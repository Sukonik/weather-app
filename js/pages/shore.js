// Shore & Water Conditions page controller. Ties together: Shore search
// (curated Shore Pins + geocoding + OSM discovery), a Preferred Shore kept
// separate from Weather Home, the hero + adaptive bubbles, one adaptive
// water chart, four expandable sections (Conditions/Nature/Safety/Plan),
// a lightweight Shore comparison, and the final plain-language summary.
//
// Every external call goes through Promise.allSettled so one slow/down
// source only degrades its own card — never blanks the page — and every
// displayed value carries an explicit source/confidence label rather than
// a bare number, per the product requirement that partial data must still
// be honest about what it is.
import { initChrome, onUnitsChange, getUnits } from '../modules/chrome.js';
import { formatUpdatedTime } from '../modules/fetchUtils.js';
import {
    convertLength, convertTemperature, formatSpeed, getWindDirection,
    getUVIndexDescription, getAirQualityDescription
} from '../modules/utils.js';
import { SHORE_PINS, nearestPins, haversineKm } from '../modules/shorePins.js';
import {
    searchShores, nearestSupportedShore, getPreferredShore, isPreferredShore, setPreferredShore,
    isShoreFavorite, toggleShoreFavorite, getVisibleShoreFavorites, setShoreEmoji,
    addRecentShore, getRecentShores, clearRecentShores, saveLastShore, getLastShore
} from '../modules/shoreLocation.js';
import { getOceanBayData, getLakeData, getRiverSpringData, getHazardAlerts, getSpeciesData, getAmenities, getWeatherData } from '../modules/shoreAPI.js';
import { createTideChart } from '../modules/tideChart.js';

const UNAVAILABLE = 'Data unavailable';
const EMOJI_CHOICES = ['🏖️', '🏄', '🌴', '🌊', '🏞️', '🛶', '🐚', '🌈', '⭐', '📍', '🌅', '🎣'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function show(id, display = '') { const el = document.getElementById(id); if (el) { el.style.display = display; el.hidden = false; } }
function hide(id) { const el = document.getElementById(id); if (el) { el.style.display = 'none'; el.hidden = true; } }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

let currentPin = null;
let currentData = null;
let chart = null;
let chartFull = { points: [], hiloPoints: [] };
let chartRangeHours = 24;
let selectedMonth = new Date().getMonth();
let compareIds = [];
let compareCache = new Map();

function fmtTime(t) {
    if (!t) return UNAVAILABLE;
    const d = typeof t === 'number' ? new Date(t) : new Date(String(t).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(t);
    return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

function localTimeFor(pin) {
    try { return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: pin.timezone || undefined }); }
    catch { return '--:--'; }
}

// ---------------------------------------------------------------------
// Search (Step 1)
// ---------------------------------------------------------------------
function renderCityPicks(result) {
    const el = document.getElementById('shore-city-picks');
    if (!result.pins.length) { el.hidden = true; return; }
    const heading = result.cityMatch ? `Named Shores near ${result.cityMatch}` : 'Matching Shores';
    el.innerHTML = `
        <h4 class="shore-picks-heading">${heading}</h4>
        <div class="shore-picks-grid">
            ${result.pins.map((p, i) => `
                <button class="shore-pick-item" data-pick-index="${i}">
                    <span class="shore-pick-emoji">${p.emoji || '📍'}</span>
                    <span class="shore-pick-info">
                        <span class="shore-pick-name">${p.name}</span>
                        <span class="shore-pick-sub">${p.parentCity ? `${p.parentCity}${p.parentAdmin1 ? ', ' + p.parentAdmin1 : ''}` : (p.waterBody || '')}</span>
                    </span>
                </button>
            `).join('')}
            ${result.fromOSM ? '<p class="shore-picks-note">🌊 Found via OpenStreetMap — not on our curated list, so some details may be limited.</p>' : ''}
        </div>
    `;
    el.hidden = false;
    el.querySelectorAll('.shore-pick-item').forEach(btn => {
        btn.addEventListener('click', () => { el.hidden = true; loadShore(result.pins[Number(btn.dataset.pickIndex)]); });
    });
}

function wireSearch() {
    const input = document.getElementById('shore-search');
    const suggestions = document.getElementById('shore-suggestions');
    let debounce = null;

    async function runSearch(query) {
        const errorBanner = document.getElementById('error');
        try {
            const result = await searchShores(query);
            if (result.noSupportedShore) {
                document.getElementById('shore-city-picks').hidden = true;
                show('shore-inland-message', 'flex');
                if (errorBanner) errorBanner.textContent = '';
                return;
            }
            hide('shore-inland-message');
            if (result.pins.length === 1 && !result.cityMatch) {
                loadShore(result.pins[0]);
            } else {
                renderCityPicks(result);
            }
            if (errorBanner) errorBanner.textContent = '';
        } catch {
            if (errorBanner) errorBanner.textContent = 'Shore search failed. Please check your connection and try again.';
        }
    }

    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearTimeout(debounce);
        if (q.length < 2) { suggestions.classList.remove('active'); return; }
        debounce = setTimeout(async () => {
            const directOrCity = [
                ...SHORE_PINS.filter(p => p.name.toLowerCase().includes(q.toLowerCase())),
                ...SHORE_PINS.filter(p => p.parentCity.toLowerCase().includes(q.toLowerCase()))
            ];
            const unique = [...new Map(directOrCity.map(p => [p.id, p])).values()].slice(0, 6);
            if (!unique.length) { suggestions.classList.remove('active'); return; }
            suggestions.innerHTML = unique.map((p, i) => `
                <div class="suggestion-item" data-index="${i}">
                    <div class="location-name">${p.emoji} ${p.name}</div>
                    <div class="location-detail">${p.parentCity}${p.parentAdmin1 ? ', ' + p.parentAdmin1 : ''}${p.parentCountry ? ', ' + p.parentCountry : ''}</div>
                </div>
            `).join('');
            suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                item.addEventListener('click', () => { suggestions.classList.remove('active'); loadShore(unique[Number(item.dataset.index)]); });
            });
            suggestions.classList.add('active');
        }, 300);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.shore-search-wrapper')) suggestions.classList.remove('active'); });

    document.getElementById('shore-search-btn').addEventListener('click', () => { const q = input.value.trim(); if (q) runSearch(q); });
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); const q = input.value.trim(); if (q) runSearch(q); } });

    document.getElementById('shore-nearest-btn').addEventListener('click', async () => {
        const errorBanner = document.getElementById('error');
        if (!navigator.geolocation) { if (errorBanner) errorBanner.textContent = 'Geolocation not supported — please search instead.'; return; }
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;
            const pin = await nearestSupportedShore(latitude, longitude);
            if (pin) loadShore(pin);
            else { hide('shore-city-picks'); show('shore-inland-message', 'flex'); }
        }, () => { if (errorBanner) errorBanner.textContent = 'Unable to get your location. Please search instead.'; }, { timeout: 8000 });
    });
}

