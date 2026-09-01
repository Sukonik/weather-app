// Shore data sources, grouped exactly as the product spec's data-source
// groups: physical conditions, safety/quality, nature/history. Every
// function returns null/[] rather than a fabricated value when a source
// has nothing for this pin — the UI is responsible for showing an honest
// "⚪ Unavailable" state, never a guess. All calls use Promise.allSettled
// upstream in shore.js so one slow/down source degrades its own card only.
import { fetchJSON } from './fetchUtils.js';
import { getStationsByType, stationSupportsProduct, nearestCandidates, fetchNOAAProduct } from './tideAPI.js';
import { getMarineData } from './tideAPI.js';
import { haversineKm } from './shorePins.js';
import { getWeatherData } from './weatherAPI.js';

const MAX_OBSERVATION_KM = 100;
const LAKE_STATION_MAX_KM = 250; // Great Lakes stations are far sparser than coastal tide stations

// ---------------------------------------------------------------------
// Physical conditions
// ---------------------------------------------------------------------

/** Ocean/bay conditions: NOAA CO-OPS (US) + Open-Meteo Marine everywhere,
 * same resolution strategy as the Tide Charts page. */
export async function getOceanBayData(pin) {
    const isUS = pin.countryCode === 'US';
    const [noaaResult, marineResult] = await Promise.allSettled([
        isUS ? resolveAndFetchNOAA(pin) : Promise.resolve(null),
        getMarineData(pin.latitude, pin.longitude)
    ]);
    return {
        type: pin.waterBodyType,
        noaa: noaaResult.status === 'fulfilled' ? noaaResult.value : null,
        marine: marineResult.status === 'fulfilled' ? marineResult.value : null
    };
}

async function resolveAndFetchNOAA(pin) {
    const stations = await getStationsByType('tidepredictions');
    const candidates = nearestCandidates(stations, pin.latitude, pin.longitude, 3);
    const nearest = candidates[0];
    if (!nearest || nearest.distanceKm > 120) return null;
    const station = { id: nearest.id, name: nearest.name, latitude: nearest.latitude, longitude: nearest.longitude, distanceKm: nearest.distanceKm };
    const [waterLevelStation, waterTempStation] = await Promise.all([
        findNearestStationForProduct(pin.latitude, pin.longitude, 'waterlevels', 'Water Level'),
        findNearestStationForProduct(pin.latitude, pin.longitude, 'waterlevels', 'Water Temperature')
    ]);
    const jobs = [
        fetchNOAAProduct(station.id, 'predictions', '&date=today&range=48&interval=hilo'),
        fetchNOAAProduct(station.id, 'predictions', '&date=today&range=48'),
        waterLevelStation ? fetchNOAAProduct(waterLevelStation.id, 'water_level', '&date=latest') : Promise.resolve(null),
        waterTempStation ? fetchNOAAProduct(waterTempStation.id, 'water_temperature', '&date=latest') : Promise.resolve(null)
    ];
    const [hiloR, curveR, wlR, wtR] = await Promise.allSettled(jobs);
    const hilo = hiloR.status === 'fulfilled' ? hiloR.value?.predictions || [] : [];
    const curve = curveR.status === 'fulfilled' ? curveR.value?.predictions || [] : [];
    const parseT = t => new Date(t.replace(' ', 'T')).getTime();
    const now = Date.now();
    return {
        station, source: 'NOAA CO-OPS', hilo, curve,
        nextHigh: hilo.find(p => p.type === 'H' && parseT(p.t) > now) || null,
        nextLow: hilo.find(p => p.type === 'L' && parseT(p.t) > now) || null,
        waterLevel: wlR.status === 'fulfilled' && wlR.value?.data?.[0] && waterLevelStation
            ? { value: parseFloat(wlR.value.data[0].v), station: waterLevelStation } : null,
        waterTemperature: wtR.status === 'fulfilled' && wtR.value?.data?.[0] && waterTempStation
            ? { valueF: parseFloat(wtR.value.data[0].v), station: waterTempStation } : null
    };
}

