// API Keys (replace with your own)
const WAQI_TOKEN = 'YOUR_WAQI_TOKEN';
const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';

// API request options
const API_OPTIONS = {
    mode: 'cors',
    headers: {
        'Accept': 'application/json'
    }
};

// Debug logging function
const debug = (message, data) => {
    console.log(`[WeatherAPI] ${message}`, data);
};

export async function getWeatherData(latitude, longitude, locationName) {
    try {
        debug('Fetching weather data for:', { latitude, longitude, locationName });
        
        // Open-Meteo API calls
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility&daily=uv_index_max,precipitation_probability_max&timezone=auto`;
        
        // Air quality data from Open-Meteo
        const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi&timezone=auto`;

        debug('Making API requests to:', { weatherUrl, airQualityUrl });

        try {
            const [weatherResponse, airQualityResponse] = await Promise.all([
                fetch(weatherUrl, API_OPTIONS),
                fetch(airQualityUrl, API_OPTIONS)
            ]);

            debug('API responses:', {
                weather: weatherResponse.status,
                airQuality: airQualityResponse.status
            });

            if (!weatherResponse.ok) {
                throw new Error(`Weather data not available: ${weatherResponse.status}`);
            }

            const [weatherData, airQualityData] = await Promise.all([
                weatherResponse.json(),
                airQualityResponse.json()
            ]);

            debug('API data:', { weatherData, airQualityData });

            // Format the data
            const result = {
                current: {
                    temperature_2m: weatherData.current.temperature_2m,
                    apparent_temperature: weatherData.current.apparent_temperature,
                    precipitation: weatherData.current.precipitation,
                    weather_code: weatherData.current.weather_code,
                    wind_speed_10m: weatherData.current.wind_speed_10m,
                    wind_direction_10m: weatherData.current.wind_direction_10m,
                    wind_gusts_10m: weatherData.current.wind_gusts_10m,
                    relative_humidity_2m: weatherData.current.relative_humidity_2m,
                    uv_index: weatherData.daily.uv_index_max[0],
                    visibility: weatherData.hourly.visibility[0] / 1000, // Convert to km
                },
                hourly: {
                    time: weatherData.hourly.time.map(t => new Date(t).getTime()),
                    temperature_2m: weatherData.hourly.temperature_2m,
                    precipitation_probability: weatherData.hourly.precipitation_probability,
                    precipitation: weatherData.hourly.precipitation,
                    weather_code: weatherData.hourly.weather_code,
                    wind_speed_10m: weatherData.hourly.wind_speed_10m,
                    wind_direction_10m: weatherData.hourly.wind_direction_10m,
                    wind_gusts_10m: weatherData.hourly.wind_gusts_10m,
                    uv_index: weatherData.hourly.uv_index,
                    visibility: weatherData.hourly.visibility.map(v => v / 1000)
                },
                air_quality: {
                    pm2_5: airQualityData.current.pm2_5,
                    pm10: airQualityData.current.pm10,
                    o3: airQualityData.current.ozone,
                    no2: airQualityData.current.nitrogen_dioxide,
                    so2: airQualityData.current.sulphur_dioxide,
                    co: airQualityData.current.carbon_monoxide,
                    us_epa_index: airQualityData.current.us_aqi
                },
                timezone: weatherData.timezone,
                location_name: locationName
            };

            debug('Final weather data:', result);
            return result;
        } catch (fetchError) {
            console.error('API fetch error:', fetchError);
            if (fetchError.name === 'TypeError' && fetchError.message.includes('Failed to fetch')) {
                throw new Error('Unable to connect to weather service. Please check your internet connection and try again.');
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Weather data error:', error);
        throw error;
    }
}

export async function getCoordinates(location) {
    try {
        console.log('Getting coordinates for location:', location);
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=5&language=en&format=json`;
        console.log('Geocoding API URL:', url);

        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Geocoding API error:', errorText);
                throw new Error(`Geocoding request failed: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('Geocoding API response:', data);

            if (!data.results || !data.results.length) {
                throw new Error(`Location "${location}" not found. Please try a different location.`);
            }
            
            const result = {
                latitude: data.results[0].latitude,
                longitude: data.results[0].longitude,
                name: data.results[0].name
            };
            
            console.log('Geocoding result:', result);
            return result;
        } catch (fetchError) {
            console.error('Geocoding fetch error:', fetchError);
            if (fetchError.name === 'TypeError' && fetchError.message.includes('Failed to fetch')) {
                throw new Error('Unable to connect to location service. Please check your internet connection and try again.');
            }
            throw fetchError;
        }
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
        debug('Getting current location...');
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });

        const { latitude, longitude } = position.coords;
        debug('Got coordinates:', { latitude, longitude });

        // Use Open-Meteo Reverse Geocoding
        try {
            const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}`;
            debug('Reverse geocoding URL:', url);
            
            const response = await fetch(url, API_OPTIONS);
            debug('Reverse geocoding response status:', response.status);
            
            if (!response.ok) {
                throw new Error('Reverse geocoding failed');
            }
            
            const data = await response.json();
            debug('Reverse geocoding response:', data);

            if (!data.results || !data.results.length) {
                throw new Error('No results from reverse geocoding');
            }

            return {
                latitude,
                longitude,
                name: data.results[0].name || 'Current Location'
            };
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            // Fall back to coordinates if reverse geocoding fails
            return {
                latitude,
                longitude,
                name: 'Current Location'
            };
        }
    } catch (error) {
        console.error('Geolocation error:', error);
        throw new Error('Unable to get your location. Please check your browser settings and try again.');
    }
} 