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
