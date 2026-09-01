import { initChrome, onLocationChange } from '../modules/chrome.js';
import { fetchJSON, cacheGet, cacheSet, formatUpdatedTime, makeAbortGroup } from '../modules/fetchUtils.js';
import { getUVIndexDescription, getUVSeverityClass } from '../modules/utils.js';
import { drawHourlyChart } from '../modules/visualization.js';

const UNAVAILABLE = 'Data unavailable';
const abortGroup = makeAbortGroup();

const SAFETY_TEXT = {
    Low: 'Minimal sun protection needed for most people. Wear sunglasses on bright days.',
    Moderate: 'Wear sunscreen, a hat, and sunglasses. Seek shade during midday hours.',
    High: 'Protection required — sunscreen SPF 30+, hat, sunglasses, and shade between 10am–4pm.',
    'Very High': 'Extra protection needed. Minimize sun exposure during midday; unprotected skin burns quickly.',
    Extreme: 'Avoid sun exposure during midday hours. Skin and eye damage can occur in minutes.'
};

function initApp() {
    initChrome({ page: 'uv' });

    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    async function loadUV(loc) {
        try {
            loadingEl.style.display = 'flex';
            errorEl.textContent = '';
            const signal = abortGroup();
            const key = `uv_page_${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`;
            let data = cacheGet(key, 5 * 60 * 1000);
            if (!data) {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=uv_index&hourly=uv_index&daily=uv_index_max&timezone=auto`;
                data = await fetchJSON(url, { signal, timeoutMs: 8000, retries: 1 });
                cacheSet(key, data);
            }
            render(data);
            loadingEl.style.display = 'none';
        } catch (error) {
            if (error?.message?.includes('superseded')) return;
            console.error('UV page error:', error);
            errorEl.textContent = 'Unable to load UV data. Please try again.';
            loadingEl.style.display = 'none';
        }
    }

    function render(data) {
        const uv = data.current?.uv_index;
        const valueEl = document.getElementById('uv-page-value');
        const statusEl = document.getElementById('uv-page-status');
        valueEl.textContent = uv != null ? Math.round(uv) : '—';
        valueEl.classList.remove('sev-1', 'sev-2', 'sev-3', 'sev-4', 'sev-5', 'sev-6');
        if (uv != null) valueEl.classList.add(getUVSeverityClass(uv));
        const level = uv != null ? getUVIndexDescription(uv) : null;
        statusEl.textContent = level || UNAVAILABLE;

        const peak = data.daily?.uv_index_max?.[0];
        document.getElementById('uv-peak-value').textContent = peak != null ? `Today's peak: ${Math.round(peak)}` : "Today's peak: unavailable";

        document.getElementById('uv-safety-text').textContent = level ? SAFETY_TEXT[level] : 'UV data unavailable for this location.';

        const canvas = document.getElementById('uv-chart');
        if (canvas && data.hourly?.uv_index?.length) {
            const now = Date.now();
            const times = data.hourly.time.map(t => typeof t === 'number' ? t : new Date(t).getTime());
            let startIdx = times.findIndex(t => t >= now);
            if (startIdx < 0) startIdx = 0;
            drawHourlyChart(canvas, data.hourly.uv_index, startIdx, 24, { color: '#ff8c00', formatValue: v => `UV ${v.toFixed(1)}` });
        }

        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())}`;
    }

    onLocationChange((loc) => { if (loc) loadUV(loc); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
