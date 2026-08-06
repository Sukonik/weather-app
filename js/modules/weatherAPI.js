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

function readCache(key) {
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

function writeCache(key, data) {
    try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
    } catch {
        // localStorage full/unavailable — non-fatal, just skip caching
    }
}

function roundCoord(n) {
    return Math.round(n * 100) / 100; // ~1.1km grid, plenty for a 10-min cache
}

// ------------------------------------------------------------
// Geocoding — worldwide place names AND postal codes, no key.
// Returns ALL matches so the caller can disambiguate ("Jamaica"
// the country vs. Jamaica, Queens) instead of silently guessing.
// ------------------------------------------------------------
export async function searchLocations(query, { count = 8, signal } = {}) {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=${count}&language=en&format=json`;

    try {
        const { data } = await fetchJSON(url, { signal });
        if (!data.results || !data.results.length) return [];

        return data.results.map(normalizeGeocodingResult);
    } catch (error) {
        if (error.message === 'Request cancelled') throw error;
        console.error('Geocoding search error:', error);
        throw new Error(`Couldn't search for "${trimmed}". ${error.message}`);
    }
}

function normalizeGeocodingResult(r) {
    return {
        id: r.id,
        name: r.name,
        admin1: r.admin1 || '',      // state/province
        admin2: r.admin2 || '',      // county
        country: r.country || '',
        countryCode: r.country_code || '',
        postcodes: r.postcodes || [],
        latitude: r.latitude,
        longitude: r.longitude,
        elevation: r.elevation,
        timezone: r.timezone,
        population: r.population || 0,
        featureCode: r.feature_code || ''
    };
}

/** Single best-match convenience wrapper (used by "current location" reverse lookups etc). */
export async function getCoordinates(location, opts = {}) {
    const results = await searchLocations(location, { ...opts, count: 1 });
    if (!results.length) {
        throw new Error(`Location "${location}" not found. Please try a different search.`);
    }
    return results[0];
}

export async function reverseGeocode(latitude, longitude, { signal } = {}) {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=en&format=json`;
    try {
        const { data } = await fetchJSON(url, { signal });
        if (data?.results?.length) {
            return normalizeGeocodingResult(data.results[0]);
        }
    } catch (error) {
        console.warn('Reverse geocoding failed, using coordinates only:', error);
    }
    return {
        name: 'Current Location',
        admin1: '', admin2: '', country: '', countryCode: '', postcodes: [],
        latitude, longitude, elevation: null, timezone: null, population: 0, featureCode: ''
    };
}

export async function getCurrentLocation({ signal } = {}) {
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
    });

    const { latitude, longitude } = position.coords;
    return reverseGeocode(latitude, longitude, { signal });
}

// ------------------------------------------------------------
// Weather + air quality — fetched in parallel via allSettled so
// one failing source degrades gracefully instead of blanking
// the whole app. Every field the Overview page can show is
// requested here; missing fields are left undefined rather than
// defaulted to 0, so the UI can render "Data unavailable".
// ------------------------------------------------------------
const CURRENT_FIELDS = [
    'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
    'precipitation', 'rain', 'showers', 'snowfall', 'weather_code',
    'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    'uv_index', 'visibility', 'dew_point_2m', 'pressure_msl',
    'surface_pressure', 'cloud_cover'
].join(',');

const HOURLY_FIELDS = [
    'temperature_2m', 'precipitation_probability', 'precipitation',
    'rain', 'showers', 'snowfall', 'weather_code',
    'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
    'uv_index', 'visibility', 'dew_point_2m', 'pressure_msl', 'cloud_cover',
    'wind_speed_80m', 'wind_speed_120m'
].join(',');

const DAILY_FIELDS = [
    'precipitation_probability_max', 'precipitation_sum',
    'rain_sum', 'showers_sum', 'snowfall_sum',
    'temperature_2m_max', 'temperature_2m_min',
    'uv_index_max', 'sunrise', 'sunset'
].join(',');

const AQ_FIELDS = [
    'pm10', 'pm2_5', 'carbon_monoxide', 'nitrogen_dioxide', 'sulphur_dioxide',
    'ozone', 'european_aqi', 'us_aqi'
].join(',');

export async function getWeatherData(latitude, longitude, locationName, { signal } = {}) {
    const lat = roundCoord(latitude);
    const lon = roundCoord(longitude);

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=${CURRENT_FIELDS}&hourly=${HOURLY_FIELDS}&daily=${DAILY_FIELDS}&timezone=auto`;
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=${AQ_FIELDS}`;

    const [weatherResult, airQualityResult] = await Promise.allSettled([
        fetchJSON(weatherUrl, { signal, cacheKey: `wx:${lat},${lon}` }),
        fetchJSON(airQualityUrl, { signal, cacheKey: `aq:${lat},${lon}` })
    ]);

    if (weatherResult.status === 'rejected') {
        if (weatherResult.reason?.message === 'Request cancelled') throw weatherResult.reason;
        throw new Error(`Unable to fetch weather data: ${weatherResult.reason.message}`);
    }
}
