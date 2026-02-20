const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || !['super_admin', 'admin'].includes(role)) {
  location.href = 'dashboard.html';
}

const workerTable = document.getElementById('workerTable');
const showInactiveCheckbox = document.getElementById('showInactiveWorkers');
const bulkUploadModal = document.getElementById('bulkUploadModal');
const bulkWorkerFile = document.getElementById('bulkWorkerFile');
const bulkUploadBtn = document.getElementById('bulkUploadBtn');
const sortHeaders = document.querySelectorAll('th.sortable');

let workers = [];
let editingWorkerId = null;
let openDetailsRow = null;
let sortColumn = 'name';
let sortAscending = true;

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

function formatDate(value) {
  if (!value) return '—';
  const raw = value instanceof Date ? value : String(value);
  const date = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-IE');
}

function toInputDate(value) {
  if (!value) return '';
  const raw = value instanceof Date ? value : String(value);
  const date = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toUkDateFormat(value) {
  if (!value) return '';
  const raw = value instanceof Date ? value : String(value);
  const date = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function isWorkerActive(leftAt) {
  if (!leftAt) return true;
  const raw = leftAt instanceof Date ? leftAt : String(leftAt);
  const date = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

function isUkDate(value) {
  if (!value) return true;
  return /^\d{2}-\d{2}-\d{4}$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseUkDate(value) {
  if (!value || !isUkDate(value)) return null;
  let day = 0;
  let month = 0;
  let year = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    [year, month, day] = value.split('-').map(part => Number(part));
  } else {
    [day, month, year] = value.split('-').map(part => Number(part));
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isPastUkDate(value) {
  const date = parseUkDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function daysUntilUkDate(value) {
  const date = parseUkDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = date.getTime() - today.getTime();
  return Math.floor(diffMs / 86400000);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeName(worker) {
  return `${worker.first_name || ''} ${worker.last_name || ''}`.trim().toLowerCase();
}

function compareStrings(aValue, bValue) {
  const aStr = String(aValue || '').toLowerCase();
  const bStr = String(bValue || '').toLowerCase();
  if (aStr === bStr) return 0;
  return aStr > bStr ? 1 : -1;
}

function compareNumbers(aValue, bValue) {
  const aMissing = aValue == null || aValue === '';
  const bMissing = bValue == null || bValue === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  const aNum = Number(aValue);
  const bNum = Number(bValue);
  if (Number.isNaN(aNum) && Number.isNaN(bNum)) return 0;
  if (Number.isNaN(aNum)) return 1;
  if (Number.isNaN(bNum)) return -1;
  if (aNum === bNum) return 0;
  return aNum > bNum ? 1 : -1;
}

function updateSortIndicators() {
  sortHeaders.forEach(header => {
    const indicator = header.querySelector('.sort-indicator');
    if (!indicator) return;
    if (header.dataset.column === sortColumn) {
      indicator.textContent = sortAscending ? ' ↑' : ' ↓';
      indicator.style.color = '#2563eb';
    } else {
      indicator.textContent = '';
      indicator.style.color = '#9ca3af';
    }
  });
}

function sortWorkers(list) {
  list.sort((a, b) => {
    let result = 0;
    if (sortColumn === 'name') {
      result = compareStrings(normalizeName(a), normalizeName(b));
    } else if (sortColumn === 'nickname') {
      result = compareStrings(a.nickname, b.nickname);
    } else if (sortColumn === 'pps_number') {
      result = compareStrings(a.pps_number, b.pps_number);
    } else if (sortColumn === 'weekly_take_home') {
      result = compareNumbers(a.weekly_take_home, b.weekly_take_home);
    } else if (sortColumn === 'login_no') {
      result = compareNumbers(a.login_no, b.login_no);
    } else if (sortColumn === 'status') {
      const aValue = isWorkerActive(a.left_at) ? 0 : 1;
      const bValue = isWorkerActive(b.left_at) ? 0 : 1;
      result = compareNumbers(aValue, bValue);
    }

    if (result === 0) return 0;
    return sortAscending ? result : -result;
  });

  updateSortIndicators();
  return list;
}

async function loadWorkers() {
  if (!workerTable) return;
  const includeInactive = showInactiveCheckbox && showInactiveCheckbox.checked ? '1' : '0';
  workers = await api(`/admin/workers?include_inactive=${includeInactive}`);
  renderWorkers();
}

function renderWorkers() {
  workerTable.innerHTML = '';
  openDetailsRow = null;

  const sortedWorkers = sortWorkers([...workers]);

  sortedWorkers.forEach((worker) => {
    const isActive = isWorkerActive(worker.left_at);
    const fullName = `${worker.first_name || ''} ${worker.last_name || ''}`.trim();
    const nickname = worker.nickname ? String(worker.nickname).trim() : '';
    const weeklyPay = worker.weekly_take_home != null ? formatMoney(worker.weekly_take_home) : '—';
    const weeklyCost = worker.weekly_cost != null ? formatMoney(worker.weekly_cost) : '—';
    const safePassExpiry = worker.safe_pass_expiry_date ? toUkDateFormat(worker.safe_pass_expiry_date) : '';
    const safePassExpired = safePassExpiry ? isPastUkDate(safePassExpiry) : false;
    const safePassDaysLeft = safePassExpiry ? daysUntilUkDate(safePassExpiry) : null;
    let safePassStatusClass = 'safe-pass-expired';
    if (safePassExpiry && !safePassExpired) {
      safePassStatusClass = safePassDaysLeft !== null && safePassDaysLeft < 60
        ? 'safe-pass-warning'
        : 'safe-pass-ok';
    }

    const mainRow = document.createElement('tr');
    mainRow.className = `main-row ${safePassStatusClass}`;
    mainRow.innerHTML = `
      <td>${escapeHtml(fullName) || '—'}</td>
      <td>${escapeHtml(nickname) || '—'}</td>
      <td>${escapeHtml(worker.login_no) || '—'}</td>
      <td>${isActive ? 'Active' : 'Inactive'}</td>
      <td>${safePassExpiry || '—'}</td>
    `;

    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    const financialData = role === 'super_admin' ? `
          <div><strong>Weekly take home:</strong> ${weeklyPay}</div>
          <div><strong>Weekly cost:</strong> ${weeklyCost}</div>` : '';
    detailsRow.innerHTML = `
      <td colspan="4">
        <div class="details-grid">
          <div><strong>First name:</strong> ${escapeHtml(worker.first_name) || '—'}</div>
          <div><strong>Last name:</strong> ${escapeHtml(worker.last_name) || '—'}</div>
          <div><strong>Nickname:</strong> ${escapeHtml(nickname) || '—'}</div>
          <div><strong>Email:</strong> ${escapeHtml(worker.email) || '—'}</div>
          <div><strong>Mobile number:</strong> ${escapeHtml(worker.mobile_number) || '—'}</div>
          <div><strong>Address:</strong> ${escapeHtml(worker.address) || '—'}</div>
          <div><strong>Bank details:</strong> ${escapeHtml(worker.bank_details) || '—'}</div>
          <div><strong>Employee ID:</strong> ${escapeHtml(worker.employee_id) || '—'}</div>
          <div><strong>Login No:</strong> ${escapeHtml(worker.login_no) || '—'}</div>
          <div><strong>PPS Number:</strong> ${escapeHtml(worker.pps_number) || '—'}</div>
          ${financialData}
          <div><strong>Safe Pass Number:</strong> ${escapeHtml(worker.safe_pass_number) || '—'}</div>
          <div><strong>Safe Pass Expiry:</strong> <span class="${safePassExpired ? 'expired-date' : ''}">${safePassExpiry || '—'}</span></div>
          <div><strong>Date of employment:</strong> ${formatDate(worker.date_of_employment)}</div>
          <div><strong>Status:</strong> ${isActive ? 'Active' : 'Inactive'}</div>
          <div><strong>Left at:</strong> ${formatDate(worker.left_at)}</div>
          <div class="full-width"><strong>Notes:</strong><br>${escapeHtml(worker.notes) || '—'}</div>
        </div>
        <div class="details-actions">
          <button class="btn btn-outline-primary" onclick="event.stopPropagation(); editWorker(${worker.id})">Edit</button>
        </div>
      </td>
    `;

    mainRow.onclick = () => toggleDetails(mainRow, detailsRow);

    workerTable.appendChild(mainRow);
    workerTable.appendChild(detailsRow);
  });
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

function openWorkerModal() {
  resetWorkerForm();
  document.getElementById('workerModal').style.display = 'flex';
  document.getElementById('workerFirstName').focus();
}

function closeWorkerModal() {
  document.getElementById('workerModal').style.display = 'none';
  resetWorkerForm();
}

function openBulkUploadModal() {
  if (!bulkUploadModal) return;
  if (bulkWorkerFile) bulkWorkerFile.value = '';
  bulkUploadModal.style.display = 'flex';
}

function closeBulkUploadModal() {
  if (!bulkUploadModal) return;
  bulkUploadModal.style.display = 'none';
}

function resetWorkerForm() {
  editingWorkerId = null;
  document.getElementById('workerModalTitle').textContent = 'Add Worker';
  document.getElementById('workerEditNotice').style.display = 'none';
  document.getElementById('saveWorkerBtn').textContent = 'Add Worker';

  document.getElementById('workerFirstName').value = '';
  document.getElementById('workerLastName').value = '';
  document.getElementById('workerNickname').value = '';
  document.getElementById('workerEmail').value = '';
  document.getElementById('workerMobileNumber').value = '';
  document.getElementById('workerAddress').value = '';
  document.getElementById('workerBankDetails').value = '';
  document.getElementById('workerEmployeeId').value = '';
  document.getElementById('workerLoginNo').value = '';
  document.getElementById('workerPpsNumber').value = '';
  document.getElementById('workerWeeklyPay').value = '';
  document.getElementById('workerWeeklyCost').value = '';
  document.getElementById('workerSafePassNumber').value = '';
  document.getElementById('workerSafePassExpiry').value = '';
  document.getElementById('workerEmploymentDate').value = '';
  document.getElementById('workerLeftDate').value = '';
  document.getElementById('workerNotes').value = '';
}

function editWorker(id) {
  const worker = workers.find(w => w.id === id);
  if (!worker) return;

  editingWorkerId = id;
  document.getElementById('workerModalTitle').textContent = 'Edit Worker';
  document.getElementById('workerEditNotice').style.display = 'block';
  document.getElementById('saveWorkerBtn').textContent = 'Save Changes';

  document.getElementById('workerFirstName').value = worker.first_name || '';
  document.getElementById('workerLastName').value = worker.last_name || '';
  document.getElementById('workerNickname').value = worker.nickname || '';
  document.getElementById('workerEmail').value = worker.email || '';
  document.getElementById('workerMobileNumber').value = worker.mobile_number || '';
  document.getElementById('workerAddress').value = worker.address || '';
  document.getElementById('workerBankDetails').value = worker.bank_details || '';
  document.getElementById('workerEmployeeId').value = worker.employee_id || '';
  document.getElementById('workerLoginNo').value = worker.login_no != null ? worker.login_no : '';
  document.getElementById('workerPpsNumber').value = worker.pps_number || '';
  document.getElementById('workerWeeklyPay').value = worker.weekly_take_home != null ? worker.weekly_take_home : '';
  document.getElementById('workerWeeklyCost').value = worker.weekly_cost != null ? worker.weekly_cost : '';
  document.getElementById('workerSafePassNumber').value = worker.safe_pass_number || '';
  document.getElementById('workerSafePassExpiry').value = worker.safe_pass_expiry_date ? toInputDate(worker.safe_pass_expiry_date) : '';
  document.getElementById('workerEmploymentDate').value = toInputDate(worker.date_of_employment);
  document.getElementById('workerLeftDate').value = toInputDate(worker.left_at);
  document.getElementById('workerNotes').value = worker.notes || '';

  document.getElementById('workerModal').style.display = 'flex';
  document.getElementById('workerFirstName').focus();
}

sortHeaders.forEach(header => {
  header.addEventListener('click', () => {
    const column = header.dataset.column;
    if (!column) return;
    if (sortColumn === column) {
      sortAscending = !sortAscending;
    } else {
      sortColumn = column;
      sortAscending = true;
    }
    renderWorkers();
  });
});

async function saveWorker() {
  const firstName = document.getElementById('workerFirstName').value.trim();
  const lastName = document.getElementById('workerLastName').value.trim();
  const nickname = document.getElementById('workerNickname').value.trim();
  const email = document.getElementById('workerEmail').value.trim();
  const mobileNumber = document.getElementById('workerMobileNumber').value.trim();
  const address = document.getElementById('workerAddress').value.trim();
  const bankDetails = document.getElementById('workerBankDetails').value.trim();
  const employeeId = document.getElementById('workerEmployeeId').value.trim();
  const loginNoRaw = document.getElementById('workerLoginNo').value.trim();
  const ppsNumber = document.getElementById('workerPpsNumber').value.trim();
  const weeklyPayRaw = document.getElementById('workerWeeklyPay').value.trim();
  const weeklyCostRaw = document.getElementById('workerWeeklyCost').value.trim();
  const safePassNumber = document.getElementById('workerSafePassNumber').value.trim();
  const safePassExpiry = document.getElementById('workerSafePassExpiry').value.trim();
  const employmentDate = document.getElementById('workerEmploymentDate').value;
  const leftDate = document.getElementById('workerLeftDate').value;
  const notes = document.getElementById('workerNotes').value.trim();

  if (!firstName || !lastName) {
    showToast('First and last name are required', 'error');
    return;
  }

  const weeklyPay = weeklyPayRaw ? Number(weeklyPayRaw) : null;
  if (weeklyPayRaw && !Number.isFinite(weeklyPay)) {
    showToast('Weekly take home must be a valid number', 'error');
    return;
  }

  const weeklyCost = weeklyCostRaw ? Number(weeklyCostRaw) : null;
  if (weeklyCostRaw && !Number.isFinite(weeklyCost)) {
    showToast('Weekly cost must be a valid number', 'error');
    return;
  }

  if (safePassExpiry && !isUkDate(safePassExpiry)) {
    showToast('Safe pass expiry must be a valid date', 'error');
    return;
  }

  if (employmentDate && !isUkDate(employmentDate)) {
    showToast('Date of employment must be a valid date', 'error');
    return;
  }

  if (leftDate && !isUkDate(leftDate)) {
    showToast('Date ceased employment must be a valid date', 'error');
    return;
  }

  if (loginNoRaw && !/^\d+$/.test(loginNoRaw)) {
    showToast('Login number must be numeric', 'error');
    return;
  }

  const payload = {
    first_name: firstName,
    last_name: lastName,
    nickname: nickname || null,
    email: email || null,
    mobile_number: mobileNumber || null,
    address: address || null,
    bank_details: bankDetails || null,
    employee_id: employeeId || null,
    login_no: loginNoRaw || null,
    pps_number: ppsNumber || null,
    weekly_take_home: role === 'super_admin' ? weeklyPay : null,
    weekly_cost: role === 'super_admin' ? weeklyCost : null,
    safe_pass_number: safePassNumber || null,
    safe_pass_expiry_date: safePassExpiry || null,
    date_of_employment: employmentDate || null,
    left_at: leftDate || null,
    notes: notes || null
  };

  try {
    if (editingWorkerId) {
      await api(`/admin/workers/${editingWorkerId}`, 'PUT', payload);
      showToast('Worker updated', 'success');
    } else {
      await api('/admin/workers', 'POST', payload);
      showToast('Worker added', 'success');
    }

    closeWorkerModal();
    loadWorkers();
  } catch (err) {
    showToast(err.message || 'Failed to save worker', 'error');
  }
}

async function downloadWorkerTemplate() {
  try {
    const res = await fetch('/admin/workers/template', {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!res.ok) {
      showToast('Failed to download template', 'error');
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'workers-template.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    showToast('Failed to download template', 'error');
  }
}

async function uploadWorkerFile() {
  if (!bulkWorkerFile || !bulkWorkerFile.files || bulkWorkerFile.files.length === 0) {
    showToast('Please select a file to upload', 'warning');
    return;
  }

  const file = bulkWorkerFile.files[0];
  const formData = new FormData();
  formData.append('file', file);

  if (bulkUploadBtn) bulkUploadBtn.disabled = true;
  try {
    const res = await fetch('/admin/workers/bulk', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Bulk upload failed');
    }

    const skippedCount = Array.isArray(data.skipped) ? data.skipped.length : 0;
    const insertedCount = Number(data.inserted || 0);
    const updatedCount = Number(data.updated || 0);
    const parts = [`Added ${insertedCount}`, `Updated ${updatedCount}`];
    if (skippedCount) {
      parts.push(`Skipped ${skippedCount}`);
    }
    const message = parts.join(', ');
    showToast(message, 'success');

    closeBulkUploadModal();
    loadWorkers();
  } catch (err) {
    showToast(err.message || 'Bulk upload failed', 'error');
  } finally {
    if (bulkUploadBtn) bulkUploadBtn.disabled = false;
  }
}

if (showInactiveCheckbox) {
  showInactiveCheckbox.addEventListener('change', () => {
    loadWorkers();
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  // Hide financial fields and tool for non-super_admin users
  if (role !== 'super_admin') {
    const weeklyPayField = document.getElementById('workerWeeklyPay');
    const weeklyCostField = document.getElementById('workerWeeklyCost');
    
    if (weeklyPayField && weeklyPayField.parentElement) {
      weeklyPayField.parentElement.style.display = 'none';
    }
    if (weeklyCostField && weeklyCostField.parentElement) {
      weeklyCostField.parentElement.style.display = 'none';
    }

    // Hide Download Excel and Bulk Upload buttons
    const downloadBtn = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('Download Excel')
    );
    const bulkUploadBtn = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('Bulk Upload')
    );
    
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (bulkUploadBtn) bulkUploadBtn.style.display = 'none';
  }

  try {
    await loadCurrencySettings();
  } catch (_) {}
  loadWorkers();
});
