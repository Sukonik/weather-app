// Coastal conditions: NOAA CO-OPS (authoritative for US tide stations) with
// an Open-Meteo Marine fallback for global coastal locations / anything a
// nearby NOAA station doesn't cover. Both are free and require no API key.
//
// Tide predictions, water level, and water temperature can each come from a
// *different* NOAA station — a subordinate tide-prediction station rarely
// also carries a water-level sensor, for example — so each product is
// resolved to its own nearest active station independently, and every
// reading is labeled with exactly which station (and how far away it is)
// it came from. A distant reading is never presented as if it were local.
import { fetchJSON, cacheGet, cacheSet } from './fetchUtils.js';

const NOAA_METADATA_BASE = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations';
const NOAA_DATA_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

const PREFERRED_US_STATION = '8516663'; // Long Beach, NY — evaluated first per product requirement
const STATION_LIST_CACHE_MS = 24 * 60 * 60 * 1000; // station list changes rarely
const MAX_OBSERVATION_KM = 100; // beyond this, an NOAA reading no longer represents "local" conditions

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getStationsByType(type) {
    const cacheKey = `noaa_stations_${type}`;
    const cached = cacheGet(cacheKey, STATION_LIST_CACHE_MS);
    if (cached) return cached;
    const data = await fetchJSON(`${NOAA_METADATA_BASE}.json?type=${type}&units=english`, { timeoutMs: 10000, retries: 1 });
    const stations = data.stations || [];
    cacheSet(cacheKey, stations);
    return stations;
}

export async function stationSupportsProduct(stationId, productName) {
    try {
        const data = await fetchJSON(`${NOAA_METADATA_BASE}/${stationId}.json?expand=products`, { timeoutMs: 6000, retries: 0 });
        const products = data?.stations?.[0]?.products?.products || [];
        return products.some(p => p.name === productName);
    } catch {
        return false;
    }
}

export function nearestCandidates(stations, latitude, longitude, count) {
    return stations
        .map(s => ({ id: s.id, name: s.name, latitude: parseFloat(s.lat), longitude: parseFloat(s.lng), distanceKm: haversineKm(latitude, longitude, parseFloat(s.lat), parseFloat(s.lng)) }))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, count);
}

/**
 * Dynamically finds the nearest station that actually reports the
 * requested product, checking a handful of the closest candidates (rather
 * than assuming distance alone implies capability). Returns null if none
 * of the checked candidates are within maxKm and support the product.
 */
async function findNearestStationForProduct(latitude, longitude, { type, productName, maxKm = MAX_OBSERVATION_KM, checkCount = 6 }) {
    const stations = await getStationsByType(type);
    const candidates = nearestCandidates(stations, latitude, longitude, checkCount);
    for (const c of candidates) {
        if (c.distanceKm > maxKm) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await stationSupportsProduct(c.id, productName)) return c;
    }
    return null;
}

async function findNearestStation(latitude, longitude, maxKm = 120) {
    const stations = await getStationsByType('tidepredictions');
    let nearest = null;
    let nearestDist = Infinity;
    for (const s of stations) {
        const dist = haversineKm(latitude, longitude, parseFloat(s.lat), parseFloat(s.lng));
        if (dist < nearestDist) {
            nearestDist = dist;
            nearest = s;
        }
    }
    if (!nearest || nearestDist > maxKm) return null;
    return { id: nearest.id, name: nearest.name, latitude: parseFloat(nearest.lat), longitude: parseFloat(nearest.lng), distanceKm: nearestDist };
}

export async function fetchNOAAProduct(stationId, product, extraParams = '') {
    const url = `${NOAA_DATA_URL}?station=${stationId}&product=${product}&datum=MLLW&time_zone=lst_ldt&units=english&format=json${extraParams}`;
    return fetchJSON(url, { timeoutMs: 8000, retries: 1 });
}

/**
 * Resolve the tide-*prediction* station to use: try the preferred US
 * station first (per requirement, station 8516663 for Long Beach NY),
 * confirm it supports predictions, else fall back to the nearest valid
 * station within range.
 */
export async function resolveNOAAStation(latitude, longitude) {
    const nearPreferred = haversineKm(latitude, longitude, 40.5892, -73.6579) < 50;
    if (nearPreferred) {
        const supported = await stationSupportsProduct(PREFERRED_US_STATION, 'Tide Predictions');
        if (supported) {
            return { id: PREFERRED_US_STATION, name: 'Long Beach, NY', latitude: 40.5892, longitude: -73.6579, distanceKm: haversineKm(latitude, longitude, 40.5892, -73.6579) };
        }
    }
    return findNearestStation(latitude, longitude);
}

/**
 * Full US coastal tide report via NOAA CO-OPS. Predictions (curve + hilo)
 * come from `predictionStation`; water level and water temperature are
 * resolved to their own nearest *active* stations (which may differ from
 * the prediction station, and from each other) and are only used if within
 * MAX_OBSERVATION_KM — otherwise the caller falls back to Open-Meteo
 * Marine's modeled estimate for that specific field.
 */