// ---------------------------------------------------------------------
// Shore Home & Favorites (Step 2)
// ---------------------------------------------------------------------
function favLabel(p) { return `${p.name}${p.parentCity ? ', ' + p.parentCity : ''}`; }

function shoreRowHTML(p, selectedId) {
    const isSelected = p.id === selectedId;
    return `
        <div class="favorite-row">
            <button class="favorite-item${isSelected ? ' selected' : ''}" data-shore-fav-id="${p.id}">
                <span class="favorite-emoji" aria-hidden="true">${p.emoji || '📍'}</span>
                <span class="favorite-info">
                    <span class="favorite-name">${favLabel(p)}</span>
                    <span class="favorite-time">${p.timezone ? localTimeFor(p) : ''}${p.isPreferred ? ' • Preferred Shore' : ''}</span>
                </span>
                ${isSelected ? '<i class="fas fa-check favorite-check" aria-hidden="true"></i>' : ''}
            </button>
            <button class="favorite-remove-btn" data-shore-remove-id="${p.id}" aria-label="Remove ${favLabel(p)}"><i class="fas fa-times" aria-hidden="true"></i></button>
        </div>`;
}

function recentShoreRowHTML(p) {
    return `
        <div class="favorite-row">
            <button class="favorite-item" data-shore-recent-id="${p.id}">
                <span class="favorite-emoji" aria-hidden="true">${p.emoji || '📍'}</span>
                <span class="favorite-info"><span class="favorite-name">${favLabel(p)}</span></span>
            </button>
            <button class="favorite-add-btn" data-shore-recent-add-id="${p.id}" aria-label="Add ${favLabel(p)} to Shore favorites"><i class="fa-regular fa-heart" aria-hidden="true"></i></button>
        </div>`;
}

function renderShoreFavoritesList() {
    const container = document.getElementById('shore-favorites-list');
    if (!container) return;
    const visible = getVisibleShoreFavorites();
    const preferred = visible.find(f => f.isPreferred);
    const rest = visible.filter(f => !f.isPreferred);
    const recent = getRecentShores();
    container.innerHTML = `
        <div class="favorites-section">
            <h4 class="favorites-section-title">🏖️ Preferred Shore</h4>
            ${preferred ? shoreRowHTML(preferred, currentPin?.id) : '<p class="favorites-empty">No Preferred Shore yet — tap ⭐ on a Shore to set one.</p>'}
        </div>
        <div class="favorites-section">
            <h4 class="favorites-section-title">❤️ Shore Favorites</h4>
            ${rest.length ? rest.map(f => shoreRowHTML(f, currentPin?.id)).join('') : '<p class="favorites-empty">No Shore favorites yet.</p>'}
        </div>
        ${recent.length ? `<div class="favorites-section">
            <h4 class="favorites-section-title">🕘 Recent Shores</h4>
            ${recent.map(recentShoreRowHTML).join('')}
            <button id="shore-clear-recent-btn" class="favorites-restore-btn">Clear Recent Shores</button>
        </div>` : ''}
    `;
    container.querySelectorAll('[data-shore-fav-id]').forEach(item => {
        item.addEventListener('click', () => { const p = visible.find(f => f.id === item.dataset.shoreFavId); if (p) loadShore(p); });
    });
    container.querySelectorAll('[data-shore-remove-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const p = visible.find(f => f.id === btn.dataset.shoreRemoveId);
            if (!p) return;
            toggleShoreFavorite(p);
            refreshShoreFavoritesUI();
            showShoreToast(`Removed ${favLabel(p)} from Shore favorites`, () => { toggleShoreFavorite(p); refreshShoreFavoritesUI(); });
        });
    });
    container.querySelectorAll('[data-shore-recent-id]').forEach(item => {
        item.addEventListener('click', () => { const p = recent.find(r => r.id === item.dataset.shoreRecentId); if (p) loadShore(p); });
    });
    container.querySelectorAll('[data-shore-recent-add-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const p = recent.find(r => r.id === btn.dataset.shoreRecentAddId);
            if (!p) return;
            toggleShoreFavorite(p);
            refreshShoreFavoritesUI();
            showShoreToast(`Added ${favLabel(p)} to Shore favorites`, () => { toggleShoreFavorite(p); refreshShoreFavoritesUI(); });
        });
    });
    const clearBtn = container.querySelector('#shore-clear-recent-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => { clearRecentShores(); refreshShoreFavoritesUI(); });
}

let shoreToastTimer = null;
function showShoreToast(message, undoFn) {
    const toast = document.getElementById('shore-favorites-toast');
    if (!toast) return;
    clearTimeout(shoreToastTimer);
    const hideToast = () => { toast.classList.remove('active'); toast.innerHTML = ''; };
    toast.innerHTML = `<span>${message}</span>` + (undoFn ? '<button type="button" class="favorites-toast-undo">Undo</button>' : '');
    toast.classList.add('active');
    if (undoFn) toast.querySelector('.favorites-toast-undo').addEventListener('click', () => { undoFn(); hideToast(); });
    shoreToastTimer = setTimeout(hideToast, 6000);
}

function updateShoreHeroButtons() {
    if (!currentPin) return;
    const heartBtn = document.getElementById('shore-heart-btn');
    const preferredBtn = document.getElementById('shore-preferred-btn');
    const isFav = isShoreFavorite(currentPin);
    heartBtn.classList.toggle('favorited', isFav);
    heartBtn.querySelector('i').className = isFav ? 'fas fa-heart' : 'fa-regular fa-heart';
    heartBtn.setAttribute('aria-label', `${isFav ? 'Remove' : 'Add'} ${currentPin.name} ${isFav ? 'from' : 'to'} Shore favorites`);
    const isPreferred = isPreferredShore(currentPin);
    preferredBtn.classList.toggle('favorited', isPreferred);
    preferredBtn.setAttribute('aria-label', isPreferred ? 'This is your Preferred Shore' : `Set ${currentPin.name} as Preferred Shore`);
}

function refreshShoreFavoritesUI() { renderShoreFavoritesList(); updateShoreHeroButtons(); }

