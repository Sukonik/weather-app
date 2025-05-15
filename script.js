// Base URL handling for GitHub Pages
const getBaseUrl = () => {
    const hostname = window.location.hostname;
    console.log('Current hostname:', hostname);
    return hostname === 'sukonik.github.io' ? '/weather-app' : '';
};

// Import modules using relative paths
import { getWeatherData, getCoordinates, getCurrentLocation } from './js/modules/weatherAPI.js';
import { 
    convertTemperature, 
    getWeatherDescription, 
    getWeatherIcon, 
    getUVIndexDescription, 
    getAirQualityDescription, 
    getAirQualityImplication, 
    getAirQualityColor, 
    getVisibilityDescription,
    getWindDirection,
    formatSpeed,
    getPrecipitationIntensity
} from './js/modules/utils.js';
import { updateHourlyVisualizations, initializeAnimations, updatePrecipitationDisplay, updateWindDisplay, animate } from './js/modules/visualization.js';

// Add debug logging
console.log('Script loaded and modules imported');

// Global state
let currentWeatherData = null;
let currentHourIndex = 0;
let currentUnit = localStorage.getItem('unit') || 'C';
let currentSpeedUnit = localStorage.getItem('speedUnit') || 'km/h';
let currentTheme = localStorage.getItem('theme') || 'dark';
let searchTimeout = null;
let animationFrame;
let particles = {
    rain: [],
    wind: []
};
let precipMode = 'current'; // 'current' or 'forecast'
let windMode = 'current';
let userLocation = null;
let searchedLocation = null;
let rainParticles = [];
let windParticles = [];

// Global animation state
let animationFrameId = null;

// Theme management
function setTheme(theme) {
    if (document.documentElement) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        currentTheme = theme;
        
        // Update theme button state
        const themeBtn = document.getElementById('theme-btn');
        const themeDropdown = document.querySelector('.theme-dropdown');
        const themeOptions = document.querySelectorAll('.theme-option');
        
        if (themeBtn && themeOptions) {
            themeOptions.forEach(option => {
                option.classList.toggle('active', option.dataset.theme === theme);
            });
        }

        // Update visualizations with new theme colors
        if (currentWeatherData) {
            updateVisualizations();
        }
    }
}

// Wait for DOM to be ready before setting theme
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTheme(currentTheme));
} else {
    setTheme(currentTheme);
}

