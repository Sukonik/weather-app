import { initChrome, onLocationChange, onUnitsChange, getUnits } from '../modules/chrome.js';
import { resolveNOAAStation, getNOAATideData, getMarineData } from '../modules/tideAPI.js';
import { formatUpdatedTime } from '../modules/fetchUtils.js';
import { convertLength, convertTemperature } from '../modules/utils.js';
import { createTideChart } from '../modules/tideChart.js';

const UNAVAILABLE = 'Data unavailable';

function show(id, display = '') { const el = document.getElementById(id); if (el) el.style.display = display; }
function hide(id) { show(id, 'none'); }

function fmtTime(t) {
    if (!t) return UNAVAILABLE;
    const d = typeof t === 'number' ? new Date(t) : new Date(t.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(t);
    return d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

// NOAA CO-OPS returns "YYYY-MM-DD HH:MM" in the station's own local
// standard/daylight time (already DST-correct); parse without a trailing
// 'Z' since it is not UTC.
const parseNOAATime = (t) => new Date(t.replace(' ', 'T')).getTime();

function fmtLength(valueInFt, targetUnit) {
    if (valueInFt == null || Number.isNaN(valueInFt)) return UNAVAILABLE;
    return convertLength(valueInFt, targetUnit, 'ft').toFixed(2) + ' ' + targetUnit;
}

function fmtMetersAsUnit(valueInM, targetUnit, decimals = 2) {
    if (valueInM == null || Number.isNaN(valueInM)) return UNAVAILABLE;
    return convertLength(valueInM, targetUnit, 'm').toFixed(decimals) + ' ' + targetUnit;
}

function fmtTemp(valueF, targetUnit) {
    if (valueF == null || Number.isNaN(valueF)) return UNAVAILABLE;
    const celsius = (valueF - 32) * 5 / 9;
    return targetUnit === 'F' ? `${valueF.toFixed(1)}°F` : `${celsius.toFixed(1)}°C`;
}

function fmtTempC(valueC, targetUnit) {
    if (valueC == null || Number.isNaN(valueC)) return UNAVAILABLE;
    return targetUnit === 'F' ? `${convertTemperature(valueC, 'F').toFixed(1)}°F` : `${valueC.toFixed(1)}°C`;
}

function initApp() {
    initChrome({ page: 'tides' });

    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    let chart = null;
    let lastLoc = null, lastNoaa = null, lastMarine = null, lastMode = null;
    let fullPoints = [], fullHilo = [];
    let currentRangeHours = 24;

    async function loadTides(loc) {
        try {
            loadingEl.style.display = 'flex';
            errorEl.textContent = '';
            hide('tide-next-events'); hide('tide-curve-card'); hide('marine-stats');
            hide('modeled-warning'); hide('inland-message');

            const isUS = loc.countryCode === 'US' || loc.country === 'United States';

            const [noaaResult, marineResult] = await Promise.allSettled([
                isUS ? resolveAndFetchNOAA(loc) : Promise.resolve(null),
                getMarineData(loc.latitude, loc.longitude)
            ]);
            const noaa = noaaResult.status === 'fulfilled' ? noaaResult.value : null;
            const marine = marineResult.status === 'fulfilled' ? marineResult.value : null;

            lastLoc = loc; lastNoaa = noaa; lastMarine = marine;

            if (noaa) {
                lastMode = 'noaa';
                renderNOAA(loc, noaa, marine);
            } else if (marine) {
                lastMode = 'marine';
                renderMarine(loc, marine);
            } else {
                lastMode = 'inland';
                document.getElementById('tide-station-info').textContent = '';
                show('inland-message', 'flex');
                document.getElementById('data-source-text').textContent = 'Source: —';
                document.getElementById('data-timestamp-text').textContent = '';
            }
            loadingEl.style.display = 'none';
        } catch (error) {
            console.error('Tides page error:', error);
            errorEl.textContent = 'Unable to load coastal data. Please try again.';
            loadingEl.style.display = 'none';
        }
    }

    async function resolveAndFetchNOAA(loc) {
        const station = await resolveNOAAStation(loc.latitude, loc.longitude);
        if (!station) return null;
        return getNOAATideData(station, loc.latitude, loc.longitude);
    }

    function buildChart(points, hiloPoints, unitLabel, valueFormatter) {
        fullPoints = points;
        fullHilo = hiloPoints;
        const canvas = document.getElementById('tide-chart');
        const slider = document.getElementById('tide-slider');
        const announceEl = document.getElementById('tide-announce');
        if (chart) chart.destroy();
        chart = createTideChart({
            canvas, slider, announceEl,
            points, hiloPoints,
            unitLabel,
            formatValue: valueFormatter,
            onSelect: (index, info) => renderSelectedPanel(info)
        });
        applyRangeFilter();
    }

    function applyRangeFilter() {
        if (!fullPoints.length || !chart) return;
        const start = fullPoints[0].time;
        const cutoff = start + currentRangeHours * 3600 * 1000;
        const filteredPoints = fullPoints.filter(p => p.time <= cutoff);
        const filteredHilo = fullHilo.filter(p => p.time <= cutoff);
        chart.setData(filteredPoints.length ? filteredPoints : fullPoints, filteredHilo);
    }

    function renderSelectedPanel(info) {
        const { point, trend, diff, timeUntilNext, sourceLabel, nextEvent, formattedValue, unitLabel } = info;
        document.getElementById('tsp-time').textContent = fmtTime(point.time);
        document.getElementById('tsp-height').textContent = formattedValue;
        document.getElementById('tsp-trend').textContent = trend;
        document.getElementById('tsp-diff').textContent = diff != null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} ${unitLabel}` : '—';
        document.getElementById('tsp-next').textContent = nextEvent
            ? `${nextEvent.type === 'H' ? 'High' : 'Low'} in ${formatDurationMs(timeUntilNext)}`
            : '—';
        document.getElementById('tsp-source').textContent = sourceLabel;
    }

    function formatDurationMs(ms) {
        if (ms == null) return '—';
        const totalMin = Math.round(Math.abs(ms) / 60000);
        return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
    }

    function renderNOAA(loc, data, marine) {
        const { lengthUnit, unit } = getUnits();
        const ps = data.predictionStation;
        const limitedNote = (!data.curve?.length && data.hilo?.length)
            ? ' — this station only provides high/low predictions; no continuous curve is shown, and no intermediate readings were invented.'
            : '';
        document.getElementById('tide-station-info').innerHTML =
            `Predictions from <strong>${ps.name}</strong> (NOAA #${ps.id}) · ${ps.distanceKm.toFixed(1)} km from search location${limitedNote}`;

        show('tide-next-events', 'grid');
        document.getElementById('next-high-value').textContent = data.nextHigh ? fmtTime(parseNOAATime(data.nextHigh.t)) : UNAVAILABLE;
        document.getElementById('next-high-height').textContent = data.nextHigh ? fmtLength(parseFloat(data.nextHigh.v), lengthUnit) : '';
        document.getElementById('next-low-value').textContent = data.nextLow ? fmtTime(parseNOAATime(data.nextLow.t)) : UNAVAILABLE;
        document.getElementById('next-low-height').textContent = data.nextLow ? fmtLength(parseFloat(data.nextLow.v), lengthUnit) : '';

        // Water level: exact NOAA observation first, Open-Meteo modeled fallback second.
        if (data.waterLevel) {
            document.getElementById('water-level-value').textContent = fmtLength(data.waterLevel.value, lengthUnit);
            document.getElementById('water-level-source').textContent = data.waterLevel.label;
        } else if (marine?.current?.sea_level_height_msl != null) {
            document.getElementById('water-level-value').textContent = fmtMetersAsUnit(marine.current.sea_level_height_msl, lengthUnit) + ' (modeled)';
            document.getElementById('water-level-source').textContent = 'Approx. local sea level — modeled · Not for navigation';
        } else {
            document.getElementById('water-level-value').textContent = UNAVAILABLE;
            document.getElementById('water-level-source').textContent = '';
        }

        // Water temperature: same source order.
        if (data.waterTemperature) {
            document.getElementById('water-temp-value').textContent = fmtTemp(data.waterTemperature.valueF, unit);
            document.getElementById('water-temp-source').textContent = data.waterTemperature.label;
        } else if (marine?.current?.sea_surface_temperature != null) {
            document.getElementById('water-temp-value').textContent = fmtTempC(marine.current.sea_surface_temperature, unit) + ' (modeled)';
            document.getElementById('water-temp-source').textContent = 'Approx. local water temperature — modeled · Not for navigation';
        } else {
            document.getElementById('water-temp-value').textContent = UNAVAILABLE;
            document.getElementById('water-temp-source').textContent = '';
        }

        // Marine-only stats (wave/current) are shown alongside NOAA data when available —
        // NOAA has no wave/current products, so this is never a mixed-without-label value.
        if (marine?.current) {
            show('marine-stats', 'grid');
            renderMarineStats(marine, lengthUnit);
        }

        const points = (data.curve?.length ? data.curve : data.hilo).map(p => ({
            time: parseNOAATime(p.t), value: convertLength(parseFloat(p.v), lengthUnit, 'ft'), sourceType: 'prediction'
        }));
        const hiloPoints = (data.hilo || []).map(p => ({
            time: parseNOAATime(p.t), value: convertLength(parseFloat(p.v), lengthUnit, 'ft'), type: p.type
        }));

        if (points.length) {
            show('tide-curve-card');
            buildChart(points, hiloPoints, lengthUnit, v => `${v.toFixed(2)} ${lengthUnit}`);
        }

        document.getElementById('data-source-text').textContent =
            `Source: NOAA CO-OPS official predictions${data.fetchErrors ? ' (some fields unavailable)' : ''}${marine ? ' + Open-Meteo Marine (waves/current)' : ''}`;
        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())} · Not for navigation — for planning purposes only`;
    }

    function renderMarineStats(marine, lengthUnit) {
        document.getElementById('wave-height-value').textContent = marine.current.wave_height != null ? fmtMetersAsUnit(marine.current.wave_height, lengthUnit, 1) : UNAVAILABLE;
        document.getElementById('wave-period-value').textContent = marine.current.wave_period != null
            ? `${marine.current.wave_period.toFixed(1)} s / ${marine.current.wave_direction != null ? Math.round(marine.current.wave_direction) + '°' : '--'}` : UNAVAILABLE;
        document.getElementById('sst-value').textContent = marine.current.sea_surface_temperature != null ? fmtTempC(marine.current.sea_surface_temperature, getUnits().unit) : UNAVAILABLE;
        document.getElementById('current-value').textContent = marine.current.ocean_current_velocity != null
            ? `${marine.current.ocean_current_velocity.toFixed(2)} km/h / ${marine.current.ocean_current_direction != null ? Math.round(marine.current.ocean_current_direction) + '°' : '--'}` : UNAVAILABLE;
    }

    function renderMarine(loc, data) {
        const { lengthUnit, unit } = getUnits();
        document.getElementById('tide-station-info').textContent = `Modeled coastal data for ${loc.name} (no NOAA station in range)`;
        show('modeled-warning', 'flex');

        show('tide-next-events', 'grid');
        document.getElementById('next-high-value').textContent = data.nextHigh ? fmtTime(data.nextHigh.time) : UNAVAILABLE;
        document.getElementById('next-high-height').textContent = data.nextHigh ? fmtMetersAsUnit(data.nextHigh.value, lengthUnit) + ' (modeled)' : '';
        document.getElementById('next-low-value').textContent = data.nextLow ? fmtTime(data.nextLow.time) : UNAVAILABLE;
        document.getElementById('next-low-height').textContent = data.nextLow ? fmtMetersAsUnit(data.nextLow.value, lengthUnit) + ' (modeled)' : '';

        document.getElementById('water-level-value').textContent = data.current?.sea_level_height_msl != null ? fmtMetersAsUnit(data.current.sea_level_height_msl, lengthUnit) + ' (modeled)' : UNAVAILABLE;
        document.getElementById('water-level-source').textContent = data.current?.sea_level_height_msl != null ? 'Approx. local sea level — modeled · Not for navigation' : '';
        document.getElementById('water-temp-value').textContent = data.current?.sea_surface_temperature != null ? fmtTempC(data.current.sea_surface_temperature, unit) + ' (modeled)' : UNAVAILABLE;
        document.getElementById('water-temp-source').textContent = data.current?.sea_surface_temperature != null ? 'Approx. local water temperature — modeled · Not for navigation' : '';

        if (data.hourlyHeights?.length) {
            show('tide-curve-card');
            const points = data.hourlyHeights.map((v, i) => ({
                time: data.times[i], value: v != null ? convertLength(v, lengthUnit, 'm') : null, sourceType: 'modeled'
            })).filter(p => p.value != null);
            const hiloPoints = data.extrema.map(e => ({ time: e.time, value: convertLength(e.value, lengthUnit, 'm'), type: e.type }));
            buildChart(points, hiloPoints, lengthUnit, v => `${v.toFixed(2)} ${lengthUnit} (modeled)`);
        }

        show('marine-stats', 'grid');
        renderMarineStats(data, lengthUnit);

        document.getElementById('data-source-text').textContent = `Source: ${data.source}`;
        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())} · Modeled data — not for navigation`;
    }

    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentRangeHours = Number(btn.dataset.range);
            applyRangeFilter();
        });
    });

    onUnitsChange(() => { if (lastLoc && lastMode === 'noaa') renderNOAA(lastLoc, lastNoaa, lastMarine); else if (lastLoc && lastMode === 'marine') renderMarine(lastLoc, lastMarine); });
    onLocationChange((loc) => { if (loc) loadTides(loc); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
