// Location resolution: Open-Meteo Geocoding API (free, no key, accepts both
// place names and postal codes worldwide) plus persistence and quick-picks.
import { fetchJSON } from './fetchUtils.js';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_URL = 'https://geocoding-api.open-meteo.com/v1/reverse';
const LAST_LOCATION_KEY = 'clearsky_last_location';

/**
 * Canonical favorite locations, each a fully-resolved location object (not
 * just a search query) — hand-verified lat/lon/timezone so these never go
 * through Open-Meteo's geocoding index and can never resolve to the wrong
 * country. This is what fixes "10001" showing candidates in Spain/France:
 * a bare postal code is inherently ambiguous worldwide, so any lookup that
 * re-runs it as free text can land anywhere. A canonical shortcut is
 * resolved exactly once, here, and never re-searched by its display text.
 * Long Beach is `permanent: true` — pinned first, undeletable, and the
 * fallback restored if a user's saved favorites ever get corrupted.
 */
export const FAVORITE_LOCATIONS = [
    { id: 'fav-long-beach-ny', emoji: '🏖️', name: 'Long Beach', admin1: 'New York', country: 'United States', countryCode: 'US', postcode: '11561', latitude: 40.58844, longitude: -73.65791, timezone: 'America/New_York', permanent: true },
    { id: 'fav-manhattan-ny', emoji: '🗽', name: 'Manhattan', admin1: 'New York', country: 'United States', countryCode: 'US', postcode: '10001', latitude: 40.7484, longitude: -73.9967, timezone: 'America/New_York' },
    { id: 'fav-north-york-on', emoji: '🍁', name: 'North York', admin1: 'Ontario', country: 'Canada', countryCode: 'CA', postcode: '', latitude: 43.7615, longitude: -79.4111, timezone: 'America/Toronto' },
    { id: 'fav-grand-anse-gd', emoji: '🌺', name: 'Grand Anse Beach', admin1: '', country: 'Grenada', countryCode: 'GD', postcode: '', latitude: 12.0022, longitude: -61.7469, timezone: 'America/Grenada' },
    { id: 'fav-sarasota-fl', emoji: '🐬', name: 'Sarasota', admin1: 'Florida', country: 'United States', countryCode: 'US', postcode: '', latitude: 27.3364, longitude: -82.5307, timezone: 'America/New_York' },
    { id: 'fav-ithaca-ny', emoji: '🍂', name: 'Ithaca', admin1: 'New York', country: 'United States', countryCode: 'US', postcode: '', latitude: 42.444, longitude: -76.5019, timezone: 'America/New_York' },
    { id: 'fav-crete-gr', emoji: '🏛️', name: 'Crete', admin1: '', country: 'Greece', countryCode: 'GR', postcode: '', latitude: 35.3387, longitude: 25.1442, timezone: 'Europe/Athens' },
    { id: 'fav-montego-bay-jm', emoji: '🌴', name: 'Montego Bay', admin1: '', country: 'Jamaica', countryCode: 'JM', postcode: '', latitude: 18.4762, longitude: -77.8939, timezone: 'America/Jamaica' },
    { id: 'fav-solana-beach-ca', emoji: '🏄', name: 'Solana Beach', admin1: 'California', country: 'United States', countryCode: 'US', postcode: '', latitude: 32.9912, longitude: -117.2712, timezone: 'America/Los_Angeles' },
    { id: 'fav-barcelona-es', emoji: '🎨', name: 'Barcelona', admin1: '', country: 'Spain', countryCode: 'ES', postcode: '', latitude: 41.3874, longitude: 2.1686, timezone: 'Europe/Madrid' },
    { id: 'fav-nice-fr', emoji: '🌊', name: 'Nice', admin1: '', country: 'France', countryCode: 'FR', postcode: '', latitude: 43.7102, longitude: 7.262, timezone: 'Europe/Paris' },
    { id: 'fav-london-gb', emoji: '🎡', name: 'London', admin1: '', country: 'United Kingdom', countryCode: 'GB', postcode: '', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London' }
].map(f => ({ ...f, admin2: '', elevation: null, population: null, featureCode: '' }));

/** Exact-match aliases: typing (or clicking) one of these strings resolves
 * straight to its canonical favorite, bypassing the geocoding API entirely
 * — so a search never has a chance to return an unrelated country's result
 * for an ambiguous postal code or short place name. Checked case- and
 * whitespace-insensitively before any network call. */
const CANONICAL_ALIASES = new Map();
function registerAlias(query, favorite) {
    CANONICAL_ALIASES.set(query.trim().toLowerCase(), favorite);
}
// Deliberately NOT aliasing bare city names (e.g. "London" or "Jamaica")
// even though they match a favorite's `name` — several of these are
// genuinely ambiguous world-wide (there's a London, Ontario; a Jamaica,
// Queens), and the product requirement is that a plain free-text search
// for one of those still shows its disambiguation list. Only postal codes
// (unambiguous once qualified) and "City, State/Country"-qualified forms —
// which is how a user would type a specific favorite — are aliased.
const US_STATE_ABBR = { 'New York': 'NY', Florida: 'FL', California: 'CA' };
for (const fav of FAVORITE_LOCATIONS) {
    if (fav.postcode) registerAlias(fav.postcode, fav);
    if (fav.admin1) {
        registerAlias(`${fav.name}, ${fav.admin1}`, fav);
        registerAlias(`${fav.name} ${fav.admin1}`, fav);
        const abbr = US_STATE_ABBR[fav.admin1];
        if (abbr) {
            registerAlias(`${fav.name}, ${abbr}`, fav);
            registerAlias(`${fav.name} ${abbr}`, fav);
        }
    } else {
        registerAlias(`${fav.name}, ${fav.country}`, fav);
    }
}
// A few naming variants the spec calls out explicitly that the generic
// postcode/admin1/country loop above doesn't cover (colloquial country
// name, exact reported bug strings).
registerAlias('London, England', FAVORITE_LOCATIONS.find(f => f.id === 'fav-london-gb'));
registerAlias('New York, NY 10001', FAVORITE_LOCATIONS.find(f => f.id === 'fav-manhattan-ny'));
registerAlias('Manhattan, NY 10001', FAVORITE_LOCATIONS.find(f => f.id === 'fav-manhattan-ny'));

/**
 * Search Open-Meteo's geocoding index by place name OR postal code.
 * Returns a normalized candidate list; caller decides whether to
 * auto-select (1 result) or show a disambiguation picker (2+ results).
 * Canonical aliases are checked first and short-circuit the network call.
 */
export async function searchLocations(query, { signal } = {}) {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const alias = CANONICAL_ALIASES.get(trimmed.toLowerCase());
    if (alias) return [alias];
    const url = `${GEOCODE_URL}?name=${encodeURIComponent(trimmed)}&count=10&language=en&format=json`;
    const data = await fetchJSON(url, { signal, timeoutMs: 8000, retries: 1 });
    return (data.results || []).map(normalizeResult);
}

export async function reverseGeocode(latitude, longitude, { signal } = {}) {
    const url = `${REVERSE_URL}?latitude=${latitude}&longitude=${longitude}&language=en&format=json`;
    try {
        const data = await fetchJSON(url, { signal, timeoutMs: 6000, retries: 0 });
        if (data.results?.length) return normalizeResult(data.results[0]);
    } catch {
        // fall through to coordinate-only fallback below
    }
    return {
        name: 'Current Location',
        admin1: '', country: '', postcode: '',
        latitude, longitude, elevation: null, timezone: null
    };
}

function normalizeResult(r) {
    return {
        id: r.id,
        name: r.name,
        admin1: r.admin1 || '',
        admin2: r.admin2 || '',
        country: r.country || '',
        countryCode: r.country_code || '',
        postcode: Array.isArray(r.postcodes) && r.postcodes.length ? r.postcodes[0] : '',
        featureCode: r.feature_code || '',
        latitude: r.latitude,
        longitude: r.longitude,
        elevation: typeof r.elevation === 'number' ? r.elevation : null,
        timezone: r.timezone || null,
        population: r.population || null
    };
}

/** Human-readable label: "City, Admin, Country" or "City, Admin, Country ZIP". */
export function formatLocationLabel(loc) {
    const parts = [loc.name];
    if (loc.admin1 && loc.admin1 !== loc.name) parts.push(loc.admin1);
    if (loc.country) parts.push(loc.country);
    let label = parts.join(', ');
    if (loc.postcode) label += ` ${loc.postcode}`;
    return label;
}

/** A short disambiguation subtitle for a candidate row. */
export function formatLocationDetail(loc) {
    const bits = [];
    if (loc.admin2 && loc.admin2 !== loc.admin1) bits.push(loc.admin2);
    if (loc.admin1) bits.push(loc.admin1);
    if (loc.country) bits.push(loc.country);
    if (loc.postcode) bits.push(loc.postcode);
    return bits.join(', ') || (loc.featureCode === 'PCLI' ? 'Country' : '');
}

// ---------------------------------------------------------------------
// Favorites management: removing/restoring defaults, adding/removing
// custom (user-searched) favorites, all persisted locally. Versioned so
// a future schema change has somewhere to migrate from, and every read
// is wrapped so corrupted or pre-existing data can never leave the menu
// unusable — it just falls back to "nothing customized yet".
// ---------------------------------------------------------------------
const FAVORITES_STORAGE_KEY = 'clearsky_favorites_v1';
const FAVORITES_VERSION = 1;

function emptyFavoritesState() {
    return { version: FAVORITES_VERSION, removedDefaultIds: [], customFavorites: [] };
}

function loadFavoritesState() {
    try {
        const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (!raw) return emptyFavoritesState();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return emptyFavoritesState();
        const removedDefaultIds = Array.isArray(parsed.removedDefaultIds)
            ? parsed.removedDefaultIds.filter(id => typeof id === 'string' && id !== 'fav-long-beach-ny')
            : [];
        const customFavorites = Array.isArray(parsed.customFavorites)
            ? parsed.customFavorites.filter(f => f && typeof f.id === 'string' && typeof f.latitude === 'number' && typeof f.longitude === 'number')
            : [];
        return { version: FAVORITES_VERSION, removedDefaultIds, customFavorites };
    } catch {
        // Corrupted JSON or a pre-versioning shape we don't recognize —
        // never leave the menu unusable, just start clean. Long Beach is
        // always restored automatically since it's never in this state.
        return emptyFavoritesState();
    }
}

function saveFavoritesState(state) {
    try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // ignore storage errors (private browsing, quota, etc.)
    }
}

