// ============================================================
// ClearSky data layer — Open-Meteo (no API key required)
// Reliability: Promise.allSettled so one failed source never
// blanks the app, per-request timeouts via AbortController,
// and a short-lived localStorage cache to cut redundant calls.
// ============================================================

const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_PREFIX = 'clearsky:cache:';

function withTimeout(signal, ms) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), ms);
    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', onAbort);
        }
    };
}

async function fetchJSON(url, { signal, cacheKey } = {}) {
    if (cacheKey) {
        const cached = readCache(cacheKey);
        if (cached) return { data: cached, cached: true };
    }

    const { signal: timedSignal, cleanup } = withTimeout(signal, FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: timedSignal });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
        }
        const data = await response.json();
        if (cacheKey) writeCache(cacheKey, data);
        return { data, cached: false };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(signal?.aborted ? 'Request cancelled' : 'Request timed out. Please try again.');
        }
        if (error.name === 'TypeError') {
            throw new Error('Unable to connect. Please check your internet connection and try again.');
        }
        throw error;
    } finally {
        cleanup();
    }
}

function readCache(key) {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL_MS) {
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }
        return data;
    } catch {
        return null;
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

    // The PositionOptions.timeout above is only honored once the browser
    // has resolved its permission prompt — if the prompt is left open or
    // silently swallowed (seen in some embedded/headless contexts), the
    // native call never settles at all, leaving the caller (and the
    // loading overlay it drives) stuck forever. A JS-level race guarantees
    // this always resolves within ~9s no matter what the browser does.
    const position = await Promise.race([
        new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 0
            });
        }),
        new Promise((_, reject) => setTimeout(() => reject({ code: 3 }), 9000))
    ]).catch((error) => {
        if (error.code === 1) throw new Error('Location access denied. Please allow location access or use the search bar.');
        if (error.code === 2) throw new Error('Unable to determine your location. Please try again or use the search bar.');
        if (error.code === 3) throw new Error('Location request timed out. Please try again or use the search bar.');
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

    const weatherData = weatherResult.value.data;
    if (!weatherData.current || !weatherData.hourly) {
        throw new Error('Invalid weather data format received from Open-Meteo');
    }

    const now = Date.now();
    const sources = {
        weather: {
            ok: true,
            provider: 'Open-Meteo Forecast API',
            fetchedAt: now,
            cached: weatherResult.value.cached
        },
        air_quality: airQualityResult.status === 'fulfilled'
            ? { ok: true, provider: 'Open-Meteo Air Quality API', fetchedAt: now, cached: airQualityResult.value.cached }
            : { ok: false, provider: 'Open-Meteo Air Quality API', error: airQualityResult.reason?.message || 'Unavailable' }
    };

    if (airQualityResult.status === 'rejected') {
        console.warn('Air quality unavailable:', airQualityResult.reason);
    }

    return {
        ...weatherData,
        air_quality: airQualityResult.status === 'fulfilled' ? airQualityResult.value.data : { current: {} },
        location_name: locationName,
        _sources: sources
    };
}
