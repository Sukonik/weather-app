import { initChrome, onLocationChange } from '../modules/chrome.js';
import { getMoonData } from '../modules/moonAPI.js';
import { formatUpdatedTime } from '../modules/fetchUtils.js';

const UNAVAILABLE = 'Data unavailable';

const PHASE_EMOJI = {
    'New Moon': '🌑', 'Waxing Crescent': '🌒', 'First Quarter': '🌓', 'Waxing Gibbous': '🌔',
    'Full Moon': '🌕', 'Waning Gibbous': '🌖', 'Last Quarter': '🌗', 'Waning Crescent': '🌘'
};

function initApp() {
    initChrome({ page: 'moon' });

    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    async function loadMoon(loc) {
        try {
            loadingEl.style.display = 'flex';
            errorEl.textContent = '';
            const data = await getMoonData(loc.latitude, loc.longitude);
            render(data);
            loadingEl.style.display = 'none';
        } catch (error) {
            console.error('Moon page error:', error);
            errorEl.textContent = 'Unable to load moon data. Please try again.';
            loadingEl.style.display = 'none';
        }
    }

    function render(data) {
        document.getElementById('moon-icon').textContent = PHASE_EMOJI[data.phaseName] || '🌙';
        document.getElementById('moon-phase-value').textContent = data.phaseName || UNAVAILABLE;
        document.getElementById('moon-illum-value').textContent = data.illumination != null ? `Illumination: ${data.illumination}%` : 'Illumination: unavailable';

        document.getElementById('moonrise-value').textContent = data.moonrise || UNAVAILABLE;
        document.getElementById('moonset-value').textContent = data.moonset || UNAVAILABLE;
        document.getElementById('transit-value').textContent = data.transit || UNAVAILABLE;

        const listEl = document.getElementById('moon-phases-list');
        if (listEl) {
            listEl.innerHTML = (data.upcomingPhases || []).map(p => `
                <div class="outlook-row">
                    <span class="outlook-day">${PHASE_EMOJI[p.phase] || '🌙'} ${p.phase}</span>
                    <span class="outlook-sum">${p.date}${p.time ? ' ' + p.time : ''}</span>
                </div>
            `).join('') || `<div class="outlook-row">${UNAVAILABLE}</div>`;
        }

        const sourceEl = document.getElementById('data-source-text');
        if (sourceEl) {
            sourceEl.textContent = data.isModeled
                ? 'Source: Calculated locally (approximate — USNO unavailable)'
                : 'Source: U.S. Naval Observatory (USNO)';
        }
        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())}`;
    }

    onLocationChange((loc) => { if (loc) loadMoon(loc); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
