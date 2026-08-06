export async function getWeatherData(latitude, longitude, locationName) {
    try {
        console.log('Fetching weather data for:', { latitude, longitude, locationName });
        
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility,precipitation_intensity,wind_speed_80m,wind_speed_120m&daily=precipitation_probability_max,precipitation_sum&timezone=auto`;
        const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi,european_aqi_pm2_5,european_aqi_pm10,european_aqi_no2,european_aqi_o3,european_aqi_so2`;

        console.log('Making API requests to:', { weatherUrl, airQualityUrl });

        try {
            const [weatherResponse, airQualityResponse] = await Promise.all([
                fetch(weatherUrl),
                fetch(airQualityUrl)
            ]);

            if (!weatherResponse.ok) {
                const errorText = await weatherResponse.text();
                console.error('Weather API error response:', errorText);
                throw new Error(`Weather data not available: ${weatherResponse.status} ${weatherResponse.statusText}`);
            }

            const weatherData = await weatherResponse.json();
            console.log('Weather API response:', weatherData);

            let airQualityData = { current: {} };
            if (airQualityResponse.ok) {
                airQualityData = await airQualityResponse.json();
                console.log('Air Quality API response:', airQualityData);
            } else {
                console.warn('Air Quality API error:', airQualityResponse.status, airQualityResponse.statusText);
            }

            if (!weatherData.current || !weatherData.hourly) {
                console.error('Invalid weather data format:', weatherData);
                throw new Error('Invalid weather data format received from API');
            }

            const result = {
                ...weatherData,
                air_quality: airQualityData,
                location_name: locationName
            };

            console.log('Final weather data:', result);
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
        console.log('Getting current location...');
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        });

        const { latitude, longitude } = position.coords;
        console.log('Got coordinates:', { latitude, longitude });
        
        try {
            const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}`;
            console.log('Reverse geocoding URL:', url);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Reverse geocoding error:', errorText);
                throw new Error('Reverse geocoding failed');
            }
            
            const data = await response.json();
            console.log('Reverse geocoding response:', data);

            const result = {
                latitude,
                longitude,
                name: data?.results?.[0]?.name || 'Current Location'
            };
            
            console.log('Final location data:', result);
            return result;
        } catch (error) {
            console.warn('Reverse geocoding failed, using fallback:', error);
            return {
                latitude,
                longitude,
                name: 'Current Location'
            };
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