export async function getNOAATideData(predictionStation, latitude, longitude) {
    const [waterLevelStation, waterTempStation] = await Promise.all([
        findNearestStationForProduct(latitude, longitude, { type: 'waterlevels', productName: 'Water Level' }),
        findNearestStationForProduct(latitude, longitude, { type: 'waterlevels', productName: 'Water Temperature' })
    ]);

    const jobs = [
        fetchNOAAProduct(predictionStation.id, 'predictions', '&date=today&range=48&interval=hilo'),
        // 6-minute interval predictions (NOAA's finest granularity) — real
        // data points only, never interpolated/invented between them.
        fetchNOAAProduct(predictionStation.id, 'predictions', '&date=today&range=48'),
        waterLevelStation ? fetchNOAAProduct(waterLevelStation.id, 'water_level', '&date=latest') : Promise.resolve(null),
        waterTempStation ? fetchNOAAProduct(waterTempStation.id, 'water_temperature', '&date=latest') : Promise.resolve(null)
    ];
    const results = await Promise.allSettled(jobs);
    const [hiloResult, curveResult, waterLevelResult, waterTempResult] = results;

    const hilo = hiloResult.status === 'fulfilled' ? hiloResult.value?.predictions || [] : [];
    const curve = curveResult.status === 'fulfilled' ? curveResult.value?.predictions || [] : [];
    const waterLevelRaw = waterLevelResult.status === 'fulfilled' ? waterLevelResult.value?.data?.[0] : null;
    const waterTempRaw = waterTempResult.status === 'fulfilled' ? waterTempResult.value?.data?.[0] : null;

    // NOAA CO-OPS returns "YYYY-MM-DD HH:MM" in the requested time_zone
    // (lst_ldt here — the station's own local standard/daylight time,
    // already DST-correct) — replace the space with 'T' so Date can parse
    // it; appending 'Z' would be wrong since it's not UTC.
    const parseNOAATime = (t) => new Date(t.replace(' ', 'T')).getTime();
    const now = Date.now();
    const nextHigh = hilo.find(p => p.type === 'H' && parseNOAATime(p.t) > now) || null;
    const nextLow = hilo.find(p => p.type === 'L' && parseNOAATime(p.t) > now) || null;

    return {
        predictionStation,
        source: 'NOAA CO-OPS',
        isModeled: false,
        hilo,
        curve,
        nextHigh: nextHigh || null,
        nextLow: nextLow || null,
        waterLevel: (waterLevelRaw && waterLevelStation)
            ? { value: parseFloat(waterLevelRaw.v), time: waterLevelRaw.t, station: waterLevelStation, label: `Observed at ${waterLevelStation.name} (NOAA #${waterLevelStation.id}, ${waterLevelStation.distanceKm.toFixed(1)} km away)` }
            : null,
        waterTemperature: (waterTempRaw && waterTempStation)
            ? { valueF: parseFloat(waterTempRaw.v), time: waterTempRaw.t, station: waterTempStation, label: `Observed at ${waterTempStation.name} (NOAA #${waterTempStation.id}, ${waterTempStation.distanceKm.toFixed(1)} km away)` }
            : null,
        fetchErrors: results.filter(r => r.status === 'rejected').length
    };
}

/** Global modeled marine conditions (waves, SST, modeled sea level) via Open-Meteo Marine. */
export async function getMarineData(latitude, longitude) {
    const url = `${MARINE_URL}?latitude=${latitude}&longitude=${longitude}` +
        `&hourly=wave_height,wave_period,wave_direction,sea_surface_temperature,sea_level_height_msl,ocean_current_velocity,ocean_current_direction` +
        `&current=wave_height,wave_period,wave_direction,sea_surface_temperature,sea_level_height_msl,ocean_current_velocity,ocean_current_direction` +
        `&timezone=auto&forecast_days=2`;
    const data = await fetchJSON(url, { timeoutMs: 8000, retries: 1 });

    const hourlyHeights = data.hourly?.sea_level_height_msl || [];
    const isCoastal = hourlyHeights.some(v => v !== null && v !== undefined);
    if (!isCoastal) return null; // Open-Meteo returns nulls for non-ocean grid cells — treat as inland

    // Approximate high/low extrema by scanning the modeled sea-level curve
    // (only over the real returned hourly points — no invented values).
    const times = (data.hourly?.time || []).map(t => new Date(t).getTime());
    const extrema = [];
    for (let i = 1; i < hourlyHeights.length - 1; i++) {
        const prev = hourlyHeights[i - 1], cur = hourlyHeights[i], next = hourlyHeights[i + 1];
        if (prev == null || cur == null || next == null) continue;
        if (cur > prev && cur > next) extrema.push({ type: 'H', time: times[i], value: cur });
        if (cur < prev && cur < next) extrema.push({ type: 'L', time: times[i], value: cur });
    }
    const now = Date.now();
    const nextHigh = extrema.find(e => e.type === 'H' && e.time > now) || null;
    const nextLow = extrema.find(e => e.type === 'L' && e.time > now) || null;

    return {
        source: 'Open-Meteo Marine (modeled)',
        isModeled: true,
        current: data.current || null,
        hourlyHeights,
        times,
        nextHigh,
        nextLow,
        extrema
    };
}