const COORD_MATCH_DEGREES = 0.05; // ~5km — enough to treat "the same place" as a dupe/match

function sameCoords(a, b) {
    return Math.abs(a.latitude - b.latitude) < COORD_MATCH_DEGREES && Math.abs(a.longitude - b.longitude) < COORD_MATCH_DEGREES;
}

/** A default favorite this location actually is, if any — matched by its
 * stable id (e.g. it came from a favorite click or a canonical alias) or,
 * failing that, by close-enough coordinates (a live geocoding search that
 * happens to land on the same place, e.g. "Long Beach, NY 11561" typed by
 * hand). Used to keep the heart button and favorites list from ever
 * showing the same real-world place as both a default and a duplicate
 * custom entry. */
function findMatchingDefault(loc) {
    if (!loc) return null;
    return FAVORITE_LOCATIONS.find(f => f.id === loc.id) || FAVORITE_LOCATIONS.find(f => sameCoords(f, loc));
}

/** True if `loc` is the permanent Home favorite (Long Beach) — used to
 * keep the heart button from offering to remove the one favorite that can
 * never actually be removed. */
export function isPermanentFavorite(loc) {
    return findMatchingDefault(loc)?.permanent === true;
}

/** The favorites actually shown in the menu right now: defaults minus any
 * the user removed (Long Beach can never be among them), plus their
 * custom saved locations, in that order. */
