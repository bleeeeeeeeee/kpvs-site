(function (global) {
    var CURRENCY_KEY = 'kpvs.currency';
    var RATES_KEY = 'kpvs.currency.rates.v1';
    var DEFAULT_BASE = 'BYN';
    var SUPPORTED = ['BYN', 'RUB', 'USD', 'EUR'];
    var TTL_MS = 12 * 60 * 60 * 1000; // 12h

    function now() { return Date.now ? Date.now() : new Date().getTime(); }

    function safeJsonParse(str) {
        try { return JSON.parse(str); } catch { return null; }
    }

    function getSelectedCurrency() {
        var c = '';
        try { c = (localStorage.getItem(CURRENCY_KEY) || '').toUpperCase(); } catch {}
        if (!SUPPORTED.includes(c)) c = DEFAULT_BASE;
        return c;
    }

    function setSelectedCurrency(cur) {
        var c = String(cur || '').toUpperCase();
        if (!SUPPORTED.includes(c)) c = DEFAULT_BASE;
        try { localStorage.setItem(CURRENCY_KEY, c); } catch {}
        try {
            global.dispatchEvent(new CustomEvent('kpvs:currency-change', { detail: { currency: c } }));
        } catch {}
        return c;
    }

    function loadCachedRates() {
        var raw = '';
        try { raw = localStorage.getItem(RATES_KEY) || ''; } catch {}
        if (!raw) return null;
        var obj = safeJsonParse(raw);
        if (!obj || obj.base !== DEFAULT_BASE || typeof obj.fetchedAt !== 'number' || !obj.rates) return null;
        return obj;
    }

    function saveCachedRates(payload) {
        try { localStorage.setItem(RATES_KEY, JSON.stringify(payload)); } catch {}
    }

    function isFresh(cached) {
        if (!cached) return false;
        return (now() - cached.fetchedAt) < TTL_MS;
    }

    // Free endpoint (no key). If it fails, we keep cached.
    // Docs/behavior can change; we store last good payload for offline fallback.
    function fetchRatesFromNetwork() {
        var url = 'https://open.er-api.com/v6/latest/' + encodeURIComponent(DEFAULT_BASE);
        return fetch(url, { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (!data || data.result !== 'success' || !data.rates) return null;
                var rates = {};
                SUPPORTED.forEach(function (c) {
                    if (c === DEFAULT_BASE) rates[c] = 1;
                    else if (typeof data.rates[c] === 'number') rates[c] = data.rates[c];
                });
                if (!rates[DEFAULT_BASE]) rates[DEFAULT_BASE] = 1;
                var payload = {
                    base: DEFAULT_BASE,
                    fetchedAt: now(),
                    source: 'open.er-api.com',
                    rates: rates
                };
                saveCachedRates(payload);
                return payload;
            })
            .catch(function () { return null; });
    }

    var inFlight = null;
    function ensureRates(opts) {
        opts = opts || {};
        var cached = loadCachedRates();
        if (!opts.force && isFresh(cached)) return Promise.resolve(cached);
        if (inFlight) return inFlight;
        inFlight = fetchRatesFromNetwork().then(function (r) {
            inFlight = null;
            return r || cached;
        });
        return inFlight;
    }

    function convert(amountBYN, target, ratesPayload) {
        var amt = Number(amountBYN);
        if (!isFinite(amt)) return null;
        var cur = String(target || '').toUpperCase();
        if (!SUPPORTED.includes(cur)) cur = DEFAULT_BASE;
        if (cur === DEFAULT_BASE) return amt;
        var p = ratesPayload || loadCachedRates();
        if (!p || !p.rates || typeof p.rates[cur] !== 'number') return null;
        return amt * p.rates[cur];
    }

    function format(amountBYN, target, opts) {
        opts = opts || {};
        var cur = String(target || getSelectedCurrency()).toUpperCase();
        if (!SUPPORTED.includes(cur)) cur = DEFAULT_BASE;
        var converted = convert(amountBYN, cur, opts.rates);
        if (converted === null) {
            // fallback: show base
            cur = DEFAULT_BASE;
            converted = Number(amountBYN);
            if (!isFinite(converted)) return '';
        }
        var locale = opts.locale || (document.documentElement.getAttribute('lang') || 'ru');
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: cur,
                maximumFractionDigits: cur === 'BYN' || cur === 'RUB' ? 2 : 2
            }).format(converted);
        } catch {
            return String(converted.toFixed(2)) + ' ' + cur;
        }
    }

    global.KpvsCurrency = {
        supported: SUPPORTED.slice(),
        getSelectedCurrency: getSelectedCurrency,
        setSelectedCurrency: setSelectedCurrency,
        ensureRates: ensureRates,
        loadCachedRates: loadCachedRates,
        convertFromBYN: function (amountBYN, target, rates) { return convert(amountBYN, target, rates); },
        formatFromBYN: function (amountBYN, target, opts) { return format(amountBYN, target, opts); }
    };
})(typeof window !== 'undefined' ? window : this);

