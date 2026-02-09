const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const workerTable = document.getElementById('workerTable');
const showInactiveCheckbox = document.getElementById('showInactiveWorkers');

let workers = [];
let editingWorkerId = null;
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

function formatDate(value) {
  if (!value) return '—';
  const raw = value instanceof Date ? value : String(value);
  const date = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-IE');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadWorkers() {
  if (!workerTable) return;
  const includeInactive = showInactiveCheckbox && showInactiveCheckbox.checked ? '1' : '0';
  workers = await api(`/admin/workers?include_inactive=${includeInactive}`);
  renderWorkers();
}

function renderWorkers() {
  workerTable.innerHTML = '';

  workers.forEach((worker) => {
    const isActive = Number(worker.active) === 1;
    const fullName = `${worker.first_name || ''} ${worker.last_name || ''}`.trim();
    const weeklyPay = worker.weekly_take_home != null ? formatMoney(worker.weekly_take_home) : '—';

    const mainRow = document.createElement('tr');
    mainRow.className = 'main-row';
    mainRow.innerHTML = `
      <td>${escapeHtml(fullName) || '—'}</td>
      <td>${escapeHtml(worker.employee_id) || '—'}</td>
      <td>${escapeHtml(worker.pps_number) || '—'}</td>
      <td>${weeklyPay}</td>
      <td>${isActive ? 'Active' : 'Inactive'}</td>
    `;

    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row';
    detailsRow.innerHTML = `
      <td colspan="5">
        <div class="details-grid">
          <div><strong>First name:</strong> ${escapeHtml(worker.first_name) || '—'}</div>
          <div><strong>Last name:</strong> ${escapeHtml(worker.last_name) || '—'}</div>
          <div><strong>Employee ID:</strong> ${escapeHtml(worker.employee_id) || '—'}</div>
          <div><strong>PPS Number:</strong> ${escapeHtml(worker.pps_number) || '—'}</div>
          <div><strong>Weekly take home:</strong> ${weeklyPay}</div>
          <div><strong>Date of employment:</strong> ${formatDate(worker.date_of_employment)}</div>
          <div><strong>Status:</strong> ${isActive ? 'Active' : 'Inactive'}</div>
          <div><strong>Left at:</strong> ${formatDate(worker.left_at)}</div>
          <div class="full-width"><strong>Notes:</strong><br>${escapeHtml(worker.notes) || '—'}</div>
        </div>
        <div class="details-actions">
          <button class="btn btn-outline-primary" onclick="event.stopPropagation(); editWorker(${worker.id})">Edit</button>
          <button class="btn ${isActive ? 'btn-danger' : 'btn-outline-primary'}" onclick="event.stopPropagation(); toggleWorkerStatus(${worker.id}, ${isActive ? 0 : 1})">
            ${isActive ? 'Mark Inactive' : 'Re-activated'}
          </button>
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

function resetWorkerForm() {
  editingWorkerId = null;
  document.getElementById('workerModalTitle').textContent = 'Add Worker';
  document.getElementById('workerEditNotice').style.display = 'none';
  document.getElementById('saveWorkerBtn').textContent = 'Add Worker';

  document.getElementById('workerFirstName').value = '';
  document.getElementById('workerLastName').value = '';
  document.getElementById('workerEmployeeId').value = '';
  document.getElementById('workerPpsNumber').value = '';
  document.getElementById('workerWeeklyPay').value = '';
  document.getElementById('workerEmploymentDate').value = '';
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
  document.getElementById('workerEmployeeId').value = worker.employee_id || '';
  document.getElementById('workerPpsNumber').value = worker.pps_number || '';
  document.getElementById('workerWeeklyPay').value = worker.weekly_take_home != null ? worker.weekly_take_home : '';
  document.getElementById('workerEmploymentDate').value = worker.date_of_employment || '';
  document.getElementById('workerNotes').value = worker.notes || '';

  document.getElementById('workerModal').style.display = 'flex';
  document.getElementById('workerFirstName').focus();
}

async function saveWorker() {
  const firstName = document.getElementById('workerFirstName').value.trim();
  const lastName = document.getElementById('workerLastName').value.trim();
  const employeeId = document.getElementById('workerEmployeeId').value.trim();
  const ppsNumber = document.getElementById('workerPpsNumber').value.trim();
  const weeklyPayRaw = document.getElementById('workerWeeklyPay').value.trim();
  const employmentDate = document.getElementById('workerEmploymentDate').value;
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

  const payload = {
    first_name: firstName,
    last_name: lastName,
    employee_id: employeeId || null,
    pps_number: ppsNumber || null,
    weekly_take_home: weeklyPay,
    date_of_employment: employmentDate || null,
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

async function toggleWorkerStatus(id, active) {
  const worker = workers.find(w => w.id === id);
  const name = worker ? `${worker.first_name || ''} ${worker.last_name || ''}`.trim() : 'this worker';
  const confirmText = active
    ? `Reinstate ${name}?`
    : `Mark ${name} as inactive?`;

  if (!(await confirmDialog(confirmText))) return;

  try {
    await api(`/admin/workers/${id}/status`, 'PUT', { active });
    showToast('Worker status updated', 'success');
    loadWorkers();
  } catch (err) {
    showToast(err.message || 'Failed to update worker', 'error');
  }
}

if (showInactiveCheckbox) {
  showInactiveCheckbox.addEventListener('change', () => {
    loadWorkers();
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadCurrencySettings();
  } catch (_) {}
  loadWorkers();
});
