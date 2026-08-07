try {
    const { getWeatherData } = await import('./js/modules/weatherAPI.js');
    const {
        convertTemperature,
        getWeatherDescription,
        getWeatherIcon,
        getUVIndexDescription,
        getUVSeverityClass,
        getAirQualityDescription,
        getAirQualityImplication,
        getAQISeverityClass,
        getVisibilityDescription,
        getCloudCoverDescription,
        getWindDirection,
        formatSpeed,
        formatPressure
    } = await import('./js/modules/utils.js');
    const { initializeAnimations, updatePrecipitationDisplay, updateWindDisplay } = await import('./js/modules/visualization.js');
    const { initChrome, onLocationChange, onUnitsChange, getUnits } = await import('./js/modules/chrome.js');
    const { formatUpdatedTime } = await import('./js/modules/fetchUtils.js');

    let currentWeatherData = null;
    let currentHourIndex = 0;
    let precipMode = 'current';
    let windMode = 'current';
    let rainParticles = [];
    let windParticles = [];

    const UNAVAILABLE = 'Data unavailable';
    const na = (value, fmt) => (value === null || value === undefined || Number.isNaN(value)) ? UNAVAILABLE : fmt(value);

    // The module imports above are awaited before this point, which can take
    // long enough (network/module resolution) that 'DOMContentLoaded' has
    // already fired by the time we'd register a listener for it — that
    // listener would then never run, silently breaking the whole app. Guard
    // with a readyState check instead of registering unconditionally.
    function initApp() {
        initChrome({ page: 'overview' });

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
        const windElement = document.getElementById('wind');
        const humidityElement = document.getElementById('humidity');
        const precipitationElement = document.getElementById('precipitation');
        const uvIndexElement = document.getElementById('uv-index');
        const feelsLikeElement = document.querySelector('.feels-like');
        const aqiInfoBtn = document.getElementById('aqi-info-btn');
        const aqiInfoModal = document.getElementById('aqi-info-modal');
        const modalCloseBtn = aqiInfoModal ? aqiInfoModal.querySelector('.close-btn') : null;

        aqiInfoBtn?.addEventListener('click', () => {
            aqiInfoModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
        modalCloseBtn?.addEventListener('click', () => {
            aqiInfoModal.classList.remove('active');
            document.body.style.overflow = '';
        });
        aqiInfoModal?.addEventListener('click', (e) => {
            if (e.target === aqiInfoModal) {
                aqiInfoModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && aqiInfoModal?.classList.contains('active')) {
                aqiInfoModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });

        function updateHeroTemperature(data) {
            const { unit } = getUnits();
            const mainTemp = convertTemperature(data.current.temperature_2m, unit);
            const feelsLike = convertTemperature(data.current.apparent_temperature, unit);

            temperatureElement.textContent = Math.round(mainTemp);
            document.querySelector('.unit').textContent = `°${unit}`;
            feelsLikeElement.textContent = `Feels like: ${Math.round(feelsLike)}°`;

            if (weatherIconElement) {
                weatherIconElement.className = `fas ${getWeatherIcon(data.current.weather_code)} hero-icon`;
            }

            const highEl = document.getElementById('temp-high');
            const lowEl = document.getElementById('temp-low');
            if (data.daily?.temperature_2m_max?.length && highEl) {
                highEl.textContent = `${Math.round(convertTemperature(data.daily.temperature_2m_max[0], unit))}°`;
            } else if (highEl) {
                highEl.textContent = UNAVAILABLE;
            }
            if (data.daily?.temperature_2m_min?.length && lowEl) {
                lowEl.textContent = `${Math.round(convertTemperature(data.daily.temperature_2m_min[0], unit))}°`;
            } else if (lowEl) {
                lowEl.textContent = UNAVAILABLE;
            }
        }

        function renderHourlyStrip(data) {
            const strip = document.getElementById('hourly-strip');
            if (!strip || !data.hourly?.time?.length) return;
            const { unit } = getUnits();

            const now = Date.now();
            let startIdx = data.hourly.time.findIndex(t => t >= now);
            if (startIdx < 0) startIdx = 0;

            const count = 16;
            const cards = [];
            for (let i = startIdx; i < Math.min(startIdx + count, data.hourly.time.length); i++) {
                const time = new Date(data.hourly.time[i]);
                const label = i === startIdx ? 'Now' : time.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
                const temp = Math.round(convertTemperature(data.hourly.temperature_2m[i], unit));
                const icon = getWeatherIcon(data.hourly.weather_code[i]);
                const precip = data.hourly.precipitation_probability?.[i];
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
            const { unit, speedUnit } = getUnits();
            updateHeroTemperature(data);
            renderHourlyStrip(data);

            const windDirection = getWindDirection(data.current.wind_direction_10m);
            const windSpeed = formatSpeed(data.current.wind_speed_10m, speedUnit);
            const windGusts = na(data.current.wind_gusts_10m, v => formatSpeed(v, speedUnit));

            windElement.innerHTML = `
                <span class="wind-speed">${windSpeed} ${windDirection} (${Math.round(data.current.wind_direction_10m)}°)</span>
                <span class="wind-gusts">Gusts: ${windGusts}</span>
            `;

            humidityElement.textContent = na(data.current.relative_humidity_2m, v => `${Math.round(v)}%`);
            precipitationElement.textContent = na(data.current.precipitation, v => `${v} mm`);
            uvIndexElement.textContent = na(data.current.uv_index, v => Math.round(v));

            descriptionElement.textContent = getWeatherDescription(data.current.weather_code);

            // More Conditions
            const dewPointEl = document.getElementById('dew-point');
            if (dewPointEl) dewPointEl.textContent = na(data.current.dew_point_2m, v => `${Math.round(convertTemperature(v, unit))}°${unit}`);

            const pressureEl = document.getElementById('pressure');
            if (pressureEl) pressureEl.textContent = na(data.current.surface_pressure ?? data.current.pressure_msl, v => formatPressure(v));

            const cloudEl = document.getElementById('cloud-cover');
            if (cloudEl) cloudEl.textContent = na(data.current.cloud_cover, v => `${Math.round(v)}% · ${getCloudCoverDescription(v)}`);

            const sunriseEl = document.getElementById('sunrise-value');
            const sunsetEl = document.getElementById('sunset-value');
            const fmtSunTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            if (sunriseEl) sunriseEl.textContent = data.daily?.sunrise?.[0] ? fmtSunTime(data.daily.sunrise[0]) : UNAVAILABLE;
            if (sunsetEl) sunsetEl.textContent = data.daily?.sunset?.[0] ? fmtSunTime(data.daily.sunset[0]) : UNAVAILABLE;

            const precipBreakdownEl = document.getElementById('precip-breakdown');
            if (precipBreakdownEl) {
                const rain = data.current.rain, showers = data.current.showers, snow = data.current.snowfall;
                if (rain === undefined && showers === undefined && snow === undefined) {
                    precipBreakdownEl.textContent = UNAVAILABLE;
                } else {
                    precipBreakdownEl.textContent = `${(rain ?? 0).toFixed(1)} / ${(showers ?? 0).toFixed(1)} / ${(snow ?? 0).toFixed(1)} mm`;
                }
            }

            // Data source / timestamp footer
            const sourceText = document.getElementById('data-source-text');
            const timestampText = document.getElementById('data-timestamp-text');
            if (sourceText) sourceText.textContent = `Source: ${data.source || 'Open-Meteo'} (forecast model)`;
            if (timestampText) timestampText.textContent = `Updated: ${formatUpdatedTime(data.fetched_at)}`;

            // Precipitation card
            const precipChance = data.daily?.precipitation_probability_max?.[0];
            const precipChanceEl = document.getElementById('precipitation-chance');
            const precipDescEl = document.getElementById('precipitation-desc');
            if (precipChanceEl) precipChanceEl.textContent = na(precipChance, v => `${v}%`);
            if (precipDescEl) {
                precipDescEl.textContent = precipChance === undefined || precipChance === null ? UNAVAILABLE :
                    precipChance > 70 ? 'High chance of precipitation' :
                    precipChance > 30 ? 'Moderate chance of precipitation' :
                    'Low chance of precipitation';
            }

            // Air quality card
            const aqi = data.air_quality?.current?.us_aqi;
            const euAqi = data.air_quality?.current?.european_aqi;
            const aqiElement = document.getElementById('air-quality-value');
            const aqiStatus = document.getElementById('air-quality-status');
            const aqiDesc = document.querySelector('.air-quality-card .card-description');
            const pollutantsContainer = document.getElementById('air-quality-pollutants');

            if (aqiElement) {
                aqiElement.textContent = aqi ?? '—';
                aqiElement.classList.remove('sev-1', 'sev-2', 'sev-3', 'sev-4', 'sev-5', 'sev-6');
                if (aqi != null) aqiElement.classList.add(getAQISeverityClass(aqi));
            }
            if (aqiStatus) aqiStatus.textContent = aqi != null ? getAirQualityDescription(aqi) : (data.air_quality_error || UNAVAILABLE);
            if (aqiDesc) aqiDesc.textContent = aqi != null
                ? `${getAirQualityImplication(aqi)}${euAqi != null ? ` (EU AQI: ${euAqi})` : ''}`
                : 'US AQI';

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
                        `).join('') || `<div class="pollutant-item">${UNAVAILABLE}</div>`;
                } else {
                    pollutantsContainer.innerHTML = `<div class="pollutant-item">${data.air_quality_error || UNAVAILABLE}</div>`;
                }
            }

            const uvValueEl = document.getElementById('uv-index-value');
            const uvStatusEl = document.getElementById('uv-index-status');
            if (uvValueEl) {
                uvValueEl.textContent = na(data.current.uv_index, v => Math.round(v));
                uvValueEl.classList.remove('sev-1', 'sev-2', 'sev-3', 'sev-4', 'sev-5', 'sev-6');
                if (data.current.uv_index != null) uvValueEl.classList.add(getUVSeverityClass(data.current.uv_index));
            }
            if (uvStatusEl) {
                const peakUv = data.daily?.uv_index_max?.[0];
                uvStatusEl.textContent = data.current.uv_index != null
                    ? `${getUVIndexDescription(data.current.uv_index)}${peakUv != null ? ` · Peak today: ${Math.round(peakUv)}` : ''}`
                    : UNAVAILABLE;
            }

            const visibilityMeters = data.current.visibility;
            const visValueEl = document.getElementById('visibility-value');
            const visStatusEl = document.getElementById('visibility-status');
            if (visValueEl) visValueEl.textContent = na(visibilityMeters, v => `${(v / 1000).toFixed(1)} km`);
            if (visStatusEl) visStatusEl.textContent = na(visibilityMeters, v => getVisibilityDescription(v));
        }

        function initCanvases() {
            const setCanvasSize = (canvas) => {
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width * window.devicePixelRatio;
                canvas.height = rect.height * window.devicePixelRatio;
                const ctx = canvas.getContext('2d');
                ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
                return { width: rect.width, height: rect.height };
            };
            setCanvasSize(precipCanvas);
            setCanvasSize(windCanvas);
            if (currentWeatherData) updateVisualizations();
        }

        function setupHourlyAnimations() {
            const { raindrops, windParticles: windParts } = initializeAnimations(precipCanvas, windCanvas);
            rainParticles = raindrops;
            windParticles = windParts;
        }

        function updateHourlyPrecipitation() {
            if (!currentWeatherData) return;
            const hourIndex = currentHourIndex;
            const isNext8 = precipMode === 'forecast';
            const { probability } = updatePrecipitationDisplay(precipCanvas, currentWeatherData, hourIndex, isNext8);
            const ctx = precipCanvas.getContext('2d');
            ctx.strokeStyle = 'rgba(0, 122, 255, 0.6)';
            ctx.lineWidth = 1;
            let rainIntensity = isNext8
                ? Math.max(...currentWeatherData.hourly.precipitation_probability.slice(hourIndex, hourIndex + 8)) / 100
                : probability / 100;
            function animateRain() {
                ctx.clearRect(0, 0, precipCanvas.width, precipCanvas.height);
                rainParticles.forEach(drop => {
                    drop.update(rainIntensity * 3);
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
            const { speed } = updateWindDisplay(windCanvas, currentWeatherData, hourIndex, isNext8);
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
            precipCurrentBtn?.classList.toggle('active', precipMode === 'current');
            precipForecastBtn?.classList.toggle('active', precipMode === 'forecast');
            windCurrentBtn?.classList.toggle('active', windMode === 'current');
            windForecastBtn?.classList.toggle('active', windMode === 'forecast');
        }

        precipCurrentBtn?.addEventListener('click', () => { precipMode = 'current'; setHourlyButtonStates(); updateHourlyPrecipitation(); });
        precipForecastBtn?.addEventListener('click', () => { precipMode = 'forecast'; setHourlyButtonStates(); updateHourlyPrecipitation(); });
        windCurrentBtn?.addEventListener('click', () => { windMode = 'current'; setHourlyButtonStates(); updateHourlyWind(); });
        windForecastBtn?.addEventListener('click', () => { windMode = 'forecast'; setHourlyButtonStates(); updateHourlyWind(); });

        function updateVisualizations() {
            setupHourlyAnimations();
            updateHourlyPrecipitation();
            updateHourlyWind();
        }

        const resizeObserver = new ResizeObserver(() => initCanvases());
        if (precipCanvas) resizeObserver.observe(precipCanvas);
        if (windCanvas) resizeObserver.observe(windCanvas);

        async function updateWeather(latitude, longitude, locationName) {
            try {
                if (loadingElement) loadingElement.style.display = 'flex';
                if (errorElement) errorElement.textContent = '';

                const data = await getWeatherData(latitude, longitude, locationName);
                if (!data || !data.current) {
                    throw new Error('Invalid weather data received');
                }

                currentWeatherData = data;
                locationElement.textContent = locationName;
                updateWeatherDisplays(data);

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

        onLocationChange((loc) => {
            if (!loc) return;
            updateWeather(loc.latitude, loc.longitude, loc.name);
        });

        onUnitsChange(() => {
            if (currentWeatherData) updateWeatherDisplays(currentWeatherData);
        });
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
