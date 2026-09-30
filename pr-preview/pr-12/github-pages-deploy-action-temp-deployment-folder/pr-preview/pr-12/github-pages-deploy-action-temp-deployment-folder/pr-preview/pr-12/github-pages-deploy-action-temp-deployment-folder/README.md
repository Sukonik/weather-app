# ClearSky Weather App ⛅

A modern, mobile-first weather app with real-time conditions, hourly forecasts, wind visualizations, and detailed air quality data — built with plain HTML, CSS, and JavaScript so it stays fast, dependency-light, and easy to eventually wrap as a native iOS app.

**Live app:** https://sukonik.github.io/weather-app/

---

## Features

- **Real-time weather data** from the [Open-Meteo](https://open-meteo.com/) API (no API key required)
- **Current conditions**: temperature, feels-like, high/low, dew point, pressure, cloud cover, humidity, precipitation (rain/showers/snow), UV index, visibility, sunrise/sunset — every field shows a polished "Data unavailable" state instead of a fake zero when a source doesn't have it
- **Seven views**: Overview, Tide Charts, Air Quality, Wind Data, Rain Data, UV Index, and Moon Phases, all sharing the same location, theme, and unit controls via a top-right nav menu
- **Location search**: worldwide city name **and** postal-code resolution (Open-Meteo Geocoding), with a disambiguation picker for ambiguous names (e.g. "Jamaica" the country vs. Jamaica, Queens), quick-pick buttons, "use my location," and the last location persisted locally
- **Tide charts**: authoritative NOAA CO-OPS predictions for US coastal locations (with automatic nearest-station fallback), Open-Meteo Marine modeled tides/waves/sea temperature elsewhere — clearly labeled official vs. modeled, with a "Coastal data unavailable" state inland
- **Moon phases** via the U.S. Naval Observatory API, with a labeled local astronomical fallback
- **Air quality (AQI)**: US + European AQI, full pollutant breakdown, hourly chart, and a built-in **ⓘ guide** explaining what each pollutant is, where it comes from, and why it matters
- **Wind**: current speed, gusts, compass direction with a rotating arrow, and a 24-hour chart with a light/moderate/strong legend
- **6 themes**: Dark, Light, Ocean, Jungle, Sunset, and Coffee, each with a subtle animated ambient gradient background
- **Unit toggles**: °C/°F and km/h/mph, consistent across every page
- **Responsive design** tuned for phones, tablets, and desktop, built to feel at home as an installed home-screen app
- **Reliable by design**: independent data sources fetched with `Promise.allSettled` so one down API degrades gracefully instead of blanking the page, request timeouts + retries, short-lived `localStorage` caching, and superseded-request cancellation when you change location quickly — see [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for the full 8-source registry and attribution

## Vision

The go-to coastal conditions weather app — a DarkSky-style visual, hour-by-hour clarity, with wind, UV, air quality, pollen, and tides in one clean, glanceable view. Free web app → installable home-screen wrapper → paid-tier native iOS app.

## Roadmap

- [x] Design system overhaul (design tokens, new themes, bold hero temperature, mobile-first top bar, safe-area insets) — see [PR plan](docs/PR_PLAN.md)
- [ ] Hour-by-hour scrubbable timeline
- [ ] Enhanced Wind section (gust callouts, compass direction indicator, richer hourly chart)
- [ ] Enhanced Air Quality section with pollutant "(i)" explainer (deeper detail, health guidance, EPA color bands)
- [ ] Enhanced UV Index section with "(i)" safe-exposure guidance
- [ ] Pollen & allergens
- [ ] Coastal conditions: tide charts (à la Ocean Watch), marine layer, rip current risk
- [ ] PWA support (installable web app, offline shell, app icons/splash screens)
- [ ] Custom domain (optional)
- [ ] iOS App Store wrapper (Capacitor/PWA-to-native shell)
- [ ] Premium tier (hurricanes, flood risk, extended forecast, radar, severe weather alerts)

Full phased breakdown: [docs/PR_PLAN.md](docs/PR_PLAN.md).

## Tech Stack

- HTML5 / CSS3 / vanilla JavaScript (ES modules)
- [Open-Meteo Weather API](https://open-meteo.com/en/docs) & [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- Font Awesome icons, Google Fonts (Inter)
- No build step, no framework — deployable directly via GitHub Pages

## Project Structure

```
weather-app/
├── index.html, tides.html, air-quality.html,   # One static HTML page per view;
│   wind.html, rain.html, uv.html, moon.html    # all mount <div id="app-chrome">
├── styles.css                                   # All styling, themes, responsive breakpoints
├── script.js                                    # Overview page controller
├── js/
│   ├── modules/
│   │   ├── chrome.js       # Shared header: logo, theme, units, location bar, nav menu
│   │   ├── location.js     # Open-Meteo geocoding, disambiguation, persistence
│   │   ├── weatherAPI.js   # Open-Meteo weather + air-quality fetch/parsing
│   │   ├── tideAPI.js      # NOAA CO-OPS + Open-Meteo Marine
│   │   ├── moonAPI.js      # USNO + local astronomical fallback
│   │   ├── fetchUtils.js   # Timeout/retry/cache/abort-group helpers
│   │   ├── visualization.js  # Canvas-based charts
│   │   └── utils.js        # Formatting, unit conversion, descriptions
│   └── pages/               # One controller per secondary page (tides.js, wind.js, ...)
├── scripts/verify-data-sources.mjs  # Real-network 6-location field-completeness check (CI)
└── docs/DATA_SOURCES.md    # Eight-source registry, licensing, reliability behavior
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

## Deployment & PR Previews

- **Production**: pushes to `main` auto-deploy to https://sukonik.github.io/weather-app/ via `.github/workflows/deploy-main.yml`
- **PR previews**: every open pull request gets its own live preview URL, auto-built by `.github/workflows/pr-preview.yml`:
  `https://sukonik.github.io/weather-app/pr-preview/pr-<NUMBER>/`
  The preview updates on every push to the PR branch and is torn down automatically when the PR closes.

One-time setup required in the GitHub UI (not doable from the repo alone): under **Settings → Pages**, set the Pages source to **"Deploy from a branch" → `gh-pages` → `/ (root)`**. Both workflows above publish to `gh-pages`; production lives at the branch root and each PR preview lives under `pr-preview/pr-<NUMBER>/`, so they coexist without clobbering each other.

## Data Source

Weather and air quality data are provided free of charge by [Open-Meteo](https://open-meteo.com/), which does not require an API key. See their [terms of use](https://open-meteo.com/en/terms) for attribution and usage limits.

## Contributing

This project is actively being enhanced. See [docs/PR_PLAN.md](docs/PR_PLAN.md) for the current roadmap and in-flight work, and [docs/FAQ.md](docs/FAQ.md) for common questions about the app and its data.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
