# ClearSky Weather App ⛅

A modern, mobile-first weather app with real-time conditions, hourly forecasts, wind visualizations, and detailed air quality data — built with plain HTML, CSS, and JavaScript so it stays fast, dependency-light, and easy to eventually wrap as a native iOS app.

**Live app:** https://sukonik.github.io/weather-app/

---

## Features

- **Real-time weather data** from the [Open-Meteo](https://open-meteo.com/) API (no API key required)
- **Current conditions**: temperature, feels-like, humidity, precipitation, UV index, visibility
- **Wind details**: current speed, gusts, direction, and an hourly wind chart with a light/moderate/strong legend
- **Air quality (AQI)**: US AQI score with a status label, pollutant breakdown, and a built-in **ⓘ guide** explaining what each pollutant is, where it comes from, and why it matters
- **Hourly precipitation & wind visualizations** with current-hour and next-8-hour views
- **Location search** with autocomplete suggestions, plus one-tap "use my location"
- **Multiple themes**: Dark, Light, Ocean, Jungle, and more
- **Unit toggles**: °C/°F and km/h/mph
- **Responsive design** tuned for phones, tablets, and desktop, built to feel at home as an installed home-screen app

## Roadmap

- [ ] Enhanced mobile-responsive redesign (in progress — see [PR plan](docs/PR_PLAN.md))
- [ ] Enhanced Wind section (gust callouts, compass direction indicator, richer hourly chart)
- [ ] Enhanced Air Quality section with pollutant "ⓘ" explainer (deeper detail, health guidance, source icons)
- [ ] PWA support (installable web app, offline shell, app icons/splash screens)
- [ ] Tide charts (à la Ocean Watch) — planned for a future PR
- [ ] iOS App Store wrapper (Capacitor/PWA-to-native shell)

## Tech Stack

- HTML5 / CSS3 / vanilla JavaScript (ES modules)
- [Open-Meteo Weather API](https://open-meteo.com/en/docs) & [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- Font Awesome icons, Google Fonts (Inter)
- No build step, no framework — deployable directly via GitHub Pages

## Project Structure

```
weather-app/
├── index.html          # App markup
├── styles.css           # All styling, themes, responsive breakpoints
├── script.js             # App entry point / event wiring
├── js/modules/
│   ├── weatherAPI.js     # Open-Meteo weather + air-quality fetch/parsing
│   ├── visualization.js  # Canvas-based charts (wind, precipitation)
│   └── utils.js          # Shared helpers (formatting, unit conversion, etc.)
└── css/
```

## Running Locally

This is a static site — no build tooling required.

```bash
git clone https://github.com/sukonik/weather-app.git
cd weather-app
# serve with any static server, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000
```

## Data Source

Weather and air quality data are provided free of charge by [Open-Meteo](https://open-meteo.com/), which does not require an API key. See their [terms of use](https://open-meteo.com/en/terms) for attribution and usage limits.

## Contributing

This project is actively being enhanced. See [docs/PR_PLAN.md](docs/PR_PLAN.md) for the current roadmap and in-flight work, and [docs/FAQ.md](docs/FAQ.md) for common questions about the app and its data.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
