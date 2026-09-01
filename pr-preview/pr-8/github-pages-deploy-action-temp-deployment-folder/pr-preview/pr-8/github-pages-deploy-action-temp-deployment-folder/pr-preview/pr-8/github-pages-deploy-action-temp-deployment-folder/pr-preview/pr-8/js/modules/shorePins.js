// Curated Shore Pins: specific named beaches, springs, lakefronts, and
// river-access points — never a whole city treated as one shore. Each pin
// is hand-verified (name, coordinates, parent city, water-body identity)
// so a Shore search never has to guess which stretch of coastline a city
// name actually means. Coordinates for the named street-end beaches are
// approximate street-end positions along the named boulevard (public
// records don't publish survey-grade beach-access coordinates); everywhere
// else uses the named park/landmark's public location.
//
// OpenStreetMap discovery (discoverShorePinsOSM) is the fallback for any
// coordinate this curated list doesn't cover — never a whole city center.

export const WATER_BODY_TYPES = ['ocean', 'bay', 'lake', 'river', 'spring'];

export const SHORE_PINS = [
    // --- Long Beach, NY (barrier island — one town, several named ocean
    // and bay accesses; this is the exact "don't treat a city as one
    // shore" case from the spec) ---
    {
        id: 'shore-long-beach-ny-lindell', name: 'Lindell Boulevard Beach', emoji: '🏄',
        parentCity: 'Long Beach', parentAdmin1: 'New York', parentCountry: 'United States', countryCode: 'US',
        latitude: 40.5889, longitude: -73.6295, timezone: 'America/New_York',
        waterBody: 'Atlantic Ocean', waterBodyType: 'ocean', setting: 'exposed', orientation: 'south-facing (sunrise over the water)', shoreType: 'sand'
    },
    {
        id: 'shore-long-beach-ny-laurelton', name: 'Laurelton Boulevard Beach', emoji: '🎬',
        parentCity: 'Long Beach', parentAdmin1: 'New York', parentCountry: 'United States', countryCode: 'US',
        latitude: 40.5886, longitude: -73.6580, timezone: 'America/New_York',
        waterBody: 'Atlantic Ocean', waterBodyType: 'ocean', setting: 'exposed', orientation: 'south-facing (sunrise over the water)', shoreType: 'sand'
    },
    {
        id: 'shore-long-beach-ny-national', name: 'National Boulevard Beach', emoji: '🍦',
        parentCity: 'Long Beach', parentAdmin1: 'New York', parentCountry: 'United States', countryCode: 'US',
        latitude: 40.5892, longitude: -73.6699, timezone: 'America/New_York',
        waterBody: 'Atlantic Ocean', waterBodyType: 'ocean', setting: 'exposed', orientation: 'south-facing (sunrise over the water)', shoreType: 'sand'
    },
    {
        id: 'shore-long-beach-ny-riverside', name: 'Riverside Boulevard Beach', emoji: '🏖️',
        parentCity: 'Long Beach', parentAdmin1: 'New York', parentCountry: 'United States', countryCode: 'US',
        latitude: 40.5899, longitude: -73.6789, timezone: 'America/New_York',
        waterBody: 'Atlantic Ocean', waterBodyType: 'ocean', setting: 'exposed', orientation: 'south-facing (sunrise over the water)', shoreType: 'sand'
    },
    {
        id: 'shore-long-beach-ny-bayfront', name: 'Long Beach Bayfront (Reynolds Channel)', emoji: '🌊',
        parentCity: 'Long Beach', parentAdmin1: 'New York', parentCountry: 'United States', countryCode: 'US',
        latitude: 40.6017, longitude: -73.6570, timezone: 'America/New_York',
        waterBody: 'Reynolds Channel', waterBodyType: 'bay', setting: 'sheltered', orientation: 'north-facing (sunset over the water)', shoreType: 'marsh'
    },

    // --- Sarasota, FL (Gulf of Mexico) ---
    {
        id: 'shore-sarasota-fl-siesta-key', name: 'Siesta Key Beach', emoji: '🐚',
        parentCity: 'Sarasota', parentAdmin1: 'Florida', parentCountry: 'United States', countryCode: 'US',
        latitude: 27.2633, longitude: -82.5468, timezone: 'America/New_York',
        waterBody: 'Gulf of Mexico', waterBodyType: 'ocean', setting: 'exposed', orientation: 'west-facing (sunset over the water)', shoreType: 'sand'
    },
    {
        id: 'shore-sarasota-fl-lido', name: 'Lido Beach', emoji: '🌴',
        parentCity: 'Sarasota', parentAdmin1: 'Florida', parentCountry: 'United States', countryCode: 'US',
        latitude: 27.3239, longitude: -82.5757, timezone: 'America/New_York',
        waterBody: 'Gulf of Mexico', waterBodyType: 'ocean', setting: 'exposed', orientation: 'west-facing (sunset over the water)', shoreType: 'sand'
    },

    // --- Florida springs (freshwater) ---
    {
        id: 'shore-silver-springs-fl', name: 'Silver Springs', emoji: '🐒',
        parentCity: 'Ocala', parentAdmin1: 'Florida', parentCountry: 'United States', countryCode: 'US',
        latitude: 29.2183, longitude: -82.0546, timezone: 'America/New_York',
        waterBody: 'Silver Springs / Silver River', waterBodyType: 'spring', setting: 'sheltered', orientation: 'tree-canopied', shoreType: 'spring pool',
        usgsBBox: [-82.08, 29.19, -82.03, 29.24]
    },
    {
        id: 'shore-juniper-springs-fl', name: 'Juniper Springs', emoji: '🛶',
        parentCity: 'Ocala National Forest', parentAdmin1: 'Florida', parentCountry: 'United States', countryCode: 'US',
        latitude: 29.1785, longitude: -81.6975, timezone: 'America/New_York',
        waterBody: 'Juniper Creek', waterBodyType: 'spring', setting: 'sheltered', orientation: 'tree-canopied', shoreType: 'spring pool',
        usgsBBox: [-81.72, 29.16, -81.68, 29.20]
    },
    {
        id: 'shore-rainbow-springs-fl', name: 'Rainbow Springs', emoji: '🌈',
        parentCity: 'Dunnellon', parentAdmin1: 'Florida', parentCountry: 'United States', countryCode: 'US',
        latitude: 29.1002, longitude: -82.4363, timezone: 'America/New_York',
        waterBody: 'Rainbow River', waterBodyType: 'spring', setting: 'sheltered', orientation: 'tree-canopied', shoreType: 'spring pool',
        usgsBBox: [-82.46, 29.08, -82.41, 29.12]
    },

    // --- Caribbean ---
    {
        id: 'shore-grand-anse-gd', name: 'Grand Anse Beach', emoji: '🌺',
        parentCity: "St. George's", parentAdmin1: '', parentCountry: 'Grenada', countryCode: 'GD',
        latitude: 12.0022, longitude: -61.7469, timezone: 'America/Grenada',
        waterBody: 'Caribbean Sea', waterBodyType: 'ocean', setting: 'sheltered', orientation: 'west-facing (sunset over the water)', shoreType: 'sand'
    },
    {
        id: 'shore-montego-bay-jm-doctors-cave', name: "Doctor's Cave Beach", emoji: '🌴',
        parentCity: 'Montego Bay', parentAdmin1: '', parentCountry: 'Jamaica', countryCode: 'JM',
        latitude: 18.4820, longitude: -77.9190, timezone: 'America/Jamaica',
        waterBody: 'Caribbean Sea', waterBodyType: 'ocean', setting: 'sheltered', orientation: 'north-facing', shoreType: 'sand'
    },

    // --- Great Lakes / Ontario ---
    {
        id: 'shore-lake-ontario-woodbine', name: 'Woodbine Beach', emoji: '🏞️',
        parentCity: 'Toronto', parentAdmin1: 'Ontario', parentCountry: 'Canada', countryCode: 'CA',
        latitude: 43.6629, longitude: -79.2977, timezone: 'America/Toronto',
        waterBody: 'Lake Ontario', waterBodyType: 'lake', setting: 'exposed', orientation: 'south-facing', shoreType: 'sand'
    },
    {
        id: 'shore-lake-simcoe-innisfil', name: 'Innisfil Beach Park', emoji: '🏞️',
        parentCity: 'Innisfil', parentAdmin1: 'Ontario', parentCountry: 'Canada', countryCode: 'CA',
        latitude: 44.3287, longitude: -79.5518, timezone: 'America/Toronto',
        waterBody: 'Lake Simcoe', waterBodyType: 'lake', setting: 'exposed', orientation: 'east-facing (sunrise over the water)', shoreType: 'sand'
    },

    // --- River access ---
    {
        id: 'shore-delaware-river-new-hope', name: 'Delaware River Access — New Hope', emoji: '🛶',
        parentCity: 'New Hope', parentAdmin1: 'Pennsylvania', parentCountry: 'United States', countryCode: 'US',
        latitude: 40.3645, longitude: -74.9527, timezone: 'America/New_York',
        waterBody: 'Delaware River', waterBodyType: 'river', setting: 'sheltered', orientation: 'east bank', shoreType: 'riverbank',
        usgsBBox: [-75.05, 40.30, -74.85, 40.45]
    }
];

