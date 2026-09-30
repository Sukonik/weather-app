// Shore-specific location handling: search (curated Shore Pins first, then
// geocoding + nearest-pin, then OpenStreetMap discovery), a Preferred Shore
// ("Shore Home") kept entirely separate from the Weather Home, favoriting,
// reordering, per-Shore emoji, and Recent Shores. Mirrors the pattern in
// location.js but is its own storage key and its own concept on purpose —
// per the product requirement, a Weather Home and a Preferred Shore must
// never be conflated.
import { fetchJSON } from './fetchUtils.js';
import { SHORE_PINS, pinsForCity, nearestPins, discoverShorePinsOSM, haversineKm } from './shorePins.js';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const STORAGE_KEY = 'clearsky_shore_favorites_v1';
const RECENT_LIMIT = 3;
const NEAREST_MAX_KM = 40;

function emptyState() {
    return { version: 1, preferredShoreId: null, order: [], customFavorites: [], recentShores: [], emojiOverrides: {} };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyState();
        const p = JSON.parse(raw);
        if (!p || typeof p !== 'object') return emptyState();
        return {
            version: 1,
            preferredShoreId: typeof p.preferredShoreId === 'string' ? p.preferredShoreId : null,
            order: Array.isArray(p.order) ? p.order.filter(id => typeof id === 'string') : [],
            customFavorites: Array.isArray(p.customFavorites)
                ? p.customFavorites.filter(f => f && typeof f.id === 'string' && typeof f.latitude === 'number' && typeof f.longitude === 'number')
                : [],
            recentShores: Array.isArray(p.recentShores)
                ? p.recentShores.filter(f => f && typeof f.latitude === 'number' && typeof f.longitude === 'number').slice(0, RECENT_LIMIT)
                : [],
            emojiOverrides: p.emojiOverrides && typeof p.emojiOverrides === 'object' && !Array.isArray(p.emojiOverrides)
                ? Object.fromEntries(Object.entries(p.emojiOverrides).filter(([k, v]) => typeof k === 'string' && typeof v === 'string'))
                : {}
        };
    } catch {
        return emptyState();
    }
}

function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota/private-mode — non-fatal */ }
}

function samePin(a, b) {
    if (!a || !b) return false;
    if (a.id === b.id) return true;
    return Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;
}

function resolvePinById(id, state) {
    if (!id) return null;
    return SHORE_PINS.find(p => p.id === id) || state.customFavorites.find(p => p.id === id) || null;
}

function withEmoji(pin, state) {
    const override = state.emojiOverrides[pin.id];
    return override ? { ...pin, emoji: override } : pin;
}

/**
 * Resolve a search query to Shore results:
 *  1. Curated pins whose parent city matches the query directly.
 *  2. Geocode the query, then curated pins near the resolved coordinate.
 *  3. If still nothing, OpenStreetMap discovery near the resolved coordinate.
 * Returns { cityMatch, pins, geocoded, noSupportedShore } so the UI can
 * render "named shores near <city>" vs. a flat pin list vs. the honest
 * "no supported Shore data here" state.
 */