async function findNearestStationForProduct(lat, lon, type, productName, maxKm = MAX_OBSERVATION_KM) {
    const stations = await getStationsByType(type);
    const candidates = nearestCandidates(stations, lat, lon, 6);
    for (const c of candidates) {
        if (c.distanceKm > maxKm) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await stationSupportsProduct(c.id, productName)) return c;
    }
    return null;
}

/** Lake conditions: NOAA CO-OPS Great Lakes water-level/temp stations
 * (the same station list/API the coast uses also carries Great Lakes
 * gauges) with a wider search radius, plus wind (for "wind-generated
 * waves" — an honest proxy, never a fabricated wave-height number since
 * no public wave model covers most lakes). */
export async function getLakeData(pin) {
    const [waterLevelStation, waterTempStation, weather] = await Promise.all([
        findNearestStationForProduct(pin.latitude, pin.longitude, 'waterlevels', 'Water Level', LAKE_STATION_MAX_KM),
        findNearestStationForProduct(pin.latitude, pin.longitude, 'waterlevels', 'Water Temperature', LAKE_STATION_MAX_KM),
        getWeatherData(pin.latitude, pin.longitude, pin.name).catch(() => null)
    ]);
    const [wl, wt] = await Promise.all([
        // range=48: a real 48-hour series (not just the latest reading) for the adaptive chart.
        waterLevelStation ? fetchNOAAProduct(waterLevelStation.id, 'water_level', '&date=latest&range=48').catch(() => null) : null,
        waterTempStation ? fetchNOAAProduct(waterTempStation.id, 'water_temperature', '&date=latest').catch(() => null) : null
    ]);
    const levelSeries = (wl?.data || []).map(d => ({ time: new Date(d.t.replace(' ', 'T')).getTime(), value: parseFloat(d.v) }));
    return {
        type: 'lake',
        waterLevel: levelSeries.length && waterLevelStation ? { value: levelSeries[levelSeries.length - 1].value, station: waterLevelStation } : null,
        waterLevelSeries: levelSeries,
        waterTemperature: wt?.data?.[0] && waterTempStation ? { valueF: parseFloat(wt.data[0].v), station: waterTempStation } : null,
        windSpeed: weather?.current?.wind_speed_10m ?? null,
        windGusts: weather?.current?.wind_gusts_10m ?? null
    };
}

const USGS_PARAMS = { gageHeight: '00065', discharge: '00060', temperature: '00010' };

/** River/spring conditions: USGS Water Services (real-time gauges, US
 * only) via a bounding box around the pin, plus Open-Meteo Flood (global
 * modeled river discharge — works for springs/rivers with no nearby USGS
 * gauge, and for the "recent rainfall / flood context" line everywhere). */
export async function getRiverSpringData(pin) {
    const bbox = pin.usgsBBox || [pin.longitude - 0.15, pin.latitude - 0.15, pin.longitude + 0.15, pin.latitude + 0.15];
    const [usgs, flood] = await Promise.allSettled([
        pin.countryCode === 'US' ? fetchUSGS(bbox, pin.latitude, pin.longitude) : Promise.resolve(null),
        getFloodData(pin.latitude, pin.longitude)
    ]);
    return {
        type: pin.waterBodyType,
        usgs: usgs.status === 'fulfilled' ? usgs.value : null,
        flood: flood.status === 'fulfilled' ? flood.value : null
    };
}

