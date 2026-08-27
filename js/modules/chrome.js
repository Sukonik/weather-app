// Shared app "chrome": logo, theme switcher, unit toggles, location bar
// (search + disambiguation + Favorite Locations + geolocation), and the
// top-right nav menu. Every page mounts this into a single
// <div id="app-chrome"></div> so the header/nav never drifts between pages
// (no build step, so this is the DRY mechanism instead of an HTML partial).
import { searchLocations, reverseGeocode, formatLocationLabel, formatLocationDetail, saveLastLocation, getLastLocation, FAVORITE_LOCATIONS } from './location.js';
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
    lengthUnit: localStorage.getItem('lengthUnit') || 'ft',
    location: getLastLocation()
};

// Separate abort groups for the two independent request streams: live
// as-you-type suggestions vs. an explicit search (Enter/button/quick-pick).
// They used to share one group, which meant a suggestions fetch that was
// still in flight when the user pressed Enter could abort the *real*
// search request moments after it started (the debounce timer firing
// after Enter, not before) — silently breaking the search with no
// visible error. cancelPendingSuggestions() is also called before every
// explicit search so no stray suggestions fetch is even in flight.
const searchAbort = makeAbortGroup();
const suggestAbort = makeAbortGroup();
let cancelPendingSuggestions = () => {};
const listeners = { locationchange: [] };
let locationGeneration = 0; // bumped on every explicit location selection

/**
 * navigator.geolocation's own `timeout` option is only honored once the
 * browser has resolved its permission prompt — if the prompt is left open
 * or silently swallowed (seen in some embedded/headless contexts), the
 * native call never settles at all, which would otherwise leave the
 * loading UI stuck forever. A JS-level race guarantees this always
 * resolves within ~9s no matter what the browser does.
 */
function getCurrentPositionWithHardTimeout() {
    return Promise.race([
        new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 })
        ),
        new Promise((_, reject) => setTimeout(() => reject({ code: 3 }), 9000))
    ]);
}

export function onLocationChange(fn) {
    listeners.locationchange.push(fn);
    if (state.location) fn(state.location);
}

function emitLocationChange() {
    listeners.locationchange.forEach(fn => fn(state.location));
}

export function getUnits() {
    return { unit: state.unit, speedUnit: state.speedUnit, lengthUnit: state.lengthUnit };
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
    document.querySelectorAll('.length-unit-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lengthUnit === state.lengthUnit));
    document.dispatchEvent(new CustomEvent('clearsky:unitschange', { detail: getUnits() }));
}

/** Local time for a favorite's stored IANA timezone — no weather fetch,
 * just Intl formatting, so opening this menu never makes a network call. */
function formatFavoriteTime(fav) {
    try {
        return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: fav.timezone || undefined });
    } catch {
        return '--:--';
    }
}

function favoriteRowHTML(fav, selectedId) {
    const isSelected = fav.id === selectedId;
    const place = [fav.admin1, fav.country].filter(Boolean).join(', ');
    return `
        <button class="favorite-item${isSelected ? ' selected' : ''}" data-fav-id="${fav.id}"${isSelected ? ' aria-current="true"' : ''}>
            <span class="favorite-emoji" aria-hidden="true">${fav.emoji}</span>
            <span class="favorite-info">
                <span class="favorite-name">${fav.name}${place ? `, ${place}` : ''}</span>
                <span class="favorite-time">${formatFavoriteTime(fav)}${fav.permanent ? ' • Home' : ''}</span>
            </span>
            ${isSelected ? '<i class="fas fa-check favorite-check" aria-hidden="true"></i>' : ''}
        </button>
    `;
}

