(() => {
  if (window.__currencyHelperLoaded) return;
  window.__currencyHelperLoaded = true;

  const CURRENCY_SYMBOLS = {
    EUR: '€',
    GBP: '£',
    USD: '$'
  };

  let cached = null;
  let cachedAt = 0;
  const cacheMs = 5 * 60 * 1000;

  function normalizeCode(code) {
    return String(code || 'EUR').toUpperCase();
  }

  async function fetchCurrencySettings() {
    const token = localStorage.getItem('token');
    if (!token) {
      return { code: 'EUR', symbol: CURRENCY_SYMBOLS.EUR };
    }

    const res = await fetch('/settings/financial', {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!res.ok) {
      return { code: 'EUR', symbol: CURRENCY_SYMBOLS.EUR };
    }

    const data = await res.json();
    const code = normalizeCode(data.currency_code || 'EUR');
    return {
      code,
      symbol: CURRENCY_SYMBOLS[code] || code
    };
  }

  async function loadCurrencySettings() {
    const now = Date.now();
    if (cached && now - cachedAt < cacheMs) {
      return cached;
    }
    cached = await fetchCurrencySettings();
    cachedAt = now;
    return cached;
  }

  function formatMoney(value, code, symbol) {
    const number = Number(value);
    if (!Number.isFinite(number)) return `${symbol || '€'}0.00`;
    const currencyCode = normalizeCode(code || (cached && cached.code) || 'EUR');
    try {
      return new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(number);
    } catch (_) {
      const fallbackSymbol = symbol || (cached && cached.symbol) || '€';
      return `${fallbackSymbol}${number.toFixed(2)}`;
    }
  }

  window.loadCurrencySettings = loadCurrencySettings;
  window.getCurrencySymbol = () => (cached && cached.symbol) || '€';
  window.getCurrencyCode = () => (cached && cached.code) || 'EUR';
  window.clearCurrencyCache = () => {
    cached = null;
    cachedAt = 0;
  };
  window.formatMoney = (value) => {
    if (cached) {
      return formatMoney(value, cached.code, cached.symbol);
    }
    return formatMoney(value, 'EUR', CURRENCY_SYMBOLS.EUR);
  };

  async function applyCurrencySymbols() {
    try {
      const settings = await loadCurrencySettings();
      const symbol = settings.symbol || '€';
      document.querySelectorAll('[data-currency-symbol]').forEach(el => {
        el.textContent = symbol;
      });
    } catch (_) {}
  }

  window.applyCurrencySymbols = applyCurrencySymbols;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCurrencySymbols);
  } else {
    applyCurrencySymbols();
  }
})();