async function fetchUSGS([w, s, e, n], lat, lon) {
    // period=P2D: real 48-hour instantaneous-value history (not just the
    // latest reading) so the adaptive chart has a genuine series to plot,
    // the same 24h/48h window the tide chart uses.
    const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${w},${s},${e},${n}` +
        `&parameterCd=${Object.values(USGS_PARAMS).join(',')}&siteStatus=active&period=P2D`;
    const data = await fetchJSON(url, { timeoutMs: 9000, retries: 1 });
    const series = data?.value?.timeSeries || [];
    if (!series.length) return null;

    // Group by site, pick the nearest site that reports at least one param.
    const bySite = new Map();
    for (const ts of series) {
        const siteCode = ts.sourceInfo?.siteCode?.[0]?.value;
        if (!siteCode) continue;
        if (!bySite.has(siteCode)) {
            const geo = ts.sourceInfo?.geoLocation?.geogLocation;
            bySite.set(siteCode, {
                siteCode, name: ts.sourceInfo?.siteName || `USGS ${siteCode}`,
                latitude: geo?.latitude, longitude: geo?.longitude, values: {}, series: {}
            });
        }
        const site = bySite.get(siteCode);
        const paramCode = ts.variable?.variableCode?.[0]?.value;
        const points = (ts.values?.[0]?.value || []).map(v => ({ time: new Date(v.dateTime).getTime(), value: parseFloat(v.value) }));
        const latest = points[points.length - 1];
        if (paramCode && latest) {
            site.values[paramCode] = { value: latest.value, time: latest.time };
            site.series[paramCode] = points;
        }
    }
    const sites = [...bySite.values()]
        .filter(s => s.latitude != null && s.longitude != null)
        .map(s => ({ ...s, distanceKm: haversineKm(lat, lon, s.latitude, s.longitude) }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
    const nearest = sites[0];
    if (!nearest) return null;
    return {
        site: { name: nearest.name, code: nearest.siteCode, distanceKm: nearest.distanceKm },
        gageHeightFt: nearest.values[USGS_PARAMS.gageHeight]?.value ?? null,
        dischargeCfs: nearest.values[USGS_PARAMS.discharge]?.value ?? null,
        temperatureC: nearest.values[USGS_PARAMS.temperature]?.value ?? null,
        time: nearest.values[USGS_PARAMS.discharge]?.time || nearest.values[USGS_PARAMS.gageHeight]?.time || null,
        gageHeightSeries: nearest.series[USGS_PARAMS.gageHeight] || [],
        dischargeSeries: nearest.series[USGS_PARAMS.discharge] || []
    };
}

async function getFloodData(lat, lon) {
    const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge&forecast_days=1&past_days=3`;
    const data = await fetchJSON(url, { timeoutMs: 8000, retries: 1 });
    const discharge = data?.daily?.river_discharge || [];
    if (!discharge.length) return null;
    const times = data.daily.time || [];
    const todayIdx = Math.max(0, discharge.length - 2);
    const past = discharge.slice(0, todayIdx);
    const trendUp = past.length >= 2 && discharge[todayIdx] > past[past.length - 1];
    return {
        currentM3s: discharge[todayIdx] ?? null,
        trend: trendUp ? 'rising' : 'falling/steady',
        recentValues: discharge.map((v, i) => ({ time: times[i], value: v })),
        source: 'Open-Meteo Flood (modeled, global hydrological model)'
    };
}

// ---------------------------------------------------------------------
// Safety & water quality
// ---------------------------------------------------------------------

/** Active NWS alerts covering the pin (US only) — the one live, keyless,
 * reliably-structured official hazard feed available without a paid API.
 * EPA BEACON (state beach advisories) and NOAA HAB bulletins do not expose
 * a stable public JSON endpoint suitable for a static client; rather than
 * fabricate a status for either, callers show them as an explicit
 * "⚪ no live source integrated — check local/state advisories" line. */
export async function getHazardAlerts(pin) {
    if (pin.countryCode !== 'US') return { supported: false, alerts: [] };
    try {
        const url = `https://api.weather.gov/alerts/active?point=${pin.latitude},${pin.longitude}`;
        const data = await fetchJSON(url, { timeoutMs: 8000, retries: 1 });
        const alerts = (data.features || []).map(f => ({
            event: f.properties?.event, severity: f.properties?.severity,
            headline: f.properties?.headline, description: f.properties?.description,
            effective: f.properties?.effective, ends: f.properties?.ends
        }));
        return { supported: true, alerts };
    } catch {
        return { supported: true, alerts: [], error: true };
    }
}

// ---------------------------------------------------------------------
// Nature & history — OBIS (marine) + GBIF (everything else), both free,
// keyless biodiversity-occurrence APIs. Every record shown carries its own
// real observation date, real distance from the pin, and its source — a
// historical record is never presented as a current sighting.
// ---------------------------------------------------------------------

