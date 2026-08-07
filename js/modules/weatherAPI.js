import { fetchJSON, cacheGet, cacheSet } from './fetchUtils.js';

const WEATHER_CURRENT = [
    'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'dew_point_2m',
    'precipitation', 'rain', 'showers', 'snowfall', 'weather_code',
    'cloud_cover', 'pressure_msl', 'surface_pressure',
    'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    'uv_index', 'visibility'
].join(',');

const WEATHER_HOURLY = [
    'temperature_2m', 'precipitation_probability', 'precipitation', 'rain', 'showers', 'snowfall',
    'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    'uv_index', 'visibility', 'dew_point_2m', 'cloud_cover', 'pressure_msl', 'surface_pressure',
    'wind_speed_80m', 'wind_speed_120m'
].join(',');

const WEATHER_DAILY = [
    'precipitation_probability_max', 'precipitation_sum', 'rain_sum', 'showers_sum', 'snowfall_sum',
    'temperature_2m_max', 'temperature_2m_min', 'uv_index_max', 'sunrise', 'sunset'
].join(',');

const AIR_QUALITY_CURRENT = [
    'pm10', 'pm2_5', 'carbon_monoxide', 'nitrogen_dioxide', 'sulphur_dioxide', 'ozone',
    'european_aqi', 'us_aqi'
].join(',');

const AIR_QUALITY_HOURLY = ['us_aqi', 'pm2_5', 'pm10', 'ozone'].join(',');

const WEATHER_CACHE_MS = 5 * 60 * 1000; // 5 min — Open-Meteo models update hourly at best
const AQI_CACHE_MS = 10 * 60 * 1000;

/**
 * Fetches current/hourly/daily weather plus air quality for a coordinate.
 * Weather and air-quality are independent sources fetched with
 * Promise.allSettled: a down air-quality API degrades the AQI card to
 * "unavailable" rather than blanking the whole app.
 */
export async function getWeatherData(latitude, longitude, locationName) {
    const coordKey = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=${WEATHER_CURRENT}&hourly=${WEATHER_HOURLY}&daily=${WEATHER_DAILY}&timezone=auto`;
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=${AIR_QUALITY_CURRENT}&hourly=${AIR_QUALITY_HOURLY}&timezone=auto`;

    const [weatherResult, airQualityResult] = await Promise.allSettled([
        loadWithCache(`weather_${coordKey}`, WEATHER_CACHE_MS, () => fetchJSON(weatherUrl, { timeoutMs: 8000, retries: 1 })),
        loadWithCache(`aqi_${coordKey}`, AQI_CACHE_MS, () => fetchJSON(airQualityUrl, { timeoutMs: 8000, retries: 1 }))
    ]);

    if (weatherResult.status === 'rejected') {
        console.error('Weather data error:', weatherResult.reason);
        throw new Error('Unable to reach the weather service. Please check your connection and try again.');
    }

    const weatherData = weatherResult.value;
    if (!weatherData.current || !weatherData.hourly) {
        throw new Error('Invalid weather data format received from Open-Meteo');
    }

    let airQuality = null;
    let airQualityError = null;
    if (airQualityResult.status === 'fulfilled') {
        airQuality = airQualityResult.value;
    } else {
        airQualityError = airQualityResult.reason?.message || 'Air quality data unavailable';
        console.warn('Air Quality API error:', airQualityError);
    }

    return {
        ...weatherData,
        air_quality: airQuality,
        air_quality_error: airQualityError,
        location_name: locationName,
        source: 'Open-Meteo',
        fetched_at: Date.now()
    };
}

async function loadWithCache(key, maxAgeMs, fetcher) {
    const cached = cacheGet(key, maxAgeMs);
    if (cached) return cached;
    const data = await fetcher();
    cacheSet(key, data);
    return data;
}

export async function getCoordinates(location) {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
        const data = await fetchJSON(url, { timeoutMs: 8000, retries: 1 });
        if (!data.results || !data.results.length) {
            throw new Error(`Location "${location}" not found. Please try a different location.`);
        }
        return {
            latitude: data.results[0].latitude,
            longitude: data.results[0].longitude,
            name: data.results[0].name
        };
    } catch (error) {
        console.error('Geocoding error:', error);
        throw error;
    }
}

export async function getCurrentLocation() {
    if (!navigator.geolocation) {
        throw new Error('Geolocation is not supported by your browser. Please use the search bar to enter a location.');
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });

        const { latitude, longitude } = position.coords;

        try {
            const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}`;
            const data = await fetchJSON(url, { timeoutMs: 6000, retries: 0 });
            return {
                latitude,
                longitude,
                name: data?.results?.[0]?.name || 'Current Location'
            };
        } catch (error) {
            console.warn('Reverse geocoding failed, using fallback:', error);
            return { latitude, longitude, name: 'Current Location' };
        }
    } catch (error) {
        console.error('Geolocation error:', error);
        if (error.code === 1) {
            throw new Error('Location access denied. Please allow location access or use the search bar.');
        } else if (error.code === 2) {
            throw new Error('Unable to determine your location. Please try again or use the search bar.');
        } else if (error.code === 3) {
            throw new Error('Location request timed out. Please try again or use the search bar.');
        }
        throw new Error('Unable to get your location. Please try again or use the search bar.');
    }
}
