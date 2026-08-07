// Dependency-free interactive tide chart: a canvas curve + a synchronized
// native range slider, both snapped to the *actual* returned data points
// (never interpolated/invented values). Supports mouse drag, touch, and
// keyboard, and reports every selection change through onSelect() so the
// page can render a "selected point" panel and announce it to screen
// readers.
import { getThemeColor, fitCanvasToDisplaySize } from './visualization.js';

/** Smooths a polyline through real points via quadratic curves between
 * midpoints — purely a rendering treatment; the underlying values shown
 * in labels/markers/the selected-point panel are always the exact ones. */
function smoothPath(ctx, points) {
    if (points.length < 2) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i], p1 = points[i + 1];
        const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
}

/**
 * @param {Object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {HTMLInputElement} opts.slider - a native <input type="range">
 * @param {HTMLElement} [opts.announceEl] - aria-live region for SR announcements
 * @param {Array<{time:number, value:number, sourceType:'observation'|'prediction'|'modeled'}>} opts.points
 *   Sorted ascending by time. Required, must be non-empty for the chart to render.
 * @param {Array<{time:number, value:number, type:'H'|'L'}>} [opts.hiloPoints] - high/low markers
 * @param {string} opts.unitLabel - e.g. "ft" or "m"
 * @param {(v:number)=>string} [opts.formatValue]
 * @param {(index:number, point:object)=>void} opts.onSelect - called on every selection change
 */
