// Shared app "chrome": logo, theme switcher, unit toggles, location bar
// (search + disambiguation + quick picks + geolocation), and the top-right
// nav menu. Every page mounts this into a single <div id="app-chrome"></div>
// so the header/nav never drifts between pages (no build step, so this is
// the DRY mechanism instead of an HTML partial/include).
import { searchLocations, reverseGeocode, formatLocationLabel, formatLocationDetail, saveLastLocation, getLastLocation, QUICK_LOCATIONS } from './location.js';
import { makeAbortGroup } from './fetchUtils.js';

const PAGES = [
    { id: 'overview', label: 'Overview', href: 'index.html', icon: 'fa-house' },
    { id: 'tides', label: 'Tide Charts', href: 'tides.html', icon: 'fa-water' },
    { id: 'air-quality', label: 'Air Quality', href: 'air-quality.html', icon: 'fa-wind' },
    { id: 'wind', label: 'Wind Data', href: 'wind.html', icon: 'fa-flag' },
    { id: 'rain', label: 'Rain Data', href: 'rain.html', icon: 'fa-cloud-rain' },
    { id: 'uv', label: 'UV Index', href: 'uv.html', icon: 'fa-sun' },
    { id: 'moon', label: 'Moon Phases', href: 'moon.html', icon: 'fa-moon' }
];

let state = {
    theme: localStorage.getItem('theme') || 'dark',
    unit: localStorage.getItem('unit') || 'C',
    speedUnit: localStorage.getItem('speedUnit') || 'km/h',
    location: getLastLocation()
};

const searchAbort = makeAbortGroup();
const listeners = { locationchange: [] };

export function onLocationChange(fn) {
    listeners.locationchange.push(fn);
    if (state.location) fn(state.location);
}

function emitLocationChange() {
    listeners.locationchange.forEach(fn => fn(state.location));
}

export function getUnits() {
    return { unit: state.unit, speedUnit: state.speedUnit };
}

export function onUnitsChange(fn) {
    document.addEventListener('clearsky:unitschange', () => fn(getUnits()));
}

export function getCurrentLocation() {
    return state.location;
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    state.theme = theme;
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === theme);
    });
}

