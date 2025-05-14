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

async function getCoordinates(location) {
    const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
        { mode: 'cors' }
    );
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    if (!data.results || !data.results.length) {
        throw new Error('Location not found');
    }
    
    return {
        latitude: data.results[0].latitude,
        longitude: data.results[0].longitude,
        name: data.results[0].name
    };
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

function convertTemperature(temp, targetUnit) {
    if (targetUnit === 'F') {
        return (temp * 9/5) + 32;
    }
    return temp;
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

function convertSpeed(speed, targetUnit) {
    if (targetUnit === 'mph') {
        return speed * 0.621371;
    }
    return speed;
}

function formatSpeed(speed) {
    return `${Math.round(convertSpeed(speed, currentSpeedUnit))} ${currentSpeedUnit}`;
}

async function getWeatherData(latitude, longitude, locationName) {
    try {
        const [weatherResponse, airQualityResponse] = await Promise.all([
            fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility&daily=precipitation_probability_max&timezone=auto`,
                { mode: 'cors' }
            ),
            fetch(
                `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi,european_aqi_pm2_5,european_aqi_pm10,european_aqi_no2,european_aqi_o3,european_aqi_so2`,
                { mode: 'cors' }
            )
        ]);

        if (!weatherResponse.ok) {
            throw new Error('Weather data not available');
        }

        const [weatherData, airQualityData] = await Promise.all([
            weatherResponse.json(),
            airQualityResponse.ok ? airQualityResponse.json() : { current: {} }
        ]);

        // Validate essential weather data
        if (!weatherData.current || !weatherData.hourly) {
            throw new Error('Invalid weather data format');
        }

        currentWeatherData = {
            ...weatherData,
            air_quality: airQualityData
        };
        
        locationElement.textContent = locationName;
        updateWeatherDisplays(currentWeatherData);
        return true;
    } catch (error) {
        console.error('Weather data error:', error);
        throw new Error('Unable to fetch weather data. Please try again.');
    }
}

function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

function updateHourlyForecast(hourlyData) {
    hourlyContainer.innerHTML = '';
    
    for (let i = 0; i < 24; i += 3) {
        const time = new Date(hourlyData.time[i]);
        const hour = time.getHours();
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        
        const windDirection = getWindDirection(hourlyData.wind_direction_10m[i]);
        const windSpeed = formatSpeed(hourlyData.wind_speed_10m[i]);
        const windGusts = formatSpeed(hourlyData.wind_gusts_10m[i]);
        
        const forecastItem = document.createElement('div');
        forecastItem.className = 'forecast-item';
        forecastItem.innerHTML = `
            <span class="time">${hour12}${ampm}</span>
            <i class="fas ${getWeatherIcon(hourlyData.weather_code[i])}"></i>
            <span class="temp">${Math.round(hourlyData.temperature_2m[i])}°</span>
            <span class="wind-info">${windSpeed} ${windDirection}</span>
            <span class="wind-gusts">Gusts: ${windGusts}</span>
            <span class="precipitation">${hourlyData.precipitation_probability[i]}%</span>
        `;
        
        hourlyContainer.appendChild(forecastItem);
    }
}

function getWeatherDescription(code) {
    const descriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        71: 'Slight snow',
        73: 'Moderate snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail'
    };
    return descriptions[code] || 'Unknown';
}

function getWeatherIcon(code) {
    if (code === 0) return 'fa-sun';
    if (code === 1) return 'fa-sun';
    if (code === 2) return 'fa-cloud-sun';
    if (code === 3) return 'fa-cloud';
    if (code >= 45 && code <= 48) return 'fa-smog';
    if (code >= 51 && code <= 55) return 'fa-cloud-rain';
    if (code >= 61 && code <= 65) return 'fa-cloud-showers-heavy';
    if (code >= 71 && code <= 77) return 'fa-snowflake';
    if (code >= 80 && code <= 82) return 'fa-cloud-showers-heavy';
    if (code >= 85 && code <= 86) return 'fa-snowflake';
    if (code >= 95) return 'fa-bolt';
    return 'fa-cloud';
}

async function getCurrentLocation() {
    if (!navigator.geolocation) {
        console.warn('Geolocation not supported');
        await getWeatherData(40.7128, -74.0060, 'New York');
        return;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        });

        const { latitude, longitude } = position.coords;
        
        try {
            const response = await fetch(
                `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}`,
                { mode: 'cors' }
            );
            
            if (!response.ok) throw new Error('Reverse geocoding failed');
            
            const data = await response.json();
            const locationName = data?.results?.[0]?.name || 'Current Location';
            await getWeatherData(latitude, longitude, locationName);
        } catch (error) {
            console.warn('Reverse geocoding failed:', error);
            await getWeatherData(latitude, longitude, 'Current Location');
        }
    } catch (error) {
        console.error('Geolocation error:', error);
        const errorMessage = error.code === 1 ? 'Location access denied' :
                           error.code === 2 ? 'Location unavailable' :
                           error.code === 3 ? 'Location request timed out' :
                           'Unable to get location';
        console.warn(errorMessage + '. Using default location.');
        await getWeatherData(40.7128, -74.0060, 'New York');
    }
}

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    themeOptions.forEach(option => {
        option.classList.toggle('active', option.dataset.theme === theme);
    });
}

// Initialize with user's location if possible
document.addEventListener('DOMContentLoaded', () => {
    getCurrentLocation().catch(error => {
        console.error('Startup error:', error);
        // Load New York as default if everything fails
        getWeatherData(40.7128, -74.0060, 'New York').catch(handleError);
    });
});

function updatePrecipitationVisualization(hourlyData) {
    const precipViz = document.getElementById('precipitation-viz');
    precipViz.innerHTML = '';

    // Get the next 24 hours of precipitation data
    const next24Hours = hourlyData.precipitation_probability.slice(0, 24);
    const maxPrecip = Math.max(...next24Hours, 20); // minimum 20% for visibility

    next24Hours.forEach((prob, index) => {
        const bar = document.createElement('div');
        bar.className = 'precipitation-bar';
        
        // Calculate height percentage (minimum 5% for visibility)
        const heightPercent = Math.max((prob / maxPrecip) * 100, 5);
        bar.style.height = `${heightPercent}%`;

        // Calculate blue intensity based on precipitation probability
        const blueBase = 155; // Base blue value
        const blueRange = 100; // Range of blue values
        const blueIntensity = Math.floor(blueBase + (prob / 100) * blueRange);
        const opacity = 0.3 + (prob / 100) * 0.7; // Opacity ranges from 0.3 to 1.0
        
        bar.style.backgroundColor = `rgba(0, 127, ${blueIntensity}, ${opacity})`;

        // Add animation for bars with precipitation
        if (prob > 10) { // Animate if probability is greater than 10%
            bar.classList.add('active');
        }

        // Add tooltip with time and probability
        const hour = new Date(hourlyData.time[index]);
        const timeStr = hour.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            hour12: true 
        });
        bar.title = `${timeStr}: ${prob}% chance of rain`;

        precipViz.appendChild(bar);
    });
}

function updateHourlyCharts(hourlyData) {
    // Update precipitation chart
    const precipChart = document.getElementById('precipitation-chart');
    const precipTimeLabels = document.getElementById('precipitation-time-labels');
    const precipChanceLarge = document.getElementById('precipitation-chance-large');
    
    precipChart.innerHTML = '';
    precipTimeLabels.innerHTML = '';

    // Get next 12 hours of data
    const next12Hours = hourlyData.precipitation_probability.slice(0, 12);
    const maxPrecip = Math.max(...next12Hours, 20);

    // Update current precipitation chance
    precipChanceLarge.textContent = `${next12Hours[0]}%`;

    // Create bars and labels
    next12Hours.forEach((prob, index) => {
        // Create bar
        const bar = document.createElement('div');
        bar.className = 'chart-bar rain';
        const height = Math.max((prob / maxPrecip) * 100, 5);
        bar.style.height = `${height}%`;
        
        // Add tooltip
        const time = new Date(hourlyData.time[index]);
        const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
        bar.setAttribute('data-tooltip', `${timeStr}: ${prob}% chance of rain`);
        
        precipChart.appendChild(bar);

        // Add time label if it's at 3-hour intervals
        if (index % 3 === 0) {
            const label = document.createElement('span');
            label.textContent = timeStr;
            precipTimeLabels.appendChild(label);
        }
    });

    // Update wind chart
    const windChart = document.getElementById('wind-chart');
    const windTimeLabels = document.getElementById('wind-time-labels');
    const windSpeedLarge = document.getElementById('wind-speed-large');
    
    windChart.innerHTML = '';
    windTimeLabels.innerHTML = '';

    // Get next 12 hours of wind data
    const windSpeeds = hourlyData.wind_speed_10m.slice(0, 12);
    const maxWind = Math.max(...windSpeeds);

    // Update current wind speed
    windSpeedLarge.textContent = formatSpeed(windSpeeds[0]);

    // Create bars and labels
    windSpeeds.forEach((speed, index) => {
        // Create bar
        const bar = document.createElement('div');
        bar.className = 'chart-bar wind';
        const height = Math.max((speed / maxWind) * 100, 5);
        bar.style.height = `${height}%`;
        
        // Add tooltip
        const time = new Date(hourlyData.time[index]);
        const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
        const direction = getWindDirection(hourlyData.wind_direction_10m[index]);
        bar.setAttribute('data-tooltip', `${timeStr}: ${formatSpeed(speed)} ${direction}`);
        
        windChart.appendChild(bar);

        // Add time label if it's at 3-hour intervals
        if (index % 3 === 0) {
            const label = document.createElement('span');
            label.textContent = timeStr;
            windTimeLabels.appendChild(label);
        }
    });
}

// Update the updateWeatherDisplays function to include the new charts
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
    if (!precipCanvas || !currentWeatherData) return;
    const ctx = precipCanvas.getContext('2d');
    const rect = precipCanvas.getBoundingClientRect();
    const { width, height } = rect;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);
    
    const hours = 12;
    const padding = 40;
    const graphWidth = width - (padding * 2);
    const graphHeight = height - (padding * 2);
    const hourWidth = graphWidth / hours;
    
    // Draw time axis
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.strokeStyle = '#999';
    ctx.stroke();
    
    // Draw precipitation data
    const startHour = currentHourIndex;
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, 'rgba(0, 127, 255, 0.8)');  // Heavy
    gradient.addColorStop(0.33, 'rgba(0, 127, 255, 0.5)'); // Medium
    gradient.addColorStop(0.66, 'rgba(0, 127, 255, 0.2)'); // Light
    
    // Draw intensity levels
    ctx.font = '12px Inter';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'right';
    ctx.fillText('Heavy', padding - 5, padding + 20);
    ctx.fillText('Med', padding - 5, padding + graphHeight * 0.5);
    ctx.fillText('Light', padding - 5, height - padding - 5);
    
    // Draw precipitation area
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    
    for (let i = 0; i < hours; i++) {
        const hourOffset = (startHour + i) % 24;
        const prob = currentWeatherData.hourly.precipitation_probability[hourOffset];
        const x = padding + (i * hourWidth);
        const intensity = prob / 100;
        const y = height - padding - (graphHeight * intensity);
        
        if (i === 0) {
            ctx.moveTo(x, height - padding);
        }
        ctx.lineTo(x, y);
    }
    
    // Complete the area
    ctx.lineTo(width - padding, height - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw time labels
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    for (let i = 0; i < hours; i += 2) {
        const hourOffset = (startHour + i) % 24;
        const time = new Date(currentWeatherData.hourly.time[hourOffset]);
        const hour = time.getHours();
        const hourStr = hour % 12 || 12;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const x = padding + (i * hourWidth);
        
        ctx.fillText(`${hourStr}${ampm}`, x, height - padding + 5);
    }
    
    // Draw current conditions
    const currentProb = currentWeatherData.hourly.precipitation_probability[currentHourIndex];
    ctx.font = 'bold 16px Inter';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#333';
    ctx.fillText(`${currentProb}% chance of rain`, padding, padding - 10);
    
    if (currentProb > 0) {
        let intensity = 'Light';
        if (currentProb > 70) intensity = 'Heavy';
        else if (currentProb > 30) intensity = 'Medium';
        ctx.fillText(`${intensity} Rain`, padding + 150, padding - 10);
    }
}

function drawWind() {
    if (!windCanvas || !currentWeatherData) return;
    const ctx = windCanvas.getContext('2d');
    const rect = windCanvas.getBoundingClientRect();
    const { width, height } = rect;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);
    
    const hours = 12;
    const padding = 40;
    const graphWidth = width - (padding * 2);
    const graphHeight = height - (padding * 2);
    const hourWidth = graphWidth / hours;
    
    // Draw time axis
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.strokeStyle = '#999';
    ctx.stroke();
    
    // Draw wind speed bars and direction arrows
    const startHour = currentHourIndex;
    const maxSpeed = Math.max(...currentWeatherData.hourly.wind_speed_10m.slice(startHour, startHour + hours));
    
    for (let i = 0; i < hours; i++) {
        const hourOffset = (startHour + i) % 24;
        const speed = currentWeatherData.hourly.wind_speed_10m[hourOffset];
        const direction = currentWeatherData.hourly.wind_direction_10m[hourOffset];
        
        const x = padding + (i * hourWidth);
        const barHeight = (speed / maxSpeed) * graphHeight;
        const y = height - padding - barHeight;
        
        // Draw wind speed bar
        ctx.fillStyle = `rgba(46, 204, 113, ${Math.min(speed / 20, 0.8)})`;
        ctx.fillRect(x, y, hourWidth * 0.8, barHeight);
        
        // Draw wind direction arrow
        const arrowSize = 15;
        const arrowAngle = (direction - 90) * Math.PI / 180;
        const arrowX = x + (hourWidth * 0.4);
        const arrowY = y + (barHeight / 2);
        
        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(arrowAngle);
        
        ctx.beginPath();
        ctx.moveTo(-arrowSize/2, 0);
        ctx.lineTo(arrowSize/2, 0);
        ctx.lineTo(arrowSize/4, -arrowSize/4);
        ctx.moveTo(arrowSize/2, 0);
        ctx.lineTo(arrowSize/4, arrowSize/4);
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }
    
    // Draw time labels
    ctx.fillStyle = '#333';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    for (let i = 0; i < hours; i += 2) {
        const hourOffset = (startHour + i) % 24;
        const time = new Date(currentWeatherData.hourly.time[hourOffset]);
        const hour = time.getHours();
        const hourStr = hour % 12 || 12;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const x = padding + (i * hourWidth);
        
        ctx.fillText(`${hourStr}${ampm}`, x, height - padding + 5);
    }
    
    // Draw speed labels on y-axis
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
        const speed = (maxSpeed * i / 4);
        const y = height - padding - (graphHeight * i / 4);
        ctx.fillText(`${Math.round(speed)} ${currentSpeedUnit}`, padding - 5, y);
    }
    
    // Draw current conditions
    const currentSpeed = currentWeatherData.hourly.wind_speed_10m[currentHourIndex];
    const currentDir = getWindDirection(currentWeatherData.hourly.wind_direction_10m[currentHourIndex]);
    
    ctx.font = 'bold 16px Inter';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#333';
    ctx.fillText(`${Math.round(currentSpeed)} ${currentSpeedUnit} ${currentDir}`, padding, padding - 10);
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
