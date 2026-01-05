console.log("dashboard.js loaded");

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token) location.href = "login.html";

const poTable = document.getElementById("poTable");

const statusFilter = document.getElementById("statusFilter");
const supplierFilter = document.getElementById("supplierFilter");
const siteFilter = document.getElementById("siteFilter");
const locationFilter = document.getElementById("locationFilter");
const stageFilter = document.getElementById("stageFilter");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const valueMin = document.getElementById("valueMin");
const valueMax = document.getElementById("valueMax");
const totalNetEl = document.getElementById("totalNet");
const totalGrossEl = document.getElementById("totalGross");
const poCountEl = document.getElementById("poCount");

let openDetailsRow = null;

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

function formatVat(rate) {
  const n = Number(rate);

  if (n === 0) return "0%";
  if (n === 13.5) return "13.5%";
  if (n === 23) return "23%";

  // fallback (should rarely happen)
  return `${n}%`;
}

/* ============================
   Load Purchase Orders
   ============================ */
async function loadPOs() {
  const res = await fetch("/purchase-orders", {
    headers: { Authorization: "Bearer " + token },
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
  fillSelect(supplierFilter, new Set(allPOs.map((p) => p.supplier)));
  fillSelect(siteFilter, new Set(allPOs.map((p) => p.site)));
  fillSelect(locationFilter, new Set(allPOs.map((p) => p.location)));

  if (stageFilter) {
    fillSelect(
      stageFilter,
      new Set(allPOs.map((p) => p.stage).filter(Boolean))
    );
  }
}

function fillSelect(select, values) {
  select.innerHTML = '<option value="">All</option>';
  [...values].sort().forEach((v) => {
    if (!v) return;
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

/* ============================
   Apply Filters
   ============================ */
function applyFilters() {
  poTable.innerHTML = "";

  let totalNet = 0;
  let totalGross = 0;

  const filtered = allPOs.filter((po) => {
    const uninvoiced = num(po.uninvoiced_total);

    if (statusFilter.value === "outstanding" && uninvoiced <= 0) return false;
    if (statusFilter.value === "complete" && uninvoiced !== 0) return false;

    if (supplierFilter.value && po.supplier !== supplierFilter.value)
      return false;
    if (siteFilter.value && po.site !== siteFilter.value) return false;
    if (locationFilter.value && po.location !== locationFilter.value)
      return false;
    if (stageFilter.value && po.stage !== stageFilter.value) return false;

    if (dateFrom.value && po.po_date < dateFrom.value) return false;
    if (dateTo.value && po.po_date > dateTo.value) return false;

    if (valueMin.value && num(po.total_amount) < num(valueMin.value))
      return false;
    if (valueMax.value && num(po.total_amount) > num(valueMax.value))
      return false;

    return true;
  });

  filtered.forEach((po) => {
    totalNet += num(po.net_amount);
    totalGross += num(po.total_amount);
    renderPO(po);
  });

  poCountEl.textContent = filtered.length;

  // Update totals bar
  totalNetEl.textContent = euro(totalNet);
  totalGrossEl.textContent = euro(totalGross);
}

/* ============================
   Render Purchase Order
   ============================ */
function renderPO(po) {
  const net = num(po.total_amount); // 🔁 was net_amount
  const uninvoiced = num(po.uninvoiced_total); // 🔁 was uninvoiced_net

  const isOver = uninvoiced < 0;
  const isComplete = uninvoiced === 0;
  const isOutstanding = uninvoiced > 0;

  const mainRow = document.createElement("tr");
  mainRow.classList.add("po-row");

  if (isOver) {
    mainRow.classList.add("po-over");
  } else if (isComplete) {
    mainRow.classList.add("po-complete");
  } else {
    mainRow.classList.add("po-outstanding");
  }

  mainRow.innerHTML = `
  <td data-label="PO Number">${po.po_number}</td>
  <td data-label="Date">${po.po_date}</td>
  <td data-label="Supplier">${po.supplier}</td>
  <td data-label="Location">${po.location}</td>
  <td data-label="Stage">${po.stage.slice(0, 10)}</td>
  <td data-label="Total (inc VAT)">${euro(net)}</td>
`;

  const detailsRow = document.createElement("tr");
  detailsRow.className = "details-row";
  detailsRow.style.display = "none";

  detailsRow.innerHTML = `
    <td colspan="6">
    <div class="details-wrapper">
<div class="details-grid">
  <div><strong>Site:</strong> ${po.site}</div>
  <div><strong>VAT Rate:</strong> ${formatVat(po.vat_rate)}</div>
  <div><strong>Total (inc VAT):</strong> €${Number(po.total_amount).toFixed(
    2
  )}</div>

  <div>
    <strong>Uninvoiced (inc VAT):</strong>
    <span class="${
      po.uninvoiced_total < 0
        ? "over"
        : po.uninvoiced_total === 0
        ? "ok"
        : "warn"
    }">
      €${Number(po.uninvoiced_total).toFixed(2)}
    </span>
  </div>
</div>


      <div class="invoice-container" id="inv-${po.id}">
        <p class="muted">Loading invoices…</p>
      </div>

      <div class="details-actions">
        <button class="btn-outline" onclick="editPO(${po.id})">Edit PO</button>
        ${
          role !== "viewer"
            ? `<button class="btn-primary" onclick="addInvoice(${po.id})">Invoices</button>`
            : ""
        }
        ${
          role === "admin" || role === "super_admin"
            ? `<button class="btn-danger" onclick="deletePO(${po.id})">Delete</button>`
            : ""
        }
      </div>
          </div> 
    </td>
  `;

  let loaded = false;

  mainRow.onclick = () => {
    const isOpen = detailsRow.classList.contains("open");

    // Close previously open PO
    if (openDetailsRow && openDetailsRow !== detailsRow) {
      openDetailsRow.classList.remove("open");
      openDetailsRow.style.display = "none";

      // remove highlight from previous main row
      openDetailsRow.previousSibling?.classList.remove("open", "active");
    }

    if (isOpen) {
      // Close current
      detailsRow.classList.remove("open");
      detailsRow.style.display = "none";
      mainRow.classList.remove("open", "active");
      openDetailsRow = null;
    } else {
      // Open current
      detailsRow.style.display = "table-row";
      detailsRow.classList.add("open");
      mainRow.classList.add("open", "active");
      openDetailsRow = detailsRow;

      if (!loaded) {
        loadInvoices(po.id, document.getElementById(`inv-${po.id}`));
        loaded = true;
      }

      // 🔽 Ensure expanded PO is not hidden behind sticky bar
      requestAnimationFrame(() => {
        scrollExpandedRowIntoView(detailsRow);
      });
    }
  };

  poTable.appendChild(mainRow);
  poTable.appendChild(detailsRow);
}

async function loadInvoices(poId, container) {
  const res = await fetch(`/invoices?poId=${poId}`, {
    headers: { Authorization: "Bearer " + token },
  });

  const invoices = await res.json();

  if (!invoices.length) {
    container.innerHTML = `<p class="muted">No invoices</p>`;
    return;
  }

  let html = `
  <div class="card invoice-card">
    <h4>Invoices</h4>

    <table class="data-table">
      <thead>
        <tr>
          <th>Invoice #</th>
          <th>Date</th>
          <th>Net (ex VAT)</th>
          <th>VAT %</th>
          <th>Total (inc VAT)</th>
        </tr>
      </thead>
      <tbody>
`;

  invoices.forEach((i) => {
    html += `
    <tr>
      <td>${i.invoice_number}</td>
      <td>${i.invoice_date}</td>
      <td>€${Number(i.net_amount).toFixed(2)}</td>
      <td>${formatVat(i.vat_rate)}</td>
      <td>€${Number(i.total_amount).toFixed(2)}</td>
    </tr>
  `;
  });

  html += `
      </tbody>
    </table>
  </div>
`;

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
  if (!confirm("Cancel this Purchase Order?\nThis cannot be undone.")) return;

  const res = await fetch(`/purchase-orders/${id}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || "Failed to cancel Purchase Order");
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
  stageFilter,
  dateFrom,
  dateTo,
  valueMin,
  valueMax,
].forEach((el) => el.addEventListener("change", applyFilters));

function clearFilters() {
  statusFilter.value = "all";
  supplierFilter.value = "";
  siteFilter.value = "";
  locationFilter.value = "";
  stageFilter.value = "";
  dateFrom.value = "";
  dateTo.value = "";
  valueMin.value = "";
  valueMax.value = "";
  applyFilters();
}

if (role === "super_admin") {
  document.getElementById("reportsDropdown").style.display = "block";
}

/* ============================
   PORTALED MENUS (FINAL)
   ============================ */

function closeMenus() {
  document.querySelectorAll(".dropdown-menu.portal").forEach((m) => m.remove());

  document.querySelector(".menu-backdrop")?.remove();
}

function openMenu(btn, menuId) {
  closeMenus();

  const original = document.getElementById(menuId);
  if (!original) return;

  // Clone menu into body (portal)
  const menu = original.cloneNode(true);
  menu.classList.add("portal");
  menu.classList.add("show");

  document.body.appendChild(menu);

  const rect = btn.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;

  let left = rect.left;
  let top = rect.bottom + 8;

  if (left + w > window.innerWidth - 8) {
    left = window.innerWidth - w - 8;
  }
  if (left < 8) left = 8;

  if (top + h > window.innerHeight - 8) {
    top = rect.top - h - 8;
  }

  menu.style.position = "fixed";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.zIndex = "10001";

  document.body.insertAdjacentHTML(
    "beforeend",
    '<div class="menu-backdrop" onclick="closeMenus()"></div>'
  );
}

function toggleActionsMenu(btn) {
  openMenu(btn, "actionsMenu");
}

function toggleReportsMenu(btn) {
  openMenu(btn, "reportsMenu");
}

function scrollExpandedRowIntoView(detailsRow) {
  const rect = detailsRow.getBoundingClientRect();

  const stickyBar = document.getElementById("dashboardTotals");
  const stickyHeight = stickyBar ? stickyBar.offsetHeight : 0;

  const viewportHeight = window.innerHeight;

  // If bottom of details row is hidden by sticky bar
  if (rect.bottom > viewportHeight - stickyHeight) {
    const scrollByAmount = rect.bottom - (viewportHeight - stickyHeight) + 16;

    window.scrollBy({
      top: scrollByAmount,
      behavior: "smooth",
    });
  }
}

/* ============================
   Init
   ============================ */
setDefaultDateFilter();
loadPOs();
