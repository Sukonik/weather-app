const baseUrl = window.location.hostname === 'sukonik.github.io' ? '/weather-app' : '';
import { convertTemperature, formatSpeed, getWindDirection, getPrecipitationIntensity } from './utils.js';

/** Reads a CSS custom property's current computed value so canvas drawing
 * (which can't use var() directly) still follows the active theme. */
export function getThemeColor(varName, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return v || fallback;
}

/**
 * Sizes a canvas's drawing buffer to match its CSS/layout size × the
 * device pixel ratio, then scales the context so drawing code can keep
 * working in CSS pixels. Without this, a canvas with a fixed HTML
 * width/height attribute (e.g. 600×220) gets stretched by its `width:100%`
 * CSS rule and renders blurry on wide containers or retina screens.
 * Returns {width, height} in CSS pixels for the caller to lay out against.
 */
export function fitCanvasToDisplaySize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.round(rect.width) || canvas.width;
    const cssHeight = Math.round(rect.height) || canvas.height;
    const targetW = Math.round(cssWidth * dpr);
    const targetH = Math.round(cssHeight * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: cssWidth, height: cssHeight };
}

/** Draws a smooth line through `points` (array of {x,y}) using quadratic
 * curves between midpoints — a purely visual smoothing of the connection
 * between real data points; it never adds or alters a labeled value. */
function smoothLinePath(ctx, points) {
    if (points.length < 2) {
        if (points.length === 1) { ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(points[0].x, points[0].y); }
        return;
    }
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i], p1 = points[i + 1];
        const midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
        ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
}

export function drawHourlyChart(canvas, data, startIndex, count, options = {}) {
    const { width, height } = fitCanvasToDisplaySize(canvas);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const values = data.slice(startIndex, startIndex + count);
    if (!values.length) {
        const labelColor = options.labelColor || getThemeColor('--chart-label-color', 'rgba(255,255,255,0.65)');
        ctx.fillStyle = labelColor;
        ctx.globalAlpha = 0.7;
        ctx.font = '500 13px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', width / 2, height / 2);
        ctx.globalAlpha = 1;
        return;
    }

    const padding = 22;
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);

    const labelColor = options.labelColor || getThemeColor('--chart-label-color', 'rgba(255,255,255,0.65)');
    const lineColor = options.color || getThemeColor('--chart-cursor-color', '#007AFF');

    // Background grid — theme-aware so it stays faint but visible on both
    // dark cards and light ones (Coffee/Light).
    ctx.strokeStyle = labelColor;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= count; i += Math.max(1, Math.round(count / 6))) {
        const x = padding + (i * (chartWidth / count));
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Scale
    const maxValue = Math.max(...values) * 1.2 || 1;
    const scale = chartHeight / maxValue;
    const points = values.map((v, i) => ({
        x: padding + (i * (chartWidth / (count - 1 || 1))),
        y: height - padding - (v * scale)
    }));

    // Soft gradient fill under the curve for a bit of visual depth.
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, lineColor + '33');
    gradient.addColorStop(1, lineColor + '00');
    ctx.beginPath();
    smoothLinePath(ctx, points);
    ctx.lineTo(points[points.length - 1].x, height - padding);
    ctx.lineTo(points[0].x, height - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // The line itself — smoothed, rounded joins/caps for a cleaner look.
    ctx.beginPath();
    smoothLinePath(ctx, points);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Current-value label — theme-aware color so it's never invisible
    // white-on-light (Coffee/Light) or dark-on-dark.
    const currentValue = values[0];
    ctx.fillStyle = labelColor;
    ctx.font = '600 14px Inter, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(options.formatValue ? options.formatValue(currentValue) : currentValue, padding, padding - 6);
}