const RAD = Math.PI / 180;
export function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * RAD, dLon = (lon2 - lon1) * RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Every curated pin whose parent city matches (loosely — case-insensitive
 * substring either direction) the given city/place name. This is what
 * turns a city search into a dropdown of named shores instead of one
 * generic city-wide result. */
export function pinsForCity(cityName) {
    if (!cityName) return [];
    const q = cityName.trim().toLowerCase();
    return SHORE_PINS.filter(p => {
        const city = p.parentCity.toLowerCase();
        return city === q || city.includes(q) || q.includes(city);
    });
}

/** Nearest curated pin(s) to a coordinate, within maxKm, closest first. */
export function nearestPins(latitude, longitude, maxKm = 40, limit = 5) {
    return SHORE_PINS
        .map(p => ({ pin: p, distanceKm: haversineKm(latitude, longitude, p.latitude, p.longitude) }))
        .filter(r => r.distanceKm <= maxKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit);
}

export function findPinById(id) {
    return SHORE_PINS.find(p => p.id === id) || null;
}

/**
 * OpenStreetMap discovery fallback: real named natural=beach / natural=spring
 * / leisure=beach_resort features near a coordinate, for anywhere the
 * curated list above doesn't cover. Keyless, free (Overpass API). Returns
 * [] (never invented pins) on any failure — the caller's "no supported
 * Shore" message is the honest outcome when this comes back empty.
 */
