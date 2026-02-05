const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');

if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const table = document.getElementById('reportTable');
const siteFilter = document.getElementById('siteFilter');
const searchInput = document.getElementById('searchInput');

let allData = [];  // Store all data for filtering
let sortColumn = 'supplier';
let sortAscending = true;

/* =========================
   Helpers
   ========================= */
const num = v => isNaN(Number(v)) ? 0 : Number(v);
const euro = v => `€${num(v).toFixed(2)}`;

/* =========================
   Load Sites into Dropdown
   ========================= */
async function loadSites() {
  const res = await fetch('/sites', {
    headers: { Authorization: 'Bearer ' + token }
  });

  const sites = await res.json();

  siteFilter.innerHTML = `<option value="">All Sites</option>`;

  sites.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    siteFilter.appendChild(opt);
  });
}

/* =========================
   Sort Table
   ========================= */
function sortTable(column) {
  // Toggle sort direction if same column clicked
  if (sortColumn === column) {
    sortAscending = !sortAscending;
  } else {
    sortColumn = column;
    sortAscending = true;
  }

  // Sort data
  allData.sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];

    // Convert to numbers for numeric columns
    if (column !== 'supplier') {
      aVal = num(aVal);
      bVal = num(bVal);
    } else {
      // Case-insensitive string comparison
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }

    if (sortAscending) {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  // Update sort indicators
  updateSortIndicators();
  // Render filtered/sorted data
  renderTable();
}

/* =========================
   Update Sort Indicators
   ========================= */
function updateSortIndicators() {
  const headers = document.querySelectorAll('th.sortable');
  const columnMap = ['supplier', 'total_po_net', 'total_po_vat', 'total_po_gross', 'total_invoiced_net', 'uninvoiced_net'];

  headers.forEach((header, index) => {
    const indicator = header.querySelector('.sort-indicator');
    if (columnMap[index] === sortColumn) {
      indicator.textContent = sortAscending ? ' ↑' : ' ↓';
      indicator.style.color = '#2563eb';
    } else {
      indicator.textContent = '';
      indicator.style.color = '#9ca3af';
    }
  });
}

/* =========================
   Filter and Render
   ========================= */
function renderTable() {
  const searchTerm = searchInput.value.toLowerCase();

  // Filter data based on search
  const filteredData = allData.filter(r =>
    r.supplier.toLowerCase().includes(searchTerm)
  );

  table.innerHTML = '';

  if (filteredData.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: #9ca3af;">
          ${searchTerm ? 'No suppliers match your search' : 'No suppliers found'}
        </td>
      </tr>
    `;
    return;
  }

  filteredData.forEach(r => {
    table.innerHTML += `
      <tr>
        <td>${r.supplier}</td>
        <td>${euro(r.total_po_net)}</td>
        <td>${euro(r.total_po_vat)}</td>
        <td>${euro(r.total_po_gross)}</td>
        <td>${euro(r.total_invoiced_net)}</td>
        <td>
          <span class="${
            r.uninvoiced_net < 0 ? 'over' :
            r.uninvoiced_net === 0 ? 'ok' : 'warn'
          }">
            ${euro(r.uninvoiced_net)}
          </span>
        </td>
        <td>
          <button class="btn btn-outline-primary" onclick="viewSupplierPOs('${r.supplier.replace(/'/g, "\\'")}')">View</button>
        </td>
      </tr>
    `;
  });
}

/* =========================
   Load Report
   ========================= */
async function loadReport() {
  const siteId = siteFilter.value;

  const url = siteId
    ? `/reports/po-totals-by-supplier?siteId=${siteId}`
    : `/reports/po-totals-by-supplier`;

  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    showToast('Failed to load report', 'error');
    return;
  }

  allData = await res.json();
  sortTable(sortColumn);  // Sort and render
}

/* =========================
   Events
   ========================= */
siteFilter.addEventListener('change', loadReport);
searchInput.addEventListener('input', renderTable);

/* =========================
   Export
   ========================= */
function exportExcel() {
  const siteId = siteFilter.value;
  const token = localStorage.getItem('token');

  let url = `/reports/supplier-totals.xlsx?token=${encodeURIComponent(token)}`;

  if (siteId) {
    url += `&siteId=${siteId}`;
  }

  window.location.href = url;
}




/* =========================
   View Supplier POs
   ========================= */
function viewSupplierPOs(supplierName) {
  // Navigate to dashboard and set supplier filter
  // Clear date filters so all POs for that supplier are shown
  sessionStorage.setItem('filterSupplier', supplierName);
  sessionStorage.setItem('clearDateFilter', 'true');
  window.location.href = 'dashboard.html';
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
loadSites().then(loadReport);
