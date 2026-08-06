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
    const { initializeAnimations, updatePrecipitationDisplay, updateWindDisplay, animate } = await import('./js/modules/visualization.js');

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

    // The module imports above are awaited before this point, which can take
    // long enough (network/module resolution) that 'DOMContentLoaded' has
    // already fired by the time we'd register a listener for it — that
    // listener would then never run, silently breaking the whole app. Guard
    // with a readyState check instead of registering unconditionally.
    function initApp() {
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
        if (searchInput) {
            searchInput.addEventListener('input', handleSearchInput);
        }
        if (currentLocationBtn) {
            currentLocationBtn.addEventListener('click', async () => {
                try {
                    if (errorElement) errorElement.textContent = '';
                    if (loadingElement) loadingElement.style.display = 'flex';
                    const locationData = await getCurrentLocation();
                    await updateWeather(locationData.latitude, locationData.longitude, locationData.name);
                } catch (error) {
                    handleError(error);
                    if (loadingElement) loadingElement.style.display = 'none';
                }
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
                    searchInput.value = result.name;
                    searchSuggestions.classList.remove('active');
                    updateWeather(result.latitude, result.longitude, result.name).catch(handleError);
                });
                
                searchSuggestions.appendChild(div);
            });
            
            searchSuggestions.classList.add('active');
        }

        function updateHeroTemperature(data) {
            const mainTemp = convertTemperature(data.current.temperature_2m, currentUnit);
            const feelsLike = convertTemperature(data.current.apparent_temperature, currentUnit);

            temperatureElement.textContent = Math.round(mainTemp);
            document.querySelector('.unit').textContent = `°${currentUnit}`;
            feelsLikeElement.textContent = `Feels like: ${Math.round(feelsLike)}°`;

            if (weatherIconElement) {
                weatherIconElement.className = `fas ${getWeatherIcon(data.current.weather_code)} hero-icon`;
            }

            const highEl = document.getElementById('temp-high');
            const lowEl = document.getElementById('temp-low');
            if (data.daily?.temperature_2m_max?.length && highEl) {
                highEl.textContent = `${Math.round(convertTemperature(data.daily.temperature_2m_max[0], currentUnit))}°`;
            }
            if (data.daily?.temperature_2m_min?.length && lowEl) {
                lowEl.textContent = `${Math.round(convertTemperature(data.daily.temperature_2m_min[0], currentUnit))}°`;
            }
        }

        function renderHourlyStrip(data) {
            const strip = document.getElementById('hourly-strip');
            if (!strip || !data.hourly?.time?.length) return;

            const now = Date.now();
            let startIdx = data.hourly.time.findIndex(t => t >= now);
            if (startIdx < 0) startIdx = 0;

            const count = 16;
            const cards = [];
            for (let i = startIdx; i < Math.min(startIdx + count, data.hourly.time.length); i++) {
                const time = new Date(data.hourly.time[i]);
                const label = i === startIdx ? 'Now' : time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                const temp = Math.round(convertTemperature(data.hourly.temperature_2m[i], currentUnit));
                const icon = getWeatherIcon(data.hourly.weather_code[i]);
                const precip = data.hourly.precipitation_probability[i];
                cards.push(`
                    <div class="hour-card">
                        <span class="hour-time">${label}</span>
                        <i class="fas ${icon}"></i>
                        <span class="hour-temp">${temp}°</span>
                        <span class="hour-precip">${precip > 0 ? `<i class="fas fa-tint"></i>${precip}%` : ''}</span>
                    </div>
                `);
            }
            strip.innerHTML = cards.join('');
        }

        function updateWeatherDisplays(data) {
            updateHeroTemperature(data);
            renderHourlyStrip(data);

            const windDirection = getWindDirection(data.current.wind_direction_10m);
            const windSpeed = formatSpeed(data.current.wind_speed_10m, currentSpeedUnit);
            const windGusts = formatSpeed(data.current.wind_gusts_10m, currentSpeedUnit);

            windElement.innerHTML = `
                <span class="wind-speed">${windSpeed} ${windDirection}</span>
                <span class="wind-gusts">Gusts: ${windGusts}</span>
            `;

            humidityElement.textContent = `${Math.round(data.current.relative_humidity_2m)}%`;
            precipitationElement.textContent = `${data.current.precipitation} mm`;
            uvIndexElement.textContent = Math.round(data.current.uv_index);

            descriptionElement.textContent = getWeatherDescription(data.current.weather_code);

            // Update detailed cards
            const precipChance = data.daily?.precipitation_probability_max?.[0] ?? 0;
            const precipChanceEl = document.getElementById('precipitation-chance');
            const precipDescEl = document.getElementById('precipitation-desc');
            if (precipChanceEl) precipChanceEl.textContent = `${precipChance}%`;
            if (precipDescEl) {
                precipDescEl.textContent =
                    precipChance > 70 ? 'High chance of precipitation' :
                    precipChance > 30 ? 'Moderate chance of precipitation' :
                    'Low chance of precipitation';
            }

            // Update air quality card with Open-Meteo data
            const aqi = data.air_quality?.current?.us_aqi;
            const aqiElement = document.getElementById('air-quality-value');
            const aqiStatus = document.getElementById('air-quality-status');
            const aqiDesc = document.querySelector('.air-quality-card .card-description');
            const pollutantsContainer = document.getElementById('air-quality-pollutants');

            if (aqiElement) {
                aqiElement.textContent = aqi ?? '--';
                aqiElement.style.color = aqi != null ? getAirQualityColor(aqi) : '';
            }
            if (aqiStatus) aqiStatus.textContent = aqi != null ? getAirQualityDescription(aqi) : '--';
            if (aqiDesc) aqiDesc.textContent = aqi != null ? getAirQualityImplication(aqi) : 'US AQI';

            // Update pollutants information
            if (pollutantsContainer) {
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
            }

            const uvIndex = Math.round(data.current.uv_index);
            const uvValueEl = document.getElementById('uv-index-value');
            const uvStatusEl = document.getElementById('uv-index-status');
            if (uvValueEl) uvValueEl.textContent = uvIndex;
            if (uvStatusEl) uvStatusEl.textContent = getUVIndexDescription(uvIndex);

            const visibilityMeters = data.current.visibility;
            const visibilityKm = (visibilityMeters / 1000).toFixed(1);
            const visValueEl = document.getElementById('visibility-value');
            const visStatusEl = document.getElementById('visibility-status');
            if (visValueEl) visValueEl.textContent = `${visibilityKm} km`;
            if (visStatusEl) visStatusEl.textContent = getVisibilityDescription(visibilityMeters);
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
                updateWeatherDisplays(data);

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

        // Initialize the app
        try {
            init();
        } catch (error) {
            console.error('App initialization error:', error);
            if (errorElement) errorElement.textContent = error.message;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
} catch (error) {
    console.error('Failed to load modules:', error);
    const errorElement = document.getElementById('error');
    if (errorElement) {
        errorElement.textContent = 'Failed to initialize the weather app. Please try refreshing the page';
        errorElement.style.display = 'block';
    }
}
