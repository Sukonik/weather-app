import { convertTemperature, formatSpeed, getWindDirection, getPrecipitationIntensity } from './utils.js';

export function drawHourlyChart(canvas, data, startIndex, count, options = {}) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const values = data.slice(startIndex, startIndex + count);
    if (!values.length) return;

    const padding = 20;
    const chartWidth = width - (padding * 2);
    const chartHeight = height - (padding * 2);
    
    // Draw background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
        const x = padding + (i * (chartWidth / count));
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
    }
    ctx.stroke();

    // Calculate scale
    const maxValue = Math.max(...values) * 1.2;
    const scale = chartHeight / maxValue;

    // Draw data points
    ctx.strokeStyle = options.color || '#007AFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((value, i) => {
        const x = padding + (i * (chartWidth / (count - 1)));
        const y = height - padding - (value * scale);
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Draw current value
    const currentValue = values[0];
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(options.formatValue ? options.formatValue(currentValue) : currentValue, padding, padding - 5);
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