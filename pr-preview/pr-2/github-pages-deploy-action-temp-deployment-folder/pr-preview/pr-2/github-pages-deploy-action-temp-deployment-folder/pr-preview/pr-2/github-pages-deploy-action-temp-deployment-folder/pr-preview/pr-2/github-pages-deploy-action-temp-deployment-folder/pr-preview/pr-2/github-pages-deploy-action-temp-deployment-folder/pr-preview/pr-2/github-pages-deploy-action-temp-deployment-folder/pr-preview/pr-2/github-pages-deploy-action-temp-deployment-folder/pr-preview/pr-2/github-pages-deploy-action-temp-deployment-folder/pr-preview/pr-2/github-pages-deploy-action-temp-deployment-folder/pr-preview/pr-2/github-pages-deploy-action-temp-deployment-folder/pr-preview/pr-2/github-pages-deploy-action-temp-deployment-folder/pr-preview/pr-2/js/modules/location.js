// Location resolution: Open-Meteo Geocoding API (free, no key, accepts both
// place names and postal codes worldwide) plus persistence and quick-picks.
import { fetchJSON } from './fetchUtils.js';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_URL = 'https://geocoding-api.open-meteo.com/v1/reverse';
const LAST_LOCATION_KEY = 'clearsky_last_location';

/** Quick-access locations requested for the location bar. */
export const QUICK_LOCATIONS = [
    { label: 'Long Beach, NY 11561', query: '11561' },
    { label: 'New York, NY 10001', query: '10001' }
];

/**
 * Search Open-Meteo's geocoding index by place name OR postal code.
 * Returns a normalized candidate list; caller decides whether to
 * auto-select (1 result) or show a disambiguation picker (2+ results).
 */
export async function searchLocations(query, { signal } = {}) {
    const trimmed = query.trim();
    if (!trimmed) return [];
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
