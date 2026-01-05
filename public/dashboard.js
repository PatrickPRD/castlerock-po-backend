console.log('dashboard.js loaded');

const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');

if (!token) location.href = 'login.html';

const poTable = document.getElementById('poTable');

const statusFilter   = document.getElementById('statusFilter');
const supplierFilter = document.getElementById('supplierFilter');
const siteFilter     = document.getElementById('siteFilter');
const locationFilter = document.getElementById('locationFilter');
const stageFilter    = document.getElementById('stageFilter');
const dateFrom       = document.getElementById('dateFrom');
const dateTo         = document.getElementById('dateTo');
const valueMin       = document.getElementById('valueMin');
const valueMax       = document.getElementById('valueMax');


let allPOs = [];

/* ============================
   Utilities
   ============================ */
function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function euro(v) {
  return `€${num(v).toFixed(2)}`;
}

/* ============================
   Load Purchase Orders
   ============================ */
async function loadPOs() {
  const res = await fetch('/purchase-orders', {
    headers: { Authorization: 'Bearer ' + token }
  });

  allPOs = await res.json();
  populateFilters();
  applyFilters();
}

/* ============================
   Default Date Filter
   ============================ */
function setDefaultDateFilter() {
  const today = new Date();
  const from = new Date();
  from.setMonth(today.getMonth() - 1);

  dateTo.value = today.toISOString().slice(0, 10);
  dateFrom.value = from.toISOString().slice(0, 10);
}


/* ============================
   Populate Filters
   ============================ */
function populateFilters() {
  fillSelect(supplierFilter, new Set(allPOs.map(p => p.supplier)));
  fillSelect(siteFilter,     new Set(allPOs.map(p => p.site)));
  fillSelect(locationFilter, new Set(allPOs.map(p => p.location)));

  if (stageFilter) {
    fillSelect(
      stageFilter,
      new Set(allPOs.map(p => p.stage).filter(Boolean))
    );
  }
}