function wireFavorites() {
    document.getElementById('shore-favorites-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('shore-favorites-dropdown').classList.toggle('active');
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.shore-search-bar .favorites-selector')) document.getElementById('shore-favorites-dropdown').classList.remove('active'); });

    document.getElementById('shore-go-preferred-btn').addEventListener('click', () => {
        const preferred = getPreferredShore();
        if (preferred) loadShore(preferred);
    });

    document.getElementById('shore-heart-btn').addEventListener('click', () => {
        if (!currentPin) return;
        const wasFavorite = isShoreFavorite(currentPin);
        toggleShoreFavorite(currentPin);
        refreshShoreFavoritesUI();
        showShoreToast(`${wasFavorite ? 'Removed' : 'Added'} ${currentPin.name} ${wasFavorite ? 'from' : 'to'} Shore favorites`, () => { toggleShoreFavorite(currentPin); refreshShoreFavoritesUI(); });
    });

    document.getElementById('shore-preferred-btn').addEventListener('click', () => {
        if (!currentPin) return;
        const previous = getPreferredShore();
        setPreferredShore(currentPin);
        refreshShoreFavoritesUI();
        showShoreToast(`${currentPin.name} is now your Preferred Shore`, () => { if (previous) setPreferredShore(previous); refreshShoreFavoritesUI(); });
    });

    const emojiBtn = document.getElementById('shore-emoji-btn');
    const emojiPopover = document.getElementById('shore-emoji-popover');
    document.getElementById('shore-emoji-grid').innerHTML = EMOJI_CHOICES.map(e => `<button type="button" class="emoji-choice-btn" data-emoji="${e}">${e}</button>`).join('');
    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPopover.hidden = !emojiPopover.hidden; });
    emojiPopover.querySelectorAll('.emoji-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!currentPin) return;
            setShoreEmoji(currentPin.id, btn.dataset.emoji);
            currentPin = { ...currentPin, emoji: btn.dataset.emoji };
            emojiPopover.hidden = true;
            renderHero();
            refreshShoreFavoritesUI();
        });
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.shore-hero-top')) emojiPopover.hidden = true; });
}

// ---------------------------------------------------------------------
// Main load pipeline
// ---------------------------------------------------------------------
async function loadShore(pin) {
    currentPin = pin;
    saveLastShore(pin);
    addRecentShore(pin);
    document.getElementById('shore-search').value = pin.name;
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('error').textContent = '';
    hide('shore-city-picks'); hide('shore-inland-message');

    renderHero();
    refreshShoreFavoritesUI();

    const isOceanOrBay = pin.waterBodyType === 'ocean' || pin.waterBodyType === 'bay';
    const isLake = pin.waterBodyType === 'lake';
    const isRiverOrSpring = pin.waterBodyType === 'river' || pin.waterBodyType === 'spring';

    const jobs = {
        physical: isOceanOrBay ? getOceanBayData(pin) : isLake ? getLakeData(pin) : getRiverSpringData(pin),
        hazards: getHazardAlerts(pin),
        species: getSpeciesData(pin, selectedMonth),
        amenities: getAmenities(pin),
        weather: getWeatherData(pin.latitude, pin.longitude, pin.name)
    };
    const keys = Object.keys(jobs);
    const settled = await Promise.allSettled(Object.values(jobs));
    const data = {};
    keys.forEach((k, i) => { data[k] = settled[i].status === 'fulfilled' ? settled[i].value : null; });
    currentData = data;

    renderAll();
    document.getElementById('loading').style.display = 'none';
}

// ---------------------------------------------------------------------
// Hero (Step 3)
// ---------------------------------------------------------------------
function planningStatus() {
    const alerts = currentData?.hazards?.alerts || [];
    const severe = alerts.some(a => ['Extreme', 'Severe'].includes(a.severity));
    if (severe) return { emoji: '🔴', label: 'Official hazard or closure' };
    if (alerts.length) return { emoji: '🟠', label: 'Use extra caution' };
    const uv = currentData?.weather?.current?.uv_index;
    const gust = currentData?.weather?.current?.wind_gusts_10m;
    if ((uv != null && uv >= 8) || (gust != null && gust >= 45)) return { emoji: '🟡', label: 'Mixed conditions' };
    return { emoji: '🟢', label: 'Generally favorable' };
}

function renderHero() {
    if (!currentPin) return;
    show('shore-hero', 'block');
    setText('shore-hero-name', `${currentPin.emoji || '📍'} ${currentPin.name}`);
    const sub = [currentPin.waterBody, currentPin.parentCity, currentPin.parentAdmin1, currentPin.parentCountry].filter(Boolean).join(' · ');
    setText('shore-hero-sub', sub || '—');
    setHTML('shore-hero-time', `<i class="fas fa-clock"></i> ${currentPin.timezone ? localTimeFor(currentPin) : '—'}`);

    const home = getPreferredShore();
    const distText = home && !isPreferredShore(currentPin)
        ? `${haversineKm(currentPin.latitude, currentPin.longitude, home.latitude, home.longitude).toFixed(0)} km from Preferred Shore`
        : '—';
    setHTML('shore-hero-distance', `<i class="fas fa-route"></i> ${distText}`);

    const status = planningStatus();
    const pill = document.getElementById('shore-hero-status');
    pill.textContent = `${status.emoji} ${status.label}`;
    pill.className = `shore-status-pill status-${status.emoji === '🟢' ? 'green' : status.emoji === '🟡' ? 'yellow' : status.emoji === '🟠' ? 'orange' : 'red'}`;

    setHTML('shore-profile-strip', profileStripHTML(currentPin));
    renderBubbles();
}

function profileStripHTML(p) {
    const items = [
        [p.shoreType, '🏖️'], [p.setting, '🧭'], [p.orientation, '🌅'], [p.waterBodyType, '💧']
    ].filter(([v]) => v && v !== 'unknown');
    return items.map(([v, icon]) => `<span class="shore-profile-chip">${icon} ${v}</span>`).join('');
}

const SOURCE_TAG = {
    observed: '✅ Observed', official: '🏛️ Official advisory', forecast: '📈 Forecast',
    modeled: '🧭 Modeled', historical: '🗓️ Historical', conditions: '🧪 Conditions-based', unavailable: '⚪ Unavailable'
};

function bubble(icon, label, value, sourceKey) {
    return `<div class="detail-card shore-bubble">
        <div class="card-header"><span aria-hidden="true">${icon}</span><span>${label}</span></div>
        <div class="card-value">${value ?? UNAVAILABLE}</div>
        <div class="card-description">${SOURCE_TAG[sourceKey] || SOURCE_TAG.unavailable}</div>
    </div>`;
}

