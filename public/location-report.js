const token = localStorage.getItem('token');
if (!token) location.href = 'login.html';

const table = document.getElementById('reportTable');
const showSpreadLocations = document.getElementById('showSpreadLocations');
const siteFilter = document.getElementById('siteFilter');
const locationFilter = document.getElementById('locationFilter');
const sortHeaders = document.querySelectorAll('th[data-sort]');
const loadingOverlay = document.getElementById('reportLoading');

let allData = [];
let sortState = { key: 'site', dir: 'asc' };
const SORT_SPINNER_MIN_MS = 120;

/* =========================
   Helpers
   ========================= */
const num = v => isNaN(Number(v)) ? 0 : Number(v);
const euro = v => (window.formatMoney ? window.formatMoney(v) : `€${num(v).toFixed(2)}`);
const getCurrencySymbol = () => (window.getCurrencySymbol ? window.getCurrencySymbol() : '€');

/* =========================
   Load Report
   ========================= */
async function loadReport() {
  const showSpread = showSpreadLocations.checked ? '1' : '0';
  setLoading(true);
  try {
    const res = await fetch(`/reports/po-totals-by-location-breakdown?showSpread=${showSpread}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!res.ok) {
      showToast('Failed to load report', 'error');
      return;
    }

    allData = await res.json();
    updateLocationOptions();
    renderReport();
  } finally {
    setLoading(false);
  }
}

function renderReport() {
  const selectedSite = siteFilter.value;
  const selectedLocation = locationFilter.value;
  let data = selectedSite ? allData.filter(r => r.site === selectedSite) : allData;
  data = selectedLocation ? data.filter(r => r.location === selectedLocation) : data;

  data = sortData(data);
  
  table.innerHTML = '';

  data.forEach((r, index) => {
  const rowId = `loc-${index}`;

  // MAIN ROW
 table.innerHTML += `
  <tr class="main-row" data-target="${rowId}">
    <td>${r.site}</td>
    <td>
      ${r.location}
    </td>
    <td>${euro(r.totals.net + (r.totals.labour || 0))}</td>
    <td>${euro(r.totals.labour || 0)}</td>
  </tr>
`;


  // DETAILS ROW (STAGES)
  table.innerHTML += `
    <tr class="details-row" id="${rowId}">
      <td colspan="4">
        <table class="inner-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Net (${getCurrencySymbol()})</th>
              <th>Gross (${getCurrencySymbol()})</th>
            </tr>
          </thead>
          <tbody>
  ${
    r.stages.map(s => `
      <tr>
        <td>${s.stage}</td>
        <td>${euro(s.net)}</td>
        <td>${euro(s.gross)}</td>
      </tr>
    `).join('')
  }
</tbody>

        </table>
      </td>
    </tr>
  `;
});

}

function sortData(data) {
  const dir = sortState.dir === 'asc' ? 1 : -1;
  const sorted = [...data].sort((a, b) => {
    let result = 0;
    switch (sortState.key) {
      case 'location':
        result = String(a.location || '').localeCompare(String(b.location || ''), undefined, { sensitivity: 'base', numeric: true });
        break;
      case 'total': {
        const aTotal = num(a.totals.net) + num(a.totals.labour || 0);
        const bTotal = num(b.totals.net) + num(b.totals.labour || 0);
        result = aTotal - bTotal;
        break;
      }
      case 'labour':
        result = num(a.totals.labour || 0) - num(b.totals.labour || 0);
        break;
      case 'site':
      default:
        result = String(a.site || '').localeCompare(String(b.site || ''), undefined, { sensitivity: 'base' });
        break;
    }

    if (result === 0) {
      result = String(a.location || '').localeCompare(String(b.location || ''), undefined, { sensitivity: 'base', numeric: true });
    }
    return result * dir;
  });

  updateSortIndicators();
  return sorted;
}

function updateSortIndicators() {
  sortHeaders.forEach(th => {
    const indicator = th.querySelector('.sort-indicator');
    if (!indicator) return;
    if (th.dataset.sort === sortState.key) {
      indicator.textContent = sortState.dir === 'asc' ? '^' : 'v';
      th.classList.add('sorted');
    } else {
      indicator.textContent = '';
      th.classList.remove('sorted');
    }
  });
}

function updateLocationOptions() {
  const selectedSite = siteFilter.value;
  const currentLocation = locationFilter.value;
  const options = new Set();

  allData.forEach(r => {
    if (selectedSite && r.site !== selectedSite) return;
    if (r.location) options.add(r.location);
  });

  locationFilter.innerHTML = '<option value="">All Locations</option>';
  Array.from(options).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
    .forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      locationFilter.appendChild(opt);
    });

  if (currentLocation && options.has(currentLocation)) {
    locationFilter.value = currentLocation;
  }
}

function setLoading(isLoading) {
  if (!loadingOverlay) return;
  loadingOverlay.classList.toggle('active', isLoading);
  loadingOverlay.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
}

function runSortWithSpinner() {
  setLoading(true);
  setTimeout(() => {
    renderReport();
    setLoading(false);
  }, SORT_SPINNER_MIN_MS);
}

table.addEventListener('click', e => {
  const row = e.target.closest('.main-row');
  if (!row) return;

  const targetId = row.dataset.target;
  const details = document.getElementById(targetId);

  const isOpen = details.classList.contains('open');

  // close all
  document.querySelectorAll('.details-row').forEach(r => r.classList.remove('open'));
  document.querySelectorAll('.main-row').forEach(r => r.classList.remove('open'));

  // open selected
  if (!isOpen) {
    details.classList.add('open');
    row.classList.add('open');
  }
});






/* =========================
   Export
   ========================= */
async function exportExcel() {
  const showSpread = showSpreadLocations.checked ? '1' : '0';
  setLoading(true);
  try {
    const res = await fetch(
      `/reports/po-totals-by-location-breakdown.xlsx?showSpread=${showSpread}`,
      {
        headers: {
          Authorization: 'Bearer ' + token
        }
      }
    );

    if (!res.ok) {
      showToast('Failed to export report', 'error');
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'po-totals-by-location-breakdown.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  } finally {
    setLoading(false);
  }
}



/* =========================
   Navigation
   ========================= */
function back() {
  location.href = 'dashboard.html';
}

/* =========================
   Init
   ========================= */
showSpreadLocations.addEventListener('change', loadReport);
siteFilter.addEventListener('change', () => {
  updateLocationOptions();
  renderReport();
});
locationFilter.addEventListener('change', renderReport);
sortHeaders.forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (!key) return;
    if (sortState.key === key) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.key = key;
      sortState.dir = 'asc';
    }
    runSortWithSpinner();
  });
});

async function loadSites() {
  try {
    const res = await fetch('/sites', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const sites = await res.json();
    
    sites.forEach(site => {
      const opt = document.createElement('option');
      opt.value = site.name;
      opt.textContent = site.name;
      siteFilter.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load sites:', err);
  }
}

(async () => {
  if (window.loadCurrencySettings) {
    try {
      await window.loadCurrencySettings();
    } catch (_) {}
  }
  await loadSites();
  await loadReport();
})();