export async function searchShores(query, { signal } = {}) {
    const trimmed = query.trim();
    if (!trimmed) return { pins: [], geocoded: null, noSupportedShore: false };

    // 1. Direct curated-pin name match (typing an exact Shore Pin name).
    const directNameMatch = SHORE_PINS.filter(p => p.name.toLowerCase().includes(trimmed.toLowerCase()));
    if (directNameMatch.length) return { pins: directNameMatch, geocoded: null, noSupportedShore: false };

    // 2. City-name match against curated pins' parent city.
    const cityPins = pinsForCity(trimmed);
    if (cityPins.length) return { pins: cityPins, geocoded: null, noSupportedShore: false, cityMatch: cityPins[0].parentCity };

    // 3. Geocode the query, then look for curated pins or OSM features nearby.
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(trimmed)}&count=5&language=en&format=json`;
    let geocoded = null;
    try {
        const data = await fetchJSON(url, { signal, timeoutMs: 8000, retries: 1 });
        geocoded = data.results?.[0] || null;
    } catch {
        geocoded = null;
    }
    if (!geocoded) return { pins: [], geocoded: null, noSupportedShore: true };

    const near = nearestPins(geocoded.latitude, geocoded.longitude, NEAREST_MAX_KM);
    if (near.length) {
        return { pins: near.map(n => n.pin), geocoded, noSupportedShore: false, cityMatch: geocoded.name };
    }

    const osmPins = await discoverShorePinsOSM(geocoded.latitude, geocoded.longitude);
    if (osmPins.length) {
        return { pins: osmPins, geocoded, noSupportedShore: false, cityMatch: geocoded.name, fromOSM: true };
    }

    return { pins: [], geocoded, noSupportedShore: true, cityMatch: geocoded.name };
}

/** The single nearest supported Shore Pin to a coordinate (curated first,
 * OSM fallback), or null — backs the "Use nearest supported Shore" option. */
export async function nearestSupportedShore(latitude, longitude) {
    const near = nearestPins(latitude, longitude, NEAREST_MAX_KM, 1);
    if (near.length) return near[0].pin;
    const osm = await discoverShorePinsOSM(latitude, longitude);
    return osm[0] || null;
}

// --- Preferred Shore ("Shore Home") — deliberately separate from Weather
// Home (location.js). Storage-only: never triggers a data refresh on its
// own, matching the Weather Home pattern the user is already used to. ---

export function getPreferredShore() {
    const state = loadState();
    if (!state.preferredShoreId) return null;
    const pin = resolvePinById(state.preferredShoreId, state);
    return pin ? withEmoji(pin, state) : null;
}

export function isPreferredShore(pin) {
    return samePin(pin, getPreferredShore());
}

export function setPreferredShore(pin) {
    if (!pin || typeof pin.latitude !== 'number') return;
    const state = loadState();
    ensureCustomIfUnlisted(pin, state);
    state.preferredShoreId = pin.id;
    saveState(state);
}

export function clearPreferredShore() {
    const state = loadState();
    state.preferredShoreId = null;
    saveState(state);
}

function ensureCustomIfUnlisted(pin, state) {
    const isCurated = SHORE_PINS.some(p => p.id === pin.id);
    const alreadyCustom = state.customFavorites.some(c => samePin(c, pin));
    if (!isCurated && !alreadyCustom) state.customFavorites.push({ ...pin });
}

// --- Favorites: favorite/un-favorite any Shore Pin (curated or
// OSM-discovered), reorder, per-Shore emoji. ---

export function isShoreFavorite(pin) {
    if (!pin) return false;
    const state = loadState();
    return state.order.includes(pin.id) || samePin(pin, getPreferredShore());
}

export function toggleShoreFavorite(pin, emoji = '📍') {
    if (!pin || typeof pin.latitude !== 'number') return;
    const state = loadState();
    ensureCustomIfUnlisted(pin, state);
    const idx = state.order.indexOf(pin.id);
    if (idx >= 0) {
        state.order.splice(idx, 1);
        if (state.preferredShoreId === pin.id) state.preferredShoreId = null;
    } else {
        state.order.push(pin.id);
    }
    saveState(state);
}

/** Favorited Shores in the user's own saved order, Preferred Shore first
 * (mirrors the Weather Home / Favorites list convention). */
export function getVisibleShoreFavorites() {
    const state = loadState();
    const preferred = getPreferredShore();
    const rest = state.order
        .filter(id => id !== state.preferredShoreId)
        .map(id => resolvePinById(id, state))
        .filter(Boolean)
        .map(p => withEmoji(p, state));
    return [...(preferred ? [{ ...preferred, isPreferred: true }] : []), ...rest.map(p => ({ ...p, isPreferred: false }))];
}

export function reorderShoreFavorites(orderedIds) {
    const state = loadState();
    const valid = orderedIds.filter(id => state.order.includes(id) && id !== state.preferredShoreId);
    // Keep the Preferred Shore excluded from the reorderable list — it's
    // pinned first in getVisibleShoreFavorites regardless of `order`.
    state.order = valid;
    saveState(state);
}

export function removeShoreFavorite(id) {
    const state = loadState();
    state.order = state.order.filter(x => x !== id);
    if (state.preferredShoreId === id) state.preferredShoreId = null;
    saveState(state);
}

export function setShoreEmoji(id, emoji) {
    if (!id || !emoji) return;
    const state = loadState();
    const custom = state.customFavorites.find(c => c.id === id);
    if (custom) custom.emoji = emoji;
    else state.emojiOverrides[id] = emoji;
    saveState(state);
}

// --- Recent Shores ---

export function addRecentShore(pin) {
    if (!pin || typeof pin.latitude !== 'number') return;
    if (isShoreFavorite(pin)) return;
    const state = loadState();
    state.recentShores = state.recentShores.filter(r => !samePin(r, pin));
    state.recentShores.unshift({ ...pin });
    state.recentShores = state.recentShores.slice(0, RECENT_LIMIT);
    saveState(state);
}

export function getRecentShores() {
    const state = loadState();
    return state.recentShores.filter(r => !isShoreFavorite(r));
}

export function clearRecentShores() {
    const state = loadState();
    state.recentShores = [];
    saveState(state);
}

export function shoreDistanceKm(pin, latitude, longitude) {
    return haversineKm(pin.latitude, pin.longitude, latitude, longitude);
}

const LAST_SHORE_KEY = 'clearsky_last_shore';
export function saveLastShore(pin) {
    try { localStorage.setItem(LAST_SHORE_KEY, JSON.stringify(pin)); } catch { /* ignore */ }
}
export function getLastShore() {
    try { const raw = localStorage.getItem(LAST_SHORE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
