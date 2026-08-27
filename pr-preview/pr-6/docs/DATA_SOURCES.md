# ClearSky — Data Sources Registry

Every data source ClearSky uses is **free, requires no API key, and needs no credit card**. This page documents what each one is responsible for, how it's called, and its attribution/licensing terms.

| # | Source | Responsibility | Auth | CORS |
|---|--------|-----------------|------|------|
| 1 | [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api) | Worldwide city name **and** postal-code resolution (search + disambiguation + reverse geocoding) | None | Yes (public, browser-callable) |
| 2 | [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | Global current/hourly/daily weather — temperature, wind, precipitation, UV, pressure, cloud cover, dew point, etc. | None | Yes |
| 3 | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | Global US AQI, European AQI, and pollutant (PM2.5, PM10, O₃, NO₂, SO₂, CO) forecasts | None | Yes |
| 4 | [Open-Meteo Marine API](https://open-meteo.com/en/docs/marine-weather-api) | Global waves, sea-surface temperature, ocean currents, and **modeled** sea-level height (used as a tide proxy outside US NOAA coverage) | None | Yes |
| 5 | [NOAA CO-OPS Data API](https://api.tidesandcurrents.noaa.gov/api/prod/) | **Authoritative** US tide predictions, observed water level, and water temperature | None | Yes (public NOAA API) |
| 6 | [NOAA CO-OPS Metadata API](https://api.tidesandcurrents.noaa.gov/mdapi/prod/) | US tide station discovery (list + per-station product capabilities), used to find the nearest valid station | None | Yes |
| 7 | [Environment and Climate Change Canada (ECCC) GeoMet](https://eccc-msc.github.io/open-data/msc-geomet/readme_en/) | Reserved for future Canadian validation/fallback data (marine/weather cross-check) | None | Public OGC API; documented here per the 8-source requirement, not yet wired into a page in this PR |
| 8 | [U.S. Naval Observatory (USNO) Astronomical Applications API](https://aa.usno.navy.mil/data/api) | Moon phase, illumination %, moonrise/moonset/transit, and upcoming primary phase dates | None | Yes (public API) |

NOAA is preferred wherever it provides authoritative US coastal data (source #5/#6); Open-Meteo remains the primary global source for everything else (sources #1–#4).

## Attribution

- **Open-Meteo** (sources 1–4): CC BY 4.0. Attribution: *"Weather data by Open-Meteo.com"*. No key, no rate-limit registration required for non-commercial use under their [terms](https://open-meteo.com/en/terms).
- **NOAA CO-OPS** (sources 5–6): US government public data, no license restriction. Attribution: *"Tide predictions and water level data courtesy of NOAA/NOS Center for Operational Oceanographic Products and Services (CO-OPS)"*.
- **ECCC GeoMet** (source 7): Government of Canada Open Data, [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada). Attribution: *"Contains information licensed under the Open Government Licence – Canada"*.
- **USNO** (source 8): US government public data, no license restriction. Attribution: *"Astronomical data courtesy of the U.S. Naval Observatory"*.

## Reliability behavior

- **Independent-source isolation**: weather and air-quality are fetched with `Promise.allSettled` (see `js/modules/weatherAPI.js`) — a down AQI API degrades that one card to "Data unavailable" instead of blanking the whole page.
- **Timeouts + retries**: every request goes through `js/modules/fetchUtils.js`'s `fetchWithTimeout` (8s timeout, 1 retry with backoff by default).
- **Caching**: successful responses are cached in `localStorage` for a few minutes (5 min for weather/wind/rain/UV, 10 min for air quality, 24h for the NOAA station list) to reduce redundant calls when revisiting a page or toggling units.
- **Abort-on-supersede**: `js/modules/fetchUtils.js`'s `makeAbortGroup()` cancels an in-flight request when the user changes location again before it resolves.
- **Never a fake zero**: every page distinguishes "value is legitimately 0" from "value is missing" — a missing field renders as "Data unavailable" text, not a `0`.
- **Modeled vs. official data is always labeled**: the Tides page marks Open-Meteo Marine results as *"modeled"* with an explicit non-navigational warning; NOAA results are labeled *"official predictions"*.

## Known coverage gaps

- **ECCC GeoMet** is documented but not yet called by any page — flagged here transparently rather than wired in shallowly. A future PR can use it to cross-validate Canadian coastal/weather data.
- **Open-Meteo Marine's modeled tide extrema** (high/low derived from the sea-level curve) are an approximation, not an official tide table — this is disclosed on the Tides page itself.
- **USNO moonrise/moonset** can be genuinely absent for certain latitude/date combinations (polar day/night) — the Moon page shows "Data unavailable" rather than a wrong time in that case.
