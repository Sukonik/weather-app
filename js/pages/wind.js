import { initChrome, onLocationChange, onUnitsChange, getUnits } from '../modules/chrome.js';
import { fetchJSON, cacheGet, cacheSet, formatUpdatedTime, makeAbortGroup } from '../modules/fetchUtils.js';
import { formatSpeed, getWindDirection, getWindStrengthCategory, parseOpenMeteoTime } from '../modules/utils.js';
import { createHourlyTimeline } from '../modules/hourlyTimeline.js';

const UNAVAILABLE = 'Data unavailable';
const abortGroup = makeAbortGroup();

function initApp() {
    initChrome({ page: 'wind' });

    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');

    let lastData = null;
    let lastLoc = null;
    let timeline = null;
    let fullPoints = [], fullGusts = [], fullDirections = [];
    let rangeHours = 24;
    let requestGeneration = 0;

    async function loadWind(loc) {
        lastLoc = loc;
        const thisGeneration = ++requestGeneration;
        try {
            loadingEl.style.display = 'flex';
            errorEl.textContent = '';
            errorEl.innerHTML = '';
            const signal = abortGroup();
            const key = `wind_page_${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`;
            let data = cacheGet(key, 5 * 60 * 1000);
            if (!data) {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
                    `&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
                    `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
                    `&timezone=auto&past_hours=3&forecast_days=2`;
                data = await fetchJSON(url, { signal, timeoutMs: 8000, retries: 1 });
                cacheSet(key, data);
            }
            if (thisGeneration !== requestGeneration) return; // superseded by a newer request
            lastData = data;
            render(data);
            loadingEl.style.display = 'none';
        } catch (error) {
            if (thisGeneration !== requestGeneration) return;
            if (error?.message?.includes('superseded')) return;
            console.error('Wind page error:', error);
            errorEl.innerHTML = `<span>Unable to load wind data. Please try again.</span> <button type="button" class="retry-inline-btn" id="wind-retry-btn">Retry</button>`;
            document.getElementById('wind-retry-btn')?.addEventListener('click', () => { if (lastLoc) loadWind(lastLoc); });
            loadingEl.style.display = 'none';
        }
    }

    function buildSeries(data) {
        const { speedUnit } = getUnits();
        const now = Date.now();
        const offsetSec = data.utc_offset_seconds;
        const times = data.hourly.time.map(t => parseOpenMeteoTime(t, offsetSec));
        let nowIdx = times.findIndex(t => t >= now);
        if (nowIdx < 0) nowIdx = Math.max(0, times.length - 1);

        const points = times.map((t, i) => ({
            time: t,
            value: convertToUnit(data.hourly.wind_speed_10m[i], speedUnit),
            isPast: t < now,
            isNow: i === nowIdx,
            meta: {
                speedKmh: data.hourly.wind_speed_10m[i],
                gustKmh: data.hourly.wind_gusts_10m?.[i] ?? null,
                directionDeg: data.hourly.wind_direction_10m?.[i] ?? null
            }
        }));
        const gustSeries = points
            .filter(p => p.meta.gustKmh != null)
            .map(p => ({ time: p.time, value: convertToUnit(p.meta.gustKmh, speedUnit) }));
        const directionSeries = points
            .filter(p => p.meta.directionDeg != null)
            .map(p => ({ time: p.time, degrees: p.meta.directionDeg }));
        return { points, gustSeries, directionSeries };
    }

    // formatSpeed's own conversion assumes km/h input; keep that single
    // source of truth instead of re-deriving the mph factor here.
    function convertToUnit(speedKmh, speedUnit) {
        if (speedKmh == null) return null;
        return speedUnit === 'mph' ? speedKmh * 0.621371 : speedKmh;
    }

    function applyRangeFilter() {
        if (!timeline || !fullPoints.length) return;
        const nowIdx = Math.max(0, fullPoints.findIndex(p => p.isNow));
        const startIdx = Math.max(0, nowIdx - 3);
        const cutoff = fullPoints[nowIdx].time + rangeHours * 3600 * 1000;
        const filtered = fullPoints.filter((p, i) => i >= startIdx && p.time <= cutoff);
        const points = filtered.length ? filtered : fullPoints;
        const start = points[0].time, end = points[points.length - 1].time;
        const filteredGusts = fullGusts.filter(g => g.time >= start && g.time <= end);
        const filteredDirections = fullDirections.filter(d => d.time >= start && d.time <= end);
        timeline.setData(points, filteredGusts, filteredDirections);
        renderStrongestGust(points);
        if (lastData) renderGuidance(lastData, points);
    }

    function renderSelectedPanel(info) {
        const { speedUnit } = getUnits();
        const meta = info.point.meta;
        const timeLabel = new Date(info.point.time).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: lastData?.timezone || undefined })
            + (info.isNow ? ' (Now)' : info.isPast ? ' (past)' : '');
        document.getElementById('wind-tsp-time').textContent = timeLabel;
        document.getElementById('wind-tsp-speed').textContent = info.formattedValue;
        document.getElementById('wind-tsp-gust').textContent = meta.gustKmh != null ? formatSpeed(meta.gustKmh, speedUnit) : UNAVAILABLE;
        document.getElementById('wind-tsp-direction').textContent = meta.directionDeg != null
            ? `${getWindDirection(meta.directionDeg)} (${Math.round(meta.directionDeg)}°)` : UNAVAILABLE;
        const strength = getWindStrengthCategory(meta.speedKmh);
        const strengthEl = document.getElementById('wind-tsp-strength');
        strengthEl.textContent = strength.label;

        const arrow = document.getElementById('compass-arrow');
        if (arrow && meta.directionDeg != null) arrow.style.transform = `rotate(${meta.directionDeg}deg)`;
    }

    function renderHero(data) {
        const { speedUnit } = getUnits();
        const c = data.current || {};
        document.getElementById('wind-speed-value').textContent = c.wind_speed_10m != null ? formatSpeed(c.wind_speed_10m, speedUnit) : UNAVAILABLE;
        document.getElementById('wind-direction-value').textContent = c.wind_direction_10m != null
            ? `${getWindDirection(c.wind_direction_10m)} (${Math.round(c.wind_direction_10m)}°)` : UNAVAILABLE;
        document.getElementById('wind-gust-value').textContent = c.wind_gusts_10m != null ? `Gusts: ${formatSpeed(c.wind_gusts_10m, speedUnit)}` : 'Gusts: ' + UNAVAILABLE;

        const badge = document.getElementById('wind-strength-badge');
        const strength = getWindStrengthCategory(c.wind_speed_10m);
        badge.textContent = strength.label;
        const statusColor = { 'sev-1': 'green', 'sev-2': 'yellow', 'sev-4': 'orange', 'sev-6': 'red' }[strength.class] || 'green';
        badge.className = `shore-status-pill status-${statusColor}`;

        const arrow = document.getElementById('compass-arrow');
        if (arrow && c.wind_direction_10m != null) arrow.style.transform = `rotate(${c.wind_direction_10m}deg)`;

        document.getElementById('data-timestamp-text').textContent = `Updated: ${formatUpdatedTime(Date.now())}`;
    }

    function renderStrongestGust(points) {
        const { speedUnit } = getUnits();
        const withGust = points.filter(p => p.meta.gustKmh != null);
        if (!withGust.length) {
            document.getElementById('strongest-gust-value').textContent = UNAVAILABLE;
            document.getElementById('strongest-gust-time').textContent = '';
            return;
        }
        const strongest = withGust.reduce((a, b) => (b.meta.gustKmh > a.meta.gustKmh ? b : a));
        document.getElementById('strongest-gust-value').textContent = formatSpeed(strongest.meta.gustKmh, speedUnit);
        const timeLabel = new Date(strongest.time).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: lastData?.timezone || undefined });
        document.getElementById('strongest-gust-time').textContent = `Expected around ${timeLabel}`;
    }

    function guidanceItem(icon, text) { return `<li><span aria-hidden="true">${icon}</span> ${text}</li>`; }

    function renderGuidance(data, windowPoints) {
        const c = data.current || {};
        const speedKmh = c.wind_speed_10m;
        const gustKmh = c.wind_gusts_10m;
        const maxGustKmh = windowPoints.reduce((max, p) => (p.meta.gustKmh != null && p.meta.gustKmh > max ? p.meta.gustKmh : max), gustKmh ?? 0);

        const cyclistList = [];
        if (speedKmh == null) {
            cyclistList.push(guidanceItem('⚪', 'Wind data unavailable.'));
        } else {
            if (speedKmh < 15 && (gustKmh ?? speedKmh) < 25) cyclistList.push(guidanceItem('🟢', 'Calm enough for comfortable riding in most directions.'));
            else if (speedKmh < 30) cyclistList.push(guidanceItem('🟡', 'Noticeable wind — expect a harder push riding into it on one leg of your route.'));
            else cyclistList.push(guidanceItem('🟠', 'Strong sustained wind — expect real resistance and reduced control, especially on exposed roads.'));
            if (gustKmh != null && gustKmh - speedKmh >= 15) cyclistList.push(guidanceItem('💨', `Gusts run well above sustained speed (up to ${Math.round(gustKmh)} km/h) — watch for sudden pushes near gaps between buildings or tree lines.`));
            if (speedKmh >= 40 || (gustKmh ?? 0) >= 55) cyclistList.push(guidanceItem('⚠️', 'Consider a different route or time — crosswind gusts at this strength can affect bike control.'));
        }
        document.getElementById('cyclist-guidance-list').innerHTML = cyclistList.join('');

        const outdoorList = [];
        if (!maxGustKmh) {
            outdoorList.push(guidanceItem('⚪', 'Wind data unavailable.'));
        } else {
            if (maxGustKmh < 30) outdoorList.push(guidanceItem('🟢', 'No general outdoor-item concerns expected at these gust levels.'));
            else if (maxGustKmh < 50) outdoorList.push(guidanceItem('🟡', 'Light unsecured items (umbrellas, small planters) may shift — worth checking.'));
            else outdoorList.push(guidanceItem('🟠', 'Secure loose outdoor items (umbrellas, furniture, trash bins) — gusts at this strength can move or tip them.'));
            outdoorList.push(guidanceItem('🌊', 'Open, waterfront, and elevated areas typically feel stronger gusts than sheltered streets or tree-covered yards.'));
        }
        document.getElementById('outdoor-guidance-list').innerHTML = outdoorList.join('');
    }

    function render(data) {
        const canvas = document.getElementById('wind-chart');
        const slider = document.getElementById('wind-slider');
        const announceEl = document.getElementById('wind-timeline-announce');
        renderHero(data);

        if (canvas && slider && data.hourly?.time?.length) {
            const { speedUnit } = getUnits();
            const { points, gustSeries, directionSeries } = buildSeries(data);
            fullPoints = points; fullGusts = gustSeries; fullDirections = directionSeries;

            if (timeline) timeline.destroy();
            timeline = createHourlyTimeline({
                canvas, slider, announceEl,
                points, secondarySeries: gustSeries, directionSeries,
                secondaryStyle: 'line', secondaryShareAxis: true,
                unitLabel: ` ${speedUnit}`,
                formatValue: v => `${Math.round(v)} ${speedUnit}`,
                timeZone: data.timezone,
                ariaLabel: 'Wind speed timeline — drag, touch, or use arrow keys to inspect an hour',
                onSelect: (index, info) => renderSelectedPanel(info)
            });
            applyRangeFilter(); // also renders the strongest-gust callout and guidance for the visible window
        }

        document.getElementById('data-source-text').textContent = 'Source: Open-Meteo Forecast API';
    }

    document.querySelectorAll('[data-wind-range]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-wind-range]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            rangeHours = Number(btn.dataset.windRange);
            applyRangeFilter();
        });
    });

    onLocationChange((loc) => { if (loc) loadWind(loc); });
    onUnitsChange(() => { if (lastData) render(lastData); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initApp);
else initApp();
