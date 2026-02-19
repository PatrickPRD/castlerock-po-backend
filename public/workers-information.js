const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || !['super_admin', 'admin'].includes(role)) {
  location.href = 'dashboard.html';
}

const table = document.getElementById('reportTable');
const searchInput = document.getElementById('searchInput');
const leaveYearLabel = document.getElementById('leaveYearLabel');
const leaveYearSelect = document.getElementById('leaveYearSelect');
const sortHeaders = document.querySelectorAll('th.sortable');
const loadingIndicator = document.getElementById('leaveReportLoading');
const tableWrapper = document.querySelector('.leave-report-table-wrapper');
const blankWorkerPdfBtn = document.getElementById('blankWorkerPdfBtn');

let allData = [];
let sortColumn = 'name';
let sortAscending = true;
let currentLeaveYear = null;

function num(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function formatDisplayDate(value) {
  if (!value) return '-';
  const raw = value instanceof Date ? value : String(value);
  const date = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function isPastDate(value) {
  if (!value) return false;
  const raw = value instanceof Date ? value : String(value);
  const date = raw.includes('T') ? new Date(raw) : new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' });
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

function sortData() {
  allData.sort((a, b) => {
    let aVal = a[sortColumn];
    let bVal = b[sortColumn];

    if (sortColumn === 'name') {
      aVal = String(aVal || '').toLowerCase();
      bVal = String(bVal || '').toLowerCase();
    } else {
      aVal = num(aVal);
      bVal = num(bVal);
    }

    if (aVal === bVal) return 0;
    if (sortAscending) return aVal > bVal ? 1 : -1;
    return aVal < bVal ? 1 : -1;
  });

  updateSortIndicators();
}

function setLoading(isLoading) {
  if (loadingIndicator) {
    loadingIndicator.style.display = isLoading ? 'flex' : 'none';
    loadingIndicator.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }
  if (tableWrapper) {
    tableWrapper.style.opacity = isLoading ? '0.35' : '1';
    tableWrapper.style.pointerEvents = isLoading ? 'none' : 'auto';
  }
}

function renderTable() {
  const term = (searchInput?.value || '').trim().toLowerCase();
  const filtered = term
    ? allData.filter(row => String(row.name || '').toLowerCase().includes(term))
    : allData;

  table.innerHTML = '';

  if (!filtered.length) {
    table.innerHTML = `
      <tr>
        <td colspan="12" style="text-align: center; padding: 2rem; color: #9ca3af;">
          ${term ? 'No workers match your search' : 'No worker information found'}
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(row => {
    const hasUnpaid = num(row.sick) > 0 || num(row.unpaid_leave) > 0 || num(row.absent) > 0;
    const safePassExpiry = formatDisplayDate(row.safe_pass_expiry_date);
    const safePassExpired = isPastDate(row.safe_pass_expiry_date);
    const safePassClass = safePassExpired ? 'text-danger fw-semibold' : '';
    table.innerHTML += `
      <tr class="${hasUnpaid ? 'leave-row-unpaid' : ''}">
        <td data-label="Worker"><span class="cell-value">${row.name}</span></td>
        <td data-label="Paid Sick"><span class="cell-value">${num(row.paid_sick)}</span></td>
        <td data-label="Paid Sick Remaining"><span class="cell-value">${num(row.paid_sick_remaining)}</span></td>
        <td data-label="Unpaid Sick"><span class="cell-value">${num(row.sick)}</span></td>
        <td data-label="Annual Leave"><span class="cell-value">${num(row.annual_leave)}</span></td>
        <td data-label="Annual Leave Remaining"><span class="cell-value">${num(row.annual_leave_remaining)}</span></td>
        <td data-label="Unpaid Leave"><span class="cell-value">${num(row.unpaid_leave)}</span></td>
        <td data-label="Bank Holidays"><span class="cell-value">${num(row.bank_holiday)}</span></td>
        <td data-label="Bank Holidays Remaining"><span class="cell-value">${num(row.bank_holiday_remaining)}</span></td>
        <td data-label="Absent"><span class="cell-value">${num(row.absent)}</span></td>
        <td data-label="Safe Pass Expiry"><span class="cell-value ${safePassClass}">${safePassExpiry}</span></td>
        <td class="pdf-col">
          <button
            type="button"
            class="btn btn-sm btn-outline-primary worker-pdf-btn"
            data-worker-id="${row.id}"
            data-worker-name="${row.name}"
          >PDF</button>
        </td>
      </tr>
    `;
  });
}

function buildLeaveYearOptions(years, selectedYear) {
  if (!leaveYearSelect) return;
  leaveYearSelect.innerHTML = '';

  years.forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = `${year}-${year + 1}`;
    if (Number(year) === Number(selectedYear)) {
      option.selected = true;
    }
    leaveYearSelect.appendChild(option);
  });
}

async function downloadWorkerPdf(workerId, workerName, button) {
  if (!workerId) return;
  
  showToast(`Generating PDF for ${workerName}...`, 'info');

  try {
    const yearParam = Number.isInteger(currentLeaveYear) ? `?year=${encodeURIComponent(currentLeaveYear)}` : '';
    const res = await fetch(`/pdfs/worker/${encodeURIComponent(workerId)}${yearParam}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!res.ok) {
      showToast('Failed to generate worker PDF', 'error');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const safeName = String(workerName || 'worker')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '');

    const link = document.createElement('a');
    link.href = url;
    link.download = `Worker-${safeName || 'worker'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    showToast('PDF generated successfully', 'success');
  } catch (error) {
    showToast('Failed to generate worker PDF', 'error');
  }
}

async function downloadBlankWorkerPdf() {
  showToast('Generating blank worker PDF...', 'info');

  try {
    const yearParam = Number.isInteger(currentLeaveYear) ? `?year=${encodeURIComponent(currentLeaveYear)}` : '';
    const res = await fetch(`/pdfs/worker-blank${yearParam}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!res.ok) {
      showToast('Failed to generate blank worker PDF', 'error');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const yearSuffix = Number.isInteger(currentLeaveYear) ? `-${currentLeaveYear}` : '';

    const link = document.createElement('a');
    link.href = url;
    link.download = `Worker-Blank-Form${yearSuffix}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('Blank worker PDF generated', 'success');
  } catch (error) {
    showToast('Failed to generate blank worker PDF', 'error');
  }
}

async function loadReport(selectedYear) {
  setLoading(true);
  try {
    const yearParam = Number.isInteger(Number(selectedYear)) ? `?year=${encodeURIComponent(selectedYear)}` : '';
    const res = await fetch(`/reports/workers-information${yearParam}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!res.ok) {
      showToast('Failed to load workers information report', 'error');
      return;
    }

    const data = await res.json();
    allData = Array.isArray(data.rows) ? data.rows : [];

    const selectedLeaveYear = Number.isInteger(Number(selectedYear))
      ? Number(selectedYear)
      : Number(data.leave_year_start_year);

    currentLeaveYear = Number.isInteger(selectedLeaveYear) ? selectedLeaveYear : null;

    if (leaveYearSelect && Array.isArray(data.available_years)) {
      const availableYears = data.available_years
        .map(year => Number(year))
        .filter(year => Number.isInteger(year));

      if (currentLeaveYear && !availableYears.includes(currentLeaveYear)) {
        availableYears.unshift(currentLeaveYear);
      }

      buildLeaveYearOptions(availableYears, currentLeaveYear);
    }

    if (leaveYearLabel) {
      leaveYearLabel.textContent = `Leave year ${formatDate(data.start_date)} to ${formatDate(data.end_date)} (starts ${data.leave_year_start || '01-01'})`;
    }

    sortData();
    renderTable();
  } finally {
    setLoading(false);
  }
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
    sortData();
    renderTable();
  });
});

if (searchInput) {
  searchInput.addEventListener('input', () => {
    renderTable();
  });
}

if (leaveYearSelect) {
  leaveYearSelect.addEventListener('change', () => {
    const year = Number(leaveYearSelect.value);
    if (Number.isInteger(year)) {
      loadReport(year).catch(() => {
        showToast('Failed to load workers information report', 'error');
      });
    }
  });
}

if (blankWorkerPdfBtn) {
  blankWorkerPdfBtn.addEventListener('click', () => {
    downloadBlankWorkerPdf();
  });
}

table.addEventListener('click', event => {
  const button = event.target.closest('.worker-pdf-btn');
  if (!button) return;
  const workerId = button.dataset.workerId;
  const workerName = button.dataset.workerName;
  downloadWorkerPdf(workerId, workerName, button);
});

loadReport().catch(() => {
  showToast('Failed to load workers information report', 'error');
});