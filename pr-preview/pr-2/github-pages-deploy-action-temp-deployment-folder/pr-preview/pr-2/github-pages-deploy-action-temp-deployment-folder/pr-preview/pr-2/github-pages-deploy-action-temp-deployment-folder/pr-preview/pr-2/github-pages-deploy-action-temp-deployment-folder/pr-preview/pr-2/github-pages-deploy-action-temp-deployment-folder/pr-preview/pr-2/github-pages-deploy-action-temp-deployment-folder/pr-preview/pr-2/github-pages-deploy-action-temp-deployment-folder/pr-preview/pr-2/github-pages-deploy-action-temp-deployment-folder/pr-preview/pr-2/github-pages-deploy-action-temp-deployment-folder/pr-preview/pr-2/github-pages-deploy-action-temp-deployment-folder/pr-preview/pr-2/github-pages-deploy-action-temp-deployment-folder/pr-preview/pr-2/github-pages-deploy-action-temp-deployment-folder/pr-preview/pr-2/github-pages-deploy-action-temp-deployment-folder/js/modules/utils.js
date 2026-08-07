export function convertTemperature(temp, targetUnit) {
    if (targetUnit === 'F') {
        return (temp * 9/5) + 32;
    }
    return temp;
}

export function convertSpeed(speed, targetUnit) {
    if (targetUnit === 'mph') {
        return speed * 0.621371;
    }
    return speed;
}

export function formatSpeed(speed, unit) {
    return `${Math.round(convertSpeed(speed, unit))} ${unit}`;
}

export function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

export function getWeatherDescription(code) {
    // OpenWeatherMap weather codes
    const descriptions = {
        200: 'Thunderstorm with light rain',
        201: 'Thunderstorm with rain',
        202: 'Thunderstorm with heavy rain',
        210: 'Light thunderstorm',
        211: 'Thunderstorm',
        212: 'Heavy thunderstorm',
        221: 'Ragged thunderstorm',
        230: 'Thunderstorm with light drizzle',
        231: 'Thunderstorm with drizzle',
        232: 'Thunderstorm with heavy drizzle',
        300: 'Light drizzle',
        301: 'Drizzle',
        302: 'Heavy drizzle',
        310: 'Light drizzle rain',
        311: 'Drizzle rain',
        312: 'Heavy drizzle rain',
        313: 'Shower rain and drizzle',
        314: 'Heavy shower rain and drizzle',
        321: 'Shower drizzle',
        500: 'Light rain',
        501: 'Moderate rain',
        502: 'Heavy rain',
        503: 'Very heavy rain',
        504: 'Extreme rain',
        511: 'Freezing rain',
        520: 'Light shower rain',
        521: 'Shower rain',
        522: 'Heavy shower rain',
        531: 'Ragged shower rain',
        600: 'Light snow',
        601: 'Snow',
        602: 'Heavy snow',
        611: 'Sleet',
        612: 'Light shower sleet',
        613: 'Shower sleet',
        615: 'Light rain and snow',
        616: 'Rain and snow',
        620: 'Light shower snow',
        621: 'Shower snow',
        622: 'Heavy shower snow',
        701: 'Mist',
        711: 'Smoke',
        721: 'Haze',
        731: 'Sand/dust whirls',
        741: 'Fog',
        751: 'Sand',
        761: 'Dust',
        762: 'Volcanic ash',
        771: 'Squalls',
        781: 'Tornado',
        800: 'Clear sky',
        801: 'Few clouds',
        802: 'Scattered clouds',
        803: 'Broken clouds',
        804: 'Overcast clouds'
    };
    return descriptions[code] || 'Unknown';
}

export function getWeatherIcon(code) {
    // OpenWeatherMap weather codes
    if (code >= 200 && code < 300) return 'fa-bolt';
    if (code >= 300 && code < 400) return 'fa-cloud-rain';
    if (code >= 500 && code < 600) return 'fa-cloud-showers-heavy';
    if (code >= 600 && code < 700) return 'fa-snowflake';
    if (code >= 700 && code < 800) return 'fa-smog';
    if (code === 800) return 'fa-sun';
    if (code > 800 && code < 900) return 'fa-cloud';
    return 'fa-cloud';
}

export function getUVIndexDescription(uvi) {
    if (uvi <= 2) return { level: 'Low', description: 'No protection needed' };
    if (uvi <= 5) return { level: 'Moderate', description: 'Wear sunscreen' };
    if (uvi <= 7) return { level: 'High', description: 'Protection required' };
    if (uvi <= 10) return { level: 'Very High', description: 'Extra precautions needed' };
    return { level: 'Extreme', description: 'Avoid sun exposure' };
}

export function getAirQualityDescription(aqi) {
    const descriptions = {
        1: { level: 'Good', description: 'Air quality is satisfactory' },
        2: { level: 'Moderate', description: 'Air quality is acceptable' },
        3: { level: 'Unhealthy for Sensitive Groups', description: 'Members of sensitive groups may experience health effects' },
        4: { level: 'Unhealthy', description: 'Everyone may experience health effects' },
        5: { level: 'Very Unhealthy', description: 'Health alert: everyone may experience serious health effects' },
        6: { level: 'Hazardous', description: 'Health warning: everyone may experience more serious health effects' }
    };
    return descriptions[aqi] || { level: 'Unknown', description: 'No data available' };
}

export function getAirQualityImplication(aqi) {
    if (aqi <= 50) return 'Air quality is satisfactory, and air pollution poses little or no risk.';
    if (aqi <= 100) return 'Acceptable air quality, but some pollutants may affect very sensitive individuals.';
    if (aqi <= 150) return 'Members of sensitive groups may experience health effects.';
    if (aqi <= 200) return 'Everyone may begin to experience health effects.';
    if (aqi <= 300) return 'Health warnings of emergency conditions. Entire population affected.';
    return 'Health alert: everyone may experience serious health effects.';
}

export function getAirQualityColor(aqi) {
    if (aqi <= 50) return '#00e400';  // Green
    if (aqi <= 100) return '#ffff00';  // Yellow
    if (aqi <= 150) return '#ff7e00';  // Orange
    if (aqi <= 200) return '#ff0000';  // Red
    if (aqi <= 300) return '#8f3f97';  // Purple
    return '#7e0023';  // Maroon
}

export function getVisibilityDescription(visibility) {
    if (visibility >= 10) return { level: 'Excellent', description: 'Clear visibility' };
    if (visibility >= 5) return { level: 'Good', description: 'Good visibility' };
    if (visibility >= 2) return { level: 'Moderate', description: 'Reduced visibility' };
    if (visibility >= 1) return { level: 'Poor', description: 'Poor visibility' };
    return { level: 'Very Poor', description: 'Dangerous conditions' };
}

export function getPrecipitationIntensity(intensity) {
    if (intensity < 0.5) return 'Light';
    if (intensity < 2) return 'Moderate';
    if (intensity < 10) return 'Heavy';
    return 'Very Heavy';
} 