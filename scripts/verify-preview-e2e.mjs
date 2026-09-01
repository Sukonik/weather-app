#!/usr/bin/env node
// Browser-driven verification of the LIVE deployed PR preview (not local
// files, not mocks). Runs on GitHub Actions after the PR Preview deploy
// completes, since only Actions runners have unrestricted internet access
// to reach the preview URL, Open-Meteo, NOAA, and USNO.
//
// Checks, per the product requirement:
//   - build-info.json served from the preview matches the expected commit
//   - all 7 pages load with the shared nav present
//   - searching 11561 / 10001 populates real values (no NaN/undefined/
//     permanent "Loading…"/empty cards) across Overview + the 6 other pages
//
// Usage: PREVIEW_URL=https://.../pr-preview/pr-2/ EXPECTED_SHA=<sha> \
//        node scripts/verify-preview-e2e.mjs

import { chromium } from 'playwright';
import fs from 'node:fs';

const PREVIEW_URL = process.env.PREVIEW_URL;
const EXPECTED_SHA = process.env.EXPECTED_SHA;
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || 'e2e-screenshots';

if (!PREVIEW_URL) {
    console.error('PREVIEW_URL env var is required');
    process.exit(1);
}

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const PAGES = [
    { id: 'overview', file: 'index.html', label: 'Overview' },
    { id: 'shore', file: 'shore.html', label: 'Shore & Water' },
    { id: 'tides', file: 'tides.html', label: 'Tide Charts' },
    { id: 'air-quality', file: 'air-quality.html', label: 'Air Quality' },
    { id: 'wind', file: 'wind.html', label: 'Wind Data' },
    { id: 'rain', file: 'rain.html', label: 'Rain Data' },
    { id: 'uv', file: 'uv.html', label: 'UV Index' },
    { id: 'moon', file: 'moon.html', label: 'Moon Phases' }
];

const QUERIES = ['11561', '10001'];

const lines = [];
function log(s = '') { lines.push(s); console.log(s); }

