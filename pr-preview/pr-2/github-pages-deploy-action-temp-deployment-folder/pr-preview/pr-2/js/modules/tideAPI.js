// Coastal conditions: NOAA CO-OPS (authoritative for US tide stations) with
// an Open-Meteo Marine fallback for global coastal locations. Both are free
// and require no API key.
import { fetchJSON, cacheGet, cacheSet } from './fetchUtils.js';

const NOAA_METADATA_BASE = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations';
const NOAA_DATA_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

const PREFERRED_US_STATION = '8516663'; // Long Beach, NY — evaluated first per product requirement
const STATION_LIST_CACHE_MS = 24 * 60 * 60 * 1000; // station list changes rarely

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getTidePredictionStations() {
    const cached = cacheGet('noaa_tide_stations', STATION_LIST_CACHE_MS);
    if (cached) return cached;
    const data = await fetchJSON(`${NOAA_METADATA_BASE}.json?type=tidepredictions&units=english`, { timeoutMs: 10000, retries: 1 });
    const stations = data.stations || [];
    cacheSet('noaa_tide_stations', stations);
    return stations;
}

async function stationSupportsPredictions(stationId) {
    try {
        const data = await fetchJSON(`${NOAA_METADATA_BASE}/${stationId}.json?expand=products`, { timeoutMs: 6000, retries: 0 });
        const products = data?.stations?.[0]?.products?.products || [];
        return products.some(p => p.name === 'Tide Predictions');
    } catch {
        return false;
    }
}

async function findNearestStation(latitude, longitude, maxKm = 120) {
    const stations = await getTidePredictionStations();
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

async function fetchNOAAProduct(stationId, product, extraParams = '') {
    const url = `${NOAA_DATA_URL}?station=${stationId}&product=${product}&datum=MLLW&time_zone=lst_ldt&units=english&format=json${extraParams}`;
    return fetchJSON(url, { timeoutMs: 8000, retries: 1 });
}

/**
 * Resolve the tide station to use: try the preferred US station first (per
 * requirement, station 8516663 for Long Beach NY), confirm it supports
 * predictions, else fall back to the nearest valid station within range.
 */
export async function resolveNOAAStation(latitude, longitude) {
    // Only try the hardcoded preferred station when we're actually near it
    // (Long Beach, NY area) — otherwise go straight to nearest-station logic.
    const nearPreferred = haversineKm(latitude, longitude, 40.5892, -73.6579) < 50;
    if (nearPreferred) {
        const supported = await stationSupportsPredictions(PREFERRED_US_STATION);
        if (supported) {
            return { id: PREFERRED_US_STATION, name: 'Long Beach, NY', latitude: 40.5892, longitude: -73.6579, distanceKm: haversineKm(latitude, longitude, 40.5892, -73.6579) };
        }
    }
    return findNearestStation(latitude, longitude);
}

/** Full US coastal tide report via NOAA CO-OPS for a resolved station. */
export async function getNOAATideData(station) {
    const results = await Promise.allSettled([
        fetchNOAAProduct(station.id, 'predictions', '&date=today&range=48&interval=hilo'),
        fetchNOAAProduct(station.id, 'predictions', '&date=today&range=48'),
        fetchNOAAProduct(station.id, 'water_level', '&date=latest'),
        fetchNOAAProduct(station.id, 'water_temperature', '&date=latest')
    ]);

    const [hiloResult, curveResult, waterLevelResult, waterTempResult] = results;

    const hilo = hiloResult.status === 'fulfilled' ? hiloResult.value?.predictions || [] : [];
    const curve = curveResult.status === 'fulfilled' ? curveResult.value?.predictions || [] : [];
    const waterLevel = waterLevelResult.status === 'fulfilled' ? waterLevelResult.value?.data?.[0] : null;
    const waterTemp = waterTempResult.status === 'fulfilled' ? waterTempResult.value?.data?.[0] : null;

    // NOAA CO-OPS returns "YYYY-MM-DD HH:MM" in the requested time_zone (lst_ldt
    // here, i.e. local station time) — replace the space with 'T' so Date can
    // parse it; appending 'Z' would be wrong since it's not UTC.
    const parseNOAATime = (t) => new Date(t.replace(' ', 'T')).getTime();
    const now = Date.now();
    const nextHigh = hilo.find(p => p.type === 'H' && parseNOAATime(p.t) > now) || null;
    const nextLow = hilo.find(p => p.type === 'L' && parseNOAATime(p.t) > now) || null;

    return {
        station,
        source: 'NOAA CO-OPS',
        isModeled: false,
        hilo,
        curve,
        nextHigh: nextHigh || null,
        nextLow: nextLow || null,
        waterLevel: waterLevel ? { value: parseFloat(waterLevel.v), time: waterLevel.t } : null,
        waterTemperatureF: waterTemp ? parseFloat(waterTemp.v) : null,
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
