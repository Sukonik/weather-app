# ClearSky Weather App — FAQ

## General

**What is ClearSky?**
ClearSky is a lightweight, mobile-first weather app that shows current conditions, hourly forecasts, wind details, and air quality for any location — built with plain HTML/CSS/JS and powered by Open-Meteo.

**Do I need to create an account or enter an API key?**
No. ClearSky uses Open-Meteo's free, key-free weather and air quality APIs. Just open the app and search a location or share your current location.

**Where does the weather data come from?**
[Open-Meteo](https://open-meteo.com/), which blends multiple national weather models (NOAA, DWD, ECMWF, and others) into a single free API. Air quality data comes from Open-Meteo's dedicated [Air Quality API](https://open-meteo.com/en/docs/air-quality-api).

**How often does the data update?**
Data is fetched live each time you load the app, search a new location, or refresh. Open-Meteo's underlying models typically update hourly.

**Can I use ClearSky offline?**
Not yet — offline support (via a PWA app shell/cache) is on the [roadmap](../README.md#roadmap).

## Location & Search

**How do I search for a city?**
Type a city, ZIP/postal code, state, or country into the search bar — suggestions appear as you type. Tap a suggestion or the search icon to load that location's weather.

**Why does the app want my location?**
Tapping the location icon uses your device/browser's geolocation to show weather for exactly where you are. This is optional — you can always search manually instead. Location is only used to fetch weather; it isn't stored or sent anywhere besides the Open-Meteo API request.

**The app shows the wrong city for my ZIP code — why?**
Some ZIP/postal codes map to multiple nearby towns. Try searching by city name instead, or use "current location" for precision.

## Wind

**What do the wind numbers mean?**
- **Wind speed**: sustained wind at 10 m above ground.
- **Gusts**: short bursts of higher wind speed.
- **Direction**: the compass direction the wind is blowing *from*.

**What's the difference between the small wind card and the hourly chart?**
The compact detail card shows the current wind speed at a glance. The **Hourly Wind** card below it charts wind speed (and gusts, in the enhanced version) across the day, with a legend for Light / Moderate / Strong wind so you can quickly gauge conditions for outdoor plans.

**Can I switch between km/h and mph?**
Yes — use the unit toggle at the top of the app. It applies to all wind speed values across the app.

## Air Quality

**What does the AQI number mean?**
ClearSky shows the **US AQI** (Air Quality Index) scale, from 0 (best) to 500+ (hazardous). Lower is better. The status label (e.g., "Good", "Moderate", "Unhealthy") gives a plain-language read on the number.

**What's the ⓘ button on the Air Quality card for?**
Tap it to open the **Pollutant Guide** — a quick explainer of each pollutant that feeds into the AQI score: what it is, common sources, and typical health effects.

**Which pollutants does ClearSky track?**
- **PM2.5** — fine particles from combustion (vehicle exhaust, wildfire smoke)
- **PM10** — coarser particles like dust and pollen
- **Ozone (O₃)** — forms in sunlight, worse on hot/sunny days
- **NO₂** — traffic and power-plant emissions
- **SO₂** — industrial/fuel-burning emissions
- **CO** — incomplete combustion (vehicles, stoves, heaters)

**Why might the AQI feel "off" compared to what I see outside?**
AQI reflects modeled pollutant concentrations, which can differ from very local conditions (e.g., standing next to a highway or a wildfire plume). Treat it as a good general guide, not a hyper-local sensor reading.

## Themes & Display

**How many themes are there, and how do I change them?**
Tap the "Theme" button in the top bar to pick from Dark, Light, Ocean, Jungle, and other themes. Your choice is meant to persist across sessions.

**Can I switch between °C/°F and km/h/mph independently?**
Yes, temperature and wind speed units are toggled separately at the top of the app.

## Mobile & App-like Use

**Can I add ClearSky to my home screen?**
Yes — on iOS Safari, tap Share → "Add to Home Screen." On Android Chrome, tap the menu → "Install app" / "Add to Home Screen." Once PWA support lands, this will feel closer to a native install (own icon, splash screen, no browser chrome).

**Is there a native iOS App Store version?**
Not yet — that's the longer-term goal. The current focus is making the responsive web app excellent (and installable) first, then wrapping it for the App Store. See the [PR plan](PR_PLAN.md).

**Will there be tide charts?**
Yes, tide charts (similar to apps like Ocean Watch) are planned for a future PR, after the mobile-responsive and Wind/Air Quality enhancements ship.

## Contributing / Feedback

**I found a bug or have a feature request — what do I do?**
Open an issue on the [GitHub repo](https://github.com/sukonik/weather-app/issues) describing what happened (or what you'd like to see) and, if possible, your device/browser.
