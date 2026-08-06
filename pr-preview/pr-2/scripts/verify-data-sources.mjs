#!/usr/bin/env node
// Real-network acceptance check for ClearSky's data layer. Runs on GitHub's
// CI runner (has open internet egress) because the authoring sandbox this
// was built in does not. Calls the *actual* Open-Meteo APIs — no mocks —
// for the six required test locations and produces a field-completeness
// report as both JSON (artifact) and Markdown (job summary).

const LOCATIONS = [
    { label: 'Long Beach, NY 11561', query: '11561' },
    { label: 'New York, NY 10001', query: '10001' },
    { label: 'North York, Ontario', query: 'North York, Ontario' },
    { label: 'Toronto, Canada', query: 'Toronto, Canada' },
    { label: 'Grenada', query: 'Grenada' },
    { label: 'Jamaica', query: 'Jamaica' }
];

const CURRENT_FIELDS = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility,dew_point_2m,pressure_msl,surface_pressure,cloud_cover';
const DAILY_FIELDS = 'precipitation_probability_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset';
const AQ_FIELDS = 'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi';

const FIELD_MAP = [
    ['Temperature', 'current.temperature_2m'],
    ['Feels-like temperature', 'current.apparent_temperature'],
    ['Condition (weather code)', 'current.weather_code'],
    ['Daily high', 'daily.temperature_2m_max.0'],
    ['Daily low', 'daily.temperature_2m_min.0'],
    ['Humidity', 'current.relative_humidity_2m'],
    ['Dew point', 'current.dew_point_2m'],
    ['Current precipitation', 'current.precipitation'],
    ['Precipitation probability (daily max)', 'daily.precipitation_probability_max.0'],
    ['Rain', 'current.rain'],
    ['Showers', 'current.showers'],
    ['Snowfall', 'current.snowfall'],
    ['Wind speed', 'current.wind_speed_10m'],
    ['Wind gust', 'current.wind_gusts_10m'],
    ['Wind direction', 'current.wind_direction_10m'],
    ['Visibility', 'current.visibility'],
    ['Pressure (MSL)', 'current.pressure_msl'],
    ['Cloud cover', 'current.cloud_cover'],
    ['Current UV index', 'current.uv_index'],
    ['Daily peak UV', 'daily.uv_index_max.0'],
    ['Sunrise', 'daily.sunrise.0'],
    ['Sunset', 'daily.sunset.0'],
    ['US AQI', 'aq.current.us_aqi'],
    ['European AQI', 'aq.current.european_aqi'],
    ['PM2.5', 'aq.current.pm2_5'],
    ['PM10', 'aq.current.pm10'],
    ['Ozone', 'aq.current.ozone'],
    ['Nitrogen dioxide', 'aq.current.nitrogen_dioxide'],
    ['Sulphur dioxide', 'aq.current.sulphur_dioxide'],
    ['Carbon monoxide', 'aq.current.carbon_monoxide']
];

function get(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function fetchJSON(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { ok: res.ok, status: res.status, body };
}

async function run() {
    const report = [];

    for (const loc of LOCATIONS) {
        const entry = { location: loc.label, query: loc.query, timestamp: new Date().toISOString() };

        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc.query)}&count=10&language=en&format=json`;
        const geo = await fetchJSON(geoUrl).catch(e => ({ ok: false, error: String(e) }));
        entry.geocoding = { ok: geo.ok, status: geo.status, resultCount: geo.body?.results?.length ?? 0 };

        if (!geo.ok || !geo.body?.results?.length) {
            entry.geocoding.error = geo.body?.reason || geo.error || 'No results';
            report.push(entry);
            continue;
        }

        entry.geocoding.results = geo.body.results.slice(0, 5).map(r => ({
            name: r.name, admin1: r.admin1, admin2: r.admin2, country: r.country,
            feature_code: r.feature_code, postcodes: r.postcodes, latitude: r.latitude, longitude: r.longitude
        }));
        entry.geocoding.ambiguous = geo.body.results.length > 1;

        const top = geo.body.results[0];
        entry.resolvedTo = { name: top.name, admin1: top.admin1, country: top.country, latitude: top.latitude, longitude: top.longitude };

        const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${top.latitude}&longitude=${top.longitude}&current=${CURRENT_FIELDS}&daily=${DAILY_FIELDS}&timezone=auto`;
        const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${top.latitude}&longitude=${top.longitude}&current=${AQ_FIELDS}`;

        const [wx, aq] = await Promise.all([
            fetchJSON(wxUrl).catch(e => ({ ok: false, error: String(e) })),
            fetchJSON(aqUrl).catch(e => ({ ok: false, error: String(e) }))
        ]);

        entry.weather = { ok: wx.ok, status: wx.status };
        entry.airQuality = { ok: aq.ok, status: aq.status };

        const merged = { current: wx.body?.current, daily: wx.body?.daily, aq: aq.body };
        entry.fields = FIELD_MAP.map(([label, path]) => {
            const value = get(merged, path);
            const available = value !== undefined && value !== null;
            return { field: label, value: available ? value : null, available, reason: available ? null : 'Not returned by source' };
        });

        report.push(entry);
        // Be polite to the free API — small delay between locations
        await new Promise(r => setTimeout(r, 300));
    }

    const fs = await import('node:fs');
    fs.writeFileSync('data-source-report.json', JSON.stringify(report, null, 2));

    let md = '# ClearSky real-data acceptance report\n\n';
    md += `Generated ${new Date().toISOString()} against live Open-Meteo APIs (no mocks).\n\n`;
    for (const entry of report) {
        md += `## ${entry.location}\n\n`;
        md += `- Query: \`${entry.query}\`\n`;
        md += `- Geocoding: ${entry.geocoding.ok ? '✅' : '❌'} (${entry.geocoding.resultCount} result(s)${entry.geocoding.ambiguous ? ', **ambiguous — disambiguation required**' : ''})\n`;
        if (entry.geocoding.results) {
            for (const r of entry.geocoding.results) {
                md += `  - ${r.name}${r.admin2 ? ', ' + r.admin2 : ''}${r.admin1 ? ', ' + r.admin1 : ''} — ${r.country} (${r.feature_code}, ${r.latitude}, ${r.longitude})\n`;
            }
        }
        if (entry.resolvedTo) {
            md += `- Resolved to: **${entry.resolvedTo.name}, ${entry.resolvedTo.admin1 || ''} ${entry.resolvedTo.country}** (${entry.resolvedTo.latitude}, ${entry.resolvedTo.longitude})\n`;
            md += `- Weather API: ${entry.weather.ok ? '✅' : '❌ ' + entry.weather.status}, Air Quality API: ${entry.airQuality.ok ? '✅' : '❌ ' + entry.airQuality.status}\n\n`;
            md += `| Field | Available | Value |\n|---|---|---|\n`;
            for (const f of entry.fields) {
                md += `| ${f.field} | ${f.available ? '✅' : '❌ ' + f.reason} | ${f.available ? JSON.stringify(f.value) : '—'} |\n`;
            }
            md += '\n';
        } else {
            md += `- **No coordinates resolved — could not fetch weather/AQI.**\n\n`;
        }
    }

    fs.writeFileSync('data-source-report.md', md);
    console.log(md);

    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    }
}

run().catch(err => {
    console.error('Verification script failed:', err);
    process.exit(1);
});