function renderBubbles() {
    const { unit, lengthUnit } = getUnits();
    const d = currentData || {};
    const w = d.weather?.current;
    const alerts = d.hazards?.alerts || [];
    const bubbles = [];

    if (currentPin.waterBodyType === 'ocean' || currentPin.waterBodyType === 'bay') {
        const noaa = d.physical?.noaa, marine = d.physical?.marine;
        const waterTempF = noaa?.waterTemperature?.valueF;
        const waterTempC = marine?.current?.sea_surface_temperature;
        bubbles.push(bubble('🌡️', 'Water Temp', waterTempF != null ? `${convertTemperature((waterTempF - 32) * 5 / 9, unit).toFixed(1)}°${unit}` : waterTempC != null ? `${convertTemperature(waterTempC, unit).toFixed(1)}°${unit}` : null, waterTempF != null ? 'observed' : waterTempC != null ? 'modeled' : 'unavailable'));
        const tideVal = noaa?.nextHigh || noaa?.nextLow;
        bubbles.push(bubble('📏', 'Next Tide', tideVal ? `${tideVal.type === 'H' ? 'High' : 'Low'} ${fmtTime(tideVal.t)}` : marine?.nextHigh ? `High ${fmtTime(marine.nextHigh.time)} (modeled)` : null, tideVal ? 'official' : marine?.nextHigh ? 'modeled' : 'unavailable'));
        const waveM = marine?.current?.wave_height;
        bubbles.push(bubble('🌊', 'Wave Height', waveM != null ? `${convertLength(waveM, lengthUnit, 'm').toFixed(1)} ${lengthUnit}` : null, waveM != null ? 'modeled' : 'unavailable'));
        bubbles.push(bubble('🌬️', 'Wind / Gusts', w?.wind_speed_10m != null ? `${formatSpeed(w.wind_speed_10m, getUnits().speedUnit)} (${getWindDirection(w.wind_direction_10m)})` : null, w ? 'forecast' : 'unavailable'));
        bubbles.push(bubble('🦠', 'Water Quality', 'No live source integrated', 'unavailable'));
    } else if (currentPin.waterBodyType === 'lake') {
        const lake = d.physical;
        bubbles.push(bubble('🌡️', 'Water Temp', lake?.waterTemperature ? `${convertTemperature((lake.waterTemperature.valueF - 32) * 5 / 9, unit).toFixed(1)}°${unit}` : null, lake?.waterTemperature ? 'observed' : 'unavailable'));
        bubbles.push(bubble('📏', 'Lake Level', lake?.waterLevel ? `${convertLength(lake.waterLevel.value, lengthUnit, 'ft').toFixed(2)} ${lengthUnit}` : null, lake?.waterLevel ? 'observed' : 'unavailable'));
        bubbles.push(bubble('🌊', 'Wind-Generated Waves', w?.wind_speed_10m != null ? `Est. from ${formatSpeed(w.wind_speed_10m, getUnits().speedUnit)} wind — not a wave model` : null, w ? 'conditions' : 'unavailable'));
        bubbles.push(bubble('🌬️', 'Wind / Gusts', w?.wind_gusts_10m != null ? `${formatSpeed(w.wind_gusts_10m, getUnits().speedUnit)} gusts` : null, w ? 'forecast' : 'unavailable'));
        bubbles.push(bubble('🦠', 'Water Quality', 'No live source integrated', 'unavailable'));
    } else {
        const rs = d.physical?.usgs, flood = d.physical?.flood;
        bubbles.push(bubble('🌡️', 'Water Temp', rs?.temperatureC != null ? `${convertTemperature(rs.temperatureC, unit).toFixed(1)}°${unit}` : null, rs?.temperatureC != null ? 'observed' : 'unavailable'));
        bubbles.push(bubble('📏', 'Gage Height', rs?.gageHeightFt != null ? `${convertLength(rs.gageHeightFt, lengthUnit, 'ft').toFixed(2)} ${lengthUnit}` : null, rs?.gageHeightFt != null ? 'observed' : 'unavailable'));
        bubbles.push(bubble('🌊', 'Flow / Discharge', rs?.dischargeCfs != null ? `${rs.dischargeCfs.toFixed(0)} cfs` : flood?.currentM3s != null ? `${flood.currentM3s.toFixed(1)} m³/s (modeled)` : null, rs?.dischargeCfs != null ? 'observed' : flood?.currentM3s != null ? 'modeled' : 'unavailable'));
        bubbles.push(bubble('🌬️', 'Wind / Gusts', w?.wind_speed_10m != null ? formatSpeed(w.wind_speed_10m, getUnits().speedUnit) : null, w ? 'forecast' : 'unavailable'));
        bubbles.push(bubble('🦠', 'Water Quality', 'No live source integrated', 'unavailable'));
    }

    bubbles.push(bubble('☀️', 'UV', w?.uv_index != null ? `${w.uv_index.toFixed(1)} (${getUVIndexDescription(w.uv_index)})` : null, w ? 'forecast' : 'unavailable'));
    bubbles.push(bubble('🌿', 'AQI', d.weather?.air_quality?.current?.us_aqi != null ? `${d.weather.air_quality.current.us_aqi} (${getAirQualityDescription(d.weather.air_quality.current.us_aqi)})` : null, d.weather?.air_quality ? 'forecast' : 'unavailable'));
    bubbles.push(bubble('🚩', 'Official Hazard', alerts.length ? `${alerts.length} active` : d.hazards?.supported ? 'None active' : 'No source for this region', alerts.length ? 'official' : d.hazards?.supported ? 'official' : 'unavailable'));

    setHTML('shore-bubbles', bubbles.slice(0, 8).join(''));
}

