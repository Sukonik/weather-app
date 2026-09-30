#!/usr/bin/env node
// Real-network field-completeness verification against the 6 acceptance-test
// locations. Runs on GitHub Actions (full internet access) since the dev
// sandbox this was authored in cannot reach these hosts directly. Writes a
// markdown report to stdout and, when running in Actions, to
// $GITHUB_STEP_SUMMARY.
//
// Usage: node scripts/verify-data-sources.mjs

const LOCATIONS = [
    { label: 'Long Beach, NY 11561', query: '11561' },
    { label: 'New York, NY 10001', query: '10001' },
    { label: 'North York, Ontario', query: 'North York, Ontario' },
    { label: 'Toronto, Canada', query: 'Toronto, Canada' },
    { label: 'Grenada', query: 'Grenada' },
    { label: 'Jamaica', query: 'Jamaica' }
];

const lines = [];
function log(s = '') { lines.push(s); console.log(s); }

async function fetchJSON(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        const status = res.status;
        let body = null;
        try { body = await res.json(); } catch { /* non-JSON response */ }
        return { ok: res.ok, status, body };
    } catch (error) {
        return { ok: false, status: 0, error: error.message };
    } finally {
        clearTimeout(timer);
    }
}

function row(field, value, source, status, timestamp, available, reason = '') {
    return `| ${field} | ${value ?? '—'} | ${source} | ${status} | ${timestamp ?? '—'} | ${available ? '✅' : '❌'} | ${reason} |`;
}

