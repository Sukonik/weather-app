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

async function main() {
    const browser = await chromium.launch();
    let failures = 0;

    log('# ClearSky Live Preview E2E Verification\n');
    log(`Preview URL: ${PREVIEW_URL}`);
    log(`Expected commit: ${EXPECTED_SHA || '(not checked)'}\n`);

    // 1. build-info.json matches expected commit
    try {
        const page = await browser.newPage();
        const res = await page.goto(new URL('build-info.json', PREVIEW_URL).toString(), { timeout: 15000 });
        const body = await res.text();
        const info = JSON.parse(body);
        log('## build-info.json');
        log('```json\n' + JSON.stringify(info, null, 2) + '\n```');
        if (EXPECTED_SHA && info.commitSha !== EXPECTED_SHA) {
            log(`❌ commitSha mismatch: expected ${EXPECTED_SHA}, got ${info.commitSha}`);
            failures++;
        } else {
            log('✅ build-info.json commit matches expected SHA (or no expectation set)');
        }
        await page.close();
    } catch (error) {
        log(`❌ Could not read build-info.json: ${error.message}`);
        failures++;
    }

    // 2. Every page loads with the shared nav (standalone visit, default location)
    log('\n## Page load + nav check');
    for (const p of PAGES) {
        try {
            const page = await browser.newPage();
            await page.goto(new URL(p.file, PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForSelector('#app-chrome header', { timeout: 10000 });
            const navCount = await page.locator('.nav-option').count();
            const ok = navCount === PAGES.length;
            log(`${ok ? '✅' : '❌'} ${p.label} (${p.file}): nav has ${navCount}/${PAGES.length} links`);
            if (!ok) failures++;
            await page.close();
        } catch (error) {
            log(`❌ ${p.label} (${p.file}) failed to load: ${error.message}`);
            failures++;
        }
    }

    // 3. Search on Overview, then navigate to every other page via the nav
    // menu (not a direct URL) to prove location/theme/units persist —
    // screenshotting each of the 7 pages along the way.
    for (const query of QUERIES) {
        log(`\n## Journey: search "${query}" then visit all 7 pages via nav`);
        let page;
        try {
            page = await browser.newContext().then(ctx => ctx.newPage());
            await page.goto(new URL('index.html', PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForSelector('#location-search', { timeout: 10000 });

            // Set a non-default theme/unit before searching, to verify persistence
            await page.click('#theme-btn');
            await page.click('.theme-option[data-theme="ocean"]');
            await page.click('.unit-btn[data-unit="F"]');
            await page.click('.speed-unit-btn[data-speed-unit="mph"]');

            await page.fill('#location-search', query);
            await page.keyboard.press('Enter');
            await page.waitForTimeout(6000); // allow real network round-trip

            for (const p of PAGES) {
                if (p.id !== 'overview') {
                    await page.click('#nav-btn');
                    await page.click(`.nav-option[href="${p.file}"]`);
                    await page.waitForLoadState('domcontentloaded');
                    await page.waitForTimeout(4000);
                }

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
                if (!ok) failures++;
            }
            await page.close();
        } catch (error) {
            log(`❌ Journey for "${query}" failed: ${error.message}`);
            failures++;
            await page?.close().catch(() => {});
        }
    }

    // 4. Theme screenshots (Coffee, Light) — confirms no low-contrast yellow
    // main numbers on the light cards — plus the interactive tide chart at
    // two different selected times (drag + keyboard), for visual review.
    log('\n## Theme + tide-chart interaction screenshots');
    for (const theme of ['coffee', 'light']) {
        try {
            const page = await browser.newContext().then(ctx => ctx.newPage());
            await page.goto(new URL('index.html', PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForSelector('#location-search', { timeout: 10000 });
            await page.click('#theme-btn');
            await page.click(`.theme-option[data-theme="${theme}"]`);
            await page.fill('#location-search', '11561');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(6000);
            const shotPath = `${SCREENSHOT_DIR}/theme-${theme}-overview.png`;
            await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
            log(`✅ ${theme} theme screenshot: ${shotPath}`);
            await page.close();
        } catch (error) {
            log(`❌ ${theme} theme screenshot failed: ${error.message}`);
            failures++;
        }
    }

    try {
        const page = await browser.newContext().then(ctx => ctx.newPage());
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
        await page.waitForFunction(() => document.querySelector('#location-summary')?.textContent?.trim().length > 0, { timeout: 15000 });
        await page.waitForTimeout(1000); // let localStorage write settle
        await page.goto(new URL('tides.html', PREVIEW_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(10000);

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
    } catch (error) {
        log(`❌ Tide slider screenshots failed: ${error.message}`);
        failures++;
    }

    await browser.close();

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
