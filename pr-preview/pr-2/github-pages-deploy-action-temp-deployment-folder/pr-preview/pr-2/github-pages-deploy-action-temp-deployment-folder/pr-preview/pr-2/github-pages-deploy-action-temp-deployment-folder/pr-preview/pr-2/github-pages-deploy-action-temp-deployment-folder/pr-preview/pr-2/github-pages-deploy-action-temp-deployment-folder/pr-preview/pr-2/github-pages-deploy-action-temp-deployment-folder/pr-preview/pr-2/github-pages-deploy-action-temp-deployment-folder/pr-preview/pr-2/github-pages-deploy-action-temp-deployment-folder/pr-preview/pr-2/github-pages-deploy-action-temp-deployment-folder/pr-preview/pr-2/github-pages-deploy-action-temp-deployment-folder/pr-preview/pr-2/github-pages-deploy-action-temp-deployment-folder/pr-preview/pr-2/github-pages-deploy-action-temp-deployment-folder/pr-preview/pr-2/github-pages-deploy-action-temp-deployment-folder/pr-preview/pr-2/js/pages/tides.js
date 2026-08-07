import { initChrome, onLocationChange } from '../modules/chrome.js';
import { resolveNOAAStation, getNOAATideData, getMarineData } from '../modules/tideAPI.js';
import { formatUpdatedTime } from '../modules/fetchUtils.js';

const UNAVAILABLE = 'Data unavailable';

function show(id, display = '') { const el = document.getElementById(id); if (el) el.style.display = display; }
function hide(id) { show(id, 'none'); }

function fmtTime(t) {
    if (!t) return UNAVAILABLE;
    const d = typeof t === 'number' ? new Date(t) : new Date(t.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(t);
    return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

function drawTideCurve(canvas, points, valueKey = 'v') {
    if (!canvas || !points?.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const values = points.map(p => parseFloat(p[valueKey]));
    const min = Math.min(...values), max = Math.max(...values);
    const pad = 24;
    ctx.strokeStyle = '#33b7e0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
        const x = pad + (i / (values.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function initApp() {
    initChrome({ page: 'tides' });

    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    async function loadTides(loc) {
        try {
            loadingEl.style.display = 'flex';
            errorEl.textContent = '';
            hide('tide-next-events'); hide('tide-curve-card'); hide('marine-stats');
            hide('modeled-warning'); hide('inland-message');

            const isUS = loc.countryCode === 'US' || loc.country === 'United States';

            if (isUS) {
                const station = await resolveNOAAStation(loc.latitude, loc.longitude);
                if (station) {
                    const tideData = await getNOAATideData(station);
                    renderNOAA(loc, tideData);
                    loadingEl.style.display = 'none';
                    return;
                }
            }

            // Non-US, or no nearby NOAA station — try global modeled marine data
            const marine = await getMarineData(loc.latitude, loc.longitude);
            if (marine) {
                renderMarine(loc, marine);
            } else {
                document.getElementById('tide-station-info').textContent = '';
                show('inland-message', 'flex');
                document.getElementById('data-source-text').textContent = 'Source: —';
            }
            loadingEl.style.display = 'none';
        } catch (error) {
            console.error('Tides page error:', error);
            errorEl.textContent = 'Unable to load coastal data. Please try again.';
            loadingEl.style.display = 'none';
        }
    }

    function renderNOAA(loc, data) {
        document.getElementById('tide-station-info').innerHTML =
            `Station: <strong>${data.station.name}</strong> (#${data.station.id}) · ${data.station.distanceKm.toFixed(1)} km from search location`;

        show('tide-next-events', 'grid');
        document.getElementById('next-high-value').textContent = data.nextHigh ? fmtTime(data.nextHigh.t) : UNAVAILABLE;
        document.getElementById('next-high-height').textContent = data.nextHigh ? `${data.nextHigh.v} ft` : '';
        document.getElementById('next-low-value').textContent = data.nextLow ? fmtTime(data.nextLow.t) : UNAVAILABLE;
        document.getElementById('next-low-height').textContent = data.nextLow ? `${data.nextLow.v} ft` : '';
        document.getElementById('water-level-value').textContent = data.waterLevel ? `${data.waterLevel.value} ft` : UNAVAILABLE;
        document.getElementById('water-temp-value').textContent = data.waterTemperatureF != null ? `${data.waterTemperatureF}°F` : UNAVAILABLE;

        if (data.curve?.length) {
            show('tide-curve-card');
            drawTideCurve(document.getElementById('tide-chart'), data.curve, 'v');
        }

        document.getElementById('data-source-text').textContent = `Source: ${data.source} (official predictions${data.fetchErrors ? ', some fields unavailable' : ''})`;
        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())}`;
    }

    function renderMarine(loc, data) {
        document.getElementById('tide-station-info').textContent = `Modeled coastal data for ${loc.name} (no NOAA station in range)`;
        show('modeled-warning', 'flex');

        show('tide-next-events', 'grid');
        document.getElementById('next-high-value').textContent = data.nextHigh ? fmtTime(data.nextHigh.time) : UNAVAILABLE;
        document.getElementById('next-high-height').textContent = data.nextHigh ? `${data.nextHigh.value.toFixed(2)} m (modeled)` : '';
        document.getElementById('next-low-value').textContent = data.nextLow ? fmtTime(data.nextLow.time) : UNAVAILABLE;
        document.getElementById('next-low-height').textContent = data.nextLow ? `${data.nextLow.value.toFixed(2)} m (modeled)` : '';
        document.getElementById('water-level-value').textContent = data.current?.sea_level_height_msl != null ? `${data.current.sea_level_height_msl.toFixed(2)} m (modeled)` : UNAVAILABLE;
        document.getElementById('water-temp-value').textContent = data.current?.sea_surface_temperature != null ? `${data.current.sea_surface_temperature.toFixed(1)}°C` : UNAVAILABLE;

        if (data.hourlyHeights?.length) {
            show('tide-curve-card');
            const points = data.hourlyHeights.map(v => ({ v }));
            drawTideCurve(document.getElementById('tide-chart'), points, 'v');
        }

        show('marine-stats', 'grid');
        document.getElementById('wave-height-value').textContent = data.current?.wave_height != null ? `${data.current.wave_height.toFixed(1)} m` : UNAVAILABLE;
        document.getElementById('wave-period-value').textContent = data.current?.wave_period != null
            ? `${data.current.wave_period.toFixed(1)} s / ${data.current.wave_direction != null ? Math.round(data.current.wave_direction) + '°' : '--'}` : UNAVAILABLE;
        document.getElementById('sst-value').textContent = data.current?.sea_surface_temperature != null ? `${data.current.sea_surface_temperature.toFixed(1)}°C` : UNAVAILABLE;
        document.getElementById('current-value').textContent = data.current?.ocean_current_velocity != null
            ? `${data.current.ocean_current_velocity.toFixed(2)} km/h / ${data.current.ocean_current_direction != null ? Math.round(data.current.ocean_current_direction) + '°' : '--'}` : UNAVAILABLE;

        document.getElementById('data-source-text').textContent = `Source: ${data.source}`;
        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())}`;
    }

    onLocationChange((loc) => { if (loc) loadTides(loc); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