function fillSelect(select, values) {
  select.innerHTML = '<option value="">All</option>';
  [...values].sort().forEach(v => {
    if (!v) return;
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

/* ============================
   Apply Filters
   ============================ */
function applyFilters() {
  poTable.innerHTML = '';

  allPOs.filter(po => {
    const uninvoiced = num(po.uninvoiced_net);

    if (statusFilter.value === 'outstanding' && uninvoiced <= 0) return false;
    if (statusFilter.value === 'complete'    && uninvoiced !== 0) return false;

    if (supplierFilter.value && po.supplier !== supplierFilter.value) return false;
    if (siteFilter.value     && po.site     !== siteFilter.value)     return false;
    if (locationFilter.value && po.location !== locationFilter.value) return false;
    if (stageFilter.value && po.stage !== stageFilter.value) return false;



    if (dateFrom.value && po.po_date < dateFrom.value) return false;
    if (dateTo.value   && po.po_date > dateTo.value)   return false;

    if (valueMin.value && num(po.net_amount) < num(valueMin.value)) return false;
    if (valueMax.value && num(po.net_amount) > num(valueMax.value)) return false;

    return true;
  }).forEach(renderPO);
}

/* ============================
   Render Purchase Order
   ============================ */
function renderPO(po) {
  const net        = num(po.net_amount);
  const uninvoiced = num(po.uninvoiced_net);

  const isOver        = uninvoiced < 0;
  const isComplete    = uninvoiced === 0;
  const isOutstanding = uninvoiced > 0;

  /* MAIN ROW */
  const mainRow = document.createElement('tr');

  if (isOver) {
    mainRow.classList.add('po-over');
  } else if (isComplete) {
    mainRow.classList.add('po-complete');
  } else {
    mainRow.classList.add('po-outstanding');
  }

  mainRow.innerHTML = `
    <td>${po.po_number}</td>
    <td>${po.po_date}</td>
    <td>${po.supplier}</td>
    <td>${po.location}</td>
    <td>${po.stage}</td>
    <td>${euro(net)}</td>
  `;

  /* DETAILS ROW */
const detailsRow = document.createElement('tr');
detailsRow.className = 'details-row';
detailsRow.style.display = 'none';

detailsRow.innerHTML = `
  <td colspan="5">
    <div class="details-grid">
      <div><strong>Site:</strong> ${po.site}</div>
      <div><strong>Net (ex VAT):</strong> €${Number(po.net_amount).toFixed(2)}</div>

      <div>
        <strong>Uninvoiced (ex VAT):</strong>
        <span class="${
          po.uninvoiced_net < 0 ? 'over' :
          po.uninvoiced_net === 0 ? 'ok' : 'warn'
        }">
          €${Number(po.uninvoiced_net).toFixed(2)}
        </span>
      </div>
    </div>

    <div class="invoice-container" id="inv-${po.id}">
      <p class="muted">Loading invoices…</p>
    </div>

    <div class="details-actions">
      <button class="btn-outline" onclick="editPO(${po.id})">Edit PO</button>

      ${role !== 'viewer'
        ? `<button class="btn-primary" onclick="addInvoice(${po.id})">Invoices</button>`
        : ''}

      ${role === 'admin' || role === 'super_admin'
        ? `<button class="btn-danger" onclick="deletePO(${po.id})">Delete</button>`
        : ''}
    </div>
  </td>
`;


let loaded = false;

mainRow.onclick = () => {
  const show = detailsRow.style.display === 'none';
  detailsRow.style.display = show ? 'table-row' : 'none';

  if (show && !loaded) {
    loadInvoices(po.id, document.getElementById(`inv-${po.id}`));
    loaded = true;
  }
};


  poTable.appendChild(mainRow);
  poTable.appendChild(detailsRow);
}

async function loadInvoices(poId, container) {
  const res = await fetch(`/invoices?poId=${poId}`, {
    headers: { Authorization: 'Bearer ' + token }
  });

  const invoices = await res.json();

  if (!invoices.length) {
    container.innerHTML = `<p class="muted">No invoices</p>`;
    return;
  }

  let html = `
    <table class="sub-table">
      <thead>
        <tr>
          <th>Invoice #</th>
          <th>Date</th>
          <th>Net (ex VAT)</th>
          <th>VAT %</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  invoices.forEach(i => {
    html += `
      <tr>
        <td>${i.invoice_number}</td>
        <td>${i.invoice_date}</td>
        <td>€${Number(i.net_amount).toFixed(2)}</td>
        <td>${i.vat_rate}%</td>
        <td>€${Number(i.total_amount).toFixed(2)}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}



/* ============================
   Actions
   ============================ */
function editPO(id) {
  location.href = `edit-po.html?id=${id}`;
}

function addInvoice(id) {
  location.href = `invoice-entry.html?poId=${id}`;
}

async function deletePO(id) {
  if (!confirm('Cancel this Purchase Order?\nThis cannot be undone.')) return;

  const res = await fetch(`/purchase-orders/${id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Failed to cancel Purchase Order');
    return;
  }

  loadPOs();
}


/* ============================
   Filter Events
   ============================ */
[
  statusFilter,
  supplierFilter,
  siteFilter,
  locationFilter,
  dateFrom,
  dateTo,
  valueMin,
  valueMax
].forEach(el => el.addEventListener('change', applyFilters));

function clearFilters() {
  statusFilter.value = 'all';
  supplierFilter.value = '';
  siteFilter.value = '';
  locationFilter.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  valueMin.value = '';
  valueMax.value = '';
  applyFilters();
}


  if (role === 'super_admin') {
    document.getElementById('reportsDropdown').style.display = 'block';
  }

/* ============================
   MENU SYSTEM (AUTHORITATIVE)
   ============================ */

function isMobile() {
  return window.innerWidth <= 768;
}

function closeMenus() {
  console.log('closeMenus');

  document.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.classList.remove('show');
    menu.style.left = '';
    menu.style.top = '';
  });

  document.querySelector('.menu-backdrop')?.remove();
}

function toggleActionsMenu(btn, e) {
  e?.stopPropagation();
  toggleMenu(btn, 'actionsMenu');
}

function toggleReportsMenu(btn, e) {
  e?.stopPropagation();
  toggleMenu(btn, 'reportsMenu');
}


function toggleMenu(button, menuId) {
  console.log('toggleMenu:', menuId);

  const menu = document.getElementById(menuId);
  if (!menu) {
    console.error('Menu not found:', menuId);
    return;
  }

  const alreadyOpen = menu.classList.contains('show');
  closeMenus();
  if (alreadyOpen) return;

  if (isMobile()) {
    openMobileMenu(button, menu);
  } else {
    menu.classList.add('show');
  }
}

function openMobileMenu(button, menu) {
  console.log('openMobileMenu');

  const rect = button.getBoundingClientRect();
  menu.classList.add('show');

  const w = menu.offsetWidth;
  const h = menu.offsetHeight;

  let left = rect.left;
  let top  = rect.bottom + 8;

  if (left + w > window.innerWidth - 8) {
    left = window.innerWidth - w - 8;
  }
  if (left < 8) left = 8;

  if (top + h > window.innerHeight - 8) {
    top = rect.top - h - 8;
  }

  menu.style.left = `${left}px`;
  menu.style.top  = `${top}px`;

  document.body.insertAdjacentHTML(
    'beforeend',
    '<div class="menu-backdrop" onclick="closeMenus()"></div>'
  );
}

document.querySelectorAll('.dropdown-menu').forEach(menu => {
  menu.addEventListener('click', e => e.stopPropagation());
});

if (window.innerWidth > 768) {
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown')) {
      closeMenus();
    }
  });
}





/* ============================
   Init
   ============================ */
    setDefaultDateFilter();
   loadPOs();