// ---------------------------------------------------------------------
// Adaptive chart (Step 4)
// ---------------------------------------------------------------------
function chartSeriesFor(pin, data) {
    const { lengthUnit } = getUnits();
    if (pin.waterBodyType === 'ocean' || pin.waterBodyType === 'bay') {
        const noaa = data.physical?.noaa, marine = data.physical?.marine;
        if (noaa?.curve?.length || noaa?.hilo?.length) {
            const parseT = t => new Date(t.replace(' ', 'T')).getTime();
            const points = (noaa.curve?.length ? noaa.curve : noaa.hilo).map(p => ({ time: parseT(p.t), value: convertLength(parseFloat(p.v), lengthUnit, 'ft'), sourceType: 'prediction' }));
            const hiloPoints = (noaa.hilo || []).map(p => ({ time: parseT(p.t), value: convertLength(parseFloat(p.v), lengthUnit, 'ft'), type: p.type }));
            return { points, hiloPoints, unitLabel: lengthUnit, title: 'TIDE HEIGHT', depthNote: 'This is tide height above the station datum (MLLW) — not water depth at the shoreline.' };
        }
        if (marine?.hourlyHeights?.length) {
            const points = marine.hourlyHeights.map((v, i) => ({ time: marine.times[i], value: v != null ? convertLength(v, lengthUnit, 'm') : null, sourceType: 'modeled' })).filter(p => p.value != null);
            const hiloPoints = (marine.extrema || []).map(e => ({ time: e.time, value: convertLength(e.value, lengthUnit, 'm'), type: e.type }));
            return { points, hiloPoints, unitLabel: lengthUnit, title: 'MODELED SEA LEVEL', depthNote: 'This is a modeled sea-level estimate — not water depth at the shoreline.' };
        }
        return null;
    }
    if (pin.waterBodyType === 'lake') {
        const series = data.physical?.waterLevelSeries;
        if (series?.length) {
            const points = series.map(p => ({ time: p.time, value: convertLength(p.value, lengthUnit, 'ft'), sourceType: 'observation' }));
            return { points, hiloPoints: [], unitLabel: lengthUnit, title: 'LAKE WATER LEVEL', depthNote: 'This is lake water level at the nearest gauge — not water depth at the shoreline.' };
        }
        return null;
    }
    // river / spring
    const usgs = data.physical?.usgs;
    if (usgs?.gageHeightSeries?.length) {
        const points = usgs.gageHeightSeries.map(p => ({ time: p.time, value: convertLength(p.value, lengthUnit, 'ft'), sourceType: 'observation' }));
        return { points, hiloPoints: [], unitLabel: lengthUnit, title: 'GAGE HEIGHT', depthNote: 'This is river/spring gage height at the nearest USGS station — not water depth at this exact point.' };
    }
    if (usgs?.dischargeSeries?.length) {
        const points = usgs.dischargeSeries.map(p => ({ time: p.time, value: p.value, sourceType: 'observation' }));
        return { points, hiloPoints: [], unitLabel: 'cfs', title: 'DISCHARGE (FLOW)', formatValue: v => `${v.toFixed(0)} cfs`, depthNote: 'This is streamflow (discharge), not water depth.' };
    }
    return null;
}

function renderChart() {
    const series = currentData ? chartSeriesFor(currentPin, currentData) : null;
    if (!series || !series.points.length) {
        hide('shore-chart-card');
        return;
    }
    show('shore-chart-card', 'block');
    setText('shore-chart-title', series.title);
    setText('shore-depth-clarify', series.depthNote);
    chartFull = series;
    const canvas = document.getElementById('shore-chart');
    const slider = document.getElementById('shore-slider');
    const announceEl = document.getElementById('shore-chart-announce');
    if (chart) chart.destroy();
    chart = createTideChart({
        canvas, slider, announceEl,
        points: series.points, hiloPoints: series.hiloPoints,
        unitLabel: series.unitLabel,
        formatValue: series.formatValue || (v => `${v.toFixed(2)} ${series.unitLabel}`),
        onSelect: (i, info) => {
            setText('shore-tsp-time', fmtTime(info.point.time));
            setText('shore-tsp-value', info.formattedValue);
            setText('shore-tsp-trend', info.trend);
            setText('shore-tsp-source', { observation: 'Observed', prediction: 'Official prediction', modeled: 'Modeled estimate' }[info.point.sourceType] || 'Unknown');
        }
    });
    applyChartRange();
}

function applyChartRange() {
    if (!chart || !chartFull.points?.length) return;
    const start = chartFull.points[0].time;
    const cutoff = start + chartRangeHours * 3600 * 1000;
    const filtered = chartFull.points.filter(p => p.time <= cutoff);
    const filteredHilo = (chartFull.hiloPoints || []).filter(p => p.time <= cutoff);
    chart.setData(filtered.length ? filtered : chartFull.points, filteredHilo);
}

function wireChartRangeToggle() {
    document.querySelectorAll('[data-shore-range]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-shore-range]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            chartRangeHours = Number(btn.dataset.shoreRange);
            applyChartRange();
        });
    });
}

// ---------------------------------------------------------------------
// Conditions section (Step 4/10 detail)
// ---------------------------------------------------------------------
function renderConditions() {
    const d = currentData;
    const pin = currentPin;
    let html = '<div class="shore-detail-grid">';
    if (pin.waterBodyType === 'ocean' || pin.waterBodyType === 'bay') {
        const noaa = d.physical?.noaa, marine = d.physical?.marine;
        html += detailRow('Prediction station', noaa?.station ? `${noaa.station.name} (NOAA #${noaa.station.id}, ${noaa.station.distanceKm.toFixed(1)} km away)` : UNAVAILABLE);
        html += detailRow('Wave period / direction', marine?.current?.wave_period != null ? `${marine.current.wave_period.toFixed(1)}s / ${marine.current.wave_direction != null ? Math.round(marine.current.wave_direction) + '°' : '--'}` : UNAVAILABLE);
        html += detailRow('Current speed', marine?.current?.ocean_current_velocity != null ? `${marine.current.ocean_current_velocity.toFixed(2)} km/h` : UNAVAILABLE);
        if (pin.waterBodyType === 'ocean' && marine && noaa) {
            html += `<p class="shore-note">These readings come from the nearest NOAA station and Open-Meteo Marine grid cell — nearby Shores on the same barrier island may share these exact same readings.</p>`;
        }
    } else if (pin.waterBodyType === 'lake') {
        html += detailRow('Water-level station', d.physical?.waterLevel?.station ? `${d.physical.waterLevel.station.name} (${d.physical.waterLevel.station.distanceKm.toFixed(1)} km away)` : UNAVAILABLE);
        html += detailRow('Water clarity', 'No live water-clarity source available — check state/provincial park postings.');
    } else {
        const usgs = d.physical?.usgs, flood = d.physical?.flood;
        html += detailRow('USGS station', usgs?.site ? `${usgs.site.name} (${usgs.site.distanceKm.toFixed(1)} km away)` : 'No active USGS gauge within range');
        html += detailRow('Flood context (recent rainfall / discharge trend)', flood ? `${flood.trend === 'rising' ? 'Rising' : 'Falling / steady'} — modeled river discharge, ${flood.source}` : UNAVAILABLE);
    }
    html += '</div>';
    html += `<p class="shore-note"><strong>Height ≠ depth:</strong> ${chartFull.depthNote || 'Depth data unavailable. Water level and wave height are not shoreline depth.'} If no reliable shoreline depth is available, it is never invented.</p>`;
    setHTML('conditions-body', html);
}

