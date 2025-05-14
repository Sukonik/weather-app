import { getWeatherData, getCoordinates, getCurrentLocation } from './js/modules/weatherAPI.js';
import { convertTemperature, getWeatherDescription, getWeatherIcon, getUVIndexDescription, getAirQualityDescription, getVisibilityDescription } from './js/modules/utils.js';
import { updateHourlyVisualizations } from './js/modules/visualization.js';

// DOM Elements
const locationSearch = document.getElementById('location-search');
const searchBtn = document.getElementById('search-btn');
const currentLocationBtn = document.getElementById('current-location-btn');
const locationElement = document.querySelector('.location');
const temperatureElement = document.querySelector('.temperature');
const conditionElement = document.querySelector('.condition');
const feelsLikeElement = document.querySelector('.feels-like');
const windElement = document.getElementById('wind');
const humidityElement = document.getElementById('humidity');
const precipitationElement = document.getElementById('precipitation');
const uvIndexElement = document.getElementById('uv-index');
const hourlyContainer = document.getElementById('hourly-container');
const searchSuggestions = document.getElementById('search-suggestions');
const currentTimeElement = document.querySelector('.current-time');
const currentDateElement = document.querySelector('.current-date');
const unitToggleBtns = document.querySelectorAll('.unit-btn');
const themeBtn = document.getElementById('theme-btn');
const themeDropdown = document.querySelector('.theme-dropdown');
const themeOptions = document.querySelectorAll('.theme-option');
const speedUnitBtns = document.querySelectorAll('.speed-unit-btn');
const aqiInfoBtn = document.getElementById('aqi-info-btn');
const aqiInfoModal = document.getElementById('aqi-info-modal');
const modalCloseBtn = aqiInfoModal.querySelector('.close-btn');
const precipCanvas = document.getElementById('precipitation-canvas');
const windCanvas = document.getElementById('wind-canvas');
const timeDisplay = document.getElementById('time-display');
const prevHourBtn = document.getElementById('prev-hour');
const nextHourBtn = document.getElementById('next-hour');

// State
let currentUnit = localStorage.getItem('unit') || 'C';
let currentWeatherData = null;
let searchTimeout = null;
let currentTheme = localStorage.getItem('theme') || 'dark';
let currentSpeedUnit = localStorage.getItem('speedUnit') || 'km/h';
let currentHourIndex = 0;
let animationFrame;
let particles = [];

// Initialize theme and unit
setTheme(currentTheme);
updateUnitDisplay();
updateSpeedUnitDisplay();

// Event Listeners
searchBtn.addEventListener('click', () => {
    handleSearch().catch(handleError);
});

locationSearch.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSearch().catch(handleError);
    }
});

locationSearch.addEventListener('input', (e) => {
    handleSearchInput(e).catch(handleError);
});

currentLocationBtn.addEventListener('click', () => {
    getCurrentLocation().catch(handleError);
});

unitToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const unit = btn.dataset.unit;
        if (unit !== currentUnit) {
            currentUnit = unit;
            localStorage.setItem('unit', unit);
            updateUnitDisplay();
            if (currentWeatherData) {
                updateTemperatureDisplays(currentWeatherData);
            }
        }
    });
});

themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    themeDropdown.classList.toggle('active');
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
        searchSuggestions.classList.remove('active');
    }
    if (!e.target.closest('.theme-selector')) {
        themeDropdown.classList.remove('active');
    }
});

themeOptions.forEach(option => {
    option.addEventListener('click', () => {
        const theme = option.dataset.theme;
        setTheme(theme);
        themeDropdown.classList.remove('active');
    });
});

speedUnitBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const unit = btn.dataset.speedUnit;
        if (unit !== currentSpeedUnit) {
            currentSpeedUnit = unit;
            localStorage.setItem('speedUnit', unit);
            updateSpeedUnitDisplay();
            if (currentWeatherData) {
                updateWeatherDisplays(currentWeatherData);
            }
        }
    });
});

