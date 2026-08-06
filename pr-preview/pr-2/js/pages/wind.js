import { initChrome, onLocationChange, onUnitsChange, getUnits } from '../modules/chrome.js';
import { fetchJSON, cacheGet, cacheSet, formatUpdatedTime, makeAbortGroup } from '../modules/fetchUtils.js';
import { formatSpeed, getWindDirection } from '../modules/utils.js';
import { drawHourlyChart } from '../modules/visualization.js';

const abortGroup = makeAbortGroup();
let lastData = null;

function initApp() {
    initChrome({ page: 'wind' });

    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    async function loadWind(loc) {
        try {
            loadingEl.style.display = 'flex';
            errorEl.textContent = '';
            const signal = abortGroup();
            const key = `wind_page_${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`;
            let data = cacheGet(key, 5 * 60 * 1000);
            if (!data) {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=auto`;
                data = await fetchJSON(url, { signal, timeoutMs: 8000, retries: 1 });
                cacheSet(key, data);
            }
            lastData = data;
            render(data);
            loadingEl.style.display = 'none';
        } catch (error) {
            if (error?.message?.includes('superseded')) return;
            console.error('Wind page error:', error);
            errorEl.textContent = 'Unable to load wind data. Please try again.';
            loadingEl.style.display = 'none';
        }
    }

    function render(data) {
        const { speedUnit } = getUnits();
        const c = data.current || {};
        document.getElementById('wind-speed-value').textContent = c.wind_speed_10m != null ? formatSpeed(c.wind_speed_10m, speedUnit) : 'Data unavailable';
        document.getElementById('wind-direction-value').textContent = c.wind_direction_10m != null
            ? `${getWindDirection(c.wind_direction_10m)} (${Math.round(c.wind_direction_10m)}°)` : 'Data unavailable';
        document.getElementById('wind-gust-value').textContent = c.wind_gusts_10m != null ? `Gusts: ${formatSpeed(c.wind_gusts_10m, speedUnit)}` : 'Gusts: Data unavailable';

        const arrow = document.getElementById('compass-arrow');
        if (arrow && c.wind_direction_10m != null) {
            // Wind direction is "from"; rotate arrow to point where wind is blowing FROM
            arrow.style.transform = `rotate(${c.wind_direction_10m}deg)`;
        }

        const canvas = document.getElementById('wind-chart');
        if (canvas && data.hourly?.wind_speed_10m?.length) {
            const now = Date.now();
            const times = data.hourly.time.map(t => typeof t === 'number' ? t : new Date(t).getTime());
            let startIdx = times.findIndex(t => t >= now);
            if (startIdx < 0) startIdx = 0;
            drawHourlyChart(canvas, data.hourly.wind_speed_10m, startIdx, 24, {
                color: '#34C759',
                formatValue: v => formatSpeed(v, speedUnit)
            });
        }

        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())}`;
    }

    onLocationChange((loc) => { if (loc) loadWind(loc); });
    onUnitsChange(() => { if (lastData) render(lastData); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
