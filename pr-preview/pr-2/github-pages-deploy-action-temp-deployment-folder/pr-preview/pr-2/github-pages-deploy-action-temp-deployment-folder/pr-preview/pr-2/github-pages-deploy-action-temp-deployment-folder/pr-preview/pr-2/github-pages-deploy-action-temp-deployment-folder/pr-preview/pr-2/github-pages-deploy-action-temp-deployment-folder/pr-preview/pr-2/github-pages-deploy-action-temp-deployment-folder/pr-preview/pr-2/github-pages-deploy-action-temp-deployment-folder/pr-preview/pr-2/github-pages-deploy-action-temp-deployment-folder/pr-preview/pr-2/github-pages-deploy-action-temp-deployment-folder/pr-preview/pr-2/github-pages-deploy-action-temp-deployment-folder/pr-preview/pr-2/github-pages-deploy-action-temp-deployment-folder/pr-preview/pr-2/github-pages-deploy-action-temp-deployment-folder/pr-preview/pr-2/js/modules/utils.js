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
    const descriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        71: 'Slight snow',
        73: 'Moderate snow',
        75: 'Heavy snow',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail'
    };
    return descriptions[code] || 'Unknown';
}

export function getWeatherIcon(code) {
    if (code === 0) return 'fa-sun';
    if (code === 1) return 'fa-sun';
    if (code === 2) return 'fa-cloud-sun';
    if (code === 3) return 'fa-cloud';
    if (code >= 45 && code <= 48) return 'fa-smog';
    if (code >= 51 && code <= 55) return 'fa-cloud-rain';
    if (code >= 61 && code <= 65) return 'fa-cloud-showers-heavy';
    if (code >= 71 && code <= 77) return 'fa-snowflake';
    if (code >= 80 && code <= 82) return 'fa-cloud-showers-heavy';
    if (code >= 85 && code <= 86) return 'fa-snowflake';
    if (code >= 95) return 'fa-bolt';
    return 'fa-cloud';
}

export function getUVIndexDescription(uvIndex) {
    if (uvIndex <= 2) return 'Low';
    if (uvIndex <= 5) return 'Moderate';
    if (uvIndex <= 7) return 'High';
    if (uvIndex <= 10) return 'Very High';
    return 'Extreme';
}

export function getAirQualityDescription(aqi) {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
}

export function getAirQualityImplication(aqi) {
    if (aqi <= 50) return 'Air quality is satisfactory, and air pollution poses little or no risk.';
    if (aqi <= 100) return 'Acceptable air quality, but some pollutants may affect very sensitive individuals.';
    if (aqi <= 150) return 'Members of sensitive groups may experience health effects.';
    if (aqi <= 200) return 'Everyone may begin to experience health effects.';
    if (aqi <= 300) return 'Health warnings of emergency conditions. Entire population affected.';
    return 'Health alert: everyone may experience serious health effects.';
}

/**
 * Semantic severity class (sev-1 = good … sev-6 = hazardous) instead of a
 * hardcoded hex color. The actual color for each stop is a per-theme CSS
 * token (see styles.css), so a "moderate" reading never renders as
 * low-contrast pure yellow on a light card like Coffee.
 */
export function getAQISeverityClass(aqi) {
    if (aqi <= 50) return 'sev-1';    // Good
    if (aqi <= 100) return 'sev-2';   // Moderate
    if (aqi <= 150) return 'sev-3';   // Unhealthy for Sensitive Groups
    if (aqi <= 200) return 'sev-4';   // Unhealthy
    if (aqi <= 300) return 'sev-5';   // Very Unhealthy
    return 'sev-6';                   // Hazardous
}

export function getVisibilityDescription(visibility) {
    const visibilityKm = visibility / 1000;
    if (visibilityKm >= 10) return 'Excellent';
    if (visibilityKm >= 5) return 'Good';
    if (visibilityKm >= 2) return 'Moderate';
    if (visibilityKm >= 1) return 'Poor';
    return 'Very Poor';
}

export function getPrecipitationIntensity(intensity) {
    if (intensity < 0.5) return 'Light';
    if (intensity < 2) return 'Moderate';
    if (intensity < 10) return 'Heavy';
    return 'Very Heavy';
}

export function getUVSeverityClass(uvIndex) {
    if (uvIndex <= 2) return 'sev-1';   // Low
    if (uvIndex <= 5) return 'sev-2';   // Moderate
    if (uvIndex <= 7) return 'sev-3';   // High
    if (uvIndex <= 10) return 'sev-5';  // Very High
    return 'sev-6';                     // Extreme
}

export function convertLength(value, targetUnit, fromUnit) {
    if (value == null || Number.isNaN(value)) return null;
    if (fromUnit === targetUnit) return value;
    // Canonical conversion via meters
    const meters = fromUnit === 'ft' ? value * 0.3048 : value;
    return targetUnit === 'ft' ? meters / 0.3048 : meters;
}

export function formatLength(value, targetUnit, fromUnit, decimals = 2) {
    const converted = convertLength(value, targetUnit, fromUnit);
    if (converted == null) return 'Data unavailable';
    return `${converted.toFixed(decimals)} ${targetUnit}`;
}

export function getCloudCoverDescription(pct) {
    if (pct <= 10) return 'Clear';
    if (pct <= 40) return 'Mostly Clear';
    if (pct <= 70) return 'Partly Cloudy';
    if (pct <= 90) return 'Mostly Cloudy';
    return 'Overcast';
}

/**
 * Formats a numeric value, or returns a polished "unavailable" label when
 * the value is null/undefined — used everywhere instead of letting a
 * missing reading silently render as 0.
 */
export function formatValueOrUnavailable(value, formatter, unavailableLabel = 'Data unavailable') {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return unavailableLabel;
    }
    return formatter(value);
}

export function convertPressure(hPa, targetUnit) {
    if (targetUnit === 'inHg') return hPa * 0.02953;
    return hPa; // hPa (== mb)
}

export function formatPressure(hPa, unit = 'hPa') {
    if (hPa === null || hPa === undefined) return 'Data unavailable';
    return unit === 'inHg' ? `${convertPressure(hPa, 'inHg').toFixed(2)} inHg` : `${Math.round(hPa)} hPa`;
}
