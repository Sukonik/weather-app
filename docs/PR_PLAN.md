# ClearSky — PR Plan

**North star:** the go-to coastal conditions weather app — DarkSky-style visual, hour-by-hour clarity, wind + UV + AQI + pollen + tides in one clean, glanceable view. Free web app → installable wrapper → paid-tier native iOS app.

This plan breaks the work into small, reviewable PRs. Each PR should be independently shippable and deployable via GitHub Pages.

---

## PR 1 — Design System Overhaul (DarkSky-inspired)
**Status: in progress**

- [x] Design tokens: spacing, radius, elevation, and type scale as CSS custom properties, shared across all themes
- [x] Two new themes (Sunset, Coffee) added alongside Dark, Light, Ocean, Jungle
- [x] Big, bold hero temperature (`clamp(3.5rem, 16vw, 6.5rem)`), minimal chrome
- [x] Subtle animated gradient background per theme (slow ambient drift, respects `prefers-reduced-motion`)
- [x] Mobile-first top-bar fix: theme selector, clock, and unit toggles now wrap/stack cleanly instead of overlapping at narrow widths
- [x] Safe-area insets (`env(safe-area-inset-*)`) for notch/home-indicator devices
- [ ] Full audit pass of card component consistency (Wind / UV / AQI / Pollen / Tides use one shared visual language) — carries into PR 3/4/6
- [ ] Docs: README, FAQ, PR plan (shipped in the prior PR)

**Scope:** `styles.css`, `index.html`

---

## PR 2 — Hour-by-Hour Timeline (core UX pillar)
**Scope:** `index.html`, `styles.css`, `js/modules/visualization.js`

- Horizontal scrollable timeline: temp curve, precipitation bars, condition icons in one strip
- Tap/drag scrub interaction to preview any hour's full detail (DarkSky's "scrubber" feel)
- Replace placeholder canvas charts with a proper charting approach (lightweight, e.g. Chart.js) for crisp curves and touch interaction
- Mobile-first: horizontal scroll with momentum, snap points per hour

---

## PR 3 — Wind Section Enhancement
**Scope:** `index.html`, `styles.css`, `js/modules/visualization.js`, `js/modules/weatherAPI.js`

- Dedicated wind card: speed, gusts, and compass direction with a rotating arrow icon
- Hourly wind line chart, unit-aware (mph/km/h)
- Light/Moderate/Strong legend wired to real thresholds, consistent with PR 1's design tokens

---

## PR 4 — Air Quality Enhancement
**Scope:** `index.html`, `styles.css`, `script.js`, `js/modules/weatherAPI.js`

- Fix "Unknown"/gap AQI data — verify correct Open-Meteo air-quality params per location/coordinate rounding
- Wire the existing pollutant copy (PM2.5/PM10/O₃/NO₂/SO₂/CO) into a proper **(i)** info modal, not raw page text
- Color-coded AQI bands (green → maroon) matching EPA conventions
- Dominant-pollutant callout (which pollutant is driving today's score)

---

## PR 5 — UV Index Enhancement
**Scope:** `index.html`, `styles.css`, `script.js`

- **(i)** info modal explaining the UV scale and safe-exposure guidance
- Daytime peak UV highlighted on the PR 2 hourly timeline

---

## PR 6 — Pollen & Allergens (new)
**Scope:** `js/modules/weatherAPI.js`, `index.html`, `styles.css`

- Integrate a pollen data source — Open-Meteo's pollen coverage is Europe-only, so evaluate **Google Pollen API** or **Ambee** for US coverage
- Tree/grass/weed pollen levels with a simple low/moderate/high indicator
- **(i)** explainer for allergy-sensitive users

---

## PR 7 — Coastal Conditions (signature feature)
**Scope:** `js/modules/weatherAPI.js`, `index.html`, `styles.css`, new visualization module

- Tide chart: high/low times + curve, via **NOAA Tides & Currents (CO-OPS) API** for US coastal stations
- Marine layer: wave height, water temperature, wind-driven rip current risk indicator
- Graceful fallback for inland locations ("Coastal data unavailable for this location")

---

## PR 8 — PWA / Installability
**Scope:** new `manifest.json`, service worker, app icons

- Web app manifest (name, icons, theme color, `display: standalone`)
- App icons/splash assets sized for iOS/Android home-screen install
- Service worker for app-shell caching (offline fallback, faster repeat loads, last-cached weather)
- "Add to Home Screen" tested end-to-end on iOS Safari and Android Chrome — this is the free daily-use wrapper app

---

## PR 9 — Custom Domain (optional, later)

- Add `CNAME` file, configure DNS at registrar (Namecheap/Cloudflare/Google Domains, ~$10–15/yr for the domain only)
- Verify HTTPS provisions correctly on GitHub Pages
- No paid hosting required — Pages stays free; Cloudflare Pages/Netlify/Vercel are fallback options if the project ever outgrows Pages

---

## PR 10 — Native iOS Wrapper

- Wrap the PWA with **Capacitor** → real `.ipa`
- App icon, launch screen, bundle ID, TestFlight build

---

## PR 11 — Premium Feature Tier (monetization)

- **Free tier** (permanent): everything through PR 8 — current conditions, hourly timeline, wind, UV, AQI, pollen, tides
- **Premium** ($5/mo or $25 one-time lifetime): hurricane tracking (NHC storm cone overlays), flood risk data, extended 15-day forecast, radar overlay, severe weather push alerts
- In-app purchase / subscription via StoreKit

---

## PR 12 — App Store Launch

- Store listing copy, screenshots per device size, privacy nutrition label (location-use disclosure)
- Submit for review, respond to feedback, iterate

---

## Suggested order

1. ✅ Docs foundation
2. 🚧 PR 1 — Design system overhaul (in progress)
3. PR 2 — Hour-by-hour timeline
4. PR 3 — Wind enhancement
5. PR 4 — Air quality enhancement
6. PR 5 — UV index enhancement
7. PR 6 — Pollen & allergens
8. PR 7 — Coastal conditions (tides)
9. PR 8 — PWA / installable app
10. PR 9 — Custom domain (optional)
11. PR 10 — Native iOS wrapper
12. PR 11 — Premium tier
13. PR 12 — App Store launch

## Hosting notes

- **Now:** GitHub Pages — free, already live at https://sukonik.github.io/weather-app/
- **If it outgrows Pages:** Cloudflare Pages, Netlify, or Vercel — all free tiers, all support a custom domain at no hosting cost
- **Domain only, whenever ready:** buy a domain (~$10–15/yr) and point it at GitHub Pages via `CNAME` — no paid hosting needed even then
