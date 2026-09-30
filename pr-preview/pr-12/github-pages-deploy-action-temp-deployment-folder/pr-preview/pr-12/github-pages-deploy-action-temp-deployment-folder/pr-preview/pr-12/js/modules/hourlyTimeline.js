// Dependency-free scrubbable hourly timeline: a canvas chart (primary line
// series + an optional secondary bar series) synchronized with a native
// range slider, plus a "Now" marker separating recent history from the
// forecast. Interaction model (drag/touch/keyboard/aria) is deliberately
// the same shape as tideChart.js so this becomes the shared foundation for
// Wind, AQI, UV, and Rain's own hourly charts — each page only supplies
// its own series data, formatting, and selected-hour panel.
import { getThemeColor, fitCanvasToDisplaySize } from './visualization.js';

const prefersReducedMotion = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {Object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {HTMLInputElement} opts.slider - native <input type="range">
 * @param {HTMLElement} [opts.announceEl] - aria-live region for SR announcements
 * @param {Array<{time:number, value:number, isPast?:boolean, isNow?:boolean}>} opts.points
 *   Sorted ascending by time. Real returned hours only — never interpolated.
 * @param {Array<{time:number, value:number}>} [opts.secondarySeries] - e.g. precip
 *   probability (0-100), drawn as light bars scaled to its own 0-100 axis.
 * @param {string} [opts.unitLabel]
 * @param {(v:number)=>string} [opts.formatValue]
 * @param {(v:number)=>string} [opts.formatSecondary]
 * @param {string} [opts.ariaLabel]
 * @param {(index:number, info:object)=>void} opts.onSelect - called on every selection change
 */
export function createHourlyTimeline(opts) {
    const { canvas, slider, announceEl } = opts;
    let points = opts.points || [];
    let secondarySeries = opts.secondarySeries || [];
    const unitLabel = opts.unitLabel || '';
    const formatValue = opts.formatValue || (v => `${Math.round(v)}${unitLabel}`);
    const formatSecondary = opts.formatSecondary || (v => `${Math.round(v)}%`);
    let selectedIndex = 0;
    let dragging = false;
    const reduceMotion = prefersReducedMotion();

    function nowIndex() {
        const idx = points.findIndex(p => p.isNow);
        if (idx >= 0) return idx;
        const now = Date.now();
        const fallback = points.findIndex(p => p.time >= now);
        return fallback >= 0 ? fallback : 0;
    }

    function nearestIndexToTime(t) {
        let best = 0, bestDiff = Infinity;
        points.forEach((p, i) => {
            const diff = Math.abs(p.time - t);
            if (diff < bestDiff) { bestDiff = diff; best = i; }
        });
        return best;
    }

    function secondaryAt(time) {
        const match = secondarySeries.find(s => s.time === time);
        return match ? match.value : null;
    }

    function describePoint(i) {
        const p = points[i];
        const prev = points[i - 1];
        let trend = 'steady';
        if (prev && p.value > prev.value) trend = 'rising';
        else if (prev && p.value < prev.value) trend = 'falling';
        const secondaryValue = secondaryAt(p.time);
        return {
            point: p, trend,
            formattedValue: formatValue(p.value),
            secondaryValue,
            formattedSecondary: secondaryValue != null ? formatSecondary(secondaryValue) : null,
            unitLabel,
            isPast: !!p.isPast,
            isNow: !!p.isNow
        };
    }

    function fmtTime(t) {
        return new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
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
            ctx.fillText('No hourly data available', w / 2, h / 2);
            ctx.globalAlpha = 1;
            return;
        }

        const values = points.map(p => p.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = (max - min) || 1;
        const padL = 42, padR = 12, padT = 16, padB = 28;
        const chartW = w - padL - padR, chartH = h - padT - padB;
        const minTime = points[0].time, maxTime = points[points.length - 1].time;
        const timeSpan = (maxTime - minTime) || 1;

        const xFor = (t) => padL + ((t - minTime) / timeSpan) * chartW;
        const yFor = (v) => padT + chartH - ((v - min) / range) * chartH;

        const labelColor = getThemeColor('--chart-label-color', 'rgba(255,255,255,0.6)');
        const cursorColor = getThemeColor('--chart-cursor-color', '#33b7e0');
        const pastColor = getThemeColor('--text-secondary', '#999999');

        // Past-hours shading (subtle) so history reads as distinct from forecast.
        const nowIdx = nowIndex();
        if (nowIdx > 0) {
            ctx.fillStyle = pastColor;
            ctx.globalAlpha = 0.06;
            ctx.fillRect(padL, padT, xFor(points[nowIdx].time) - padL, chartH);
            ctx.globalAlpha = 1;
        }

        // Y-axis gridlines
        ctx.strokeStyle = labelColor;
        ctx.fillStyle = labelColor;
        ctx.globalAlpha = 0.2;
        ctx.font = '11px Inter, Arial, sans-serif';
        const ySteps = 4;
        for (let i = 0; i <= ySteps; i++) {
            const y = yFor(min + (range * i / ySteps));
            ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i <= ySteps; i++) {
            const v = min + (range * i / ySteps);
            const y = yFor(v);
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(v), padL - 6, y + 3);
        }

        // X-axis time labels
        ctx.textAlign = 'center';
        const xTicks = 4;
        for (let i = 0; i <= xTicks; i++) {
            const t = minTime + (timeSpan * i / xTicks);
            ctx.fillText(new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }), xFor(t), h - 8);
        }

        // Secondary bar series (e.g. precipitation probability), own 0-100 axis.
        if (secondarySeries.length) {
            const barW = Math.max(2, chartW / points.length - 2);
            ctx.fillStyle = cursorColor;
            ctx.globalAlpha = 0.18;
            points.forEach(p => {
                const sv = secondaryAt(p.time);
                if (sv == null) return;
                const barH = (sv / 100) * chartH * 0.4;
                ctx.fillRect(xFor(p.time) - barW / 2, padT + chartH - barH, barW, barH);
            });
            ctx.globalAlpha = 1;
        }

        // Primary line + gradient fill
        const linePoints = points.map(p => ({ x: xFor(p.time), y: yFor(p.value) }));
        const fillGradient = ctx.createLinearGradient(0, padT, 0, padT + chartH);
        fillGradient.addColorStop(0, cursorColor + '2e');
        fillGradient.addColorStop(1, cursorColor + '00');
        ctx.beginPath();
        ctx.moveTo(linePoints[0].x, linePoints[0].y);
        for (let i = 0; i < linePoints.length - 1; i++) {
            const p0 = linePoints[i], p1 = linePoints[i + 1];
            const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
        }
        ctx.lineTo(linePoints[linePoints.length - 1].x, linePoints[linePoints.length - 1].y);
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
        ctx.moveTo(linePoints[0].x, linePoints[0].y);
        for (let i = 0; i < linePoints.length - 1; i++) {
            const p0 = linePoints[i], p1 = linePoints[i + 1];
            const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
        }
        ctx.lineTo(linePoints[linePoints.length - 1].x, linePoints[linePoints.length - 1].y);
        ctx.stroke();

        // "Now" marker — a static line (no animation) unless the user allows
        // motion, in which case a soft pulse gives the MSN-style liveliness
        // the product spec asks for without a heavy animation dependency.
        if (points[nowIdx]) {
            const x = xFor(points[nowIdx].time);
            ctx.strokeStyle = cursorColor;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + chartH); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = '600 10px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = cursorColor;
            ctx.fillText('NOW', x, padT - 4);
            if (!reduceMotion) {
                const pulse = 3 + Math.sin(Date.now() / 500) * 1.5;
                ctx.beginPath();
                ctx.globalAlpha = 0.5;
                ctx.arc(x, yFor(points[nowIdx].value), pulse + 4, 0, Math.PI * 2);
                ctx.fillStyle = cursorColor;
                ctx.fill();
                ctx.globalAlpha = 1;
            }
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
        }

        if (!reduceMotion && points[nowIdx]) {
            // Keep the subtle pulse alive without ever moving the chart data.
            cancelAnimationFrame(draw._raf);
            draw._raf = requestAnimationFrame(() => { if (canvas.isConnected) draw(); });
        }
    }

    function select(index, { announce = true } = {}) {
        if (!points.length) return;
        selectedIndex = Math.max(0, Math.min(points.length - 1, index));
        const info = describePoint(selectedIndex);
        slider.value = String(selectedIndex);
        const valueText = `${fmtTime(info.point.time)} — ${formatValue(info.point.value)}${info.formattedSecondary ? `, ${info.formattedSecondary}` : ''}${info.isNow ? ' (now)' : info.isPast ? ' (past)' : ''}`;
        slider.setAttribute('aria-valuetext', valueText);
        if (announceEl && announce) announceEl.textContent = valueText;
        draw();
        if (typeof opts.onSelect === 'function') opts.onSelect(selectedIndex, info);
    }

    function xToIndex(clientX) {
        const rect = canvas.getBoundingClientRect();
        const padL = 42, padR = 12;
        const relX = clientX - rect.left;
        const chartW = rect.width - padL - padR;
        const frac = Math.max(0, Math.min(1, (relX - padL) / chartW));
        return Math.round(frac * (points.length - 1));
    }

    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'slider');
    canvas.setAttribute('aria-label', opts.ariaLabel || 'Hourly timeline — drag or use arrow keys to inspect an hour');

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
        setData(newPoints, newSecondarySeries) {
            points = newPoints || [];
            secondarySeries = newSecondarySeries || [];
            slider.min = '0';
            slider.max = String(Math.max(0, points.length - 1));
            slider.step = '1';
            const startAt = points.length ? nowIndex() : 0;
            select(Math.min(selectedIndex || startAt, Math.max(0, points.length - 1)), { announce: false });
        },
        selectByTime(t) { select(nearestIndexToTime(t)); },
        selectNow() { select(nowIndex()); },
        select,
        redraw: draw,
        destroy() {
            cancelAnimationFrame(draw._raf);
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
