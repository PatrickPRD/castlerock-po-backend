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
const workerSearchInput = document.getElementById('workerSearch');
const weekSelect = document.getElementById('weekSelect');
const timesheetWarningsEl = document.getElementById('timesheetWarnings');

let currentWeekStart = getWeekStart(new Date());
let workers = [];
let entries = [];
let sites = [];
let stages = [];
const siteMap = new Map();
const stageMap = new Map();
const locationCache = new Map();
let openDetailsRow = null;
let availableWeeks = [];
let isDirty = false;
let leaveSettings = null;
let leaveUsage = new Map();
const siteLocationMap = new Map();
let siteStageId = null;

const LEAVE_TYPE_PREFIX = 'leave:';
const LEAVE_TYPES = {
  PAID_SICK: 'paid_sick',
  SICK: 'sick',
  ANNUAL_LEAVE: 'annual_leave',
  UNPAID_LEAVE: 'unpaid_leave',
  BANK_HOLIDAY: 'bank_holiday',
  ABSENT: 'absent'
};

const LEAVE_LABELS = {
  [LEAVE_TYPES.PAID_SICK]: 'Paid Sick',
  [LEAVE_TYPES.SICK]: 'Sick',
  [LEAVE_TYPES.ANNUAL_LEAVE]: 'Annual Leave',
  [LEAVE_TYPES.UNPAID_LEAVE]: 'Unpaid Leave',
  [LEAVE_TYPES.BANK_HOLIDAY]: 'Bank Holidays',
  [LEAVE_TYPES.ABSENT]: 'Absent'
};

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