const NATURE_GROUPS = {
    Aves: { label: 'Birds', emoji: '🐦' },
    Mammalia: { label: 'Marine mammals', emoji: '🐬' },
    Reptilia: { label: 'Turtles & reptiles', emoji: '🐢' },
    Amphibia: { label: 'Amphibians', emoji: '🐸' },
    Actinopterygii: { label: 'Fish', emoji: '🐟' },
    Chondrichthyes: { label: 'Sharks & rays', emoji: '🦈' },
    Malacostraca: { label: 'Crabs', emoji: '🦀' },
    Scyphozoa: { label: 'Jellyfish', emoji: '🪼' },
    Thaliacea: { label: 'Salps', emoji: '💧' },
    Bivalvia: { label: 'Shellfish', emoji: '🐚' },
    Gastropoda: { label: 'Shellfish', emoji: '🐚' },
    Insecta: { label: 'Insects', emoji: '🦟' },
    Plantae: { label: 'Shore vegetation', emoji: '🌿' }
};

function bbox(lat, lon, degrees = 0.35) {
    return { west: lon - degrees, south: lat - degrees, east: lon + degrees, north: lat + degrees };
}

async function fetchGBIF(lat, lon) {
    const b = bbox(lat, lon);
    const url = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${b.south},${b.north}&decimalLongitude=${b.west},${b.east}` +
        `&hasCoordinate=true&limit=150`;
    const data = await fetchJSON(url, { timeoutMs: 9000, retries: 1 });
    return (data.results || []).map(r => ({
        scientificName: r.species || r.scientificName, vernacularName: r.vernacularName || null,
        class: r.class, kingdom: r.kingdom, phylum: r.phylum,
        latitude: r.decimalLatitude, longitude: r.decimalLongitude,
        date: r.eventDate || r.year ? (r.eventDate || String(r.year)) : null,
        establishmentMeans: r.establishmentMeans || null,
        basisOfRecord: r.basisOfRecord, source: 'GBIF'
    }));
}

async function fetchOBIS(lat, lon) {
    const b = bbox(lat, lon);
    const wkt = `POLYGON((${b.west} ${b.south},${b.east} ${b.south},${b.east} ${b.north},${b.west} ${b.north},${b.west} ${b.south}))`;
    const url = `https://api.obis.org/v3/occurrence?geometry=${encodeURIComponent(wkt)}&size=150`;
    const data = await fetchJSON(url, { timeoutMs: 9000, retries: 1 });
    return (data.results || []).map(r => ({
        scientificName: r.species || r.scientificName, vernacularName: r.vernacularname || null,
        class: r.class, kingdom: r.kingdom, phylum: r.phylum,
        latitude: r.decimalLatitude, longitude: r.decimalLongitude,
        date: r.eventDate || r.date_year ? (r.eventDate || String(r.date_year)) : null,
        establishmentMeans: null, basisOfRecord: r.basisOfRecord, source: 'OBIS'
    }));
}

function monthOf(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d.getMonth();
}

function confidenceFor(record, allSameSpeciesMonths, selectedMonth) {
    const recordDate = record.date ? new Date(record.date) : null;
    const isRecent = recordDate && !Number.isNaN(recordDate.getTime()) && (Date.now() - recordDate.getTime()) < 365 * 24 * 3600 * 1000;
    if (isRecent) return { level: 'orange', label: '🟠 Recent verified report' };
    if (selectedMonth != null && allSameSpeciesMonths.includes(selectedMonth)) return { level: 'yellow', label: '🟡 Seasonally possible' };
    return { level: 'blue', label: '🔵 Historically observed nearby' };
}

/**
 * Fetches and categorizes nature/wildlife/vegetation records near a pin.
 * Ocean/bay pins query both OBIS and GBIF (best marine + best terrestrial
 * coverage); lake/river/spring pins rely on GBIF (freshwater/terrestrial
 * taxa are its strength). Returns a map of group label -> record list,
 * each record carrying a real computed distance and confidence tier.
 */
