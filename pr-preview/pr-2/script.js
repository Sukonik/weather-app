try {
    const baseUrl = window.location.hostname === 'sukonik.github.io' ? '/weather-app' : '';
    const { getWeatherData, getCoordinates, getCurrentLocation } = await import('./js/modules/weatherAPI.js');
    const { 
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
    } = await import('./js/modules/utils.js');
    const { updateHourlyVisualizations, initializeAnimations, updatePrecipitationDisplay, updateWindDisplay, animate } = await import('./js/modules/visualization.js');

    // Global state
    let currentWeatherData = null;
    let currentHourIndex = 0;
    let currentUnit = localStorage.getItem('unit') || 'C';
    let currentSpeedUnit = localStorage.getItem('speedUnit') || 'km/h';
    let currentTheme = localStorage.getItem('theme') || 'dark';
    let searchTimeout = null;
    let animationFrame;
    let particles = [];
    let precipMode = 'current'; // 'current' or 'forecast'
    let windMode = 'current';
    let rainParticles = [];
    let windParticles = [];

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

    document.addEventListener('DOMContentLoaded', function() {
        // DOM Elements (fixed selectors)
        const searchForm = document.getElementById('search-form');
        const searchInput = document.getElementById('location-search');
        const searchBtn = document.getElementById('search-btn');
        const currentLocationBtn = document.getElementById('current-location-btn');
        const errorElement = document.getElementById('error');
        const loadingElement = document.getElementById('loading');
        const locationElement = document.querySelector('.location');
        const temperatureElement = document.querySelector('.temperature');
        const descriptionElement = document.querySelector('.condition');
        const weatherIconElement = document.getElementById('weather-icon');
        const precipCanvas = document.getElementById('precipCanvas');
        const windCanvas = document.getElementById('windCanvas');
        const tempCanvas = document.getElementById('tempCanvas');
        const timeDisplay = document.getElementById('time-display');
        const prevHourBtn = document.getElementById('prev-hour');
        const nextHourBtn = document.getElementById('next-hour');
        const infoCards = document.querySelectorAll('.info-card');
        const precipCurrentBtn = document.getElementById('precip-current');
        const precipForecastBtn = document.getElementById('precip-forecast');
        const windCurrentBtn = document.getElementById('wind-current');
        const windForecastBtn = document.getElementById('wind-forecast');
        const searchSuggestions = document.getElementById('search-suggestions');
        const currentTimeElement = document.querySelector('.current-time');
        const currentDateElement = document.querySelector('.current-date');
        const windElement = document.getElementById('wind');
        const humidityElement = document.getElementById('humidity');
        const precipitationElement = document.getElementById('precipitation');
        const uvIndexElement = document.getElementById('uv-index');
        const feelsLikeElement = document.querySelector('.feels-like');
        // Add more as needed for your UI

        // Define unit/theme/speed/aqi controls if present
        const unitToggleBtns = document.querySelectorAll('.unit-btn');
        const themeBtn = document.getElementById('theme-btn');
        const themeDropdown = document.querySelector('.theme-dropdown');
        const themeOptions = document.querySelectorAll('.theme-option');
        const speedUnitBtns = document.querySelectorAll('.speed-unit-btn');
        const aqiInfoBtn = document.getElementById('aqi-info-btn');
        const aqiInfoModal = document.getElementById('aqi-info-modal');
        const modalCloseBtn = aqiInfoModal ? aqiInfoModal.querySelector('.close-btn') : null;

        let searchTimeout = null;
        let animationFrame;

        // Initialize theme and unit
        setTheme(currentTheme);
        updateUnitDisplay();
        updateSpeedUnitDisplay();

        // Event Listeners
        if (searchForm) {
            searchForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const location = searchInput?.value.trim();
                if (!location) return;
                try {
                    if (errorElement) errorElement.textContent = '';
                    if (loadingElement) loadingElement.style.display = 'flex';
                    const coordinates = await getCoordinates(location);
                    await updateWeather(coordinates.latitude, coordinates.longitude, coordinates.name);
                } catch (error) {
                    console.error('Search error:', error);
                    if (errorElement) errorElement.textContent = error.message || 'Error searching location';
                    if (loadingElement) loadingElement.style.display = 'none';
                }
            });
        }
        if (searchBtn && searchInput) {
            searchBtn.addEventListener('click', async () => {
                const location = searchInput.value.trim();
                if (!location) return;
                try {
                    if (errorElement) errorElement.textContent = '';
                    const coordinates = await getCoordinates(location);
                    await updateWeather(coordinates.latitude, coordinates.longitude, coordinates.name);
                } catch (error) {
                    console.error('Search error:', error);
                    if (errorElement) errorElement.textContent = error.message;
                }
            });
        }
        if (currentLocationBtn) {
            currentLocationBtn.addEventListener('click', () => {
                getCurrentLocation().catch(handleError);
            });
        }
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
            
            descriptionElement.textContent = getWeatherDescription(data.current.weather_code);
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

        function setupHourlyAnimations() {
            // Initialize rain and wind particles
            const { raindrops, windParticles: windParts } = initializeAnimations(precipCanvas, windCanvas);
            rainParticles = raindrops;
            windParticles = windParts;
        }

        function updateHourlyPrecipitation() {
            if (!currentWeatherData) return;
            const hourIndex = currentHourIndex;
            const isNext8 = precipMode === 'forecast';
            // Use Open-Meteo data for current hour or next 8 hours
            const { probability, amount } = updatePrecipitationDisplay(precipCanvas, currentWeatherData, hourIndex, isNext8);
            // Animate rain based on probability/amount
            const ctx = precipCanvas.getContext('2d');
            ctx.strokeStyle = 'rgba(0, 122, 255, 0.6)';
            ctx.lineWidth = 1;
            let rainIntensity = isNext8
                ? Math.max(...currentWeatherData.hourly.precipitation_probability.slice(hourIndex, hourIndex + 8)) / 100
                : probability / 100;
            function animateRain() {
                ctx.clearRect(0, 0, precipCanvas.width, precipCanvas.height);
                rainParticles.forEach(drop => {
                    drop.update(rainIntensity * 3); // scale intensity
                    drop.draw(ctx);
                });
                if (precipMode === (isNext8 ? 'forecast' : 'current')) {
                    requestAnimationFrame(animateRain);
                }
            }
            animateRain();
        }

        function updateHourlyWind() {
            if (!currentWeatherData) return;
            const hourIndex = currentHourIndex;
            const isNext8 = windMode === 'forecast';
            const { speed, direction } = updateWindDisplay(windCanvas, currentWeatherData, hourIndex, isNext8);
            // Animate wind based on speed
            const ctx = windCanvas.getContext('2d');
            ctx.fillStyle = 'rgba(52, 199, 89, 0.6)';
            let windSpeed = isNext8
                ? Math.max(...currentWeatherData.hourly.wind_speed_10m.slice(hourIndex, hourIndex + 8))
                : speed;
            function animateWind() {
                ctx.clearRect(0, 0, windCanvas.width, windCanvas.height);
                windParticles.forEach(p => {
                    p.update(windSpeed);
                    p.draw(ctx);
                });
                if (windMode === (isNext8 ? 'forecast' : 'current')) {
                    requestAnimationFrame(animateWind);
                }
            }
            animateWind();
        }

        function setHourlyButtonStates() {
            precipCurrentBtn.classList.toggle('active', precipMode === 'current');
            precipForecastBtn.classList.toggle('active', precipMode === 'forecast');
            windCurrentBtn.classList.toggle('active', windMode === 'current');
            windForecastBtn.classList.toggle('active', windMode === 'forecast');
        }

        // Button event listeners
        if (precipCurrentBtn) {
            precipCurrentBtn.addEventListener('click', () => {
                precipMode = 'current';
                setHourlyButtonStates();
                updateHourlyPrecipitation();
            });
        }
        if (precipForecastBtn) {
            precipForecastBtn.addEventListener('click', () => {
                precipMode = 'forecast';
                setHourlyButtonStates();
                updateHourlyPrecipitation();
            });
        }
        if (windCurrentBtn) {
            windCurrentBtn.addEventListener('click', () => {
                windMode = 'current';
                setHourlyButtonStates();
                updateHourlyWind();
            });
        }
        if (windForecastBtn) {
            windForecastBtn.addEventListener('click', () => {
                windMode = 'forecast';
                setHourlyButtonStates();
                updateHourlyWind();
            });
        }

        // Replace old chart drawing in updateVisualizations
        function updateVisualizations() {
            setupHourlyAnimations();
            updateHourlyPrecipitation();
            updateHourlyWind();
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
                if (!navigator.geolocation) {
                    throw new Error('Geolocation is not supported by your browser. Please use the search bar to enter a location.');
                }
                
                if (loadingElement) loadingElement.style.display = 'flex';
                if (errorElement) errorElement.textContent = '';
                
                const locationData = await getCurrentLocation();
                await updateWeather(locationData.latitude, locationData.longitude, locationData.name);
            } catch (error) {
                console.error('Error initializing weather:', error);
                if (errorElement) {
                    errorElement.textContent = error.message || 'Unable to get location. Please use the search bar to enter a location manually.';
                }
                if (loadingElement) loadingElement.style.display = 'none';
            }
        }

        async function updateWeather(latitude, longitude, locationName) {
            try {
                if (loadingElement) loadingElement.style.display = 'flex';
                if (errorElement) errorElement.textContent = '';
                
                console.log('Updating weather for:', { latitude, longitude, locationName });
                const data = await getWeatherData(latitude, longitude, locationName);
                
                if (!data || !data.current) {
                    throw new Error('Invalid weather data received');
                }
                
                currentWeatherData = data;
                console.log('Weather data updated:', data);
                
                // Update all displays
                locationElement.textContent = locationName;
                const temp = Math.round(convertTemperature(data.current.temperature_2m, currentUnit));
                temperatureElement.textContent = temp;
                document.querySelector('.unit').textContent = `°${currentUnit}`;
                
                const feelsLikeTemp = Math.round(convertTemperature(data.current.apparent_temperature, currentUnit));
                feelsLikeElement.textContent = `Feels like: ${feelsLikeTemp}°`;
                
                descriptionElement.textContent = getWeatherDescription(data.current.weather_code);
                
                // Update weather details
                windElement.textContent = `${Math.round(data.current.wind_speed_10m)} ${currentSpeedUnit}`;
                humidityElement.textContent = `${Math.round(data.current.relative_humidity_2m)}%`;
                precipitationElement.textContent = `${data.current.precipitation} mm`;
                uvIndexElement.textContent = Math.round(data.current.uv_index);
                
                // Initialize visualizations
                setupHourlyAnimations();
                updateHourlyPrecipitation();
                updateHourlyWind();
                
                if (loadingElement) loadingElement.style.display = 'none';
            } catch (error) {
                console.error('Error updating weather:', error);
                if (errorElement) {
                    errorElement.textContent = error.message || 'Unable to fetch weather data. Please try again.';
                }
                if (loadingElement) loadingElement.style.display = 'none';
            }
        }

        function updateDisplay() {
            if (!currentWeatherData) return;

            // Update location and current conditions
            locationElement.textContent = currentWeatherData.location_name;
            temperatureElement.textContent = 
                `${Math.round(convertTemperature(currentWeatherData.current.temperature_2m, 'F'))}°F`;
            descriptionElement.textContent = 
                getWeatherDescription(currentWeatherData.current.weather_code);
            
            // Update weather icon
            const iconClass = getWeatherIcon(currentWeatherData.current.weather_code);
            weatherIconElement.className = `fas ${iconClass}`;

            // Update hourly visualizations
            updateHourlyVisualizations(currentWeatherData, currentHourIndex);

            // Update additional info cards
            updateInfoCards();
        }

        function updateInfoCards() {
            infoCards.forEach(card => {
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

        // Initialize the app
        try {
            init();
        } catch (error) {
            console.error('App initialization error:', error);
            if (errorElement) errorElement.textContent = error.message;
        }
    });
} catch (error) {
    console.error('Failed to load modules:', error);
    const errorElement = document.getElementById('error');
    if (errorElement) {
        errorElement.textContent = 'Failed to initialize the weather app. Please try refreshing the page';
        errorElement.style.display = 'block';
    }
}