document.addEventListener('DOMContentLoaded', async function() {
    // DOM Elements (fixed selectors)
    const elements = {
        searchForm: document.getElementById('search-form'),
        searchInput: document.getElementById('location-search'),
        searchBtn: document.getElementById('search-btn'),
        currentLocationBtn: document.getElementById('current-location-btn'),
        errorElement: document.getElementById('error'),
        loadingElement: document.getElementById('loading'),
        locationElement: document.querySelector('.location'),
        temperatureElement: document.querySelector('.temperature'),
        descriptionElement: document.querySelector('.condition'),
        weatherIconElement: document.getElementById('weather-icon'),
        precipCanvas: document.getElementById('precipCanvas'),
        windCanvas: document.getElementById('windCanvas'),
        timeDisplay: document.getElementById('time-display'),
        prevHourBtn: document.getElementById('prev-hour'),
        nextHourBtn: document.getElementById('next-hour'),
        infoCards: document.querySelectorAll('.info-card'),
        precipCurrentBtn: document.getElementById('precip-current'),
        precipForecastBtn: document.getElementById('precip-forecast'),
        windCurrentBtn: document.getElementById('wind-current'),
        windForecastBtn: document.getElementById('wind-forecast'),
        searchSuggestions: document.getElementById('search-suggestions'),
        currentTimeElement: document.querySelector('.current-time'),
        currentDateElement: document.querySelector('.current-date'),
        windElement: document.getElementById('wind'),
        humidityElement: document.getElementById('humidity'),
        precipitationElement: document.getElementById('precipitation'),
        uvIndexElement: document.getElementById('uv-index'),
        feelsLikeElement: document.querySelector('.feels-like'),
        visibilityElement: document.getElementById('visibility'),
        airQualityElement: document.getElementById('air-quality')
    };

    // Verify required elements exist
    const requiredElements = ['loadingElement', 'errorElement', 'locationElement', 'temperatureElement', 'searchInput', 'searchBtn'];
    const missingElements = requiredElements.filter(key => !elements[key]);
    if (missingElements.length > 0) {
        console.error('Missing required DOM elements:', missingElements);
        throw new Error('Required DOM elements not found. Please check the HTML structure.');
    }

    // Add search event listeners
    elements.searchBtn.addEventListener('click', async () => {
        const location = elements.searchInput.value.trim();
        if (!location) return;
        
        try {
            elements.loadingElement.style.display = 'flex';
            elements.errorElement.textContent = '';
            const coordinates = await getCoordinates(location);
            await updateWeather(coordinates.latitude, coordinates.longitude, coordinates.name, false);
        } catch (error) {
            console.error('Search error:', error);
            elements.errorElement.textContent = error.message || 'Error searching location';
            elements.loadingElement.style.display = 'none';
        }
    });

    elements.searchInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            elements.searchBtn.click();
        }
    });

    elements.currentLocationBtn.addEventListener('click', async () => {
        try {
            elements.loadingElement.style.display = 'flex';
            elements.errorElement.textContent = '';
            const locationData = await getCurrentLocation();
            await updateWeather(locationData.latitude, locationData.longitude, locationData.name, true);
        } catch (error) {
            console.error('Current location error:', error);
            elements.errorElement.textContent = error.message;
            elements.loadingElement.style.display = 'none';
        }
    });

    function setupVisualizations() {
        if (elements.precipCanvas && elements.windCanvas) {
            const { raindrops, windParticles } = initializeAnimations(elements.precipCanvas, elements.windCanvas);
            particles.rain = raindrops;
            particles.wind = windParticles;
        }
    }

    function updateHourlyForecast() {
        if (!currentWeatherData || !currentWeatherData.hourly) return;

        const forecastRows = document.getElementById('forecast-rows');
        if (!forecastRows) return;

        // Clear existing rows
        forecastRows.innerHTML = '';

        // Get the current hour's index
        const now = new Date();
        const currentHour = now.getHours();
        
        // Create rows for the next 8 hours
        for (let i = currentHourIndex; i < currentHourIndex + 8; i++) {
            if (i >= currentWeatherData.hourly.time.length) break;

            const time = new Date(currentWeatherData.hourly.time[i]);
            const windSpeed = currentWeatherData.hourly.wind_speed_10m[i];
            const precip = currentWeatherData.hourly.precipitation_probability[i];
            const weatherCode = currentWeatherData.hourly.weather_code[i];

            const row = document.createElement('div');
            row.className = 'forecast-row';
            
            row.innerHTML = `
                <div class="col time">
                    ${i === currentHourIndex ? 'Now' : time.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        hour12: true
                    })}
                </div>
                <div class="col wind">
                    ${Math.round(convertSpeed(windSpeed, 'km/h', currentSpeedUnit))} ${currentSpeedUnit}
                    <i class="fas fa-arrow-up" style="transform: rotate(${currentWeatherData.hourly.wind_direction_10m[i]}deg)"></i>
                </div>
                <div class="col precip">
                    ${precip}%
                    ${precip > 0 ? '<i class="fas fa-cloud-rain"></i>' : ''}
                </div>
                <div class="col condition">
                    <i class="fas ${getWeatherIcon(weatherCode)}"></i>
                    ${getWeatherDescription(weatherCode)}
                </div>
            `;

            forecastRows.appendChild(row);
        }
    }

    function updateVisualizations() {
        if (!currentWeatherData) return;

        // Cancel any existing animation frame
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        // Update precipitation visualization
        if (elements.precipCanvas) {
            const precipCtx = elements.precipCanvas.getContext('2d');
            const precipParams = updatePrecipitationDisplay(
                elements.precipCanvas,
                currentWeatherData,
                currentHourIndex,
                precipMode === 'forecast'
            );
            
            // Start precipitation animation if there's precipitation
            if (precipParams.amount > 0) {
                function animatePrecip() {
                    animate(precipCtx, particles.rain, { intensity: precipParams.amount });
                    animationFrameId = requestAnimationFrame(animatePrecip);
                }
                animatePrecip();
            }
        }

        // Update wind visualization
        if (elements.windCanvas) {
            const windCtx = elements.windCanvas.getContext('2d');
            const windParams = updateWindDisplay(
                elements.windCanvas,
                currentWeatherData,
                currentHourIndex,
                windMode === 'forecast'
            );
            
            // Start wind animation
            function animateWind() {
                animate(windCtx, particles.wind, { speed: windParams.speed });
                animationFrameId = requestAnimationFrame(animateWind);
            }
            animateWind();
        }

        // Update hourly forecast display
        updateHourlyForecast();
    }

    // Update time displays
    function updateTimeDisplay() {
        if (!currentWeatherData) return;

        const now = new Date();
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const searchedTimezone = currentWeatherData.timezone || userTimezone;
        
        // Update current location time
        if (elements.currentTimeElement && userLocation) {
            const userTime = now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: userTimezone
            });
            elements.currentTimeElement.textContent = `${userLocation.name} · ${userTime}`;
        }

        // Update searched location time
        if (elements.locationElement && searchedLocation) {
            const searchedTime = now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: searchedTimezone
            });
            elements.locationElement.textContent = `${searchedLocation.name} · ${searchedTime}`;
        }

        // Update current date
        if (elements.currentDateElement) {
            const date = now.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                timeZone: searchedTimezone
            });
            elements.currentDateElement.textContent = date;
        }
    }

    function updateWeatherDetails() {
        if (!currentWeatherData || !currentWeatherData.current) return;

        // Update UV Index with description
        if (elements.uvIndexElement) {
            const uvi = currentWeatherData.current.uv_index;
            const uviInfo = getUVIndexDescription(uvi);
            elements.uvIndexElement.innerHTML = `
                <span class="value">${Math.round(uvi)}</span>
                <span class="description">${uviInfo.level}</span>
                <span class="tooltip">${uviInfo.description}</span>
            `;
        }

        // Update visibility with description
        if (elements.visibilityElement) {
            const visibility = currentWeatherData.current.visibility;
            const visInfo = getVisibilityDescription(visibility);
            elements.visibilityElement.innerHTML = `
                <span class="value">${Math.round(visibility)} km</span>
                <span class="description">${visInfo.level}</span>
                <span class="tooltip">${visInfo.description}</span>
            `;
        }

        // Update air quality with description
        if (elements.airQualityElement && currentWeatherData.air_quality) {
            const aqi = currentWeatherData.air_quality.us_epa_index;
            const aqiInfo = getAirQualityDescription(aqi);
            elements.airQualityElement.innerHTML = `
                <span class="value">${aqiInfo.level}</span>
                <span class="description">${aqiInfo.description}</span>
                <div class="aqi-details">
                    <div class="aqi-item">
                        <span class="label">PM2.5</span>
                        <span class="value">${Math.round(currentWeatherData.air_quality.pm2_5)} µg/m³</span>
                    </div>
                    <div class="aqi-item">
                        <span class="label">PM10</span>
                        <span class="value">${Math.round(currentWeatherData.air_quality.pm10)} µg/m³</span>
                    </div>
                    <div class="aqi-item">
                        <span class="label">O₃</span>
                        <span class="value">${Math.round(currentWeatherData.air_quality.o3)} µg/m³</span>
                    </div>
                </div>
            `;
        }
    }

    async function updateWeather(latitude, longitude, locationName, isUserLocation = false) {
        try {
            elements.loadingElement.style.display = 'flex';
            elements.errorElement.textContent = '';
            
            console.log('Updating weather for:', { latitude, longitude, locationName });
            const data = await getWeatherData(latitude, longitude, locationName);
            
            if (!data || !data.current) {
                console.error('Invalid weather data structure:', data);
                throw new Error('Invalid weather data received from API');
            }
            
            // Update location state
            if (isUserLocation) {
                userLocation = { latitude, longitude, name: locationName };
            } else {
                searchedLocation = { latitude, longitude, name: locationName };
            }
            
            currentWeatherData = data;
            console.log('Weather data updated:', data);
            
            // Update displays
            updateTimeDisplay();
            updateDisplayUnits();
            updateWeatherDetails();
            
            // Initialize and update visualizations
            setupVisualizations();
            updateVisualizations();
            
            elements.loadingElement.style.display = 'none';
        } catch (error) {
            console.error('Error updating weather:', error);
            elements.errorElement.textContent = error.message || 'Unable to fetch weather data. Please try again.';
            elements.loadingElement.style.display = 'none';
            throw error;
        }
    }

    // Visualization control event handlers
    if (elements.precipCurrentBtn) {
        elements.precipCurrentBtn.addEventListener('click', () => {
            precipMode = 'current';
            elements.precipCurrentBtn.classList.add('active');
            elements.precipForecastBtn.classList.remove('active');
            updateVisualizations();
        });
    }

    if (elements.precipForecastBtn) {
        elements.precipForecastBtn.addEventListener('click', () => {
            precipMode = 'forecast';
            elements.precipForecastBtn.classList.add('active');
            elements.precipCurrentBtn.classList.remove('active');
            updateVisualizations();
        });
    }

    if (elements.windCurrentBtn) {
        elements.windCurrentBtn.addEventListener('click', () => {
            windMode = 'current';
            elements.windCurrentBtn.classList.add('active');
            elements.windForecastBtn.classList.remove('active');
            updateVisualizations();
        });
    }

    if (elements.windForecastBtn) {
        elements.windForecastBtn.addEventListener('click', () => {
            windMode = 'forecast';
            elements.windForecastBtn.classList.add('active');
            elements.windCurrentBtn.classList.remove('active');
            updateVisualizations();
        });
    }

    if (elements.prevHourBtn) {
        elements.prevHourBtn.addEventListener('click', () => {
            if (currentHourIndex > 0) {
                currentHourIndex--;
                updateVisualizations();
                updateTimeDisplay();
            }
        });
    }

    if (elements.nextHourBtn) {
        elements.nextHourBtn.addEventListener('click', () => {
            if (currentWeatherData && currentHourIndex < currentWeatherData.hourly.time.length - 8) {
                currentHourIndex++;
                updateVisualizations();
                updateTimeDisplay();
            }
        });
    }

    // Start time updates
    updateTimeDisplay();
    setInterval(updateTimeDisplay, 60000); // Update every minute

    // Theme management
    const themeBtn = document.getElementById('theme-btn');
    const themeDropdown = document.querySelector('.theme-dropdown');
    const themeOptions = document.querySelectorAll('.theme-option');
    
    if (themeBtn && themeDropdown) {
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            themeDropdown.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.theme-selector')) {
                themeDropdown.classList.remove('show');
            }
        });

        themeOptions.forEach(option => {
            option.addEventListener('click', () => {
                const theme = option.dataset.theme;
                setTheme(theme);
                themeDropdown.classList.remove('show');
            });
        });
    }

    // Unit conversion functions
    function convertTemp(value, fromUnit, toUnit) {
        if (fromUnit === toUnit) return value;
        if (fromUnit === 'C' && toUnit === 'F') {
            return (value * 9/5) + 32;
        }
        return (value - 32) * 5/9; // F to C
    }

    function convertSpeed(value, fromUnit, toUnit) {
        if (fromUnit === toUnit) return value;
        if (fromUnit === 'km/h' && toUnit === 'mph') {
            return value / 1.609;
        }
        return value * 1.609; // mph to km/h
    }

    // Update displays with unit conversion
    function updateDisplayUnits() {
        if (!currentWeatherData) return;

        // Update temperature displays
        const temp = convertTemp(
            currentWeatherData.current.temperature_2m,
            'C',
            currentUnit
        );
        elements.temperatureElement.textContent = Math.round(temp);
        document.querySelector('.unit').textContent = `°${currentUnit}`;

        if (elements.feelsLikeElement) {
            const feelsLike = convertTemp(
                currentWeatherData.current.apparent_temperature,
                'C',
                currentUnit
            );
            elements.feelsLikeElement.textContent = `Feels like: ${Math.round(feelsLike)}°`;
        }

        // Update wind speed displays
        if (elements.windElement) {
            const windSpeed = convertSpeed(
                currentWeatherData.current.wind_speed_10m,
                'km/h',
                currentSpeedUnit
            );
            elements.windElement.textContent = `${Math.round(windSpeed)} ${currentSpeedUnit}`;
        }

        // Update unit button states
        document.querySelectorAll('.unit-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.unit === currentUnit);
        });

        document.querySelectorAll('.speed-unit-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.speedUnit === currentSpeedUnit);
        });

        // Update visualizations with new units
        updateVisualizations();
    }

    // Unit toggle event handlers
    document.querySelectorAll('.unit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const newUnit = btn.dataset.unit;
            if (newUnit !== currentUnit) {
                currentUnit = newUnit;
                localStorage.setItem('unit', newUnit);
                updateDisplayUnits();
            }
        });
    });

    document.querySelectorAll('.speed-unit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const newUnit = btn.dataset.speedUnit;
            if (newUnit !== currentSpeedUnit) {
                currentSpeedUnit = newUnit;
                localStorage.setItem('speedUnit', newUnit);
                updateDisplayUnits();
            }
        });
    });

    // Initialize the app (only once)
    try {
        await init();
    } catch (error) {
        console.error('App initialization failed:', error);
        // Error already displayed by init() or updateWeather()
    }
});

async function init() {
    try {
        elements.loadingElement.style.display = 'flex';
        elements.errorElement.textContent = '';

        // Try to get user's current location first
        const locationData = await getCurrentLocation();
        await updateWeather(locationData.latitude, locationData.longitude, locationData.name, true);

        // Initialize visualizations
        setupVisualizations();
        
        // Start time updates
        updateTimeDisplay();
        setInterval(updateTimeDisplay, 60000); // Update every minute

        elements.loadingElement.style.display = 'none';
    } catch (error) {
        console.error('Initialization error:', error);
        elements.errorElement.textContent = 'Unable to get your location. Please search for a location.';
        elements.loadingElement.style.display = 'none';
    }
}
