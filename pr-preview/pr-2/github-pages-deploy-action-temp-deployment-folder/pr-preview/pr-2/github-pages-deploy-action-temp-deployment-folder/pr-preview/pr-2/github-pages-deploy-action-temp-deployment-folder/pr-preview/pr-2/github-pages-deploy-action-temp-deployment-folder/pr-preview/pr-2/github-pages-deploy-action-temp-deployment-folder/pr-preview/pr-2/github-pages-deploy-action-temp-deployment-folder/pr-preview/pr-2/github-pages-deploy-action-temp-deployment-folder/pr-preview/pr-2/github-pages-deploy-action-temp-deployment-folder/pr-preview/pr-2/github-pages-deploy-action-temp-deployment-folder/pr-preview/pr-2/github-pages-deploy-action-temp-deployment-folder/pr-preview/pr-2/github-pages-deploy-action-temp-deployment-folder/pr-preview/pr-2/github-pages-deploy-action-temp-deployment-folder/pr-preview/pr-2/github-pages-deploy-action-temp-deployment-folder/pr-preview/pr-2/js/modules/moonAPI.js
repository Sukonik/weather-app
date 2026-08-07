// Moon phase / illumination / rise-set data.
// Primary source: U.S. Naval Observatory (USNO) Astronomical Applications API
// — free, no key required. Falls back to a local astronomical approximation
// (Conway's algorithm) when USNO is unreachable, clearly labeled as such.
import { fetchJSON } from './fetchUtils.js';

const USNO_ONEDAY_URL = 'https://aa.usno.navy.mil/api/rstt/oneday';
const USNO_PHASES_URL = 'https://aa.usno.navy.mil/api/moon/phases/date';

export async function getMoonData(latitude, longitude, date = new Date()) {
    const dateStr = date.toISOString().slice(0, 10);
    const tzOffsetHours = -date.getTimezoneOffset() / 60;

    try {
        const [oneDay, phases] = await Promise.all([
            fetchJSON(`${USNO_ONEDAY_URL}?date=${dateStr}&coords=${latitude.toFixed(4)},${longitude.toFixed(4)}&tz=${tzOffsetHours}`, { timeoutMs: 8000, retries: 1 }),
            fetchJSON(`${USNO_PHASES_URL}?date=${dateStr}&nump=4`, { timeoutMs: 8000, retries: 1 })
        ]);

        const moonData = oneDay?.properties?.data?.moondata || [];
        const rise = moonData.find(m => m.phen === 'Rise');
        const set = moonData.find(m => m.phen === 'Set');
        const transit = moonData.find(m => m.phen === 'Upper Transit');
        const curPhase = oneDay?.properties?.data?.curphase;
        const fracIllum = oneDay?.properties?.data?.fracillum;

        return {
            source: 'USNO',
            isModeled: false,
            phaseName: curPhase || null,
            illumination: fracIllum ? parseInt(fracIllum, 10) : null,
            moonrise: rise?.time || null,
            moonset: set?.time || null,
            transit: transit?.time || null,
            upcomingPhases: (phases?.phasedata || []).map(p => ({ phase: p.phase, date: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`, time: p.time }))
        };
    } catch (error) {
        console.warn('USNO API unavailable, using local astronomical fallback:', error);
        return { ...localMoonApproximation(date), source: 'Calculated locally (approximate)', isModeled: true };
    }
}

/**
 * Conway's approximate lunar phase algorithm — days since a known new moon,
 * modulo the synodic month (29.53059 days). Accurate to roughly ±1 day,
 * used ONLY when the USNO API is unreachable. Always labeled as modeled.
 */
function localMoonApproximation(date) {
    const synodicMonth = 29.53058867;
    const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14); // Jan 6, 2000 18:14 UTC
    const daysSince = (date.getTime() - knownNewMoon) / 86400000;
    const age = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
    const illumination = Math.round((1 - Math.cos((age / synodicMonth) * 2 * Math.PI)) / 2 * 100);

    let phaseName;
    if (age < 1.84566) phaseName = 'New Moon';
    else if (age < 5.53699) phaseName = 'Waxing Crescent';
    else if (age < 9.22831) phaseName = 'First Quarter';
    else if (age < 12.91963) phaseName = 'Waxing Gibbous';
    else if (age < 16.61096) phaseName = 'Full Moon';
    else if (age < 20.30228) phaseName = 'Waning Gibbous';
    else if (age < 23.99361) phaseName = 'Last Quarter';
    else if (age < 27.68493) phaseName = 'Waning Crescent';
    else phaseName = 'New Moon';

    // Estimate upcoming primary phase dates by stepping forward from age
    const targets = [
        { phase: 'New Moon', targetAge: synodicMonth },
        { phase: 'First Quarter', targetAge: synodicMonth * 0.25 },
        { phase: 'Full Moon', targetAge: synodicMonth * 0.5 },
        { phase: 'Last Quarter', targetAge: synodicMonth * 0.75 }
    ];
    const upcomingPhases = targets.map(({ phase, targetAge }) => {
        let delta = targetAge - age;
        if (delta <= 0) delta += synodicMonth;
        const d = new Date(date.getTime() + delta * 86400000);
        return { phase, date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
        phaseName,
        illumination,
        moonrise: null,
        moonset: null,
        transit: null,
        upcomingPhases
    };
}