export function updateHourlyVisualizations(weatherData, currentHourIndex) {
    const hourCount = 12;

    // Temperature
    const tempCanvas = document.getElementById('tempCanvas');
    if (tempCanvas) {
        const temps = weatherData.hourly.temperature_2m;
        drawHourlyChart(tempCanvas, temps, currentHourIndex, hourCount, {
            color: '#FF3B30',
            formatValue: (temp) => `${Math.round(convertTemperature(temp, 'F'))}°F`
        });
    }

    // Precipitation
    const precipCanvas = document.getElementById('precipCanvas');
    if (precipCanvas) {
        const precip = weatherData.hourly.precipitation;
        drawHourlyChart(precipCanvas, precip, currentHourIndex, hourCount, {
            color: '#5856D6',
            formatValue: (value) => `${value.toFixed(1)}mm`
        });
    }

    // Wind
    const windCanvas = document.getElementById('windCanvas');
    if (windCanvas) {
        const windSpeeds = weatherData.hourly.wind_speed_10m;
        drawHourlyChart(windCanvas, windSpeeds, currentHourIndex, hourCount, {
            color: '#34C759',
            formatValue: (speed) => formatSpeed(speed, 'mph')
        });
    }
}

class RainDrop {
    constructor(canvas) {
        this.canvas = canvas;
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * -100;
        this.speed = 2 + Math.random() * 2;
        this.length = 10 + Math.random() * 10;
    }

    update(intensity) {
        this.y += this.speed * (intensity / 2 + 0.5);
        if (this.y > this.canvas.height) {
            this.y = Math.random() * -100;
            this.x = Math.random() * this.canvas.width;
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x, this.y + this.length);
        ctx.stroke();
    }
}

class WindParticle {
    constructor(canvas) {
        this.canvas = canvas;
        this.reset();
        this.radius = 1 + Math.random();
    }

    reset() {
        this.x = Math.random() * -100;
        this.y = Math.random() * this.canvas.height;
    }

    update(speed) {
        this.x += speed / 5;
        if (this.x > this.canvas.width) {
            this.reset();
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

export function initializeAnimations(precipCanvas, windCanvas) {
    const raindrops = Array.from({ length: 50 }, () => new RainDrop(precipCanvas));
    const windParticles = Array.from({ length: 100 }, () => new WindParticle(windCanvas));

    return { raindrops, windParticles };
}

export function updatePrecipitationDisplay(canvas, data, hourIndex, isNext8Hours = false) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get precipitation data
    const precipProb = data.hourly.precipitation_probability;
    const precipAmount = data.hourly.precipitation;
    const endIndex = isNext8Hours ? hourIndex + 8 : hourIndex + 1;
    const currentProb = precipProb[hourIndex];
    const currentAmount = precipAmount[hourIndex];

    // Update display values
    const probDisplay = document.getElementById('precip-probability');
    const timeDisplay = document.getElementById('precip-time');

    probDisplay.textContent = `${currentProb}%`;
    const time = new Date(data.hourly.time[hourIndex]);
    timeDisplay.textContent = time.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    // Animation settings
    ctx.strokeStyle = 'rgba(0, 122, 255, 0.6)';
    ctx.lineWidth = 1;

    return { probability: currentProb, amount: currentAmount };
}

export function updateWindDisplay(canvas, data, hourIndex, isNext8Hours = false) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get wind data
    const windSpeed = data.hourly.wind_speed_10m;
    const windDir = data.hourly.wind_direction_10m;
    const endIndex = isNext8Hours ? hourIndex + 8 : hourIndex + 1;
    const currentSpeed = windSpeed[hourIndex];
    const currentDir = windDir[hourIndex];

    // Update display values
    const speedDisplay = document.getElementById('wind-speed');
    const dirDisplay = document.getElementById('wind-direction');
    const timeDisplay = document.getElementById('wind-time');

    speedDisplay.textContent = formatSpeed(currentSpeed, 'km/h');
    dirDisplay.textContent = getWindDirection(currentDir);
    const time = new Date(data.hourly.time[hourIndex]);
    timeDisplay.textContent = time.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    // Animation settings
    ctx.fillStyle = 'rgba(52, 199, 89, 0.6)';

    return { speed: currentSpeed, direction: currentDir };
}

export function animate(ctx, particles, weatherParams) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    particles.forEach(particle => {
        particle.update(weatherParams.intensity || weatherParams.speed);
        particle.draw(ctx);
    });
}
