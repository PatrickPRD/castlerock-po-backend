const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || !['super_admin', 'admin'].includes(role)) {
  location.href = 'dashboard.html';
}

const table = document.getElementById('labourTable');
const siteFilter = document.getElementById('siteFilter');

let allData = [];

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = v => (window.formatMoney ? window.formatMoney(v) : `€${num(v).toFixed(2)}`);

async function loadSites() {
  try {
    const res = await fetch('/sites', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const sites = await res.json();

    siteFilter.innerHTML = '<option value="">All Sites</option>';
    sites.forEach(site => {
      const opt = document.createElement('option');
      opt.value = site.id;
      opt.textContent = site.name;
      siteFilter.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load sites:', err);
  }
}

async function loadReport() {
  const siteId = siteFilter.value;
  const url = siteId
    ? `/reports/labour-costs?siteId=${encodeURIComponent(siteId)}`
    : '/reports/labour-costs';

  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    showToast('Failed to load labour costs', 'error');
    return;
  }

  allData = await res.json();
  renderReport();
}

function renderReport() {
  table.innerHTML = '';

  if (!allData.length) {
    table.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; padding: 2rem; color: #9ca3af;">
          No labour costs found
        </td>
      </tr>
    `;
    return;
  }

  allData.forEach(row => {
    table.innerHTML += `
      <tr>
        <td>${row.site}</td>
        <td>${row.location}</td>
        <td>${money(row.labour_cost)}</td>
      </tr>
    `;
  });
}

siteFilter.addEventListener('change', loadReport);

(async () => {
  if (window.loadCurrencySettings) {
    try {
      await window.loadCurrencySettings();
    } catch (_) {}
  }
  await loadSites();
  await loadReport();
})();