function detailRow(label, value) {
    return `<div class="shore-detail-row"><span class="shore-detail-label">${label}</span><span class="shore-detail-value">${value}</span></div>`;
}

// ---------------------------------------------------------------------
// Nature section (Steps 5-7)
// ---------------------------------------------------------------------
function habitatRoleFor(name) {
    const n = name.toLowerCase();
    if (n.includes('spartina') || n.includes('marsh') || n.includes('cordgrass')) return 'Stabilizes marsh sediment and filters runoff.';
    if (n.includes('ammophila') || n.includes('beachgrass') || n.includes('sea oat') || n.includes('uniola')) return 'Anchors dune sand and reduces erosion.';
    if (n.includes('mangrove') || n.includes('rhizophora') || n.includes('avicennia')) return 'Buffers storm surge and provides nursery habitat for fish.';
    if (n.includes('zostera') || n.includes('seagrass')) return 'Filters water and shelters juvenile marine life.';
    return 'Supports shoreline habitat and helps stabilize the shore.';
}

function renderNature() {
    const groups = currentData?.species || {};
    const groupKeys = Object.keys(groups);
    let html = '<h4 class="shore-sub-heading">What Might I Encounter?</h4>';
    if (!groupKeys.length) {
        html += '<p class="shore-note">⚪ No usable current data from OBIS/GBIF for this exact location.</p>';
    } else {
        html += '<div class="shore-nature-grid">';
        for (const key of groupKeys) {
            if (key === 'Shore vegetation') continue; // rendered separately below
            const g = groups[key];
            const top = g.records[0];
            html += `<div class="shore-nature-chip" data-nature-group="${key}">
                <span class="shore-nature-emoji">${g.emoji}</span>
                <span class="shore-nature-label">${key}</span>
                <span class="shore-nature-confidence">${top?.confidence.label || '⚪ No usable current data'}</span>
            </div>`;
        }
        html += '</div>';
    }

    // Month selector + Nature Calendar
    html += `<h4 class="shore-sub-heading">📅 Shore Nature Calendar</h4>
        <select id="shore-month-select" class="shore-select">
            ${MONTH_NAMES.map((m, i) => `<option value="${i}"${i === selectedMonth ? ' selected' : ''}>${m}</option>`).join('')}
        </select>
        <div class="shore-calendar-list" id="shore-calendar-list"></div>`;

    // Expandable detail per group ("Explore All")
    html += '<details class="shore-explore-more"><summary>Explore All Records</summary><div id="shore-nature-detail"></div></details>';

    // Vegetation
    const veg = groups['Shore vegetation'];
    html += '<h4 class="shore-sub-heading">🌿 Plants &amp; Shoreline Vegetation</h4>';
    if (veg?.records.length) {
        html += veg.records.slice(0, 6).map(r => `
            <div class="shore-record-row">
                <span class="shore-record-name">${r.vernacularName || r.scientificName}</span>
                <span class="shore-record-meta">${r.date ? new Date(r.date).getFullYear() : '—'} · ${r.distanceKm.toFixed(1)} km · ${r.establishmentMeans || 'origin unknown'} · ${r.source}</span>
                <span class="shore-record-role">${habitatRoleFor(r.scientificName)}</span>
            </div>`).join('');
    } else {
        html += '<p class="shore-note">⚪ No vegetation records found nearby via GBIF.</p>';
    }
    html += '<p class="shore-note">NOAA shoreline land-cover change timeline is not available via a live public API in this build — not shown rather than estimated.</p>';

    // Birds
    const birds = groups['Birds'];
    html += '<h4 class="shore-sub-heading">🐦 Birds</h4>';
    if (birds?.records.length) {
        html += birds.records.slice(0, 6).map(r => `
            <div class="shore-record-row">
                <span class="shore-record-name">${r.vernacularName || r.scientificName}</span>
                <span class="shore-record-meta">${r.date ? new Date(r.date).toLocaleDateString() : '—'} · ${r.distanceKm.toFixed(1)} km · ${r.confidence.label} · ${r.source}</span>
            </div>`).join('');
        html += `<p class="shore-note">🌅 <strong>Birdwatching Outlook:</strong> ${birdwatchingOutlook()}</p>`;
        html += '<p class="shore-note">Follow any posted nesting-area restrictions at this Shore.</p>';
    } else {
        html += '<p class="shore-note">⚪ No bird records found nearby via GBIF.</p>';
    }

    setHTML('nature-body', html);
    renderNatureCalendar(groups);
    document.getElementById('shore-month-select')?.addEventListener('change', (e) => {
        selectedMonth = Number(e.target.value);
        renderNatureCalendar(groups);
    });
    document.getElementById('shore-nature-detail') && (document.getElementById('shore-nature-detail').innerHTML = renderNatureDetailHTML(groups));
}

function renderNatureDetailHTML(groups) {
    return Object.entries(groups).map(([label, g]) => `
        <div class="shore-nature-detail-group">
            <h5>${g.emoji} ${label}</h5>
            ${g.records.map(r => `<div class="shore-record-row">
                <span class="shore-record-name">${r.vernacularName || r.scientificName}</span>
                <span class="shore-record-meta">${r.date ? new Date(r.date).toLocaleDateString() : '—'} · ${r.distanceKm.toFixed(1)} km · ${r.confidence.label} · ${r.source}</span>
            </div>`).join('')}
        </div>`).join('');
}

function renderNatureCalendar(groups) {
    const el = document.getElementById('shore-calendar-list');
    if (!el) return;
    const relevant = [];
    for (const [label, g] of Object.entries(groups)) {
        const monthHits = g.records.filter(r => r.months.includes(selectedMonth));
        if (monthHits.length) relevant.push({ label, emoji: g.emoji, count: monthHits.length });
    }
    relevant.sort((a, b) => b.count - a.count);
    if (!relevant.length) { el.innerHTML = '<p class="shore-note">No seasonal records for this month at this Shore.</p>'; return; }
    el.innerHTML = `<div class="shore-calendar-grid">${relevant.slice(0, 6).map(r => `<span class="shore-calendar-chip">${r.emoji} ${r.label}</span>`).join('')}</div>` +
        (relevant.length > 6 ? '<details class="shore-explore-more"><summary>Explore All</summary>' + relevant.slice(6).map(r => `<span class="shore-calendar-chip">${r.emoji} ${r.label}</span>`).join('') + '</details>' : '');
}