export function createTideChart(opts) {
    const { canvas, slider, announceEl } = opts;
    let points = opts.points || [];
    let hiloPoints = opts.hiloPoints || [];
    const unitLabel = opts.unitLabel || '';
    const formatValue = opts.formatValue || (v => `${v.toFixed(2)} ${unitLabel}`);
    let selectedIndex = 0;
    let dragging = false;

    function nearestIndexToTime(t) {
        let best = 0, bestDiff = Infinity;
        points.forEach((p, i) => {
            const diff = Math.abs(p.time - t);
            if (diff < bestDiff) { bestDiff = diff; best = i; }
        });
        return best;
    }

    function describePoint(i) {
        const p = points[i];
        const prev = points[i - 1];
        const next = points[i + 1];
        let trend = 'steady';
        if (prev && p.value > prev.value) trend = 'rising';
        else if (prev && p.value < prev.value) trend = 'falling';
        if (next) {
            const willRise = next.value > p.value;
            const willFall = next.value < p.value;
            if (trend === 'rising' && willFall) trend = 'near high';
            if (trend === 'falling' && willRise) trend = 'near low';
        }
        const diff = prev ? p.value - prev.value : null;

        // Time until next high/low from the hilo marker list
        const nextEvent = hiloPoints.find(h => h.time > p.time);
        const timeUntilNext = nextEvent ? nextEvent.time - p.time : null;

        const sourceLabel = { observation: 'Observation', prediction: 'Official prediction', modeled: 'Modeled estimate' }[p.sourceType] || 'Unknown';

        return { point: p, trend, diff, nextEvent, timeUntilNext, sourceLabel, formattedValue: formatValue(p.value), unitLabel };
    }

    function fmtTime(t) {
        return new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
    }

    function fmtDuration(ms) {
        if (ms == null) return '—';
        const totalMin = Math.round(Math.abs(ms) / 60000);
        const h = Math.floor(totalMin / 60), m = totalMin % 60;
        return `${h}h ${m}m`;
    }

    function draw() {
        const { width: w, height: h } = fitCanvasToDisplaySize(canvas);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        if (!points.length) {
            const labelColor = getThemeColor('--chart-label-color', 'rgba(255,255,255,0.6)');
            ctx.fillStyle = labelColor;
            ctx.globalAlpha = 0.7;
            ctx.font = '500 13px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No tide data available', w / 2, h / 2);
            ctx.globalAlpha = 1;
            return;
        }

        const values = points.map(p => p.value);
        const min = Math.min(...values, ...hiloPoints.map(p => p.value));
        const max = Math.max(...values, ...hiloPoints.map(p => p.value));
        const range = (max - min) || 1;
        const padL = 42, padR = 12, padT = 16, padB = 28;
        const chartW = w - padL - padR, chartH = h - padT - padB;
        const minTime = points[0].time, maxTime = points[points.length - 1].time;
        const timeSpan = (maxTime - minTime) || 1;

        const xFor = (t) => padL + ((t - minTime) / timeSpan) * chartW;
        const yFor = (v) => padT + chartH - ((v - min) / range) * chartH;

        const labelColor = getThemeColor('--chart-label-color', 'rgba(255,255,255,0.6)');
        const cursorColor = getThemeColor('--chart-cursor-color', '#33b7e0');

        // Y-axis gridlines + labels
        ctx.strokeStyle = labelColor;
        ctx.fillStyle = labelColor;
        ctx.globalAlpha = 0.2;
        ctx.font = '11px Inter, Arial, sans-serif';
        const ySteps = 4;
        for (let i = 0; i <= ySteps; i++) {
            const v = min + (range * i / ySteps);
            const y = yFor(v);
            ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i <= ySteps; i++) {
            const v = min + (range * i / ySteps);
            const y = yFor(v);
            ctx.textAlign = 'right';
            ctx.fillText(v.toFixed(1), padL - 6, y + 3);
        }

        // X-axis time labels (a handful of evenly spaced ticks)
        ctx.textAlign = 'center';
        const xTicks = 4;
        for (let i = 0; i <= xTicks; i++) {
            const t = minTime + (timeSpan * i / xTicks);
            const x = xFor(t);
            ctx.fillText(new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }), x, h - 8);
        }

        // Curve — connects only real returned points; if the curve is
        // sparse (hilo-only station), this still just draws smoothed
        // segments between real values, never fabricated ones.
        const linePoints = points.map(p => ({ x: xFor(p.time), y: yFor(p.value) }));

        // Soft gradient fill under the curve for visual depth.
        const fillGradient = ctx.createLinearGradient(0, padT, 0, padT + chartH);
        fillGradient.addColorStop(0, cursorColor + '2e');
        fillGradient.addColorStop(1, cursorColor + '00');
        ctx.beginPath();
        smoothPath(ctx, linePoints);
        ctx.lineTo(linePoints[linePoints.length - 1].x, padT + chartH);
        ctx.lineTo(linePoints[0].x, padT + chartH);
        ctx.closePath();
        ctx.fillStyle = fillGradient;
        ctx.fill();

        ctx.strokeStyle = cursorColor;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        smoothPath(ctx, linePoints);
        ctx.stroke();

        // High/low markers
        hiloPoints.forEach(hp => {
            if (hp.time < minTime || hp.time > maxTime) return;
            const x = xFor(hp.time), y = yFor(hp.value);
            ctx.fillStyle = hp.type === 'H' ? '#ff9f43' : '#4fa8ff';
            ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
            ctx.font = '600 11px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(hp.type === 'H' ? 'H' : 'L', x, y - 8);
        });

        // Current-time marker (vertical line)
        const now = Date.now();
        if (now >= minTime && now <= maxTime) {
            const x = xFor(now);
            ctx.strokeStyle = labelColor;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + chartH); ctx.stroke();
            ctx.setLineDash([]);
        }

        // Selected-point cursor
        const sel = points[selectedIndex];
        if (sel) {
            const x = xFor(sel.time), y = yFor(sel.value);
            ctx.fillStyle = cursorColor;
            ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = getThemeColor('--metric-value-color', '#fff');
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + chartH); ctx.strokeStyle = cursorColor; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
        }
    }

    function select(index, { announce = true } = {}) {
        if (!points.length) return;
        selectedIndex = Math.max(0, Math.min(points.length - 1, index));
        const info = describePoint(selectedIndex);
        slider.value = String(selectedIndex);
        const valueText = `${fmtTime(info.point.time)} — ${formatValue(info.point.value)}, ${info.trend}`;
        slider.setAttribute('aria-valuetext', valueText);
        if (announceEl && announce) announceEl.textContent = valueText;
        draw();
        if (typeof opts.onSelect === 'function') opts.onSelect(selectedIndex, info);
    }

    function xToIndex(clientX) {
        // Work in CSS pixels (rect.width) — canvas.width is the DPI-scaled
        // drawing-buffer size, not the on-screen size, since fitCanvasToDisplaySize.
        const rect = canvas.getBoundingClientRect();
        const padL = 42, padR = 12;
        const relX = clientX - rect.left;
        const chartW = rect.width - padL - padR;
        const frac = Math.max(0, Math.min(1, (relX - padL) / chartW));
        return Math.round(frac * (points.length - 1));
    }

    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', 'Tide chart — drag or use arrow keys to inspect a point in time');

    const onMouseDown = (e) => { dragging = true; select(xToIndex(e.clientX)); };
    const onMouseMove = (e) => { if (dragging) select(xToIndex(e.clientX)); };
    const onMouseUp = () => { dragging = false; };
    const onTouchStart = (e) => { dragging = true; select(xToIndex(e.touches[0].clientX)); };
    const onTouchMove = (e) => { if (dragging) select(xToIndex(e.touches[0].clientX)); };
    const onTouchEnd = () => { dragging = false; };
    const onKeyDown = (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); select(selectedIndex + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); select(selectedIndex - 1); }
        else if (e.key === 'Home') { e.preventDefault(); select(0); }
        else if (e.key === 'End') { e.preventDefault(); select(points.length - 1); }
    };
    const onSliderInput = () => select(Number(slider.value));
    const onResize = () => draw();

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('keydown', onKeyDown);
    slider.addEventListener('input', onSliderInput);
    window.addEventListener('resize', onResize);

    return {
        setData(newPoints, newHiloPoints, newUnitLabel, newFormatValue) {
            points = newPoints || [];
            hiloPoints = newHiloPoints || [];
            if (newUnitLabel) opts.unitLabel = newUnitLabel;
            if (newFormatValue) opts.formatValue = newFormatValue;
            slider.min = '0';
            slider.max = String(Math.max(0, points.length - 1));
            slider.step = '1';
            select(Math.min(selectedIndex, Math.max(0, points.length - 1)), { announce: false });
        },
        selectByTime(t) { select(nearestIndexToTime(t)); },
        select,
        redraw: draw,
        destroy() {
            canvas.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
            canvas.removeEventListener('keydown', onKeyDown);
            slider.removeEventListener('input', onSliderInput);
            window.removeEventListener('resize', onResize);
        }
    };
}
