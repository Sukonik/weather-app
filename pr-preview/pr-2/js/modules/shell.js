// Shared chrome for every ClearSky page: theme, unit-button highlighting,
// nav menu, clock, and a read-only "currently showing" location badge.
// Full search + live weather data lives on the Overview page (index.html);
// these pages read the same localStorage keys so switching theme/units on
// any page is reflected everywhere.

const LAST_LOCATION_KEY = 'clearsky:lastLocation';

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === theme);
    });
}

function initShell() {
    const theme = localStorage.getItem('theme') || 'dark';
    setTheme(theme);

    const currentUnit = localStorage.getItem('unit') || 'C';
    const currentSpeedUnit = localStorage.getItem('speedUnit') || 'km/h';
    document.querySelectorAll('.unit-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.unit === currentUnit);
        btn.addEventListener('click', () => {
            localStorage.setItem('unit', btn.dataset.unit);
            document.querySelectorAll('.unit-btn').forEach(b => b.classList.toggle('active', b === btn));
        });
    });
    document.querySelectorAll('.speed-unit-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.speedUnit === currentSpeedUnit);
        btn.addEventListener('click', () => {
            localStorage.setItem('speedUnit', btn.dataset.speedUnit);
            document.querySelectorAll('.speed-unit-btn').forEach(b => b.classList.toggle('active', b === btn));
        });
    });

    const themeBtn = document.getElementById('theme-btn');
    const themeDropdown = document.querySelector('.theme-dropdown');
    if (themeBtn && themeDropdown) {
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            themeDropdown.classList.toggle('active');
        });
        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', () => {
                setTheme(opt.dataset.theme);
                themeDropdown.classList.remove('active');
            });
        });
    }

    const navBtn = document.getElementById('nav-btn');
    const navDropdown = document.getElementById('nav-dropdown');
    if (navBtn && navDropdown) {
        navBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = navDropdown.classList.toggle('active');
            navBtn.setAttribute('aria-expanded', String(isOpen));
        });
    }

    document.addEventListener('click', (e) => {
        if (themeDropdown && !e.target.closest('.theme-selector')) themeDropdown.classList.remove('active');
        if (navDropdown && !e.target.closest('.nav-menu')) navDropdown.classList.remove('active');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            themeDropdown?.classList.remove('active');
            navDropdown?.classList.remove('active');
        }
    });

    function updateClock() {
        const now = new Date();
        const timeEl = document.querySelector('.current-time');
        const dateEl = document.querySelector('.current-date');
        if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    updateClock();
    setInterval(updateClock, 1000);

    // Read-only "currently showing" badge, sourced from the last location
    // saved by the Overview page's search/quick-location/geolocation flow.
    const badge = document.getElementById('active-location-badge');
    if (badge) {
        try {
            const raw = localStorage.getItem(LAST_LOCATION_KEY);
            const loc = raw ? JSON.parse(raw) : null;
            if (loc?.name) {
                const bits = [loc.name];
                if (loc.admin1) bits.push(loc.admin1);
                if (loc.country) bits.push(loc.country);
                badge.innerHTML = `<i class="fas fa-location-dot"></i> ${bits.join(', ')} <a href="index.html">(change)</a>`;
            } else {
                badge.innerHTML = `<i class="fas fa-location-dot"></i> No location selected yet — <a href="index.html">choose one on Overview</a>`;
            }
        } catch {
            badge.innerHTML = `<a href="index.html">Choose a location on Overview</a>`;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShell);
} else {
    initShell();
}
