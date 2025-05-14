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