function applyUnits() {
    document.querySelectorAll('.unit-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.unit === state.unit));
    document.querySelectorAll('.speed-unit-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.speedUnit === state.speedUnit));
    document.dispatchEvent(new CustomEvent('clearsky:unitschange', { detail: getUnits() }));
}

function updateClock(root) {
    const now = new Date();
    const timeEl = root.querySelector('.current-time');
    const dateEl = root.querySelector('.current-date');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function chromeTemplate(activePage) {
    const themeOptions = ['dark', 'light', 'ocean', 'jungle', 'sunset', 'coffee'];
    const themeIcons = { dark: 'fa-moon', light: 'fa-sun', ocean: 'fa-water', jungle: 'fa-leaf', sunset: 'fa-cloud-sun', coffee: 'fa-mug-hot' };
    return `
        <div class="app-logo">
            <div class="logo-icon"><div class="sun-circle"></div><div class="sun-rays"></div></div>
            <div class="logo-text"><h1>ClearSky</h1><span>Weather App</span></div>
        </div>
        <header>
            <div class="top-bar">
                <div class="left-section">
                    <div class="theme-selector">
                        <button id="theme-btn" class="theme-btn"><i class="fas fa-palette"></i><span>Theme</span></button>
                        <div class="theme-dropdown">
                            ${themeOptions.map(t => `<button class="theme-option" data-theme="${t}"><i class="fas ${themeIcons[t]}"></i> ${t[0].toUpperCase()}${t.slice(1)}</button>`).join('')}
                        </div>
                    </div>
                    <div class="current-datetime">
                        <span class="current-time">--:-- --</span>
                        <span class="current-date">---, --- --</span>
                    </div>
                </div>
                <div class="chrome-right">
                    <div class="unit-toggle">
                        <div class="temp-units">
                            <button class="unit-btn" data-unit="C">°C</button><span class="separator">|</span>
                            <button class="unit-btn" data-unit="F">°F</button>
                        </div>
                        <span class="units-separator"></span>
                        <div class="speed-units">
                            <button class="speed-unit-btn" data-speed-unit="km/h">km/h</button><span class="separator">|</span>
                            <button class="speed-unit-btn" data-speed-unit="mph">mph</button>
                        </div>
                    </div>
                    <div class="nav-selector">
                        <button id="nav-btn" class="theme-btn nav-btn" aria-label="Menu"><i class="fas fa-bars"></i></button>
                        <div class="nav-dropdown" id="nav-dropdown">
                            ${PAGES.map(p => `<a class="nav-option${p.id === activePage ? ' active' : ''}" href="${p.href}"><i class="fas ${p.icon}"></i> ${p.label}</a>`).join('')}
                        </div>
                    </div>
                </div>
            </div>
            <div class="search-container">
                <div class="search-wrapper">
                    <input type="text" id="location-search" placeholder="Search city, state, country, or ZIP...">
                    <div id="search-suggestions" class="search-suggestions"></div>
                </div>
                <button id="search-btn" aria-label="Search"><i class="fas fa-search"></i></button>
                <button id="current-location-btn" aria-label="Use current location"><i class="fas fa-location-dot"></i></button>
            </div>
            <div class="quick-locations" id="quick-locations">
                ${QUICK_LOCATIONS.map(q => `<button class="quick-loc-btn" data-query="${q.query}">${q.label}</button>`).join('')}
            </div>
            <div class="location-summary" id="location-summary"></div>
        </header>
        <div class="modal" id="location-picker-modal">
            <div class="modal-content">
                <div class="modal-header"><h3>📍 Multiple matches — pick one</h3><button class="close-btn"><i class="fas fa-times"></i></button></div>
                <div class="modal-body"><div class="location-picker-list" id="location-picker-list"></div></div>
            </div>
        </div>
    `;
}

function renderLocationSummary(root, loc) {
    const el = root.querySelector('#location-summary');
    if (!el) return;
    if (!loc) { el.textContent = ''; return; }
    const bits = [loc.name];
    if (loc.admin1 && loc.admin1 !== loc.name) bits.push(loc.admin1);
    if (loc.country) bits.push(loc.country);
    let text = bits.join(', ');
    if (loc.postcode) text += ` · ${loc.postcode}`;
    if (loc.elevation != null) text += ` · ${Math.round(loc.elevation)}m elev.`;
    el.textContent = text;
}

async function selectLocation(root, loc) {
    state.location = loc;
    saveLastLocation(loc);
    renderLocationSummary(root, loc);
    const input = root.querySelector('#location-search');
    if (input) input.value = formatLocationLabel(loc);
    emitLocationChange();
}

function showPicker(root, candidates) {
    const modal = root.querySelector('#location-picker-modal');
    const list = root.querySelector('#location-picker-list');
    list.innerHTML = candidates.map((c, i) => `
        <button class="guide-item location-picker-item" data-index="${i}">
            <h4>${c.name}${c.featureCode === 'PCLI' ? ' (Country)' : ''}</h4>
            <p>${formatLocationDetail(c) || '—'}</p>
        </button>
    `).join('');
    list.querySelectorAll('.location-picker-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const c = candidates[Number(btn.dataset.index)];
            modal.classList.remove('active');
            selectLocation(root, c);
        });
    });
    modal.classList.add('active');
}

async function runSearch(root, query) {
    const errorBanner = document.getElementById('error');
    try {
        const signal = searchAbort();
        const results = await searchLocations(query, { signal });
        if (!results.length) {
            if (errorBanner) errorBanner.textContent = `No location found for "${query}". Try a different spelling or a nearby city.`;
            return;
        }
        if (errorBanner) errorBanner.textContent = '';
        if (results.length === 1) {
            await selectLocation(root, results[0]);
        } else {
            showPicker(root, results);
        }
    } catch (error) {
        if (error?.message?.includes('superseded')) return;
        if (errorBanner) errorBanner.textContent = 'Location search failed. Please check your connection and try again.';
        console.error('Location search error:', error);
    }
}

