const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || !['super_admin', 'admin'].includes(role)) {
  location.href = 'dashboard.html';
}

const timesheetTable = document.getElementById('timesheetTable');
const weekNumberLabel = document.getElementById('weekNumberLabel');
const weekStartLabel = document.getElementById('weekStartLabel');
const weekEndLabel = document.getElementById('weekEndLabel');
const prevWeekBtn = document.getElementById('prevWeekBtn');
const nextWeekBtn = document.getElementById('nextWeekBtn');
const currentWeekBtn = document.getElementById('currentWeekBtn');
const saveWeekBtn = document.getElementById('saveWeekBtn');

let currentWeekStart = getWeekStart(new Date());
let workers = [];
let entries = [];
let sites = [];
const siteMap = new Map();
const locationCache = new Map();
let openDetailsRow = null;

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

function getWeekStart(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatRangeDate(date) {
  return date.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getWeekNumber(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

function formatDayLabel(date) {
  return date.toLocaleDateString('en-IE', { weekday: 'short', day: '2-digit', month: 'short' });
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }).map((_, idx) => {
    const date = addDays(weekStart, idx);
    return {
      date,
      dateString: toDateString(date),
      label: formatDayLabel(date)
    };
  });
}

async function loadSites() {
  if (sites.length > 0) return;
  const rows = await api('/sites');
  sites = Array.isArray(rows) ? rows : [];
  siteMap.clear();
  sites.forEach(site => {
    siteMap.set(Number(site.id), site.name);
  });
}

async function loadLocations(siteId) {
  const key = Number(siteId);
  if (locationCache.has(key)) {
    return locationCache.get(key);
  }
  const rows = await api(`/locations?siteId=${encodeURIComponent(key)}`);
  const locations = Array.isArray(rows) ? rows : [];
  locationCache.set(key, locations);
  return locations;
}

function getLocationName(siteId, locationId) {
  const locations = locationCache.get(Number(siteId));
  if (!locations) return null;
  const match = locations.find(loc => Number(loc.id) === Number(locationId));
  return match ? match.name : null;
}

function updateWeekLabels() {
  const weekEnd = addDays(currentWeekStart, 6);
  weekStartLabel.textContent = formatRangeDate(currentWeekStart);
  weekEndLabel.textContent = formatRangeDate(weekEnd);
  if (weekNumberLabel) {
    weekNumberLabel.textContent = String(getWeekNumber(currentWeekStart));
  }
}

function buildSiteOptions(selectedId) {
  const options = ['<option value="">Select site</option>'];
  sites.forEach(site => {
    const selected = Number(site.id) === Number(selectedId) ? 'selected' : '';
    options.push(`<option value="${site.id}" ${selected}>${site.name}</option>`);
  });
  return options.join('');
}

function buildLocationOptions(locations, selectedId) {
  const options = ['<option value="">Select location</option>'];
  locations.forEach(location => {
    const selected = Number(location.id) === Number(selectedId) ? 'selected' : '';
    options.push(`<option value="${location.id}" ${selected}>${location.name}</option>`);
  });
  return options.join('');
}

function renderWorkers() {
  const weekDays = getWeekDays(currentWeekStart);
  const entryMap = new Map();

  entries.forEach(entry => {
    entryMap.set(`${entry.worker_id}|${entry.work_date}`, entry);
  });

  timesheetTable.innerHTML = '';
  const locationFillTasks = [];

  workers.forEach(worker => {
    const isActive = Number(worker.active) === 1;
    const fullName = `${worker.first_name || ''} ${worker.last_name || ''}`.trim() || 'Unnamed worker';

    const mainRow = document.createElement('tr');
    mainRow.className = 'main-row';

    const nameCell = document.createElement('td');
    nameCell.innerHTML = `
      <div class="worker-name">${fullName}</div>
      ${isActive ? '' : '<div class="worker-status">Inactive</div>'}
    `;
    mainRow.appendChild(nameCell);

    weekDays.forEach(day => {
      const entry = entryMap.get(`${worker.id}|${day.dateString}`);
      const siteName = entry ? siteMap.get(Number(entry.site_id)) : null;
      const locationName = entry ? getLocationName(entry.site_id, entry.location_id) : null;
      const summary = entry
        ? `${siteName || 'Site'} / ${locationName || 'Location'}`
        : '—';

      const cell = document.createElement('td');
      cell.className = 'day-summary';
      cell.dataset.workerId = worker.id;
      cell.dataset.date = day.dateString;
      cell.textContent = summary;
      mainRow.appendChild(cell);
    });

    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';

    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 8;

    const dayList = document.createElement('div');
    dayList.className = 'timesheet-day-list';

    weekDays.forEach(day => {
      const entry = entryMap.get(`${worker.id}|${day.dateString}`);
      const dayRow = document.createElement('div');
      dayRow.className = 'timesheet-day-row';
      dayRow.dataset.workerId = worker.id;
      dayRow.dataset.date = day.dateString;

      const dayLabel = document.createElement('label');
      dayLabel.textContent = day.label;

      const siteSelect = document.createElement('select');
      siteSelect.className = 'form-select site-select';
      siteSelect.innerHTML = buildSiteOptions(entry ? entry.site_id : '');

      const locationSelect = document.createElement('select');
      locationSelect.className = 'form-select location-select';
      locationSelect.disabled = true;

      siteSelect.addEventListener('change', async () => {
        const siteId = siteSelect.value;
        if (!siteId) {
          locationSelect.innerHTML = '<option value="">Select location</option>';
          locationSelect.disabled = true;
          updateSummaryCell(worker.id, day.dateString, null, null);
          return;
        }

        const locations = await loadLocations(siteId);
        locationSelect.innerHTML = buildLocationOptions(locations, '');
        locationSelect.disabled = false;
        updateSummaryCell(worker.id, day.dateString, siteId, null);
      });

      locationSelect.addEventListener('change', () => {
        updateSummaryCell(worker.id, day.dateString, siteSelect.value, locationSelect.value);
      });

      if (entry && entry.site_id) {
        locationFillTasks.push(
          loadLocations(entry.site_id).then(locations => {
            locationSelect.innerHTML = buildLocationOptions(locations, entry.location_id);
            locationSelect.disabled = false;
          })
        );
      } else {
        locationSelect.innerHTML = '<option value="">Select location</option>';
      }

      dayRow.appendChild(dayLabel);
      dayRow.appendChild(siteSelect);
      dayRow.appendChild(locationSelect);
      dayList.appendChild(dayRow);
    });

    detailsCell.appendChild(dayList);
    detailsRow.appendChild(detailsCell);

    mainRow.onclick = () => toggleDetails(mainRow, detailsRow);

    timesheetTable.appendChild(mainRow);
    timesheetTable.appendChild(detailsRow);
  });

  Promise.all(locationFillTasks).catch(() => {});
}

function toggleDetails(mainRow, detailsRow) {
  if (openDetailsRow && !openDetailsRow.isConnected) {
    openDetailsRow = null;
  }

  if (openDetailsRow && openDetailsRow !== detailsRow) {
    openDetailsRow.classList.remove('open');
    const previousRow = openDetailsRow.previousElementSibling;
    if (previousRow) {
      previousRow.classList.remove('open');
    }
  }

  const shouldOpen = !detailsRow.classList.contains('open');
  detailsRow.classList.toggle('open', shouldOpen);
  mainRow.classList.toggle('open', shouldOpen);
  openDetailsRow = shouldOpen ? detailsRow : null;
}

function updateSummaryCell(workerId, date, siteId, locationId) {
  const cell = timesheetTable.querySelector(
    `.day-summary[data-worker-id="${workerId}"][data-date="${date}"]`
  );
  if (!cell) return;

  if (!siteId || !locationId) {
    cell.textContent = siteId ? `${siteMap.get(Number(siteId)) || 'Site'} / Location` : '—';
    return;
  }

  const siteName = siteMap.get(Number(siteId)) || 'Site';
  const locationName = getLocationName(siteId, locationId) || 'Location';
  cell.textContent = `${siteName} / ${locationName}`;
}

async function loadWeek() {
  updateWeekLabels();
  await loadSites();

  const weekStartString = toDateString(currentWeekStart);
  const data = await api(`/timesheets?week_start=${encodeURIComponent(weekStartString)}`);

  workers = Array.isArray(data.workers) ? data.workers : [];
  entries = Array.isArray(data.entries) ? data.entries : [];

  const siteIds = new Set(entries.map(entry => Number(entry.site_id)).filter(Boolean));
  await Promise.all(Array.from(siteIds).map(loadLocations));

  renderWorkers();
}

async function saveWeek() {
  const weekStartString = toDateString(currentWeekStart);
  const dayRows = timesheetTable.querySelectorAll('.timesheet-day-row');
  const payloadEntries = [];

  for (const row of dayRows) {
    const workerId = row.dataset.workerId;
    const date = row.dataset.date;
    const siteSelect = row.querySelector('.site-select');
    const locationSelect = row.querySelector('.location-select');
    const siteId = siteSelect ? siteSelect.value : '';
    const locationId = locationSelect ? locationSelect.value : '';

    if (siteId && !locationId) {
      showToast('Please select a location for every selected site', 'warning');
      return;
    }

    if (siteId && locationId) {
      payloadEntries.push({
        worker_id: Number(workerId),
        work_date: date,
        site_id: Number(siteId),
        location_id: Number(locationId)
      });
    }
  }

  saveWeekBtn.disabled = true;
  try {
    await api('/timesheets', 'POST', {
      week_start: weekStartString,
      entries: payloadEntries
    });
    showToast('Timesheets saved', 'success');
    await loadWeek();
  } catch (err) {
    showToast(err.message || 'Failed to save timesheets', 'error');
  } finally {
    saveWeekBtn.disabled = false;
  }
}

prevWeekBtn.addEventListener('click', () => {
  currentWeekStart = addDays(currentWeekStart, -7);
  loadWeek().catch(() => {});
});

nextWeekBtn.addEventListener('click', () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  loadWeek().catch(() => {});
});

currentWeekBtn.addEventListener('click', () => {
  currentWeekStart = getWeekStart(new Date());
  loadWeek().catch(() => {});
});

saveWeekBtn.addEventListener('click', () => {
  saveWeek().catch(() => {});
});

window.addEventListener('DOMContentLoaded', () => {
  loadWeek().catch(() => {
    showToast('Failed to load timesheets', 'error');
  });
});
