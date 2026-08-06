import { initChrome, onLocationChange } from '../modules/chrome.js';
import { fetchJSON, cacheGet, cacheSet, formatUpdatedTime, makeAbortGroup } from '../modules/fetchUtils.js';
import { getWeatherIcon } from '../modules/utils.js';
import { drawHourlyChart } from '../modules/visualization.js';

const UNAVAILABLE = 'Data unavailable';
const abortGroup = makeAbortGroup();

function initApp() {
    initChrome({ page: 'rain' });

    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    async function loadRain(loc) {
        try {
            loadingEl.style.display = 'flex';
            errorEl.textContent = '';
            const signal = abortGroup();
            const key = `rain_page_${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`;
            let data = cacheGet(key, 5 * 60 * 1000);
            if (!data) {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
                    `&current=precipitation,rain,showers,snowfall,weather_code` +
                    `&hourly=precipitation_probability,precipitation,rain,showers,snowfall,weather_code` +
                    `&daily=precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_probability_max` +
                    `&timezone=auto`;
                data = await fetchJSON(url, { signal, timeoutMs: 8000, retries: 1 });
                cacheSet(key, data);
            }
            render(data);
            loadingEl.style.display = 'none';
        } catch (error) {
            if (error?.message?.includes('superseded')) return;
            console.error('Rain page error:', error);
            errorEl.textContent = 'Unable to load precipitation data. Please try again.';
            loadingEl.style.display = 'none';
        }
    }

    function render(data) {
        const c = data.current || {};
        document.getElementById('precip-current-value').textContent = c.precipitation != null ? `${c.precipitation} mm` : UNAVAILABLE;
        document.getElementById('precip-prob-value').textContent = data.daily?.precipitation_probability_max?.[0] != null
            ? `Chance of rain: ${data.daily.precipitation_probability_max[0]}%` : 'Chance of rain: unavailable';

        document.getElementById('rain-today').textContent = data.daily?.rain_sum?.[0] != null ? `${data.daily.rain_sum[0]} mm` : UNAVAILABLE;
        document.getElementById('showers-today').textContent = data.daily?.showers_sum?.[0] != null ? `${data.daily.showers_sum[0]} mm` : UNAVAILABLE;
        document.getElementById('snow-today').textContent = data.daily?.snowfall_sum?.[0] != null ? `${data.daily.snowfall_sum[0]} cm` : UNAVAILABLE;
        document.getElementById('total-today').textContent = data.daily?.precipitation_sum?.[0] != null ? `${data.daily.precipitation_sum[0]} mm` : UNAVAILABLE;

        // Next 8 hours strip
        const strip = document.getElementById('next8-strip');
        if (strip && data.hourly?.time?.length) {
            const now = Date.now();
            const times = data.hourly.time.map(t => typeof t === 'number' ? t : new Date(t).getTime());
            let startIdx = times.findIndex(t => t >= now);
            if (startIdx < 0) startIdx = 0;
            const cards = [];
            for (let i = startIdx; i < Math.min(startIdx + 8, times.length); i++) {
                const time = new Date(times[i]);
                const label = i === startIdx ? 'Now' : time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                const prob = data.hourly.precipitation_probability?.[i];
                cards.push(`
                    <div class="hour-card">
                        <span class="hour-time">${label}</span>
                        <i class="fas ${getWeatherIcon(data.hourly.weather_code[i])}"></i>
                        <span class="hour-temp">${prob != null ? prob + '%' : '--'}</span>
                        <span class="hour-precip">${(data.hourly.precipitation?.[i] ?? 0).toFixed(1)} mm</span>
                    </div>
                `);
            }
            strip.innerHTML = cards.join('');
        }

        const canvas = document.getElementById('rain-chart');
        if (canvas && data.hourly?.precipitation_probability?.length) {
            const now = Date.now();
            const times = data.hourly.time.map(t => typeof t === 'number' ? t : new Date(t).getTime());
            let startIdx = times.findIndex(t => t >= now);
            if (startIdx < 0) startIdx = 0;
            drawHourlyChart(canvas, data.hourly.precipitation_probability, startIdx, 24, { color: '#3498db', formatValue: v => `${Math.round(v)}%` });
        }

        const outlookEl = document.getElementById('daily-outlook');
        if (outlookEl && data.daily?.time?.length) {
            outlookEl.innerHTML = data.daily.time.map((t, i) => {
                const day = new Date(t).toLocaleDateString('en-US', { weekday: 'short' });
                const prob = data.daily.precipitation_probability_max?.[i];
                const sum = data.daily.precipitation_sum?.[i];
                return `<div class="outlook-row"><span class="outlook-day">${day}</span><span class="outlook-prob">${prob != null ? prob + '%' : '--'}</span><span class="outlook-sum">${sum != null ? sum + ' mm' : UNAVAILABLE}</span></div>`;
            }).join('');
        }

        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())}`;
    }

    onLocationChange((loc) => { if (loc) loadRain(loc); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