export async function discoverShorePinsOSM(latitude, longitude, radiusM = 15000) {
    const query = `[out:json][timeout:10];(
        node["natural"="beach"](around:${radiusM},${latitude},${longitude});
        way["natural"="beach"](around:${radiusM},${latitude},${longitude});
        node["leisure"="beach_resort"](around:${radiusM},${latitude},${longitude});
        node["natural"="spring"](around:${radiusM},${latitude},${longitude});
    );out center 20;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.elements || [])
            .map(el => {
                const lat = el.lat ?? el.center?.lat;
                const lon = el.lon ?? el.center?.lon;
                const name = el.tags?.name;
                if (lat == null || lon == null || !name) return null;
                return {
                    id: `osm-${el.type}-${el.id}`, name, emoji: '📍',
                    parentCity: '', parentAdmin1: '', parentCountry: '', countryCode: '',
                    latitude: lat, longitude: lon, timezone: null,
                    waterBody: el.tags?.natural === 'spring' ? 'Spring' : 'Nearby water',
                    waterBodyType: el.tags?.natural === 'spring' ? 'spring' : 'ocean',
                    setting: 'unknown', orientation: 'unknown', shoreType: 'unknown',
                    source: 'OpenStreetMap contributors'
                };
            })
            .filter(Boolean);
    } catch {
        return []; // Overpass down/rate-limited — never fabricate a result
    }
}