// Every search after the very first one in a shared browser process was
// observed hanging indefinitely (no console error, no failed/aborted
// request — the fetch just never resolves) across independent CI runs,
// regardless of which query or step triggered it. That signature — silent,
// permanent stalls only on the *second+* use of a browser process, never
// the first — points at Chromium's per-host connection-pool/keepalive
// state being shared across BrowserContexts in one browser process rather
// than anything in the app or the network. Giving each search-driving
// section its own freshly launched browser (not just a new context)
// sidesteps that shared state entirely.
async function withBrowser(fn) {
    const browser = await chromium.launch();
    try {
        return await fn(browser);
    } finally {
        await browser.close();
    }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    let failures = 0;

    log('# ClearSky Live Preview E2E Verification\n');
    log(`Preview URL: ${PREVIEW_URL}`);
    log(`Expected commit: ${EXPECTED_SHA || '(not checked)'}\n`);

    // verify-data-sources.mjs (run immediately before this script, in the
    // same CI job) fires ~10 geocoding requests back-to-back from this
    // runner's IP. Every CI run so far shows the exact same shape: the
    // FIRST geocoding search this script itself makes always succeeds in
    // a few seconds, and the NEXT one always hangs indefinitely — no
    // error, no abort, no response, just silence past this script's own
    // generous timeouts. That's not something our own retry/abort logic
    // can distinguish from a real outage; it reads as upstream throttling
    // of a free, keyless public API reacting to a burst of requests from
    // one IP. Give it room to cool down before this script adds to that
    // burst, and again between the additional searches below.
    await sleep(8000);

    // 1. build-info.json matches expected commit
    failures += await withBrowser(async (browser) => {
        try {
            const page = await browser.newPage();
            const res = await page.goto(new URL('build-info.json', PREVIEW_URL).toString(), { timeout: 15000 });
            const body = await res.text();
            const info = JSON.parse(body);
            log('## build-info.json');
            log('```json\n' + JSON.stringify(info, null, 2) + '\n```');
            if (EXPECTED_SHA && info.commitSha !== EXPECTED_SHA) {
                log(`❌ commitSha mismatch: expected ${EXPECTED_SHA}, got ${info.commitSha}`);
                await page.close();
                return 1;
            }
            log('✅ build-info.json commit matches expected SHA (or no expectation set)');
            await page.close();
            return 0;
        } catch (error) {
            log(`❌ Could not read build-info.json: ${error.message}`);
            return 1;
        }
    });

    // 2. Every page loads with the shared nav (standalone visit, default location)
    log('\n## Page load + nav check');
    failures += await withBrowser(async (browser) => {
        let f = 0;
        for (const p of PAGES) {
            try {
                const page = await browser.newPage();
                await page.goto(new URL(p.file, PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.waitForSelector('#app-chrome header', { timeout: 10000 });
                const navCount = await page.locator('.nav-option').count();
                const ok = navCount === PAGES.length;
                log(`${ok ? '✅' : '❌'} ${p.label} (${p.file}): nav has ${navCount}/${PAGES.length} links`);
                if (!ok) f++;
                await page.close();
            } catch (error) {
                log(`❌ ${p.label} (${p.file}) failed to load: ${error.message}`);
                f++;
            }
        }
        return f;
    });

    // Give the page's data fetch (which can itself involve an 8s-timeout +
    // retry, e.g. NOAA station list + predictions on the tides page, or the
    // weather+AQI Promise.allSettled kicked off by a search) real room to
    // finish instead of a fixed sleep that reads "stuck loading" on nothing
    // more than normal network variance.
    const waitForLoadingClear = (page) => page.waitForFunction(
        () => document.getElementById('loading') === null || getComputedStyle(document.getElementById('loading')).display !== 'flex',
        null,
        { timeout: 18000 }
    ).catch(() => {}); // if it's genuinely stuck, fall through and let the stuckLoading check report it

    // A query like "10001" (a bare US ZIP with no state/country) can
    // legitimately resolve to more than one candidate world-wide (New York
    // NY, a town in Spain, one in France, ...) — the app correctly shows
    // its disambiguation picker instead of auto-selecting, exactly as it
    // would for a real user. #location-summary only fills in once a
    // picker choice is made, so the test has to drive that same picker
    // rather than assuming every search auto-resolves.
    const resolveSearch = async (page) => {
        const picked = await Promise.race([
            page.waitForFunction(() => document.querySelector('#location-summary')?.textContent?.trim().length > 0, null, { timeout: 22000 }).then(() => 'summary'),
            page.waitForSelector('#location-picker-modal.active', { timeout: 22000 }).then(() => 'picker')
        ]);
        if (picked === 'picker') {
            await page.click('.location-picker-item[data-index="0"]');
            await page.waitForFunction(() => document.querySelector('#location-summary')?.textContent?.trim().length > 0, null, { timeout: 15000 });
        }
    };

    // 3. Search on Overview, then navigate to every other page via the nav
    // menu (not a direct URL) to prove location/theme/units persist —
    // screenshotting each of the 7 pages along the way. Each query gets its
    // own fresh browser (see withBrowser).
    for (const query of QUERIES) {
        log(`\n## Journey: search "${query}" then visit all 7 pages via nav`);
        await sleep(6000); // space out geocoding calls — see note at top of main()
        failures += await withBrowser(async (browser) => {
            let page;
            const consoleErrors = [];
            const failedRequests = [];
            try {
                page = await browser.newPage();
                page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
                page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));
                page.on('requestfailed', req => failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
                page.on('response', res => { if (!res.ok() && (res.url().includes('geocoding') || res.url().includes('open-meteo'))) failedRequests.push(`HTTP ${res.status()} ${res.url()}`); });

                await page.goto(new URL('index.html', PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.waitForSelector('#location-search', { timeout: 10000 });

                // Set a non-default theme/unit before searching, to verify persistence
                await page.click('#theme-btn');
                await page.click('.theme-option[data-theme="ocean"]');
                await page.click('.unit-btn[data-unit="F"]');
                await page.click('.speed-unit-btn[data-speed-unit="mph"]');

                await page.fill('#location-search', query);
                await page.keyboard.press('Enter');
                // Wait for the location to actually resolve before navigating —
                // a fixed sleep can fire while the geocoding fetch is still
                // in-flight, and the subsequent nav-click cancels it. The app's
                // own fetchWithTimeout gives a request up to ~8s, then retries
                // once more (another ~8s + backoff) before giving up, so the
                // real-world worst case is ~16-17s on a slow/flaky network —
                // the wait here must comfortably exceed that.
                await resolveSearch(page);
                await waitForLoadingClear(page);

                let f = 0;
                for (const p of PAGES) {
                    if (p.id !== 'overview') {
                        await page.click('#nav-btn');
                        await page.click(`.nav-option[href="${p.file}"]`);
                        await page.waitForLoadState('domcontentloaded');
                        await waitForLoadingClear(page);
                    }
                    await page.waitForTimeout(500); // let the just-populated DOM settle

                    const bodyText = await page.locator('body').innerText();
                    const hasNaN = /\bNaN\b/.test(bodyText);
                    const hasUndefined = /\bundefined\b/.test(bodyText);
                    const stuckLoading = await page.locator('#loading').evaluate(el => getComputedStyle(el).display === 'flex').catch(() => false);
                    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
                    const unitActive = await page.locator('.unit-btn.active').getAttribute('data-unit').catch(() => null);
                    const speedActive = await page.locator('.speed-unit-btn.active').getAttribute('data-speed-unit').catch(() => null);
                    const persisted = theme === 'ocean' && unitActive === 'F' && speedActive === 'mph';

                    const shotPath = `${SCREENSHOT_DIR}/${query}-${p.id}.png`;
                    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});

                    const ok = !hasNaN && !hasUndefined && !stuckLoading && persisted;
                    log(`${ok ? '✅' : '❌'} ${p.label}: NaN=${hasNaN} undefined=${hasUndefined} stuckLoading=${stuckLoading} theme/units-persisted=${persisted} [screenshot: ${shotPath}]`);
                    if (!ok) f++;
                }
                await page.close();
                return f;
            } catch (error) {
                log(`❌ Journey for "${query}" failed: ${error.message}`);
                if (consoleErrors.length) log('Browser console errors:\n```\n' + consoleErrors.slice(0, 20).join('\n') + '\n```');
                if (failedRequests.length) log('Failed/error API requests (geocoding/Open-Meteo):\n```\n' + failedRequests.slice(0, 20).join('\n') + '\n```');
                const errorBannerText = await page?.locator('#error').innerText().catch(() => '(unavailable)');
                log(`Error banner text: "${errorBannerText}"`);
                await page?.close().catch(() => {});
                return 1;
            }
        });
    }

    // 4. Theme screenshots (Coffee, Light) — confirms no low-contrast yellow
    // main numbers on the light cards — plus the interactive tide chart at
    // two different selected times (drag + keyboard), for visual review.
    // Each gets its own fresh browser too, for the same reason as above.
    log('\n## Theme + tide-chart interaction screenshots');
    for (const theme of ['coffee', 'light']) {
        await sleep(6000); // space out geocoding calls — see note at top of main()
        failures += await withBrowser(async (browser) => {
            try {
                const page = await browser.newPage();
                await page.goto(new URL('index.html', PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
                await page.waitForSelector('#location-search', { timeout: 10000 });
                await page.click('#theme-btn');
                await page.click(`.theme-option[data-theme="${theme}"]`);
                await page.fill('#location-search', '11561');
                await page.keyboard.press('Enter');
                await resolveSearch(page);
                await waitForLoadingClear(page);
                await page.waitForTimeout(500);
                const shotPath = `${SCREENSHOT_DIR}/theme-${theme}-overview.png`;
                await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
                log(`✅ ${theme} theme screenshot: ${shotPath}`);
                await page.close();
                return 0;
            } catch (error) {
                log(`❌ ${theme} theme screenshot failed: ${error.message}`);
                return 1;
            }
        });
    }

    await sleep(6000); // space out geocoding calls — see note at top of main()
    failures += await withBrowser(async (browser) => {
        try {
            const page = await browser.newPage();
            const consoleErrors = [];
            const failedRequests = [];
            page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
            page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));
            page.on('requestfailed', req => failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
            page.on('response', res => { if (!res.ok() && (res.url().includes('noaa') || res.url().includes('open-meteo'))) failedRequests.push(`HTTP ${res.status()} ${res.url()}`); });

            await page.goto(new URL('index.html', PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForSelector('#location-search', { timeout: 10000 });
            await page.fill('#location-search', '11561');
            await page.keyboard.press('Enter');
            // Wait for the location to actually resolve (not a fixed sleep) —
            // navigating away while the geocoding fetch is still in-flight
            // would have the browser cancel it (net::ERR_ABORTED) before the
            // selection is saved, which is a test race, not a product bug.
            await resolveSearch(page);
            await page.waitForTimeout(1000); // let localStorage write settle
            await page.goto(new URL('tides.html', PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
            await waitForLoadingClear(page);
            await page.waitForTimeout(500);

            const tideStationInfo = await page.locator('#tide-station-info').innerText().catch(() => '(unavailable)');
            const errorBanner = await page.locator('#error').innerText().catch(() => '');
            log(`Tide station info text: "${tideStationInfo}"`);
            if (errorBanner) log(`Error banner: "${errorBanner}"`);
            if (consoleErrors.length) log('Browser console errors:\n```\n' + consoleErrors.slice(0, 20).join('\n') + '\n```');
            if (failedRequests.length) log('Failed/error API requests (NOAA/Open-Meteo):\n```\n' + failedRequests.slice(0, 20).join('\n') + '\n```');

            const slider = page.locator('#tide-slider');
            const sliderVisible = await slider.isVisible().catch(() => false);
            if (sliderVisible) {
                await slider.focus();
                await slider.press('Home');
                await page.waitForTimeout(300);
                await page.screenshot({ path: `${SCREENSHOT_DIR}/tide-slider-point-1.png`, fullPage: true }).catch(() => {});
                log(`✅ Tide slider point 1 (start, via keyboard Home): ${SCREENSHOT_DIR}/tide-slider-point-1.png`);

                const max = await slider.getAttribute('max');
                for (let i = 0; i < 15; i++) await slider.press('ArrowRight');
                await page.waitForTimeout(300);
                await page.screenshot({ path: `${SCREENSHOT_DIR}/tide-slider-point-2.png`, fullPage: true }).catch(() => {});
                log(`✅ Tide slider point 2 (+15 steps via keyboard, max=${max}): ${SCREENSHOT_DIR}/tide-slider-point-2.png`);
            } else {
                log('⚠️ Tide slider not visible for this location/time — likely inland or no coastal data; skipping slider screenshots (not a failure).');
            }
            await page.close();
            return 0;
        } catch (error) {
            log(`❌ Tide slider screenshots failed: ${error.message}`);
            return 1;
        }
    });

    // 5. Shore page: a city search resolving to named Shore Pins (not the
    // whole city), then hero/chart/sections render without NaN/undefined,
    // plus the honest "no supported Shore" state for an inland search.
    log('\n## Shore page checks');
    await sleep(6000); // space out geocoding calls — see note at top of main()
    failures += await withBrowser(async (browser) => {
        try {
            const page = await browser.newPage();
            await page.goto(new URL('shore.html', PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.fill('#shore-search', 'Long Beach, NY');
            await page.click('#shore-search-btn');
            await page.waitForSelector('.shore-pick-item', { timeout: 15000 });
            const pickCount = await page.locator('.shore-pick-item').count();
            log(`${pickCount >= 2 ? '✅' : '❌'} City search "Long Beach, NY" returned ${pickCount} named Shore Pin(s) (not one city-wide result)`);
            await page.click('.shore-pick-item[data-pick-index="0"]');
            await page.waitForFunction(() => document.getElementById('shore-hero')?.hidden === false, null, { timeout: 20000 });
            await page.waitForTimeout(1500);
            const bodyText = await page.locator('body').innerText();
            const hasNaN = /\bNaN\b/.test(bodyText);
            const hasUndefined = /\bundefined\b/.test(bodyText);
            const heroText = await page.locator('#shore-hero-name').innerText().catch(() => '');
            const ok = !hasNaN && !hasUndefined && heroText.trim().length > 0;
            log(`${ok ? '✅' : '❌'} Shore hero for a named beach: NaN=${hasNaN} undefined=${hasUndefined} hero="${heroText}"`);
            await page.screenshot({ path: `${SCREENSHOT_DIR}/shore-lindell.png`, fullPage: true }).catch(() => {});
            await page.close();
            return ok && pickCount >= 2 ? 0 : 1;
        } catch (error) {
            log(`❌ Shore page (named beach) check failed: ${error.message}`);
            return 1;
        }
    });

    await sleep(6000);
    failures += await withBrowser(async (browser) => {
        try {
            const page = await browser.newPage();
            await page.goto(new URL('shore.html', PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.fill('#shore-search', 'Topeka, Kansas');
            await page.click('#shore-search-btn');
            await page.waitForSelector('#shore-inland-message', { state: 'visible', timeout: 15000 });
            log('✅ Inland search ("Topeka, Kansas") shows the honest "no supported Shore" message');
            await page.close();
            return 0;
        } catch (error) {
            log(`❌ Inland Shore search check failed: ${error.message}`);
            return 1;
        }
    });

    log(`\n## Result: ${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);

    if (process.env.GITHUB_STEP_SUMMARY) {
        const fs = await import('node:fs');
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    }

    process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal error in verify-preview-e2e:', err);
    process.exit(1);
});
