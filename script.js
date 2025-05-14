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

// State
let currentUnit = localStorage.getItem('unit') || 'C';
let currentWeatherData = null;
let searchTimeout = null;
let currentTheme = localStorage.getItem('theme') || 'dark';
let currentSpeedUnit = localStorage.getItem('speedUnit') || 'km/h';

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

// Error Handler
function handleError(error) {
    console.error('Error:', error);
    alert('An error occurred. Please try again.');
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

        if (!weatherResponse.ok || !airQualityResponse.ok) 
            throw new Error('Network response was not ok');
        
        const [weatherData, airQualityData] = await Promise.all([
            weatherResponse.json(),
            airQualityResponse.json()
        ]);

        currentWeatherData = {
            ...weatherData,
            air_quality: airQualityData
        };
        
        locationElement.textContent = locationName;
        updateWeatherDisplays(currentWeatherData);
    } catch (error) {
        console.error('Error:', error);
        throw new Error('Error fetching weather data. Please try again.');
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
        throw new Error('Geolocation is not supported by your browser');
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        });

        const { latitude, longitude } = position.coords;
        await getWeatherData(latitude, longitude, 'Current Location');
    } catch (error) {
        if (error.code === 1) {
            throw new Error('Location access denied. Please enable location access or search manually.');
        } else {
            throw new Error('Unable to retrieve your location. Please try searching manually.');
        }
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
    getCurrentLocation().catch(() => {
        // If geolocation fails, load New York as default
        getWeatherData(40.7128, -74.0060, 'New York').catch(handleError);
    });
});

// New function to update all weather displays
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