export function getVisibleFavorites() {
    const state = loadFavoritesState();
    const defaults = FAVORITE_LOCATIONS.filter(f => f.permanent || !state.removedDefaultIds.includes(f.id));
    return [...defaults, ...state.customFavorites];
}

export function isRemovedDefault(id) {
    return loadFavoritesState().removedDefaultIds.includes(id);
}

/** true if this location (by id or coordinates) is currently a visible
 * favorite — drives the ♡/♥ heart button. */
export function isFavorite(loc) {
    if (!loc) return false;
    const match = findMatchingDefault(loc);
    if (match) return match.permanent || !isRemovedDefault(match.id);
    const state = loadFavoritesState();
    return state.customFavorites.some(c => c.id === loc.id || sameCoords(c, loc));
}

/** Removes a default favorite from the user's visible list (never deletes
 * the canonical definition — restoreDefaultFavorite / restoreAllDefaults
 * can always bring it back). Refuses silently for the permanent one. */
export function removeDefaultFavorite(id) {
    const fav = FAVORITE_LOCATIONS.find(f => f.id === id);
    if (!fav || fav.permanent) return;
    const state = loadFavoritesState();
    if (!state.removedDefaultIds.includes(id)) {
        state.removedDefaultIds.push(id);
        saveFavoritesState(state);
    }
}

