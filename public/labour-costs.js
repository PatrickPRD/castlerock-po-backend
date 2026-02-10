const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || !['super_admin', 'admin'].includes(role)) {
  location.href = 'dashboard.html';
}

const table = document.getElementById('labourTable');
const siteFilter = document.getElementById('siteFilter');
const workerFilter = document.getElementById('workerFilter');
const locationFilter = document.getElementById('locationFilter');
const labourTotalEl = document.getElementById('labourTotal');
const labourDaysWorkedEl = document.getElementById('labourDaysWorked');
const labourStartDateEl = document.getElementById('labourStartDate');
const labourEndDateEl = document.getElementById('labourEndDate');

let allData = [];
let sortColumn = 'site';
let sortAscending = true;

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = v => (window.formatMoney ? window.formatMoney(v) : `€${num(v).toFixed(2)}`);
const formatDate = dateStr => {
  if (!dateStr) return '-';
  const safeDate = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(safeDate.getTime())) return '-';
  return safeDate.toLocaleDateString('en-IE', { year: 'numeric', month: 'short', day: 'numeric' });
};

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

async function loadWorkers() {
  if (!workerFilter) return;
  try {
    const res = await fetch('/reports/labour-costs/workers', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return;
    const workers = await res.json();
    workerFilter.innerHTML = '<option value="">All Workers</option>';
    workers.forEach(worker => {
      const opt = document.createElement('option');
      opt.value = worker.id;
      opt.textContent = worker.name;
      workerFilter.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load workers:', err);
  }
}

async function loadReport() {
  const siteId = siteFilter.value;
  const workerId = workerFilter ? workerFilter.value : '';
  const params = new URLSearchParams();
  if (siteId) params.set('siteId', siteId);
  if (workerId) params.set('workerId', workerId);
  const query = params.toString();
  const url = query ? `/reports/labour-costs?${query}` : '/reports/labour-costs';

  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    showToast('Failed to load labour costs', 'error');
    return;
  }

  allData = await res.json();
  sortTable(sortColumn, true);
}

function renderReport() {
  const locationId = locationFilter ? locationFilter.value : '';
  table.innerHTML = '';

  const filtered = locationId
    ? allData.filter(row => String(row.location_id) === String(locationId))
    : allData;

  const totalLabour = filtered.reduce((sum, row) => sum + num(row.labour_cost), 0);
  const totalDaysWorked = filtered.reduce((sum, row) => sum + num(row.days_worked), 0);
  const startDates = filtered.map(row => row.start_date).filter(Boolean);
  const endDates = filtered.map(row => row.end_date).filter(Boolean);
  const startDate = startDates.length ? startDates.sort()[0] : null;
  const endDate = endDates.length ? endDates.sort().slice(-1)[0] : null;

  if (labourTotalEl) {
    labourTotalEl.textContent = money(totalLabour);
  }
  if (labourDaysWorkedEl) {
    labourDaysWorkedEl.textContent = String(totalDaysWorked);
  }
  if (labourStartDateEl) {
    labourStartDateEl.textContent = formatDate(startDate);
  }
  if (labourEndDateEl) {
    labourEndDateEl.textContent = formatDate(endDate);
  }

  if (!filtered.length) {
    table.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; padding: 2rem; color: #9ca3af;">
          No labour costs found
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(row => {
    table.innerHTML += `
      <tr>
        <td>${row.site}</td>
        <td>${row.location}</td>
        <td>${money(row.labour_cost)}</td>
      </tr>
    `;
  });
}

function updateSortIndicators() {
  const headers = document.querySelectorAll('th.sortable');
  const columnMap = ['site', 'location', 'labour_cost'];

  headers.forEach((header, index) => {
    const indicator = header.querySelector('.sort-indicator');
    if (!indicator) return;
    if (columnMap[index] === sortColumn) {
      indicator.textContent = sortAscending ? ' ↑' : ' ↓';
      indicator.style.color = '#2563eb';
    } else {
      indicator.textContent = '';
      indicator.style.color = '#9ca3af';
    }
  });
}

function sortTable(column, keepDirection = false) {
  if (!keepDirection) {
    if (sortColumn === column) {
      sortAscending = !sortAscending;
    } else {
      sortColumn = column;
      sortAscending = true;
    }
  } else {
    sortColumn = column;
  }

  allData.sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];

    if (column === 'labour_cost') {
      aVal = num(aVal);
      bVal = num(bVal);
    } else {
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
    }

    if (sortAscending) {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    }
    return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
  });

  updateSortIndicators();
  renderReport();
}

window.sortTable = sortTable;

function toggleFilters() {
  const panel = document.getElementById('filterPanel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'grid' : 'none';
}

function clearFilters() {
  if (siteFilter) siteFilter.value = '';
  if (workerFilter) workerFilter.value = '';
  if (locationFilter) locationFilter.value = '';
  setLocationFilterEnabled(false);
  loadReport();
}

window.toggleFilters = toggleFilters;
window.clearFilters = clearFilters;

siteFilter.addEventListener('change', loadReport);
if (workerFilter) {
  workerFilter.addEventListener('change', loadReport);
}
if (locationFilter) {
  locationFilter.addEventListener('change', renderReport);
}

function setLocationFilterEnabled(enabled) {
  if (!locationFilter) return;
  locationFilter.disabled = !enabled;
}

siteFilter.addEventListener('change', () => {
  const hasSite = Boolean(siteFilter.value);
  if (!hasSite && locationFilter) {
    locationFilter.value = '';
  }
  setLocationFilterEnabled(hasSite);
  loadLocationsForSite(siteFilter.value);
});

async function loadLocationsForSite(siteId) {
  if (!locationFilter) return;
  if (!siteId) {
    locationFilter.innerHTML = '<option value="">Select a site first</option>';
    return;
  }

  try {
    const res = await fetch(`/locations?siteId=${encodeURIComponent(siteId)}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return;
    const locations = await res.json();
    locationFilter.innerHTML = '<option value="">All Locations</option>';
    locations.forEach(location => {
      const opt = document.createElement('option');
      opt.value = location.id;
      opt.textContent = location.name;
      locationFilter.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load locations:', err);
  }
}

(async () => {
  if (window.loadCurrencySettings) {
    try {
      await window.loadCurrencySettings();
    } catch (_) {}
  }
  await loadSites();
  await loadWorkers();
  setLocationFilterEnabled(Boolean(siteFilter.value));
  await loadLocationsForSite(siteFilter.value);
  await loadReport();
})();
