try {
    const baseUrl = window.location.hostname === 'sukonik.github.io' ? '/weather-app' : '';
    const { getWeatherData, searchLocations, getCurrentLocation } = await import('./js/modules/weatherAPI.js');
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
    let currentLocationMeta = null; // full geocoding result for the active location
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
    let activeWeatherController = null; // AbortController for the in-flight weather fetch
    let requestGeneration = 0; // guards against a slow, stale request rendering over a newer one

    const LAST_LOCATION_KEY = 'clearsky:lastLocation';

    function saveLastLocation(meta) {
        try {
            localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(meta));
        } catch {
            // storage unavailable — non-fatal
        }
    }

    function loadLastLocation() {
        try {
            const raw = localStorage.getItem(LAST_LOCATION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    /** Renders a value via `formatter`, or a styled "Data unavailable" marker
     *  when the value is missing — never falls back to 0 or a bare "--". */
    function fieldHTML(value, formatter) {
        if (value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value))) {
            return '<span class="unavailable">Data unavailable</span>';
        }
        return formatter(value);
    }

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
        const locationDetailElement = document.getElementById('location-detail');
        const dataMetaElement = document.getElementById('data-meta');
        const dewPointElement = document.getElementById('dew-point');
        const pressureElement = document.getElementById('pressure');
        const cloudCoverElement = document.getElementById('cloud-cover');
        const navBtn = document.getElementById('nav-btn');
        const navDropdown = document.getElementById('nav-dropdown');
        const quickLocBtns = document.querySelectorAll('.quick-loc-btn');

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

        /** Resolves a free-text query (place name OR postal code) via the
         *  geocoding API. A single confident match loads immediately; more
         *  than one match is shown as a disambiguation list instead of
         *  silently guessing (e.g. "Jamaica" the country vs. Jamaica, Queens). */
        async function resolveAndShowWeather(query) {
            if (!query) return;
            try {
                if (errorElement) errorElement.textContent = '';
                if (loadingElement) loadingElement.style.display = 'flex';
                const results = await searchLocations(query);
                if (!results.length) {
                    throw new Error(`Location "${query}" not found. Try a city name or postal code.`);
                }
                if (results.length === 1) {
                    searchSuggestions.classList.remove('active');
                    await updateWeather(results[0]);
                } else {
                    if (loadingElement) loadingElement.style.display = 'none';
                    displaySearchSuggestions(results, { disambiguate: true });
                }
            } catch (error) {
                console.error('Search error:', error);
                if (errorElement) errorElement.textContent = error.message || 'Error searching location';
                if (loadingElement) loadingElement.style.display = 'none';
            }
        }

        // Event Listeners
        if (searchForm) {
            searchForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await resolveAndShowWeather(searchInput?.value.trim());
            });
        }
        if (searchBtn && searchInput) {
            searchBtn.addEventListener('click', async () => {
                await resolveAndShowWeather(searchInput.value.trim());
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
                    await updateWeather(locationData);
                } catch (error) {
                    handleError(error);
                    if (loadingElement) loadingElement.style.display = 'none';
                }
            });
        }
        if (navBtn && navDropdown) {
            navBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = navDropdown.classList.toggle('active');
                navBtn.setAttribute('aria-expanded', String(isOpen));
            });
        }
        quickLocBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const zip = btn.dataset.quickZip;
                if (searchInput) searchInput.value = btn.dataset.quickName || zip;
                resolveAndShowWeather(zip);
            });
        });
        unitToggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const unit = btn.dataset.unit;
                if (unit !== currentUnit) {
                    currentUnit = unit;
                    localStorage.setItem('unit', unit);
                    updateUnitDisplay();
                    if (currentWeatherData) {
                        updateWeatherDisplays(currentWeatherData);
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
                    const results = await searchLocations(query);
                    if (results.length > 0) {
                        displaySearchSuggestions(results);
                    } else {
                        searchSuggestions.classList.remove('active');
                    }
                } catch (error) {
                    console.error('Error fetching location suggestions:', error);
                    searchSuggestions.classList.remove('active');
                }
            }, 300);
        }

        /** A country-level match (feature_code starting "PCL") gets a
         *  distinguishing badge so "Jamaica" (the country) never looks
         *  identical to "Jamaica, Queens" in the list. */
        function describeResult(result) {
            const parts = [];
            if (result.admin2) parts.push(result.admin2);
            if (result.admin1) parts.push(result.admin1);
            if (result.country) parts.push(result.country);
            const isCountry = (result.featureCode || '').startsWith('PCL');
            const postcode = result.postcodes?.[0];
            return {
                line: parts.join(', '),
                badge: isCountry ? 'Country' : (result.admin1 ? null : (result.featureCode || null)),
                postcode
            };
        }

        function displaySearchSuggestions(results, { disambiguate = false } = {}) {
            searchSuggestions.innerHTML = '';

            if (disambiguate) {
                const header = document.createElement('div');
                header.className = 'suggestion-header';
                header.textContent = `Multiple matches — choose one`;
                searchSuggestions.appendChild(header);
            }

            results.forEach(result => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                const { line, badge, postcode } = describeResult(result);

                div.innerHTML = `
                    <div class="location-name">${result.name}${badge ? `<span class="loc-badge">${badge}</span>` : ''}</div>
                    <div class="location-detail">${line}${postcode ? ` · ${postcode}` : ''}</div>
                `;

                div.addEventListener('click', () => {
                    searchInput.value = result.name;
                    searchSuggestions.classList.remove('active');
                    updateWeather(result).catch(handleError);
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
            const c = data.current || {};
            updateHeroTemperature(data);
            renderHourlyStrip(data);

            // Wind: speed, gusts, direction
            if (windElement) {
                windElement.innerHTML = (c.wind_speed_10m == null)
                    ? fieldHTML(null, () => '')
                    : `
                        <span class="wind-speed">${formatSpeed(c.wind_speed_10m, currentSpeedUnit)} ${getWindDirection(c.wind_direction_10m)}</span>
                        <span class="wind-gusts">Gusts: ${fieldHTML(c.wind_gusts_10m, v => formatSpeed(v, currentSpeedUnit))}</span>
                    `;
            }

            if (humidityElement) humidityElement.innerHTML = fieldHTML(c.relative_humidity_2m, v => `${Math.round(v)}%`);
            if (precipitationElement) precipitationElement.innerHTML = fieldHTML(c.precipitation, v => `${v} mm`);
            if (uvIndexElement) uvIndexElement.innerHTML = fieldHTML(c.uv_index, v => Math.round(v));
            if (dewPointElement) dewPointElement.innerHTML = fieldHTML(c.dew_point_2m, v => `${Math.round(convertTemperature(v, currentUnit))}°`);
            if (pressureElement) pressureElement.innerHTML = fieldHTML(c.pressure_msl ?? c.surface_pressure, v => `${Math.round(v)} hPa`);
            if (cloudCoverElement) cloudCoverElement.innerHTML = fieldHTML(c.cloud_cover, v => `${Math.round(v)}%`);

            if (descriptionElement) descriptionElement.textContent = c.weather_code != null ? getWeatherDescription(c.weather_code) : 'Unknown';

            // Precipitation card: chance + rain/showers/snow breakdown
            const precipChance = data.daily?.precipitation_probability_max?.[0];
            const precipChanceEl = document.getElementById('precipitation-chance');
            const precipDescEl = document.getElementById('precipitation-desc');
            if (precipChanceEl) precipChanceEl.innerHTML = fieldHTML(precipChance, v => `${v}%`);
            if (precipDescEl) {
                precipDescEl.textContent = precipChance == null ? 'Data unavailable' :
                    precipChance > 70 ? 'High chance of precipitation' :
                    precipChance > 30 ? 'Moderate chance of precipitation' :
                    'Low chance of precipitation';
            }
            const precipBreakdownEl = document.getElementById('precipitation-breakdown');
            if (precipBreakdownEl) {
                const rows = [
                    { name: 'Rain', value: c.rain, unit: 'mm' },
                    { name: 'Showers', value: c.showers, unit: 'mm' },
                    { name: 'Snowfall', value: c.snowfall, unit: 'cm' }
                ].filter(r => r.value !== undefined && r.value !== null && r.value > 0);
                precipBreakdownEl.innerHTML = rows.length
                    ? rows.map(r => `<div class="pollutant-item"><span class="pollutant-name">${r.name}</span><span class="pollutant-value">${r.value} ${r.unit}</span></div>`).join('')
                    : '<div class="pollutant-item"><span class="pollutant-name">None currently falling</span></div>';
            }

            // Air quality
            const aqSources = data._sources?.air_quality;
            const aq = data.air_quality?.current;
            const aqi = aq?.us_aqi;
            const euAqi = aq?.european_aqi;
            const aqiElement = document.getElementById('air-quality-value');
            const aqiStatus = document.getElementById('air-quality-status');
            const aqiDesc = document.querySelector('.air-quality-card .card-description');
            const aqiEuEl = document.getElementById('air-quality-eu');
            const pollutantsContainer = document.getElementById('air-quality-pollutants');

            if (aqiElement) {
                aqiElement.innerHTML = fieldHTML(aqi, v => v);
                aqiElement.style.color = aqi != null ? getAirQualityColor(aqi) : '';
            }
            if (aqiStatus) aqiStatus.textContent = aqi != null ? getAirQualityDescription(aqi) : (aqSources?.ok === false ? 'Source unavailable' : 'Data unavailable');
            if (aqiDesc) aqiDesc.innerHTML = `US AQI${euAqi != null ? ` · EU AQI ${euAqi}` : ''}`;
            if (aqiEuEl) aqiEuEl.textContent = '';

            if (pollutantsContainer) {
                if (aq) {
                    const pollutants = [
                        { name: 'PM2.5', value: aq.pm2_5, unit: 'μg/m³' },
                        { name: 'PM10', value: aq.pm10, unit: 'μg/m³' },
                        { name: 'Ozone', value: aq.ozone, unit: 'μg/m³' },
                        { name: 'NO₂', value: aq.nitrogen_dioxide, unit: 'μg/m³' },
                        { name: 'SO₂', value: aq.sulphur_dioxide, unit: 'μg/m³' },
                        { name: 'CO', value: aq.carbon_monoxide, unit: 'μg/m³' }
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
                        pollutantsContainer.innerHTML = '<div class="pollutant-item">Data unavailable</div>';
                    }
                } else {
                    pollutantsContainer.innerHTML = `<div class="pollutant-item">${aqSources?.ok === false ? 'Source unavailable' : 'Data unavailable'}</div>`;
                }
            }

            // UV: current + today's peak
            const uvValueEl = document.getElementById('uv-index-value');
            const uvStatusEl = document.getElementById('uv-index-status');
            const uvPeakEl = document.getElementById('uv-index-peak');
            if (uvValueEl) uvValueEl.innerHTML = fieldHTML(c.uv_index, v => Math.round(v));
            if (uvStatusEl) uvStatusEl.textContent = c.uv_index != null ? getUVIndexDescription(c.uv_index) : 'Data unavailable';
            if (uvPeakEl) uvPeakEl.innerHTML = fieldHTML(data.daily?.uv_index_max?.[0], v => Math.round(v));

            // Visibility
            const visValueEl = document.getElementById('visibility-value');
            const visStatusEl = document.getElementById('visibility-status');
            if (visValueEl) visValueEl.innerHTML = fieldHTML(c.visibility, v => `${(v / 1000).toFixed(1)} km`);
            if (visStatusEl) visStatusEl.textContent = c.visibility != null ? getVisibilityDescription(c.visibility) : 'Data unavailable';

            renderDataMeta(data);
        }

        function renderDataMeta(data) {
            if (!dataMetaElement) return;
            const time = data.current?.time ? new Date(data.current.time) : new Date();
            const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const bits = [`Updated ${timeStr}`, 'Source: Open-Meteo'];
            if (data._sources?.air_quality?.ok === false) bits.push('AQI temporarily unavailable');
            dataMetaElement.textContent = bits.join(' · ');
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
            // Prefer the last location the user actually chose — avoids a
            // re-prompt for geolocation permission on every return visit.
            const saved = loadLastLocation();
            if (saved) {
                try {
                    await updateWeather(saved);
                    return;
                } catch (error) {
                    console.warn('Saved location failed to load, falling back:', error);
                }
            }

            // Deliberately does NOT show the blocking full-screen loading
            // overlay here: this is a silent, best-effort background
            // attempt, and it can take up to ~9s if the browser's
            // geolocation permission prompt is never answered (see the
            // hard timeout in getCurrentLocation()). Blocking all
            // interaction for that long — including the quick-location
            // buttons that exist specifically as a fallback — would be
            // a real usability regression. The user can search or tap a
            // quick-location button at any time; whichever finishes first
            // wins (updateWeather() cancels the other via AbortController).
            try {
                if (!navigator.geolocation) {
                    throw new Error('Geolocation is not supported by your browser. Please use the search bar or a quick-location button below.');
                }

                const locationData = await getCurrentLocation();
                await updateWeather(locationData);
            } catch (error) {
                console.warn('Silent geolocation init failed (expected if no permission yet):', error);
                if (errorElement && !currentWeatherData) {
                    errorElement.textContent = 'Search a city/ZIP or try a quick-location button below to get started.';
                }
            }
        }

        /** `location` is a normalized geocoding result: { name, admin1,
         *  admin2, country, countryCode, postcodes, latitude, longitude,
         *  elevation, timezone }.
         *
         *  Two race conditions are guarded against here, not just one:
         *  1. A fast second search/quick-location click should cancel a
         *     still-in-flight fetch for the previous location (AbortController).
         *  2. The slow, best-effort *silent* background geolocation lookup
         *     on first load (which can take up to ~9s if the permission
         *     prompt is never answered) must never clobber a manual
         *     selection the user already made and saw finish in the
         *     meantime — even though its own fetch was never aborted, since
         *     it may have started before the manual one and simply be
         *     slower. requestGeneration solves this: whichever call is
         *     *last to start* wins the right to render, regardless of
         *     which happens to finish first. */
        async function updateWeather(location) {
            if (activeWeatherController) {
                activeWeatherController.abort();
            }
            const controller = new AbortController();
            activeWeatherController = controller;
            const myGeneration = ++requestGeneration;

            try {
                if (loadingElement) loadingElement.style.display = 'flex';
                if (errorElement) errorElement.textContent = '';

                console.log('Updating weather for:', location);
                const data = await getWeatherData(location.latitude, location.longitude, location.name, { signal: controller.signal });

                if (controller.signal.aborted || myGeneration !== requestGeneration) return; // superseded

                if (!data || !data.current) {
                    throw new Error('Invalid weather data received');
                }

                currentWeatherData = data;
                currentLocationMeta = location;
                console.log('Weather data updated:', data);

                saveLastLocation(location);

                // Update all displays
                locationElement.textContent = location.name;
                renderLocationDetail(location);
                updateWeatherDisplays(data);

                // Initialize visualizations
                setupHourlyAnimations();
                updateHourlyPrecipitation();
                updateHourlyWind();

                if (loadingElement) loadingElement.style.display = 'none';
            } catch (error) {
                if (myGeneration !== requestGeneration) return; // superseded — ignore its error too
                if (error.message === 'Request cancelled' || controller.signal.aborted) return;
                console.error('Error updating weather:', error);
                if (errorElement) {
                    errorElement.textContent = error.message || 'Unable to fetch weather data. Please try again.';
                }
                if (loadingElement) loadingElement.style.display = 'none';
            } finally {
                if (activeWeatherController === controller) activeWeatherController = null;
            }
        }

        function renderLocationDetail(location) {
            if (!locationDetailElement) return;
            const parts = [];
            if (location.admin1) parts.push(location.admin1);
            if (location.country) parts.push(location.country);
            const postcode = location.postcodes?.[0];
            let text = parts.join(', ');
            if (postcode) text += ` · ${postcode}`;
            locationDetailElement.textContent = text;
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