export async function getSpeciesData(pin, selectedMonth = null) {
    const includeOBIS = pin.waterBodyType === 'ocean' || pin.waterBodyType === 'bay';
    const [gbifR, obisR] = await Promise.allSettled([
        fetchGBIF(pin.latitude, pin.longitude),
        includeOBIS ? fetchOBIS(pin.latitude, pin.longitude) : Promise.resolve([])
    ]);
    const raw = [
        ...(gbifR.status === 'fulfilled' ? gbifR.value : []),
        ...(obisR.status === 'fulfilled' ? obisR.value : [])
    ].filter(r => r.scientificName && r.latitude != null && r.longitude != null);

    // Month histogram per species (for the 🟡 seasonal tier and the Nature Calendar).
    const monthsBySpecies = new Map();
    for (const r of raw) {
        const m = monthOf(r.date);
        if (m == null) continue;
        if (!monthsBySpecies.has(r.scientificName)) monthsBySpecies.set(r.scientificName, []);
        monthsBySpecies.get(r.scientificName).push(m);
    }

    const bySpecies = new Map();
    for (const r of raw) {
        const key = r.scientificName;
        const distanceKm = haversineKm(pin.latitude, pin.longitude, r.latitude, r.longitude);
        const existing = bySpecies.get(key);
        // Keep the closest, most-recently-dated record per species per group.
        if (!existing || distanceKm < existing.distanceKm) {
            bySpecies.set(key, { ...r, distanceKm });
        }
    }

    const groups = {};
    for (const rec of bySpecies.values()) {
        const groupKey = rec.class || rec.phylum || rec.kingdom;
        const meta = NATURE_GROUPS[groupKey];
        if (!meta) continue; // not a category the Shore page surfaces
        const months = monthsBySpecies.get(rec.scientificName) || [];
        const confidence = confidenceFor(rec, months, selectedMonth);
        if (!groups[meta.label]) groups[meta.label] = { emoji: meta.emoji, records: [] };
        groups[meta.label].records.push({ ...rec, months, confidence });
    }
    for (const g of Object.values(groups)) {
        g.records.sort((a, b) => a.distanceKm - b.distanceKm);
        g.records = g.records.slice(0, 8);
    }
    return groups;
}

// ---------------------------------------------------------------------
// Shore discovery amenities — real, tagged OpenStreetMap features
// (lifeguards, restrooms, parking, accessible entrance, boardwalk,
// concessions, boat/kayak launch). Free, keyless.
// ---------------------------------------------------------------------
export async function getAmenities(pin) {
    const query = `[out:json][timeout:10];(
        node["amenity"="lifeguard_tower"](around:800,${pin.latitude},${pin.longitude});
        node["lifeguard"="yes"](around:800,${pin.latitude},${pin.longitude});
        node["amenity"="toilets"](around:800,${pin.latitude},${pin.longitude});
        node["amenity"="parking"](around:800,${pin.latitude},${pin.longitude});
        node["leisure"="boardwalk"](around:800,${pin.latitude},${pin.longitude});
        way["leisure"="boardwalk"](around:800,${pin.latitude},${pin.longitude});
        node["amenity"="cafe"](around:800,${pin.latitude},${pin.longitude});
        node["leisure"="slipway"](around:800,${pin.latitude},${pin.longitude});
    );out center 30;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
        const data = await fetchJSON(url, { timeoutMs: 9000, retries: 0 });
        const els = data.elements || [];
        const has = (pred) => els.some(pred);
        return {
            supported: true,
            lifeguards: has(e => e.tags?.amenity === 'lifeguard_tower' || e.tags?.lifeguard === 'yes'),
            restrooms: has(e => e.tags?.amenity === 'toilets'),
            parking: has(e => e.tags?.amenity === 'parking'),
            accessibleEntrance: has(e => e.tags?.wheelchair === 'yes'),
            boardwalk: has(e => e.tags?.leisure === 'boardwalk'),
            concessions: has(e => e.tags?.amenity === 'cafe' || e.tags?.shop === 'convenience'),
            boatLaunch: has(e => e.tags?.leisure === 'slipway'),
            source: 'OpenStreetMap contributors', updated: new Date().toISOString()
        };
    } catch {
        return { supported: false };
    }
}

export { getWeatherData };
