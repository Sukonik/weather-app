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
        feelsLikeElement: document.querySelector('.feels-like')
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
            await updateWeather(coordinates.latitude, coordinates.longitude, coordinates.name);
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
            await updateWeather(locationData.latitude, locationData.longitude, locationData.name);
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
    }

    // Initialize the app
    async function init() {
        try {
            if (!navigator.geolocation) {
                throw new Error('Geolocation is not supported by your browser. Please use the search bar to enter a location.');
            }
            
            elements.loadingElement.style.display = 'flex';
            elements.errorElement.textContent = '';
            
            const locationData = await getCurrentLocation();
            await updateWeather(locationData.latitude, locationData.longitude, locationData.name);
        } catch (error) {
            console.error('Error initializing weather:', error);
            elements.errorElement.textContent = error.message || 'Unable to get location. Please use the search bar to enter a location manually.';
            elements.loadingElement.style.display = 'none';
            throw error; // Re-throw to be caught by the outer try-catch
        }
    }

    async function updateWeather(latitude, longitude, locationName) {
        try {
            elements.loadingElement.style.display = 'flex';
            elements.errorElement.textContent = '';
            
            console.log('Updating weather for:', { latitude, longitude, locationName });
            const data = await getWeatherData(latitude, longitude, locationName);
            
            if (!data || !data.current) {
                console.error('Invalid weather data structure:', data);
                throw new Error('Invalid weather data received from API');
            }
            
            currentWeatherData = data;
            console.log('Weather data updated:', data);
            
            // Update all displays
            elements.locationElement.textContent = locationName;
            const temp = Math.round(convertTemperature(data.current.temperature_2m, currentUnit));
            elements.temperatureElement.textContent = temp;
            document.querySelector('.unit').textContent = `°${currentUnit}`;
            
            if (elements.feelsLikeElement) {
                const feelsLikeTemp = Math.round(convertTemperature(data.current.apparent_temperature, currentUnit));
                elements.feelsLikeElement.textContent = `Feels like: ${feelsLikeTemp}°`;
            }
            
            elements.descriptionElement.textContent = getWeatherDescription(data.current.weather_code);
            
            // Update weather details if elements exist
            if (elements.windElement) elements.windElement.textContent = `${Math.round(data.current.wind_speed_10m)} ${currentSpeedUnit}`;
            if (elements.humidityElement) elements.humidityElement.textContent = `${Math.round(data.current.relative_humidity_2m)}%`;
            if (elements.precipitationElement) elements.precipitationElement.textContent = `${data.current.precipitation} mm`;
            if (elements.uvIndexElement) elements.uvIndexElement.textContent = Math.round(data.current.uv_index);
            
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
            }
        });
    }

    if (elements.nextHourBtn) {
        elements.nextHourBtn.addEventListener('click', () => {
            if (currentWeatherData && currentHourIndex < currentWeatherData.hourly.time.length - 1) {
                currentHourIndex++;
                updateVisualizations();
            }
        });
    }

    // Update time display
    function updateTimeDisplay() {
        if (!currentWeatherData) return;
        
        const currentTime = new Date(currentWeatherData.hourly.time[currentHourIndex]);
        if (elements.timeDisplay) {
            elements.timeDisplay.textContent = currentTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }
    }

    // Update current date/time
    function updateDateTime() {
        const now = new Date();
        if (elements.currentTimeElement) {
            elements.currentTimeElement.textContent = now.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }
        if (elements.currentDateElement) {
            elements.currentDateElement.textContent = now.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
        }
    }

    // Start date/time updates
    updateDateTime();
    setInterval(updateDateTime, 60000); // Update every minute

    // Initialize the app (only once)
    try {
        await init();
    } catch (error) {
        console.error('App initialization failed:', error);
        // Error already displayed by init() or updateWeather()
    }
});