function formatWeekLabel(weekStartString) {
  const date = new Date(`${weekStartString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return weekStartString;
  return `Week of ${formatRangeDate(date)}`;
}

function setDirty(value) {
  isDirty = value;
  if (saveWeekBtn) {
    saveWeekBtn.disabled = !isDirty;
    saveWeekBtn.classList.toggle('disabled', !isDirty);
    saveWeekBtn.setAttribute('aria-disabled', String(!isDirty));
  }
}

function renderWarnings(warnings) {
  if (!timesheetWarningsEl) return;
  timesheetWarningsEl.innerHTML = '';

  if (!warnings || warnings.length === 0) {
    timesheetWarningsEl.style.display = 'none';
    return;
  }

  const list = document.createElement('ul');
  warnings.forEach(message => {
    const item = document.createElement('li');
    item.textContent = message;
    list.appendChild(item);
  });

  timesheetWarningsEl.appendChild(list);
  timesheetWarningsEl.style.display = 'block';
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

function formatHeaderLabel(date) {
  const dayName = date.toLocaleDateString('en-IE', { weekday: 'short' });
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  return `${dayName} ${day}/${month}`;
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

function isLeaveSelection(value) {
  return String(value || '').startsWith(LEAVE_TYPE_PREFIX);
}

function getLeaveTypeFromValue(value) {
  if (!isLeaveSelection(value)) return null;
  return String(value).slice(LEAVE_TYPE_PREFIX.length);
}

function getLeaveOptionValue(type) {
  return `${LEAVE_TYPE_PREFIX}${type}`;
}

function getLeaveLabel(type) {
  return LEAVE_LABELS[type] || 'Leave';
}

function getLeaveUsage(workerId) {
  return leaveUsage.get(Number(workerId)) || {
    paid_sick: 0,
    sick: 0,
    annual_leave: 0,
    unpaid_leave: 0,
    bank_holiday: 0,
    absent: 0
  };
}

function buildLeaveOptions(workerId, selectedLeaveType) {
  if (!leaveSettings) return [];

  const usage = getLeaveUsage(workerId);
  const options = [];

  const sickRemaining = Number(leaveSettings.sick_days_per_year || 0) - Number(usage.paid_sick || 0);
  const annualRemaining = Number(leaveSettings.annual_leave_days_per_year || 0) - Number(usage.annual_leave || 0);
  const bankRemaining = Number(leaveSettings.bank_holidays_per_year || 0) - Number(usage.bank_holiday || 0);

  const paidSickAvailable = sickRemaining > 0;
  if (paidSickAvailable || selectedLeaveType === LEAVE_TYPES.PAID_SICK) {
    options.push({ type: LEAVE_TYPES.PAID_SICK, label: LEAVE_LABELS[LEAVE_TYPES.PAID_SICK] });
    if (selectedLeaveType === LEAVE_TYPES.SICK) {
      options.push({ type: LEAVE_TYPES.SICK, label: LEAVE_LABELS[LEAVE_TYPES.SICK] });
    }
  } else {
    options.push({ type: LEAVE_TYPES.SICK, label: LEAVE_LABELS[LEAVE_TYPES.SICK] });
    if (selectedLeaveType === LEAVE_TYPES.PAID_SICK) {
      options.push({ type: LEAVE_TYPES.PAID_SICK, label: LEAVE_LABELS[LEAVE_TYPES.PAID_SICK] });
    }
  }

  const annualAvailable = annualRemaining > 0;
  if (annualAvailable || selectedLeaveType === LEAVE_TYPES.ANNUAL_LEAVE) {
    options.push({ type: LEAVE_TYPES.ANNUAL_LEAVE, label: LEAVE_LABELS[LEAVE_TYPES.ANNUAL_LEAVE] });
    if (selectedLeaveType === LEAVE_TYPES.UNPAID_LEAVE) {
      options.push({ type: LEAVE_TYPES.UNPAID_LEAVE, label: LEAVE_LABELS[LEAVE_TYPES.UNPAID_LEAVE] });
    }
  } else {
    options.push({ type: LEAVE_TYPES.UNPAID_LEAVE, label: LEAVE_LABELS[LEAVE_TYPES.UNPAID_LEAVE] });
    if (selectedLeaveType === LEAVE_TYPES.ANNUAL_LEAVE) {
      options.push({ type: LEAVE_TYPES.ANNUAL_LEAVE, label: LEAVE_LABELS[LEAVE_TYPES.ANNUAL_LEAVE] });
    }
  }

  if (bankRemaining > 0 || selectedLeaveType === LEAVE_TYPES.BANK_HOLIDAY) {
    options.push({ type: LEAVE_TYPES.BANK_HOLIDAY, label: LEAVE_LABELS[LEAVE_TYPES.BANK_HOLIDAY] });
  }

  options.push({ type: LEAVE_TYPES.ABSENT, label: LEAVE_LABELS[LEAVE_TYPES.ABSENT] });

  return options;
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

async function loadStages() {
  if (stages.length > 0) return;
  const rows = await api('/stages');
  stages = Array.isArray(rows) ? rows : [];
  stageMap.clear();
  stages.forEach(stage => {
    stageMap.set(Number(stage.id), stage.name);
  });
  const siteStage = stages.find(stage => String(stage.name || '').trim().toLowerCase() === 'site');
  siteStageId = siteStage ? Number(siteStage.id) : null;
}

async function loadLocations(siteId) {
  const key = Number(siteId);
  if (locationCache.has(key)) {
    return locationCache.get(key);
  }
  const rows = await api(`/locations?siteId=${encodeURIComponent(key)}`);
  const locations = Array.isArray(rows) ? rows : [];
  const siteLocation = locations.find(location => String(location.name || '').trim().toLowerCase() === 'site');
  if (siteLocation) {
    siteLocationMap.set(key, Number(siteLocation.id));
  }
  locationCache.set(key, locations);
  return locations;
}

function getLocationName(siteId, locationId) {
  const locations = locationCache.get(Number(siteId));
  if (!locations) return null;
  const match = locations.find(loc => Number(loc.id) === Number(locationId));
  return match ? match.name : null;
}

function getStageName(stageId) {
  if (!stageId) return null;
  return stageMap.get(Number(stageId)) || null;
}

function updateWeekLabels() {
  const weekEnd = addDays(currentWeekStart, 6);
  weekStartLabel.textContent = formatRangeDate(currentWeekStart);
  weekEndLabel.textContent = formatRangeDate(weekEnd);
  if (weekNumberLabel) {
    weekNumberLabel.textContent = String(getWeekNumber(currentWeekStart));
  }

  const weekDays = getWeekDays(currentWeekStart);
  weekDays.forEach((day, index) => {
    const header = document.getElementById(`dayHeader${index}`);
    if (header) {
      header.textContent = formatHeaderLabel(day.date);
    }
  });
}

function buildSiteOptions(selectedId) {
  const options = ['<option value="">Select site</option>'];
  sites.forEach(site => {
    const selected = Number(site.id) === Number(selectedId) ? 'selected' : '';
    options.push(`<option value="${site.id}" ${selected}>${site.name}</option>`);
  });
  return options.join('');
}

function buildLocationOptions(locations, selectedValue, workerId, selectedLeaveType) {
  const options = ['<option value="">Select location</option>'];
  const leaveOptions = buildLeaveOptions(workerId, selectedLeaveType);

  if (leaveOptions.length) {
    options.push('<optgroup label="Leave">');
    leaveOptions.forEach(option => {
      const value = getLeaveOptionValue(option.type);
      const selected = String(selectedValue) === value ? 'selected' : '';
      options.push(`<option value="${value}" ${selected}>${option.label}</option>`);
    });
    options.push('</optgroup>');
  }

  locations.forEach(location => {
    const selected = Number(location.id) === Number(selectedValue) ? 'selected' : '';
    options.push(`<option value="${location.id}" ${selected}>${location.name}</option>`);
  });
  return options.join('');
}

function buildStageOptions(selectedId) {
  const options = ['<option value="">Select stage</option>'];
  stages.forEach(stage => {
    const selected = Number(stage.id) === Number(selectedId) ? 'selected' : '';
    options.push(`<option value="${stage.id}" ${selected}>${stage.name}</option>`);
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

  const filteredWorkers = getFilteredWorkers();
  if (!filteredWorkers.length) {
    timesheetTable.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: #9ca3af;">
          No matching workers
        </td>
      </tr>
    `;
    return;
  }

  filteredWorkers.forEach(worker => {
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
      const locationName = entry ? getLocationName(entry.site_id, entry.location_id) : null;
      const summary = entry
        ? (entry.leave_type
          ? getLeaveLabel(entry.leave_type)
          : locationName || 'Location')
        : '—';

      const cell = document.createElement('td');
      cell.className = 'day-summary';
      cell.dataset.workerId = worker.id;
      cell.dataset.date = day.dateString;
      cell.textContent = summary;
      const leaveType = entry ? entry.leave_type : null;
      if (leaveType) {
        cell.classList.add('leave-summary');
        cell.classList.toggle('leave-summary-paid', [LEAVE_TYPES.PAID_SICK, LEAVE_TYPES.ANNUAL_LEAVE, LEAVE_TYPES.BANK_HOLIDAY].includes(leaveType));
        cell.classList.toggle('leave-summary-unpaid', [LEAVE_TYPES.SICK, LEAVE_TYPES.UNPAID_LEAVE, LEAVE_TYPES.ABSENT].includes(leaveType));
      } else {
        cell.classList.remove('leave-summary', 'leave-summary-paid', 'leave-summary-unpaid');
      }
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

      const stageSelect = document.createElement('select');
      stageSelect.className = 'form-select stage-select';
      stageSelect.innerHTML = buildStageOptions(entry ? entry.stage_id : '');

      siteSelect.addEventListener('change', async () => {
        const siteId = siteSelect.value;
        if (!siteId) {
          locationSelect.innerHTML = '<option value="">Select location</option>';
          locationSelect.disabled = true;
          stageSelect.value = '';
          setLeaveRowState(dayRow, locationSelect, null);
          updateSummaryCell(worker.id, day.dateString, null, null, null, null);
          setDirty(true);
          return;
        }

        const locations = await loadLocations(siteId);
        locationSelect.innerHTML = buildLocationOptions(locations, '', worker.id, null);
        locationSelect.disabled = false;
        setLeaveRowState(dayRow, locationSelect, null);
        updateSummaryCell(worker.id, day.dateString, siteId, null, stageSelect.value, null);
        setDirty(true);
      });

      locationSelect.addEventListener('change', () => {
        const leaveType = getLeaveTypeFromValue(locationSelect.value);
        if (leaveType) {
          applyLeaveSelection(siteSelect.value, stageSelect, leaveType);
        } else {
          stageSelect.disabled = false;
        }
        setLeaveRowState(dayRow, locationSelect, leaveType);
        updateSummaryCell(worker.id, day.dateString, siteSelect.value, locationSelect.value, stageSelect.value, leaveType);
        setDirty(true);
      });

      stageSelect.addEventListener('change', () => {
        const leaveType = getLeaveTypeFromValue(locationSelect.value);
        if (leaveType) return;
        updateSummaryCell(worker.id, day.dateString, siteSelect.value, locationSelect.value, stageSelect.value, null);
        setDirty(true);
      });

      if (entry && entry.site_id) {
        locationFillTasks.push(
          loadLocations(entry.site_id).then(locations => {
            const selectedValue = entry.leave_type
              ? getLeaveOptionValue(entry.leave_type)
              : entry.location_id;
            locationSelect.innerHTML = buildLocationOptions(
              locations,
              selectedValue,
              worker.id,
              entry.leave_type || null
            );
            locationSelect.disabled = false;
            if (entry.leave_type) {
              applyLeaveSelection(entry.site_id, stageSelect, entry.leave_type);
            }
            setLeaveRowState(dayRow, locationSelect, entry.leave_type || null);
          })
        );
      } else {
        locationSelect.innerHTML = '<option value="">Select location</option>';
      }

      dayRow.appendChild(dayLabel);
      dayRow.appendChild(siteSelect);
      dayRow.appendChild(locationSelect);
      dayRow.appendChild(stageSelect);
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

function getFilteredWorkers() {
  const term = workerSearchInput ? workerSearchInput.value.trim().toLowerCase() : '';
  if (!term) return workers;
  return workers.filter(worker => {
    const name = `${worker.first_name || ''} ${worker.last_name || ''}`.trim().toLowerCase();
    return name.includes(term);
  });
}

function syncWeekSelectToCurrent() {
  if (!weekSelect || !availableWeeks.length) return;
  const current = toDateString(currentWeekStart);
  if (availableWeeks.includes(current)) {
    weekSelect.value = current;
  }
}

async function refreshWeekOptions() {
  if (!weekSelect) return;
  const term = workerSearchInput ? workerSearchInput.value.trim() : '';
  const query = term ? `?workerSearch=${encodeURIComponent(term)}` : '';
  const current = toDateString(currentWeekStart);

  try {
    const data = await api(`/timesheets/weeks${query}`);
    availableWeeks = Array.isArray(data.weeks) ? data.weeks : [];
  } catch (_) {
    availableWeeks = [];
  }

  weekSelect.innerHTML = '';
  if (!availableWeeks.length) {
    weekSelect.innerHTML = '<option value="">No weeks with entries</option>';
    return false;
  }

  availableWeeks.forEach(weekStart => {
    const opt = document.createElement('option');
    opt.value = weekStart;
    opt.textContent = formatWeekLabel(weekStart);
    weekSelect.appendChild(opt);
  });

  if (availableWeeks.includes(current)) {
    weekSelect.value = current;
    return false;
  }

  weekSelect.value = availableWeeks[0];
  currentWeekStart = getWeekStart(new Date(`${availableWeeks[0]}T00:00:00`));
  return true;
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

function updateSummaryCell(workerId, date, siteId, locationId, stageId, leaveType) {
  const cell = timesheetTable.querySelector(
    `.day-summary[data-worker-id="${workerId}"][data-date="${date}"]`
  );
  if (!cell) return;

  if (!siteId) {
    cell.textContent = '—';
    cell.classList.remove('leave-summary');
    return;
  }

  const siteName = siteMap.get(Number(siteId)) || 'Site';
  if (leaveType) {
    cell.textContent = `${siteName} / ${getLeaveLabel(leaveType)}`;
    cell.classList.add('leave-summary');
    cell.classList.toggle('leave-summary-paid', [LEAVE_TYPES.PAID_SICK, LEAVE_TYPES.ANNUAL_LEAVE, LEAVE_TYPES.BANK_HOLIDAY].includes(leaveType));
    cell.classList.toggle('leave-summary-unpaid', [LEAVE_TYPES.SICK, LEAVE_TYPES.UNPAID_LEAVE, LEAVE_TYPES.ABSENT].includes(leaveType));
    return;
  }
  cell.classList.remove('leave-summary');
  cell.classList.remove('leave-summary-paid');
  cell.classList.remove('leave-summary-unpaid');
  const locationName = locationId ? getLocationName(siteId, locationId) || 'Location' : 'Location';
  const stageName = stageId ? getStageName(stageId) || 'Stage' : 'Stage';
  cell.textContent = `${siteName} / ${locationName} / ${stageName}`;
}

function applyLeaveSelection(siteId, stageSelect, leaveType) {
  if (!stageSelect) return;
  if (siteStageId) {
    stageSelect.value = String(siteStageId);
    stageSelect.disabled = true;
  } else {
    stageSelect.disabled = false;
    showToast('Site stage is missing. Please contact an admin.', 'warning');
  }
}

function setLeaveRowState(dayRow, locationSelect, leaveType) {
  if (!dayRow || !locationSelect) return;
  const isLeave = Boolean(leaveType);
  dayRow.classList.toggle('leave-row', isLeave);
  dayRow.classList.toggle('leave-row-paid', [LEAVE_TYPES.PAID_SICK, LEAVE_TYPES.ANNUAL_LEAVE, LEAVE_TYPES.BANK_HOLIDAY].includes(leaveType));
  dayRow.classList.toggle('leave-row-unpaid', [LEAVE_TYPES.SICK, LEAVE_TYPES.UNPAID_LEAVE, LEAVE_TYPES.ABSENT].includes(leaveType));
  locationSelect.classList.toggle('leave-selected', isLeave);
}

async function loadWeek() {
  updateWeekLabels();
  await loadSites();
  await loadStages();

  const weekStartString = toDateString(currentWeekStart);
  const data = await api(`/timesheets?week_start=${encodeURIComponent(weekStartString)}`);

  workers = Array.isArray(data.workers) ? data.workers : [];
  entries = Array.isArray(data.entries) ? data.entries : [];
  leaveSettings = data.leave_settings || null;
  leaveUsage = new Map(
    Object.entries(data.leave_usage || {}).map(([workerId, usage]) => [Number(workerId), usage])
  );
  renderWarnings(data.warnings);

  const siteIds = new Set(entries.map(entry => Number(entry.site_id)).filter(Boolean));
  await Promise.all(Array.from(siteIds).map(loadLocations));

  renderWorkers();
  syncWeekSelectToCurrent();
  setDirty(false);
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
    const stageSelect = row.querySelector('.stage-select');
    const siteId = siteSelect ? siteSelect.value : '';
    const locationValue = locationSelect ? locationSelect.value : '';
    const stageId = stageSelect ? stageSelect.value : '';
    const leaveType = getLeaveTypeFromValue(locationValue);

    if (siteId && !locationValue) {
      showToast('Please select a location for every selected site', 'warning');
      return;
    }

    if (siteId && !leaveType && !stageId) {
      showToast('Please select a stage for every selected site', 'warning');
      return;
    }

    if (siteId && leaveType) {
      const siteLocationId = siteLocationMap.get(Number(siteId));
      if (!siteLocationId) {
        showToast('Site location is missing for this site', 'warning');
        return;
      }
      if (!siteStageId) {
        showToast('Site stage is missing. Please contact an admin.', 'warning');
        return;
      }
      payloadEntries.push({
        worker_id: Number(workerId),
        work_date: date,
        site_id: Number(siteId),
        location_id: Number(siteLocationId),
        stage_id: Number(siteStageId),
        leave_type: leaveType
      });
    } else if (siteId && locationValue && stageId) {
      payloadEntries.push({
        worker_id: Number(workerId),
        work_date: date,
        site_id: Number(siteId),
        location_id: Number(locationValue),
        stage_id: Number(stageId),
        leave_type: null
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

if (workerSearchInput) {
  workerSearchInput.addEventListener('input', () => {
    renderWorkers();
    refreshWeekOptions()
      .then(weekChanged => {
        if (weekChanged) {
          return loadWeek();
        }
        return null;
      })
      .catch(() => {});
  });
}

if (weekSelect) {
  weekSelect.addEventListener('change', () => {
    if (!weekSelect.value) return;
    currentWeekStart = getWeekStart(new Date(`${weekSelect.value}T00:00:00`));
    loadWeek().catch(() => {});
  });
}

window.addEventListener('DOMContentLoaded', () => {
  setDirty(false);
  loadWeek().catch(() => {
    showToast('Failed to load timesheets', 'error');
  });
  refreshWeekOptions().catch(() => {});
});