function wireSearchSuggestions(root) {
    const input = root.querySelector('#location-search');
    const suggestions = root.querySelector('#search-suggestions');
    let debounce = null;
    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearTimeout(debounce);
        if (q.length < 2) { suggestions.classList.remove('active'); return; }
        debounce = setTimeout(async () => {
            try {
                const signal = searchAbort();
                const results = await searchLocations(q, { signal });
                if (!results.length) { suggestions.classList.remove('active'); return; }
                suggestions.innerHTML = results.slice(0, 6).map((r, i) => `
                    <div class="suggestion-item" data-index="${i}">
                        <div class="location-name">${r.name}${r.featureCode === 'PCLI' ? ' (Country)' : ''}</div>
                        <div class="location-detail">${formatLocationDetail(r) || '—'}</div>
                    </div>
                `).join('');
                suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', () => {
                        suggestions.classList.remove('active');
                        selectLocation(root, results[Number(item.dataset.index)]);
                    });
                });
                suggestions.classList.add('active');
            } catch (error) {
                if (!error?.message?.includes('superseded')) suggestions.classList.remove('active');
            }
        }, 300);
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) suggestions.classList.remove('active');
    });
}

export function initChrome({ page = 'overview' } = {}) {
    const mount = document.getElementById('app-chrome');
    if (!mount) throw new Error('initChrome: #app-chrome mount point not found');
    mount.innerHTML = chromeTemplate(page);

    applyTheme(state.theme);
    applyUnits();
    updateClock(mount);
    setInterval(() => updateClock(mount), 1000);

    // Theme dropdown
    const themeBtn = mount.querySelector('#theme-btn');
    const themeDropdown = mount.querySelector('.theme-dropdown');
    themeBtn.addEventListener('click', (e) => { e.stopPropagation(); themeDropdown.classList.toggle('active'); });
    mount.querySelectorAll('.theme-option').forEach(opt => {
        opt.addEventListener('click', () => { applyTheme(opt.dataset.theme); themeDropdown.classList.remove('active'); });
    });

    // Nav dropdown
    const navBtn = mount.querySelector('#nav-btn');
    const navDropdown = mount.querySelector('#nav-dropdown');
    navBtn.addEventListener('click', (e) => { e.stopPropagation(); navDropdown.classList.toggle('active'); });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.theme-selector')) themeDropdown.classList.remove('active');
        if (!e.target.closest('.nav-selector')) navDropdown.classList.remove('active');
    });

    // Unit toggles
    mount.querySelectorAll('.unit-btn').forEach(btn => btn.addEventListener('click', () => {
        state.unit = btn.dataset.unit;
        localStorage.setItem('unit', state.unit);
        applyUnits();
    }));
    mount.querySelectorAll('.speed-unit-btn').forEach(btn => btn.addEventListener('click', () => {
        state.speedUnit = btn.dataset.speedUnit;
        localStorage.setItem('speedUnit', state.speedUnit);
        applyUnits();
    }));

    // Search
    wireSearchSuggestions(mount);
    mount.querySelector('#search-btn').addEventListener('click', () => {
        const q = mount.querySelector('#location-search').value.trim();
        if (q) runSearch(mount, q);
    });
    mount.querySelector('#location-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const q = e.target.value.trim();
            if (q) runSearch(mount, q);
        }
    });

    // Quick locations
    mount.querySelectorAll('.quick-loc-btn').forEach(btn => {
        btn.addEventListener('click', () => runSearch(mount, btn.dataset.query));
    });

    // Current location
    mount.querySelector('#current-location-btn').addEventListener('click', async () => {
        const errorBanner = document.getElementById('error');
        if (!navigator.geolocation) {
            if (errorBanner) errorBanner.textContent = 'Geolocation is not supported by your browser. Please use the search bar.';
            return;
        }
        try {
            const position = await new Promise((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
            );
            const { latitude, longitude } = position.coords;
            const loc = await reverseGeocode(latitude, longitude);
            await selectLocation(mount, loc);
            if (errorBanner) errorBanner.textContent = '';
        } catch (error) {
            if (errorBanner) errorBanner.textContent = 'Unable to get your location. Please allow location access or use the search bar.';
            console.error('Geolocation error:', error);
        }
    });

    // Modal close
    const modal = mount.querySelector('#location-picker-modal');
    modal.querySelector('.close-btn').addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

    // Restore last location, else attempt geolocation silently
    if (state.location) {
        renderLocationSummary(mount, state.location);
        mount.querySelector('#location-search').value = formatLocationLabel(state.location);
        emitLocationChange();
    } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const loc = await reverseGeocode(position.coords.latitude, position.coords.longitude);
            await selectLocation(mount, loc);
        }, () => { /* silent — user can search manually */ }, { timeout: 8000 });
    }
}
