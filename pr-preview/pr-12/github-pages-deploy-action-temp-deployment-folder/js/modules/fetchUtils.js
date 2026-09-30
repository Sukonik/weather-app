// Shared network reliability helpers used by every data module.
// - fetchWithTimeout: aborts a request that hangs too long, retries transient failures
// - cacheGet/cacheSet: short-lived localStorage cache so repeat views/location
//   switches don't hammer free APIs
// - makeAbortGroup: cancels superseded in-flight requests when the user
//   changes location quickly

const DEFAULT_TIMEOUT_MS = 8000;
const CACHE_PREFIX = 'clearsky_cache_';

export async function fetchWithTimeout(url, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1, signal } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
        // Chain an external abort signal (e.g. from makeAbortGroup) if provided
        const onExternalAbort = () => controller.abort(signal?.reason || new Error('superseded'));
        if (signal) {
            if (signal.aborted) onExternalAbort();
            else signal.addEventListener('abort', onExternalAbort, { once: true });
        }
        try {
            const response = await fetch(url, { signal: controller.signal, mode: 'cors' });
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', onExternalAbort);
            if (!response.ok) {
                throw new Error(`Request failed: ${response.status} ${response.statusText}`);
            }
            return response;
        } catch (error) {
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', onExternalAbort);
            lastError = error;
            if (signal?.aborted) throw error; // don't retry a superseded request
            if (attempt === retries) break;
            await new Promise(r => setTimeout(r, 300 * (attempt + 1))); // small backoff
        }
    }
    throw lastError;
}

export async function fetchJSON(url, options) {
    const response = await fetchWithTimeout(url, options);
    return response.json();
}

/** Read a cached value if it exists and is younger than maxAgeMs. */
export function cacheGet(key, maxAgeMs) {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        const { t, v } = JSON.parse(raw);
        if (Date.now() - t > maxAgeMs) return null;
        return v;
    } catch {
        return null;
    }
}

export function cacheSet(key, value) {
    try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch {
        // localStorage full/unavailable — non-fatal, just skip caching
    }
}

/**
 * Returns a function that hands back a fresh AbortSignal each call, aborting
 * whichever signal it previously handed out. Use one group per "topic" (e.g.
 * per page) so switching location mid-flight cancels the stale request.
 */
export function makeAbortGroup() {
    let current = null;
    return function next() {
        if (current) current.abort(new Error('superseded by newer request'));
        current = new AbortController();
        return current.signal;
    };
}

/** Formats an ISO/epoch timestamp as a short local time string for "last updated" labels. */
export function formatUpdatedTime(value) {
    if (!value) return '--';
    const date = typeof value === 'number' ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