async function verifyLocation({ label, query }) {
    log(`\n## ${label}\n`);

    // 1. Geocoding resolution
    const geoRes = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`);
    const results = geoRes.body?.results || [];
    log(`**Geocoding**: query \`${query}\` → HTTP ${geoRes.status}, ${results.length} result(s)`);
    if (results.length > 1) {
        log(`- Ambiguous — candidates: ${results.slice(0, 5).map(r => `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}, ${r.country}${r.feature_code === 'PCLI' ? ' (country)' : ''}`).join(' | ')}`);
    }
    if (!results.length) {
        log(`- ❌ No geocoding result — cannot verify further fields for this location.`);
        return;
    }
    const loc = results[0];
    log(`- Resolved to: **${loc.name}, ${loc.admin1 || ''} ${loc.country}** (lat ${loc.latitude}, lon ${loc.longitude}, country_code ${loc.country_code})`);

    // 2. Weather + Air Quality
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility` +
        `&daily=temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset,precipitation_probability_max` +
        `&timezone=auto`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.latitude}&longitude=${loc.longitude}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi`;

    const [weatherRes, airRes] = await Promise.all([fetchJSON(weatherUrl), fetchJSON(airUrl)]);

    log(`\n**Open-Meteo Forecast**: HTTP ${weatherRes.status}`);
    log(`\n| Field | Value | Source | Status | Timestamp | Available | Reason |`);
    log(`|---|---|---|---|---|---|---|`);
    if (weatherRes.ok && weatherRes.body?.current) {
        const c = weatherRes.body.current;
        const d = weatherRes.body.daily || {};
        const ts = weatherRes.body.current.time;
        const fields = [
            ['Temperature', c.temperature_2m, '°C'], ['Feels-like', c.apparent_temperature, '°C'],
            ['Dew point', c.dew_point_2m, '°C'], ['Humidity', c.relative_humidity_2m, '%'],
            ['Pressure (surface)', c.surface_pressure, 'hPa'], ['Cloud cover', c.cloud_cover, '%'],
            ['Precipitation', c.precipitation, 'mm'], ['Rain', c.rain, 'mm'], ['Showers', c.showers, 'mm'], ['Snowfall', c.snowfall, 'cm'],
            ['Wind speed', c.wind_speed_10m, 'km/h'], ['Wind gust', c.wind_gusts_10m, 'km/h'], ['Wind direction', c.wind_direction_10m, '°'],
            ['Visibility', c.visibility, 'm'], ['UV index', c.uv_index, ''], ['Weather code', c.weather_code, '(WMO)']
        ];
        fields.forEach(([name, val, unit]) => log(row(name, val != null ? `${val}${unit}` : null, 'Open-Meteo Forecast', 'forecast', ts, val != null)));
        log(row('Daily high', d.temperature_2m_max?.[0], 'Open-Meteo Forecast', 'forecast', ts, d.temperature_2m_max?.[0] != null));
        log(row('Daily low', d.temperature_2m_min?.[0], 'Open-Meteo Forecast', 'forecast', ts, d.temperature_2m_min?.[0] != null));
        log(row('Peak UV', d.uv_index_max?.[0], 'Open-Meteo Forecast', 'forecast', ts, d.uv_index_max?.[0] != null));
        log(row('Sunrise', d.sunrise?.[0], 'Open-Meteo Forecast', 'forecast', ts, d.sunrise?.[0] != null));
        log(row('Sunset', d.sunset?.[0], 'Open-Meteo Forecast', 'forecast', ts, d.sunset?.[0] != null));
    } else {
        log(row('Weather (all fields)', null, 'Open-Meteo Forecast', `HTTP ${weatherRes.status}`, null, false, weatherRes.error || 'request failed'));
    }

    if (airRes.ok && airRes.body?.current) {
        const c = airRes.body.current;
        const ts = airRes.body.current.time;
        log(row('US AQI', c.us_aqi, 'Open-Meteo Air Quality', 'forecast', ts, c.us_aqi != null));
        log(row('European AQI', c.european_aqi, 'Open-Meteo Air Quality', 'forecast', ts, c.european_aqi != null));
        log(row('PM2.5', c.pm2_5, 'Open-Meteo Air Quality', 'forecast', ts, c.pm2_5 != null));
        log(row('PM10', c.pm10, 'Open-Meteo Air Quality', 'forecast', ts, c.pm10 != null));
        log(row('Ozone', c.ozone, 'Open-Meteo Air Quality', 'forecast', ts, c.ozone != null));
        log(row('NO₂', c.nitrogen_dioxide, 'Open-Meteo Air Quality', 'forecast', ts, c.nitrogen_dioxide != null));
        log(row('SO₂', c.sulphur_dioxide, 'Open-Meteo Air Quality', 'forecast', ts, c.sulphur_dioxide != null));
        log(row('CO', c.carbon_monoxide, 'Open-Meteo Air Quality', 'forecast', ts, c.carbon_monoxide != null));
    } else {
        log(row('Air Quality (all fields)', null, 'Open-Meteo Air Quality', `HTTP ${airRes.status}`, null, false, airRes.error || 'request failed'));
    }

    // 3. Coastal data: NOAA for US, Marine for others
    const isUS = loc.country_code === 'US';
    if (isUS) {
        const stationsRes = await fetchJSON(`https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&units=english`);
        const stations = stationsRes.body?.stations || [];
        let nearest = null, nearestDist = Infinity;
        const toRad = d => d * Math.PI / 180;
        for (const s of stations) {
            const dLat = toRad(loc.latitude - parseFloat(s.lat)), dLon = toRad(loc.longitude - parseFloat(s.lng));
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(loc.latitude)) * Math.cos(toRad(parseFloat(s.lat))) * Math.sin(dLon / 2) ** 2;
            const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (dist < nearestDist) { nearestDist = dist; nearest = s; }
        }
        log(`\n**NOAA CO-OPS**: station list HTTP ${stationsRes.status}, ${stations.length} stations returned`);
        if (nearest && nearestDist < 120) {
            log(`- Nearest station: **${nearest.name}** (#${nearest.id}), ${nearestDist.toFixed(1)} km away`);
            const predRes = await fetchJSON(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=${nearest.id}&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&format=json&date=today&interval=hilo`);
            const preds = predRes.body?.predictions || [];
            log(row('Next tide predictions', preds.length ? `${preds.length} events` : null, `NOAA CO-OPS (station ${nearest.id})`, 'official prediction', new Date().toISOString(), preds.length > 0, predRes.error || (preds.length ? '' : `HTTP ${predRes.status}`)));
        } else {
            log(`- ❌ No NOAA tide station within 120km — inland location, coastal data unavailable.`);
        }
    } else {
        const marineRes = await fetchJSON(`https://marine-api.open-meteo.com/v1/marine?latitude=${loc.latitude}&longitude=${loc.longitude}&current=wave_height,sea_surface_temperature,sea_level_height_msl&timezone=auto`);
        const hasMarine = marineRes.body?.current?.wave_height != null;
        log(`\n**Open-Meteo Marine**: HTTP ${marineRes.status}`);
        log(row('Wave height', marineRes.body?.current?.wave_height, 'Open-Meteo Marine', 'modeled', marineRes.body?.current?.time, hasMarine, hasMarine ? '' : 'inland / non-ocean grid cell'));
        log(row('Sea surface temp', marineRes.body?.current?.sea_surface_temperature, 'Open-Meteo Marine', 'modeled', marineRes.body?.current?.time, marineRes.body?.current?.sea_surface_temperature != null));
    }
}

async function main() {
    log('# ClearSky — Real-Network Data Completeness Report');
    log(`\nGenerated: ${new Date().toISOString()} (GitHub Actions runner — full internet access)`);
    for (const loc of LOCATIONS) {
        try {
            await verifyLocation(loc);
        } catch (error) {
            log(`\n❌ Unexpected error verifying ${loc.label}: ${error.message}`);
        }
    }

    const report = lines.join('\n');
    if (process.env.GITHUB_STEP_SUMMARY) {
        const fs = await import('node:fs');
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
    }
}

main();