aqiInfoBtn.addEventListener('click', () => {
    aqiInfoModal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent scrolling behind modal
});

modalCloseBtn.addEventListener('click', () => {
    aqiInfoModal.classList.remove('active');
    document.body.style.overflow = ''; // Restore scrolling
});

// Close modal when clicking outside
aqiInfoModal.addEventListener('click', (e) => {
    if (e.target === aqiInfoModal) {
        aqiInfoModal.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aqiInfoModal.classList.contains('active')) {
        aqiInfoModal.classList.remove('active');
        document.body.style.overflow = '';
    }
});

prevHourBtn?.addEventListener('click', () => {
    currentHourIndex = Math.max(0, currentHourIndex - 1);
    updateTimeDisplay();
    updateVisualizations();
});

nextHourBtn?.addEventListener('click', () => {
    currentHourIndex = Math.min(11, currentHourIndex + 1);
    updateTimeDisplay();
    updateVisualizations();
});

// Error Handler
function handleError(error) {
    console.error('Error:', error);
    alert(error.message || 'An error occurred. Please try again.');
}

// Time update
function updateDateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });
    const dateString = now.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
    
    currentTimeElement.textContent = timeString;
    currentDateElement.textContent = dateString;
}

setInterval(updateDateTime, 1000);
updateDateTime();

function updateUnitDisplay() {
    unitToggleBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.unit === currentUnit);
    });
}

function updateSpeedUnitDisplay() {
    speedUnitBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.speedUnit === currentSpeedUnit);
    });
}

async function handleSearch() {
    const location = locationSearch.value.trim();
    if (!location) return;

    try {
        const coords = await getCoordinates(location);
        if (coords) {
            await getWeatherData(coords.latitude, coords.longitude, coords.name);
        }
    } catch (error) {
        throw new Error('Location not found. Please try again.');
    }
}