function birdwatchingOutlook() {
    const w = currentData?.weather;
    const sunrise = w?.daily?.sunrise?.[0];
    const wind = w?.current?.wind_speed_10m;
    const rain = w?.current?.precipitation;
    const bits = [];
    bits.push(sunrise ? `Sunrise around ${fmtTime(sunrise)} offers the best early light.` : 'Early morning typically offers the best light.');
    bits.push(wind != null && wind < 15 ? 'Light wind should keep visibility good.' : 'Breezier conditions may make distant birds harder to spot.');
    bits.push(rain != null && rain > 0 ? 'Some precipitation is in the forecast, which can push birds toward sheltered cover.' : '');
    bits.push('Historical bird records exist in the broader area — this is not a live sighting report.');
    return bits.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------
// Safety section (Step 8)
// ---------------------------------------------------------------------
function renderSafety() {
    const d = currentData;
    const alerts = d?.hazards?.alerts || [];
    let html = '';
    if (alerts.length) {
        html += '<h4 class="shore-sub-heading">🚩 Official Alerts (override everything below)</h4>';
        html += alerts.map(a => `<div class="shore-alert shore-alert-${(a.severity || '').toLowerCase()}">
            <strong>${a.event || 'Alert'}</strong> — ${a.headline || ''}
        </div>`).join('');
    } else if (d?.hazards?.supported) {
        html += '<p class="shore-note">✅ No active NWS alerts for this location right now.</p>';
    } else {
        html += '<p class="shore-note">⚪ No official alert source available for this region (outside NWS coverage).</p>';
    }

    html += `<h4 class="shore-sub-heading">🦠 Water Quality &amp; Algae</h4>
        <div class="shore-detail-grid">
            ${detailRow('🦠 Harmful bloom advisory', '⚪ No live source integrated — check local/state health department')}
            ${detailRow('🟢 General algae', '⚪ No live source integrated')}
            ${detailRow('🌿 Seaweed / shoreline wrack', '⚪ Not tracked')}
        </div>
        <p class="shore-note"><strong>Important:</strong> "No advisory found" does not mean no algae — it means no live official feed was checked for this exact Shore.</p>`;

    const waterTempC = currentData?.physical?.noaa?.waterTemperature?.valueF != null ? (currentData.physical.noaa.waterTemperature.valueF - 32) * 5 / 9 : currentData?.physical?.marine?.current?.sea_surface_temperature ?? currentData?.physical?.usgs?.temperatureC;
    if (waterTempC != null && waterTempC < 15) {
        html += `<p class="shore-note shore-alert-extreme">🥶 Water temperature is low enough for cold-water shock to be a real risk — dress and prepare accordingly.</p>`;
    }
    const aqi = currentData?.weather?.air_quality?.current?.us_aqi;
    if (aqi != null && aqi > 100) html += `<p class="shore-note shore-alert-orange">🌫️ Air quality is ${getAirQualityDescription(aqi)} — consider limiting prolonged exertion.</p>`;

    html += '<p class="shore-note">This app never labels the water "safe to swim." Follow lifeguard instructions and posted notices.</p>';
    setHTML('safety-body', html);
}

// ---------------------------------------------------------------------
// Plan section (Step 9 + amenities)
// ---------------------------------------------------------------------
function renderPlan() {
    const w = currentData?.weather?.current;
    const daily = currentData?.weather?.daily;
    const amenities = currentData?.amenities;
    const uv = w?.uv_index, gust = w?.wind_gusts_10m, temp = w?.temperature_2m;

    let html = '<h4 class="shore-sub-heading">🎒 Plan Your Shore Visit</h4><ul class="shore-plan-list">';
    html += planItem('⛱️', uv != null && uv >= 3 ? 'An umbrella is worth bringing — meaningful UV expected.' : 'UV is low — an umbrella is optional today.');
    if (gust != null && gust >= 30) html += planItem('⚠️', `Gusts near ${Math.round(gust)} km/h may make a large umbrella hard to manage — stake it well or skip it.`);
    html += planItem('🧴', uv != null && uv >= 3 ? 'Reapply sunscreen every ~2 hours, more often after swimming.' : 'Light sun protection is enough today.');
    html += planItem('🕶️', 'Sunglasses recommended near open water — glare reflects strongly off the surface.');
    html += planItem('💧', temp != null && temp >= 27 ? 'Warm conditions — bring extra water.' : 'Bring water as usual.');
    html += planItem('🦟', 'Consider insect repellent, especially near dusk or marshy/wooded shorelines.');
    const waterTempC = currentData?.physical?.noaa?.waterTemperature ? (currentData.physical.noaa.waterTemperature.valueF - 32) * 5 / 9 : currentData?.physical?.marine?.current?.sea_surface_temperature;
    if (waterTempC != null && waterTempC < 18) html += planItem('🧥', 'Cold water — a wetsuit or extra layer is worth considering.');
    html += planItem('🏄', currentPin.waterBodyType === 'ocean' ? 'Check the wave/wind bubbles above for surf or paddling comfort.' : 'Check flow/wind above before paddling.');
    html += planItem('🎣', gust != null && gust < 25 ? 'Comfortable conditions for fishing.' : 'Breezy — fishing casts may be more difficult.');
    html += planItem('🚴', gust != null && gust < 25 ? 'Comfortable for waterfront cycling.' : 'Gusty — waterfront cycling may feel harder than usual.');
    if (daily?.sunset?.[0]) html += planItem('🌅', `Sunset around ${fmtTime(daily.sunset[0])} — ${currentPin.orientation.includes('west') ? 'this Shore faces the right way for it' : 'check local sightlines'}.`);
    html += '</ul>';

    html += '<h4 class="shore-sub-heading">Amenities</h4>';
    if (amenities?.supported) {
        const rows = [
            ['Lifeguards', amenities.lifeguards], ['Restrooms', amenities.restrooms], ['Parking', amenities.parking],
            ['Accessible entrance', amenities.accessibleEntrance], ['Boardwalk', amenities.boardwalk],
            ['Concessions', amenities.concessions], ['Boat/kayak launch', amenities.boatLaunch]
        ];
        html += '<div class="shore-detail-grid">' + rows.map(([label, has]) => detailRow(label, has ? '✅ Reported nearby' : '⚪ Not found nearby')).join('') + '</div>';
        html += `<p class="shore-note">Source: ${amenities.source}, checked ${formatUpdatedTime(amenities.updated)}.</p>`;
    } else {
        html += '<p class="shore-note">⚪ Amenity data unavailable right now.</p>';
    }
    setHTML('plan-body', html);
}

function planItem(icon, text) { return `<li><span aria-hidden="true">${icon}</span> ${text}</li>`; }

// ---------------------------------------------------------------------
// Compare (Step 11)
// ---------------------------------------------------------------------
async function renderCompare() {
    if (!currentPin) return;
    const nearby = nearestPins(currentPin.latitude, currentPin.longitude, 60, 6).map(n => n.pin).filter(p => p.id !== currentPin.id);
    const picksEl = document.getElementById('shore-compare-picks');
    if (!nearby.length) { document.getElementById('shore-compare').hidden = true; return; }
    document.getElementById('shore-compare').hidden = false;
    picksEl.innerHTML = nearby.map(p => `<label class="shore-compare-check"><input type="checkbox" value="${p.id}" ${compareIds.includes(p.id) ? 'checked' : ''}> ${p.emoji} ${p.name}</label>`).join('');
    picksEl.querySelectorAll('input').forEach(cb => {
        cb.addEventListener('change', () => {
            compareIds = [...picksEl.querySelectorAll('input:checked')].slice(0, 3).map(i => i.value);
            picksEl.querySelectorAll('input').forEach(i => { if (!compareIds.includes(i.value)) i.checked = false; });
            buildCompareTable(nearby);
        });
    });
    buildCompareTable(nearby);
}

function buildCompareTable(nearby) {
    const wrap = document.getElementById('shore-compare-table-wrap');
    const selected = [currentPin, ...nearby.filter(p => compareIds.includes(p.id))];
    if (selected.length < 2) { wrap.innerHTML = '<p class="shore-note">Select at least one nearby Shore to compare.</p>'; return; }
    const sameGrid = selected.every(p => Math.abs(p.latitude - selected[0].latitude) < 0.1 && Math.abs(p.longitude - selected[0].longitude) < 0.1);
    const rows = [
        ['Distance from here', selected.map(p => p.id === currentPin.id ? '—' : `${haversineKm(currentPin.latitude, currentPin.longitude, p.latitude, p.longitude).toFixed(1)} km`)],
        ['Orientation', selected.map(p => p.orientation)],
        ['Exposure', selected.map(p => p.setting)],
        ['Water body', selected.map(p => p.waterBody)],
        ['Shore type', selected.map(p => p.shoreType)]
    ];
    wrap.innerHTML = `
        <div class="shore-table-scroll"><table class="shore-compare-table">
            <thead><tr><th></th>${selected.map(p => `<th>${p.emoji} ${p.name}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(([label, vals]) => `<tr><th>${label}</th>${vals.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        ${sameGrid ? '<p class="shore-note">These Shores currently share the same regional water forecast.</p>' : ''}
    `;
}

// ---------------------------------------------------------------------
// Summary (Step 12)
// ---------------------------------------------------------------------
function renderSummary() {
    if (!currentPin || !currentData) return;
    show('shore-summary', 'block');
    setText('shore-summary-emoji', currentPin.emoji || '🏖️');
    setText('shore-summary-title', currentPin.name);
    const status = planningStatus();
    const pill = document.getElementById('shore-summary-status');
    pill.textContent = `${status.emoji} ${status.label}`;

    const d = currentData;
    const bits = [];
    if (currentPin.waterBodyType === 'ocean' || currentPin.waterBodyType === 'bay') {
        bits.push(d.physical?.noaa ? `Tide predictions come from ${d.physical.noaa.station?.name || 'a nearby NOAA station'}.` : 'Water conditions are modeled from the nearest marine grid cell.');
        const wave = d.physical?.marine?.current?.wave_height;
        if (wave != null) bits.push(`Waves are around ${wave.toFixed(1)}m.`);
    } else if (currentPin.waterBodyType === 'lake') {
        bits.push(d.physical?.waterLevel ? 'Lake level comes from the nearest NOAA gauge.' : 'Lake level data is limited near this Shore.');
    } else {
        bits.push(d.physical?.usgs ? `Flow comes from the nearest USGS gauge, ${d.physical.usgs.site.distanceKm.toFixed(1)} km away.` : 'No nearby USGS gauge — flow context is modeled.');
    }
    const uv = d.weather?.current?.uv_index;
    if (uv != null) bits.push(`UV is ${getUVIndexDescription(uv).toLowerCase()}.`);
    const gust = d.weather?.current?.wind_gusts_10m;
    if (gust != null && gust >= 30) bits.push('Afternoon gusts may make a large umbrella difficult to manage.');
    const groups = Object.keys(d.species || {}).filter(k => k !== 'Shore vegetation');
    if (groups.length) bits.push(`${groups.slice(0, 4).join(', ')} have historical records in the broader area.`);
    const alerts = d.hazards?.alerts || [];
    bits.push(alerts.length ? 'An official hazard or advisory is active — follow it above all else.' : 'Follow lifeguard instructions and posted notices.');

    setText('shore-summary-text', bits.join(' '));
}

// ---------------------------------------------------------------------
// Footer + orchestration
// ---------------------------------------------------------------------
function renderFooter() {
    show('shore-data-footer', 'flex');
    const sources = ['Open-Meteo', 'NOAA CO-OPS/CO-OPS', 'USGS Water Data', 'NWS', 'GBIF', 'OBIS', 'OpenStreetMap'];
    setText('shore-source-text', `Sources: ${sources.join(', ')}`);
    setText('shore-timestamp-text', `Updated: ${formatUpdatedTime(Date.now())}`);
}

function renderAll() {
    renderHero();
    renderChart();
    show('shore-sections', 'block');
    renderConditions();
    renderNature();
    renderSafety();
    renderPlan();
    renderCompare();
    renderSummary();
    renderFooter();
}

function initApp() {
    initChrome({ page: 'shore' });
    wireSearch();
    wireFavorites();
    wireChartRangeToggle();
    onUnitsChange(() => { if (currentPin && currentData) renderAll(); });

    // Populate the Shore Favorites dropdown immediately, even before any
    // Shore is loaded this session, so previously saved favorites/Preferred
    // Shore are usable right away.
    renderShoreFavoritesList();

    const last = getLastShore();
    if (last) loadShore(last);
    document.getElementById('loading').style.display = 'none';
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