function updateClock(root) {
    const now = new Date();
    const timeEl = root.querySelector('.current-time');
    const dateEl = root.querySelector('.current-date');
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function chromeTemplate(activePage, selectedId) {
    const themeOptions = ['dark', 'light', 'ocean', 'jungle', 'sunset', 'coffee'];
    const themeIcons = { dark: 'fa-moon', light: 'fa-sun', ocean: 'fa-water', jungle: 'fa-leaf', sunset: 'fa-cloud-sun', coffee: 'fa-mug-hot' };
    const home = FAVORITE_LOCATIONS.find(f => f.permanent);
    const rest = FAVORITE_LOCATIONS.filter(f => !f.permanent);
    return `
        <a class="app-logo" href="index.html" aria-label="ClearSky home">
            <div class="logo-icon"><div class="sun-circle"></div><div class="sun-rays"></div></div>
            <div class="logo-text"><h1>ClearSky</h1><span>Weather App</span></div>
        </a>
        <header>
            <div class="top-bar">
                <div class="left-section">
                    <div class="nav-selector">
                        <button id="nav-btn" class="theme-btn nav-btn" aria-label="Menu" aria-haspopup="true" aria-expanded="false"><i class="fas fa-bars"></i></button>
                        <div class="nav-dropdown" id="nav-dropdown">
                            ${PAGES.map(p => `<a class="nav-option${p.id === activePage ? ' active' : ''}" href="${p.href}"${p.id === activePage ? ' aria-current="page"' : ''}><i class="fas ${p.icon}"></i> ${p.label}</a>`).join('')}
                        </div>
                    </div>
                    <div class="theme-selector">
                        <button id="theme-btn" class="theme-btn" aria-label="Theme" aria-haspopup="true" aria-expanded="false"><i class="fas fa-palette"></i><span>Theme</span></button>
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
                        <span class="units-separator"></span>
                        <div class="length-units">
                            <button class="length-unit-btn" data-length-unit="ft">ft</button><span class="separator">|</span>
                            <button class="length-unit-btn" data-length-unit="m">m</button>
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
                <div class="favorites-selector">
                    <button id="favorites-btn" class="theme-btn favorites-btn" aria-label="Favorite Locations" aria-haspopup="true" aria-expanded="false">
                        <i class="fas fa-heart"></i><span>Favorites</span>
                    </button>
                    <div class="favorites-dropdown" id="favorites-dropdown" aria-label="Favorite Locations">
                        <div class="favorites-section">
                            <h4 class="favorites-section-title">🏠 Home</h4>
                            ${favoriteRowHTML(home, selectedId)}
                        </div>
                        <div class="favorites-section">
                            <h4 class="favorites-section-title">❤️ Favorites</h4>
                            ${rest.map(f => favoriteRowHTML(f, selectedId)).join('')}
                        </div>
                    </div>
                </div>
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
    locationGeneration++;
    state.location = loc;
    saveLastLocation(loc);
    renderLocationSummary(root, loc);
    const input = root.querySelector('#location-search');
    if (input) input.value = formatLocationLabel(loc);
    updateFavoritesSelection(root, loc);
    emitLocationChange();
}

/** Keeps the Favorites dropdown's checkmark/aria-current in sync with
 * whatever location is actually active, however it was selected (search,
 * disambiguation picker, geolocation, or a favorite itself). */
function updateFavoritesSelection(root, loc) {
    const dropdown = root.querySelector('#favorites-dropdown');
    if (!dropdown) return;
    dropdown.querySelectorAll('.favorite-item').forEach(item => {
        const isSelected = loc && item.dataset.favId === loc.id;
        item.classList.toggle('selected', isSelected);
        if (isSelected) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
        const check = item.querySelector('.favorite-check');
        if (isSelected && !check) {
            item.insertAdjacentHTML('beforeend', '<i class="fas fa-check favorite-check" aria-hidden="true"></i>');
        } else if (!isSelected && check) {
            check.remove();
        }
    });
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
    cancelPendingSuggestions();
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
    cancelPendingSuggestions = () => {
        clearTimeout(debounce);
        suggestAbort(); // abort any suggestions fetch already in flight
    };
    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearTimeout(debounce);
        if (q.length < 2) { suggestions.classList.remove('active'); return; }
        debounce = setTimeout(async () => {
            try {
                const signal = suggestAbort();
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
    mount.innerHTML = chromeTemplate(page, state.location?.id);

    applyTheme(state.theme);
    applyUnits();
    updateClock(mount);
    setInterval(() => updateClock(mount), 1000);

    // Theme, Menu, and Favorites dropdowns are mutually exclusive: opening
    // one always closes the other two, Escape closes whichever is open and
    // returns focus to its trigger button, and a click outside all three
    // closes all three.
    const themeBtn = mount.querySelector('#theme-btn');
    const themeDropdown = mount.querySelector('.theme-dropdown');
    const navBtn = mount.querySelector('#nav-btn');
    const navDropdown = mount.querySelector('#nav-dropdown');
    const favoritesBtn = mount.querySelector('#favorites-btn');
    const favoritesDropdown = mount.querySelector('#favorites-dropdown');

    const dropdowns = [
        { btn: themeBtn, panel: themeDropdown },
        { btn: navBtn, panel: navDropdown },
        { btn: favoritesBtn, panel: favoritesDropdown }
    ];

    function closeDropdown(d) {
        d.panel.classList.remove('active');
        d.btn.setAttribute('aria-expanded', 'false');
    }
    function openDropdown(d) {
        dropdowns.filter(other => other !== d).forEach(closeDropdown);
        d.panel.classList.add('active');
        d.btn.setAttribute('aria-expanded', 'true');
    }
    function toggleDropdown(d) {
        if (d.panel.classList.contains('active')) closeDropdown(d);
        else openDropdown(d);
    }

    dropdowns.forEach(d => {
        d.btn.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(d); });
    });
    mount.querySelectorAll('.theme-option').forEach(opt => {
        opt.addEventListener('click', () => { applyTheme(opt.dataset.theme); closeDropdown(dropdowns[0]); });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.theme-selector')) closeDropdown(dropdowns[0]);
        if (!e.target.closest('.nav-selector')) closeDropdown(dropdowns[1]);
        if (!e.target.closest('.favorites-selector')) closeDropdown(dropdowns[2]);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const open = dropdowns.find(d => d.panel.classList.contains('active'));
        if (open) {
            closeDropdown(open);
            open.btn.focus();
        }
    });

    // Favorite Locations: clicking a favorite loads its canonical,
    // hand-verified location object directly — never re-run as a text
    // search, so a saved shortcut can never resolve to the wrong country.
    favoritesDropdown.querySelectorAll('.favorite-item').forEach(item => {
        item.addEventListener('click', () => {
            const fav = FAVORITE_LOCATIONS.find(f => f.id === item.dataset.favId);
            if (fav) selectLocation(mount, fav);
            closeDropdown(dropdowns[2]);
            favoritesBtn.focus();
        });
    });
    // Refresh each favorite's local-time label periodically while mounted —
    // cheap Intl formatting only, never a network request.
    setInterval(() => {
        favoritesDropdown.querySelectorAll('.favorite-item').forEach(item => {
            const fav = FAVORITE_LOCATIONS.find(f => f.id === item.dataset.favId);
            const timeEl = item.querySelector('.favorite-time');
            if (fav && timeEl) timeEl.textContent = `${formatFavoriteTime(fav)}${fav.permanent ? ' • Home' : ''}`;
        });
    }, 30000);

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
    mount.querySelectorAll('.length-unit-btn').forEach(btn => btn.addEventListener('click', () => {
        state.lengthUnit = btn.dataset.lengthUnit;
        localStorage.setItem('lengthUnit', state.lengthUnit);
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

    // Current location
    mount.querySelector('#current-location-btn').addEventListener('click', async () => {
        const errorBanner = document.getElementById('error');
        if (!navigator.geolocation) {
            if (errorBanner) errorBanner.textContent = 'Geolocation is not supported by your browser. Please use the search bar.';
            return;
        }
        try {
            const position = await getCurrentPositionWithHardTimeout();
            const { latitude, longitude } = position.coords;
            const loc = await reverseGeocode(latitude, longitude);
            await selectLocation(mount, loc);
            if (errorBanner) errorBanner.textContent = '';
        } catch (error) {
            const message = error?.code === 1 ? 'Location access denied. Please allow location access or use the search bar.'
                : error?.code === 3 ? 'Location request timed out. Please try again or use the search bar.'
                : 'Unable to get your location. Please allow location access or use the search bar.';
            if (errorBanner) errorBanner.textContent = message;
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
        // Silent background attempt — if the user searches or picks a
        // favorite before this resolves, its result must not clobber their
        // manual choice. Capture the generation counter and check it's
        // still current before applying.
        const startGeneration = locationGeneration;
        getCurrentPositionWithHardTimeout()
            .then(async (position) => {
                if (locationGeneration !== startGeneration) return; // superseded by a manual selection
                const loc = await reverseGeocode(position.coords.latitude, position.coords.longitude);
                if (locationGeneration !== startGeneration) return;
                await selectLocation(mount, loc);
            })
            .catch(() => { /* silent — user can search manually */ });
    }
}
