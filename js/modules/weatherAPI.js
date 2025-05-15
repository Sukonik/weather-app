// API Keys (replace with your own)
const OPENWEATHER_API_KEY = 'YOUR_OPENWEATHER_API_KEY';
const WEATHERAPI_KEY = 'YOUR_WEATHERAPI_KEY';

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
        
        // OpenWeatherMap API calls
        const weatherUrl = `https://api.openweathermap.org/data/3.0/onecall?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_API_KEY}&units=metric&exclude=minutely`;
        const timeZoneUrl = `https://api.openweathermap.org/data/3.0/timezone?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_API_KEY}`;
        
        // WeatherAPI.com call for air quality
        const airQualityUrl = `https://api.weatherapi.com/v1/current.json?key=${WEATHERAPI_KEY}&q=${latitude},${longitude}&aqi=yes`;

        debug('Making API requests to:', { weatherUrl, timeZoneUrl, airQualityUrl });

        try {
            const [weatherResponse, timeZoneResponse, airQualityResponse] = await Promise.all([
                fetch(weatherUrl, API_OPTIONS),
                fetch(timeZoneUrl, API_OPTIONS),
                fetch(airQualityUrl, API_OPTIONS)
            ]);

            debug('API responses:', {
                weather: weatherResponse.status,
                timeZone: timeZoneResponse.status,
                airQuality: airQualityResponse.status
            });

            if (!weatherResponse.ok) {
                throw new Error(`Weather data not available: ${weatherResponse.status}`);
            }

            const [weatherData, timeZoneData, airQualityData] = await Promise.all([
                weatherResponse.json(),
                timeZoneResponse.json(),
                airQualityResponse.json()
            ]);

            debug('API data:', { weatherData, timeZoneData, airQualityData });

            // Format the data
            const result = {
                current: {
                    temperature_2m: weatherData.current.temp,
                    apparent_temperature: weatherData.current.feels_like,
                    precipitation: weatherData.current.rain ? weatherData.current.rain['1h'] : 0,
                    weather_code: weatherData.current.weather[0].id,
                    wind_speed_10m: weatherData.current.wind_speed,
                    wind_direction_10m: weatherData.current.wind_deg,
                    wind_gusts_10m: weatherData.current.wind_gust,
                    relative_humidity_2m: weatherData.current.humidity,
                    uv_index: weatherData.current.uvi,
                    visibility: weatherData.current.visibility / 1000, // Convert to km
                },
                hourly: {
                    time: weatherData.hourly.map(h => h.dt * 1000), // Convert to milliseconds
                    temperature_2m: weatherData.hourly.map(h => h.temp),
                    precipitation_probability: weatherData.hourly.map(h => h.pop * 100),
                    precipitation: weatherData.hourly.map(h => h.rain ? h.rain['1h'] : 0),
                    weather_code: weatherData.hourly.map(h => h.weather[0].id),
                    wind_speed_10m: weatherData.hourly.map(h => h.wind_speed),
                    wind_direction_10m: weatherData.hourly.map(h => h.wind_deg),
                    wind_gusts_10m: weatherData.hourly.map(h => h.wind_gust),
                    uv_index: weatherData.hourly.map(h => h.uvi),
                    visibility: weatherData.hourly.map(h => h.visibility / 1000)
                },
                air_quality: {
                    pm2_5: airQualityData.current.air_quality.pm2_5,
                    pm10: airQualityData.current.air_quality.pm10,
                    o3: airQualityData.current.air_quality.o3,
                    no2: airQualityData.current.air_quality.no2,
                    so2: airQualityData.current.air_quality.so2,
                    co: airQualityData.current.air_quality.co,
                    us_epa_index: airQualityData.current.air_quality['us-epa-index']
                },
                timezone: timeZoneData.timezone,
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
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
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

        // Default to coordinates if reverse geocoding fails
        const defaultResult = {
            latitude,
            longitude,
            name: 'Current Location'
        };
        
        try {
            const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}`;
            debug('Reverse geocoding URL:', url);
            
            const response = await fetch(url, API_OPTIONS);
            debug('Reverse geocoding response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Reverse geocoding error:', errorText);
                return defaultResult;
            }
            
            const data = await response.json();
            debug('Reverse geocoding response:', data);

            if (!data.results || !data.results.length) {
                return defaultResult;
            }

            const result = {
                latitude,
                longitude,
                name: data.results[0].name
            };
            
            debug('Final location data:', result);
            return result;
        } catch (error) {
            console.warn('Reverse geocoding failed, using fallback:', error);
            return defaultResult;
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