async function handleSearchInput(e) {
    const query = e.target.value.trim();
    
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    if (query.length < 2) {
        searchSuggestions.classList.remove('active');
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`,
                { mode: 'cors' }
            );
            if (!response.ok) throw new Error('Network response was not ok');
            
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                displaySearchSuggestions(data.results);
            } else {
                searchSuggestions.classList.remove('active');
            }
        } catch (error) {
            console.error('Error fetching location suggestions:', error);
            searchSuggestions.classList.remove('active');
        }
    }, 300);
}

function displaySearchSuggestions(results) {
    searchSuggestions.innerHTML = '';
    
    results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        
        const details = [];
        if (result.admin1) details.push(result.admin1);
        if (result.country) details.push(result.country);
        
        div.innerHTML = `
            <div class="location-name">${result.name}</div>
            <div class="location-detail">${details.join(', ')}</div>
        `;
        
        div.addEventListener('click', () => {
            locationSearch.value = result.name;
            searchSuggestions.classList.remove('active');
            getWeatherData(result.latitude, result.longitude, result.name).catch(handleError);
        });
        
        searchSuggestions.appendChild(div);
    });
    
    searchSuggestions.classList.add('active');
}

function updateTemperatureDisplays(data) {
    const mainTemp = convertTemperature(data.current.temperature_2m, currentUnit);
    const feelsLike = convertTemperature(data.current.apparent_temperature, currentUnit);
    
    temperatureElement.textContent = Math.round(mainTemp);
    document.querySelector('.unit').textContent = `°${currentUnit}`;
    feelsLikeElement.textContent = `Feels like: ${Math.round(feelsLike)}°`;
    
    if (hourlyContainer.children.length > 0) {
        const hourlyItems = hourlyContainer.querySelectorAll('.forecast-item');
        hourlyItems.forEach((item, index) => {
            const temp = convertTemperature(data.hourly.temperature_2m[index * 3], currentUnit);
            item.querySelector('.temp').textContent = `${Math.round(temp)}°`;
        });
    }
}

function updateWeatherDisplays(data) {
    updateTemperatureDisplays(data);
    
    const windDirection = getWindDirection(data.current.wind_direction_10m);
    const windSpeed = formatSpeed(data.current.wind_speed_10m);
    const windGusts = formatSpeed(data.current.wind_gusts_10m);
    
    windElement.innerHTML = `
        <div class="wind-speed">${windSpeed} ${windDirection}</div>
        <div class="wind-gusts">Gusts: ${windGusts}</div>
    `;
    
    humidityElement.textContent = `${Math.round(data.current.relative_humidity_2m)}%`;
    precipitationElement.textContent = `${data.current.precipitation} mm`;
    uvIndexElement.textContent = Math.round(data.current.uv_index);
    
    conditionElement.textContent = getWeatherDescription(data.current.weather_code);
    updateHourlyForecast(data.hourly);

    // Update detailed cards
    const precipChance = data.daily.precipitation_probability_max[0];
    document.getElementById('precipitation-chance').textContent = `${precipChance}%`;
    document.getElementById('precipitation-desc').textContent = 
        precipChance > 70 ? 'High chance of precipitation' :
        precipChance > 30 ? 'Moderate chance of precipitation' :
        'Low chance of precipitation';

    // Update air quality card with Open-Meteo data
    const aqi = data.air_quality?.current?.us_aqi || '--';
    const aqiElement = document.getElementById('air-quality-value');
    const aqiStatus = document.getElementById('air-quality-status');
    const aqiDesc = document.querySelector('.air-quality-card .card-description');
    const pollutantsContainer = document.getElementById('air-quality-pollutants');
    
    aqiElement.textContent = aqi;
    aqiElement.style.color = getAirQualityColor(aqi);
    aqiStatus.textContent = getAirQualityDescription(aqi);
    aqiDesc.textContent = getAirQualityImplication(aqi);

    // Update pollutants information
    if (data.air_quality?.current) {
        const current = data.air_quality.current;
        const pollutants = [
            { name: 'PM2.5', value: current.pm2_5, unit: 'μg/m³' },
            { name: 'PM10', value: current.pm10, unit: 'μg/m³' },
            { name: 'Ozone', value: current.ozone, unit: 'μg/m³' },
            { name: 'NO₂', value: current.nitrogen_dioxide, unit: 'μg/m³' },
            { name: 'SO₂', value: current.sulphur_dioxide, unit: 'μg/m³' },
            { name: 'CO', value: current.carbon_monoxide, unit: 'μg/m³' }
        ];

        pollutantsContainer.innerHTML = pollutants
            .filter(p => p.value !== undefined && p.value !== null)
            .map(p => `
                <div class="pollutant-item">
                    <span class="pollutant-name">${p.name}</span>
                    <span class="pollutant-value">${Math.round(p.value)} ${p.unit}</span>
                </div>
            `).join('');

        if (!pollutantsContainer.innerHTML) {
            pollutantsContainer.innerHTML = '<div class="pollutant-item">No detailed data available</div>';
        }
    } else {
        pollutantsContainer.innerHTML = '<div class="pollutant-item">No detailed data available</div>';
    }

    const uvIndex = Math.round(data.current.uv_index);
    document.getElementById('uv-index-value').textContent = uvIndex;
    document.getElementById('uv-index-status').textContent = getUVIndexDescription(uvIndex);

    const visibilityMeters = data.current.visibility;
    const visibilityKm = (visibilityMeters / 1000).toFixed(1);
    document.getElementById('visibility-value').textContent = `${visibilityKm} km`;
    document.getElementById('visibility-status').textContent = getVisibilityDescription(visibilityMeters);

    // Update precipitation visualization
    if (data.hourly) {
        updatePrecipitationVisualization(data.hourly);
    }

    // Update hourly charts
    if (data.hourly) {
        updateHourlyCharts(data.hourly);
    }

    // Initialize and update visualizations
    initCanvases();
    updateTimeDisplay();
    updateVisualizations();
}

function getUVIndexDescription(uvIndex) {
    if (uvIndex <= 2) return 'Low';
    if (uvIndex <= 5) return 'Moderate';
    if (uvIndex <= 7) return 'High';
    if (uvIndex <= 10) return 'Very High';
    return 'Extreme';
}

function getAirQualityDescription(aqi) {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
}

function getAirQualityImplication(aqi) {
    if (aqi <= 50) return 'Air quality is satisfactory, and air pollution poses little or no risk.';
    if (aqi <= 100) return 'Acceptable air quality, but some pollutants may affect very sensitive individuals.';
    if (aqi <= 150) return 'Members of sensitive groups may experience health effects.';
    if (aqi <= 200) return 'Everyone may begin to experience health effects.';
    if (aqi <= 300) return 'Health warnings of emergency conditions. Entire population affected.';
    return 'Health alert: everyone may experience serious health effects.';
}

function getAirQualityColor(aqi) {
    if (aqi <= 50) return '#00e400';  // Green
    if (aqi <= 100) return '#ffff00';  // Yellow
    if (aqi <= 150) return '#ff7e00';  // Orange
    if (aqi <= 200) return '#ff0000';  // Red
    if (aqi <= 300) return '#8f3f97';  // Purple
    return '#7e0023';  // Maroon
}

function getVisibilityDescription(visibility) {
    const visibilityKm = visibility / 1000;
    if (visibilityKm >= 10) return 'Excellent';
    if (visibilityKm >= 5) return 'Good';
    if (visibilityKm >= 2) return 'Moderate';
    if (visibilityKm >= 1) return 'Poor';
    return 'Very Poor';
}

function updateTimeDisplay() {
    if (!currentWeatherData) return;
    const time = new Date(currentWeatherData.hourly.time[currentHourIndex]);
    const hour = time.getHours();
    const hourStr = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    timeDisplay.textContent = `${hourStr}:00 ${ampm}`;
}

function initCanvases() {
    // Set canvas sizes
    const setCanvasSize = (canvas) => {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        const ctx = canvas.getContext('2d');
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        return { width: rect.width, height: rect.height };
    };

    const precipSize = setCanvasSize(precipCanvas);
    const windSize = setCanvasSize(windCanvas);

    // Initialize particles
    particles = [];
    const particleCount = 50; // Reduced for better performance
    
    if (precipSize && windSize) {
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * precipSize.width,
                y: Math.random() * precipSize.height,
                windX: Math.random() * windSize.width,
                windY: Math.random() * windSize.height,
                speed: 1 + Math.random() * 2,
                size: 1 + Math.random() * 2
            });
        }
    }

    // Start animations if we have weather data
    if (currentWeatherData) {
        updateVisualizations();
    }
}

function drawPrecipitation() {
    const ctx = precipCanvas.getContext('2d');
    const width = precipCanvas.width;
    const height = precipCanvas.height;
    ctx.clearRect(0, 0, width, height);

    if (!currentWeatherData?.hourly) return;

    const precipProb = currentWeatherData.hourly.precipitation_probability;
    const precipAmount = currentWeatherData.hourly.precipitation;
    const precipIntensity = currentWeatherData.hourly.precipitation_intensity;
    
    // Get next 12 hours of data starting from currentHourIndex
    const probData = precipProb.slice(currentHourIndex, currentHourIndex + 12);
    const amountData = precipAmount.slice(currentHourIndex, currentHourIndex + 12);
    const intensityData = precipIntensity.slice(currentHourIndex, currentHourIndex + 12);

    const maxProb = Math.max(...probData, 20);
    const maxAmount = Math.max(...amountData, 1);
    const barWidth = width / 12;
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, 'rgba(0, 122, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 122, 255, 0.8)');

    // Draw probability bars
    ctx.fillStyle = gradient;
    probData.forEach((prob, i) => {
        const barHeight = (prob / maxProb) * height * 0.8;
        const x = i * barWidth;
        const y = height - barHeight;
        ctx.fillRect(x + barWidth * 0.1, y, barWidth * 0.8, barHeight);
    });

    // Draw amount line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 122, 255, 1)';
    ctx.lineWidth = 2;
    amountData.forEach((amount, i) => {
        const x = i * barWidth + barWidth / 2;
        const y = height - (amount / maxAmount) * height * 0.8;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Update current precipitation info
    const currentProb = precipProb[currentHourIndex];
    const currentAmount = precipAmount[currentHourIndex];
    const currentIntensity = intensityData[currentHourIndex];
    
    document.getElementById('precipitation-chance-large').textContent = `${currentProb}%`;
    const precipDesc = document.querySelector('.precipitation-large-card .card-description');
    precipDesc.textContent = `${currentAmount.toFixed(1)}mm - ${getPrecipitationIntensity(currentIntensity)}`;
}

function getPrecipitationIntensity(intensity) {
    if (intensity < 0.5) return 'Light';
    if (intensity < 2) return 'Moderate';
    if (intensity < 10) return 'Heavy';
    return 'Very Heavy';
}

function drawWind() {
    const ctx = windCanvas.getContext('2d');
    const width = windCanvas.width;
    const height = windCanvas.height;
    ctx.clearRect(0, 0, width, height);

    if (!currentWeatherData?.hourly) return;

    const windSpeed = currentWeatherData.hourly.wind_speed_10m;
    const windGusts = currentWeatherData.hourly.wind_gusts_10m;
    const windDirection = currentWeatherData.hourly.wind_direction_10m;
    const windSpeed80m = currentWeatherData.hourly.wind_speed_80m;
    
    // Get next 12 hours of data starting from currentHourIndex
    const speedData = windSpeed.slice(currentHourIndex, currentHourIndex + 12);
    const gustData = windGusts.slice(currentHourIndex, currentHourIndex + 12);
    const directionData = windDirection.slice(currentHourIndex, currentHourIndex + 12);
    const speed80mData = windSpeed80m.slice(currentHourIndex, currentHourIndex + 12);

    const maxSpeed = Math.max(...speedData, ...gustData, ...speed80mData);
    const barWidth = width / 12;

    // Draw wind speed bars with gradient
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, 'rgba(0, 122, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 122, 255, 0.8)');

    speedData.forEach((speed, i) => {
        const barHeight = (speed / maxSpeed) * height * 0.8;
        const x = i * barWidth;
        const y = height - barHeight;
        
        // Draw base wind speed
        ctx.fillStyle = gradient;
        ctx.fillRect(x + barWidth * 0.1, y, barWidth * 0.8, barHeight);

        // Draw wind direction arrow
        const direction = directionData[i];
        const centerX = x + barWidth / 2;
        const centerY = y - 15;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((direction * Math.PI) / 180);
        
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(-4, 0);
        ctx.lineTo(4, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 122, 255, 1)';
        ctx.fill();
        
        ctx.restore();
    });

    // Draw gust line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 59, 48, 0.8)';
    ctx.lineWidth = 2;
    gustData.forEach((gust, i) => {
        const x = i * barWidth + barWidth / 2;
        const y = height - (gust / maxSpeed) * height * 0.8;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Draw 80m wind speed line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(88, 86, 214, 0.8)';
    ctx.lineWidth = 2;
    speed80mData.forEach((speed, i) => {
        const x = i * barWidth + barWidth / 2;
        const y = height - (speed / maxSpeed) * height * 0.8;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    // Update current wind info
    const currentSpeed = windSpeed[currentHourIndex];
    const currentGust = windGusts[currentHourIndex];
    const currentDirection = getWindDirection(windDirection[currentHourIndex]);
    
    document.getElementById('wind-speed-large').textContent = `${formatSpeed(currentSpeed)}`;
    const windDesc = document.querySelector('.wind-large-card .card-description');
    windDesc.textContent = `${currentDirection} - Gusts: ${formatSpeed(currentGust)}`;
}

function updateVisualizations() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }
    
    // Start both animations
    drawPrecipitation();
    drawWind();
}

// Add resize observer for better canvas resizing
const resizeObserver = new ResizeObserver(() => {
    initCanvases();
});

// Observe both canvases
if (precipCanvas) resizeObserver.observe(precipCanvas);
if (windCanvas) resizeObserver.observe(windCanvas);

// Update the legend to match the new visualization
const windLegend = document.querySelector('.wind-legend');
windLegend.innerHTML = `
    <span class="legend-item">Surface Wind</span>
    <span class="legend-item">Wind Gusts</span>
    <span class="legend-item">80m Wind</span>
`;

async function init() {
    try {
        const locationData = await getCurrentLocation();
        await updateWeather(locationData.latitude, locationData.longitude, locationData.name);
    } catch (error) {
        console.error('Error initializing weather:', error);
        document.getElementById('error').textContent = error.message;
    }
}

async function updateWeather(latitude, longitude, locationName) {
    try {
        document.getElementById('loading').style.display = 'flex';
        document.getElementById('error').textContent = '';
        
        currentWeatherData = await getWeatherData(latitude, longitude, locationName);
        updateDisplay();
        
        document.getElementById('loading').style.display = 'none';
    } catch (error) {
        console.error('Error updating weather:', error);
        document.getElementById('error').textContent = error.message;
        document.getElementById('loading').style.display = 'none';
    }
}

function updateDisplay() {
    if (!currentWeatherData) return;

    // Update location and current conditions
    document.getElementById('location').textContent = currentWeatherData.location_name;
    document.getElementById('temperature').textContent = 
        `${Math.round(convertTemperature(currentWeatherData.current.temperature_2m, 'F'))}°F`;
    document.getElementById('description').textContent = 
        getWeatherDescription(currentWeatherData.current.weather_code);
    
    // Update weather icon
    const iconClass = getWeatherIcon(currentWeatherData.current.weather_code);
    document.getElementById('weather-icon').className = `fas ${iconClass}`;

    // Update hourly visualizations
    updateHourlyVisualizations(currentWeatherData, currentHourIndex);

    // Update additional info cards
    updateInfoCards();
}

function updateInfoCards() {
    const cards = document.querySelectorAll('.info-card');
    cards.forEach(card => {
        const type = card.getAttribute('data-type');
        const value = card.querySelector('.value');
        const description = card.querySelector('.description');

        switch (type) {
            case 'feels-like':
                value.textContent = `${Math.round(convertTemperature(currentWeatherData.current.apparent_temperature, 'F'))}°F`;
                break;
            case 'humidity':
                value.textContent = `${Math.round(currentWeatherData.current.relative_humidity_2m)}%`;
                break;
            case 'uv-index':
                value.textContent = Math.round(currentWeatherData.current.uv_index);
                description.textContent = getUVIndexDescription(currentWeatherData.current.uv_index);
                break;
            case 'visibility':
                value.textContent = `${(currentWeatherData.current.visibility / 1000).toFixed(1)} km`;
                description.textContent = getVisibilityDescription(currentWeatherData.current.visibility);
                break;
            case 'air-quality':
                const aqi = currentWeatherData.air_quality.current.us_aqi;
                value.textContent = aqi;
                description.textContent = getAirQualityDescription(aqi);
                break;
        }
    });
}

// Event Listeners
document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const location = document.getElementById('search-input').value.trim();
    if (!location) return;

    try {
        document.getElementById('error').textContent = '';
        const coordinates = await getCoordinates(location);
        await updateWeather(coordinates.latitude, coordinates.longitude, coordinates.name);
    } catch (error) {
        console.error('Search error:', error);
        document.getElementById('error').textContent = error.message;
    }
});

document.getElementById('current-location').addEventListener('click', async () => {
    try {
        document.getElementById('error').textContent = '';
        const locationData = await getCurrentLocation();
        await updateWeather(locationData.latitude, locationData.longitude, locationData.name);
    } catch (error) {
        console.error('Location error:', error);
        document.getElementById('error').textContent = error.message;
    }
});

// Initialize the app
init();