export function restoreDefaultFavorite(id) {
    const state = loadFavoritesState();
    state.removedDefaultIds = state.removedDefaultIds.filter(x => x !== id);
    saveFavoritesState(state);
}

/** Brings back every removed default. Does not touch the user's own
 * custom saved locations. */
export function restoreAllDefaults() {
    const state = loadFavoritesState();
    state.removedDefaultIds = [];
    saveFavoritesState(state);
}

/** Saves a verified, fully-resolved location (the result the user actually
 * selected — never a raw typed query) as a custom favorite. No-ops if it
 * duplicates an existing default or custom favorite by id or coordinates. */
export function addCustomFavorite(loc, emoji = '📍') {
    if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') return;
    const defaultMatch = findMatchingDefault(loc);
    if (defaultMatch) {
        if (!defaultMatch.permanent) restoreDefaultFavorite(defaultMatch.id);
        return;
    }
    const state = loadFavoritesState();
    if (state.customFavorites.some(c => c.id === loc.id || sameCoords(c, loc))) return;
    // Re-adding an already-custom-shaped object (e.g. an Undo right after
    // removal) keeps its existing "custom-..." id and emoji instead of
    // double-wrapping it into "custom-custom-...".
    const id = typeof loc.id === 'string' && loc.id.startsWith('custom-')
        ? loc.id
        : loc.id != null ? `custom-${loc.id}` : `custom-${loc.latitude.toFixed(3)}-${loc.longitude.toFixed(3)}`;
    const resolvedEmoji = loc.emoji || emoji;
    state.customFavorites.push({
        id, emoji: resolvedEmoji,
        name: loc.name, admin1: loc.admin1 || '', admin2: loc.admin2 || '',
        country: loc.country || '', countryCode: loc.countryCode || '',
        postcode: loc.postcode || '', latitude: loc.latitude, longitude: loc.longitude,
        timezone: loc.timezone || null, elevation: loc.elevation ?? null,
        population: loc.population ?? null, featureCode: loc.featureCode || ''
    });
    saveFavoritesState(state);
}

export function removeCustomFavorite(id) {
    const state = loadFavoritesState();
    state.customFavorites = state.customFavorites.filter(c => c.id !== id);
    saveFavoritesState(state);
}

/** Adds or removes `loc` from favorites, whichever applies — a default
 * gets un/re-removed, anything else is added/removed as a custom entry.
 * This is what the ♡/♥ heart button and the Favorites-list X both call. */
export function toggleFavorite(loc, emoji = '📍') {
    if (!loc) return;
    const match = findMatchingDefault(loc);
    if (match) {
        if (match.permanent) return;
        if (isRemovedDefault(match.id)) restoreDefaultFavorite(match.id);
        else removeDefaultFavorite(match.id);
        return;
    }
    const state = loadFavoritesState();
    const existing = state.customFavorites.find(c => c.id === loc.id || sameCoords(c, loc));
    if (existing) removeCustomFavorite(existing.id);
    else addCustomFavorite(loc, emoji);
}

export function saveLastLocation(loc) {
    try {
        localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc));
    } catch {
        // ignore storage errors (private browsing, quota, etc.)
    }
}

export function getLastLocation() {
    try {
        const raw = localStorage.getItem(LAST_LOCATION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}
