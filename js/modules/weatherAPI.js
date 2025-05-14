export async function getWeatherData(latitude, longitude, locationName) {
    try {
        const [weatherResponse, airQualityResponse] = await Promise.all([
            fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility,precipitation_intensity,wind_speed_80m,wind_speed_120m&daily=precipitation_probability_max,precipitation_sum&timezone=auto`,
                { mode: 'cors' }
            ),
            fetch(
                `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,us_aqi,european_aqi_pm2_5,european_aqi_pm10,european_aqi_no2,european_aqi_o3,european_aqi_so2`,
                { mode: 'cors' }
            )
        ]);

        if (!weatherResponse.ok) {
            throw new Error('Weather data not available');
        }

        const [weatherData, airQualityData] = await Promise.all([
            weatherResponse.json(),
            airQualityResponse.ok ? airQualityResponse.json() : { current: {} }
        ]);

        if (!weatherData.current || !weatherData.hourly) {
            throw new Error('Invalid weather data format');
        }

        return {
            ...weatherData,
            air_quality: airQualityData,
            location_name: locationName
        };
    } catch (error) {
        console.error('Weather data error:', error);
        throw new Error('Unable to fetch weather data. Please try again.');
    }
}

export async function getCoordinates(location) {
    const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
        { mode: 'cors' }
    );
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
    if (!data.results || !data.results.length) {
        throw new Error('Location not found');
    }
    
    return {
        latitude: data.results[0].latitude,
        longitude: data.results[0].longitude,
        name: data.results[0].name
    };
}

export async function getCurrentLocation() {
    if (!navigator.geolocation) {
        throw new Error('Geolocation not supported');
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        });

        const { latitude, longitude } = position.coords;
        
        try {
            const response = await fetch(
                `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}`,
                { mode: 'cors' }
            );
            
            if (!response.ok) throw new Error('Reverse geocoding failed');
            
            const data = await response.json();
            return {
                latitude,
                longitude,
                name: data?.results?.[0]?.name || 'Current Location'
            };
        } catch (error) {
            return {
                latitude,
                longitude,
                name: 'Current Location'
            };
        }
    } catch (error) {
        throw new Error('Unable to get location');
    }
} 