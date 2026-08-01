# ClearSky — PR Plan

Goal: turn ClearSky into a super clean, best-in-class mobile-responsive weather app, with enhanced Wind and Air Quality sections, that's ready to be installed as a home-screen web app now and wrapped for the iOS App Store later.

This plan breaks the work into small, reviewable PRs. Each PR should be independently shippable and deployable via GitHub Pages.

---

## PR 1 — Docs foundation (this PR)
**Status: in progress**

- Rewrite `README.md`: clearer feature list, roadmap, tech stack, project structure, local dev instructions
- Add `docs/FAQ.md`: general, location, wind, air quality, themes, mobile/app-like use, contributing
- Add `docs/PR_PLAN.md` (this file)

No code changes. Sets shared context for the PRs below.

---

## PR 2 — Mobile-responsive foundation pass
**Scope:** `styles.css`, `index.html`

- Audit and rework layout using a mobile-first approach (base styles target small screens, `min-width` media queries scale up — currently the app is desktop-first with `max-width` overrides)
- Fix header/top-bar wrapping on narrow screens (theme dropdown, unit toggles, search row currently crowd together — visible in current screenshots)
- Standardize spacing scale, touch target sizes (min 44×44px per Apple HIG) for all buttons/icons
- Ensure the location search input, buttons, and suggestions dropdown behave well with the mobile keyboard open
- Test at common breakpoints: 375px (SE/mini), 390–430px (standard/Pro Max), 768px (tablet), 1024px+ (desktop)
- Add safe-area padding (`env(safe-area-inset-*)`) for notch/home-indicator devices, in prep for home-screen install

**Acceptance:** No horizontal scroll or overlapping elements at any breakpoint 320px–1440px; all interactive elements are easily tappable one-handed.

---

## PR 3 — Enhanced Wind section
**Scope:** `index.html`, `styles.css`, `js/modules/visualization.js`, `js/modules/weatherAPI.js`

- Add a compass-style direction indicator (rotating arrow/needle) alongside the numeric wind direction
- Surface **gusts** prominently (already fetched via `wind_gusts_10m`, not yet displayed) next to sustained speed
- Improve the hourly wind chart: clearer axis labels, tooltip/tap-to-inspect per hour, color-coded Light/Moderate/Strong bands matching the legend
- Polish the small "Wind" detail card and the large "Hourly Wind" card for mobile widths (stacked layout, larger touch targets on the hour navigation)

**Acceptance:** Wind card shows speed, gusts, and direction at a glance; hourly chart is legible and interactive on mobile.

---

## PR 4 — Enhanced Air Quality section
**Scope:** `index.html`, `styles.css`, `script.js`

- Expand the AQI card: current US AQI + color-coded status band (Good → Hazardous), matching EPA color conventions
- Enhance the **ⓘ Pollutant Guide** modal: add health-effect detail, "who's most affected" callouts (e.g. asthma, elderly, outdoor athletes), and source Open-Meteo's AQI scale reference
- Add a dominant-pollutant highlight (which pollutant is driving today's AQI)
- Make the modal itself fully mobile-friendly (currently a fixed-position modal — confirm scroll behavior and dismiss gestures on small screens)

**Acceptance:** Users can understand *what* the AQI number means and *why*, without leaving the app.

---

## PR 5 — Visual polish / "super clean" pass
**Scope:** `styles.css`, icons/assets

- Consistent card design system (radius, shadow, spacing) across all detail cards
- Refine theme palettes (Dark, Light, Ocean, Jungle, + review any new themes) for contrast/accessibility (WCAG AA)
- Loading and error states redesigned to match the new visual language
- Micro-interactions/transitions (theme switch, modal open/close, unit toggle) kept subtle and performant

---

## PR 6 — Installable web app (PWA groundwork)
**Scope:** new `manifest.json`, service worker, icons

- Add a web app manifest (name, icons, theme color, `display: standalone`)
- Add app icons/splash assets sized for iOS/Android home-screen install
- Basic service worker for app-shell caching (offline fallback, faster repeat loads)
- Verify "Add to Home Screen" produces a clean, chrome-less experience on iOS Safari and Android Chrome

**Acceptance:** Installing from the GitHub Pages link behaves like a lightweight native app (own icon, no browser UI, fast reload).

---

## PR 7 (future, separate from this plan) — Tide Charts
- New "Tides" section modeled after apps like Ocean Watch
- Requires a tide data source (e.g. NOAA CO-OPS API for US coastal stations) — needs research since Open-Meteo doesn't provide tide data
- New chart type (tide curve with high/low markers) alongside existing wind/precipitation visualizations
- Only relevant for coastal locations — needs a sensible fallback/hidden state for inland locations

---

## Later — iOS App Store packaging
- Once the PWA (PR 6) is solid, evaluate wrapping via Capacitor (or a thin WebView shell) to submit to the App Store
- Requires: Apple Developer account, app icons/screenshots at required sizes, privacy policy (location usage), App Store review prep
- Not started until the responsive redesign and PWA groundwork are complete

---

## Suggested order

1. ✅ Docs (this PR)
2. Mobile-responsive foundation
3. Enhanced Wind
4. Enhanced Air Quality
5. Visual polish
6. PWA / installable app
7. Tide charts (separate future initiative)
8. iOS App Store packaging (separate future initiative)
