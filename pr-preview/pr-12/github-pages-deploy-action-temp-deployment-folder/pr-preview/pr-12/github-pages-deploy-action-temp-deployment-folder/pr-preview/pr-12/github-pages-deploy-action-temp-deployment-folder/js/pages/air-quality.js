import { initChrome, onLocationChange } from '../modules/chrome.js';
import { fetchJSON, cacheGet, cacheSet, formatUpdatedTime, makeAbortGroup } from '../modules/fetchUtils.js';
import { getAirQualityDescription, getAQISeverityClass, getAirQualityImplication } from '../modules/utils.js';
import { drawHourlyChart } from '../modules/visualization.js';

const UNAVAILABLE = 'Data unavailable';
const abortGroup = makeAbortGroup();

function initApp() {
    initChrome({ page: 'air-quality' });

    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const modal = document.getElementById('aqi-info-modal');
    document.getElementById('aqi-info-btn')?.addEventListener('click', () => modal.classList.add('active'));
    modal?.querySelector('.close-btn')?.addEventListener('click', () => modal.classList.remove('active'));
    modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

    async function loadAirQuality(loc) {
        try {
            loadingEl.style.display = 'flex';
            errorEl.textContent = '';
            const signal = abortGroup();
            const key = `aqi_page_${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`;
            let data = cacheGet(key, 10 * 60 * 1000);
            if (!data) {
                const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.latitude}&longitude=${loc.longitude}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi&hourly=us_aqi&timezone=auto`;
                data = await fetchJSON(url, { signal, timeoutMs: 8000, retries: 1 });
                cacheSet(key, data);
            }
            render(data);
            loadingEl.style.display = 'none';
        } catch (error) {
            if (error?.message?.includes('superseded')) return;
            console.error('Air quality page error:', error);
            errorEl.textContent = 'Unable to load air quality data. Please try again.';
            loadingEl.style.display = 'none';
        }
    }

    function render(data) {
        const c = data.current || {};
        const aqi = c.us_aqi;
        const aqiValueEl = document.getElementById('aqi-page-value');
        aqiValueEl.textContent = aqi ?? '—';
        aqiValueEl.classList.remove('sev-1', 'sev-2', 'sev-3', 'sev-4', 'sev-5', 'sev-6');
        if (aqi != null) aqiValueEl.classList.add(getAQISeverityClass(aqi));
        document.getElementById('aqi-page-status').textContent = aqi != null ? `${getAirQualityDescription(aqi)} — ${getAirQualityImplication(aqi)}` : UNAVAILABLE;
        document.getElementById('aqi-eu-value').textContent = c.european_aqi != null ? `European AQI: ${c.european_aqi}` : 'European AQI: unavailable';

        const fields = [
            ['pm25-value', c.pm2_5], ['pm10-value', c.pm10], ['o3-value', c.ozone],
            ['no2-value', c.nitrogen_dioxide], ['so2-value', c.sulphur_dioxide], ['co-value', c.carbon_monoxide]
        ];
        fields.forEach(([id, value]) => {
            document.getElementById(id).textContent = value != null ? Math.round(value) : UNAVAILABLE;
        });

        const canvas = document.getElementById('aqi-chart');
        if (canvas && data.hourly?.us_aqi?.length) {
            const now = Date.now();
            const times = data.hourly.time.map(t => typeof t === 'number' ? t : new Date(t).getTime());
            let startIdx = times.findIndex(t => t >= now);
            if (startIdx < 0) startIdx = 0;
            drawHourlyChart(canvas, data.hourly.us_aqi, startIdx, 24, { color: '#8e44ad', formatValue: v => `AQI ${Math.round(v)}` });
        }

        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())}`;
    }

    onLocationChange((loc) => { if (loc) loadAirQuality(loc); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
