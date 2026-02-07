

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
   Filter Panel Toggle
   ============================ */
function toggleFilters() {
  const panel = document.getElementById("filterPanel");
  if (panel) {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  }
}

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

  if (n === 0) return '0%';
  if (n === 13.5) return '13.5%';
  if (n === 23) return '23%';
  
  // Handle decimal format (0.1350 -> 13.5%, 0.2300 -> 23%)
  if (n < 1) {
    const percentage = Math.round(n * 1000) / 10; // Avoid floating point errors
    return `${percentage}%`;
  }

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
  // Skip setting default date filter if coming from supplier report
  if (clearDateFilter) {
    dateFrom.value = '';
    dateTo.value = '';
    return;
  }

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

  // Apply stored supplier filter if it exists
  if (storedSupplier) {
    supplierFilter.value = storedSupplier;
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

const storedToast = sessionStorage.getItem('toast');
if (storedToast) {
  const { message, type } = JSON.parse(storedToast);
  showToast(message, type);
  sessionStorage.removeItem('toast');
}

// Check for stored supplier filter from supplier report
const storedSupplier = sessionStorage.getItem('filterSupplier');
const clearDateFilter = sessionStorage.getItem('clearDateFilter');
if (storedSupplier) {
  sessionStorage.removeItem('filterSupplier');
}
if (clearDateFilter) {
  sessionStorage.removeItem('clearDateFilter');
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
    const invoiced = num(po.invoiced_total);

    if (statusFilter.value === "outstanding" && uninvoiced <= 0) return false;
    if (statusFilter.value === "complete" && uninvoiced !== 0) return false;
    if (statusFilter.value === "over-invoiced" && invoiced <= num(po.total_amount)) return false;

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
      <div style="display: flex; gap: 2rem;">
        <div class="details-grid" style="flex: 0 0 auto;">
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
        
        <div style="flex: 1; min-width: 0;">
          <div><strong>Description:</strong></div>
          <div style="padding: 0.75rem; background: #f9f9f9; border-radius: 4px; border-left: 3px solid #007bff; word-wrap: break-word;">
            ${po.description || '<span style="color: #999;">No description</span>'}
          </div>
        </div>
      </div>


      <div class="invoice-container" id="inv-${po.id}">
        <p class="muted">Loading invoices…</p>
      </div>

      <div class="details-actions">
        <button class="btn btn-outline-primary" onclick="editPO(${po.id})">Edit PO</button>
        ${
          role !== "viewer"
            ? `<button class="btn btn-primary" onclick="addInvoice(${po.id})">Invoices</button>`
            : ""
        }
        ${
          role === "admin" || role === "super_admin"
            ? `<button class="btn btn-danger" onclick="deletePO(${po.id})">Delete</button>`
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
          <th>ID</th>
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
      <td>${i.id}</td>
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
async function editPO(id) {
  const modal = document.getElementById("editPOModal");
  modal.style.display = "flex";
  
  // Load PO data
  try {
    const res = await fetch(`/purchase-orders/${id}`, {
      headers: { Authorization: "Bearer " + token }
    });
    
    if (!res.ok) {
      showToast("Failed to load purchase order", "error");
      closeEditPOModal();
      return;
    }
    
    const po = await res.json();
    
    // Populate form
    document.getElementById("editPONumber").value = po.po_number;
    document.getElementById("editPOSite").value = po.site; // Display site name as text
    document.getElementById("editPODate").value = po.po_date.split('T')[0];
    document.getElementById("editPODescription").value = po.description || "";
    document.getElementById("editPONetAmount").value = po.net_amount;
    
    // Convert decimal VAT rate to percentage for dropdown (0.135 -> 13.5)
    const vatRatePercent = po.vat_rate < 1 ? po.vat_rate * 100 : po.vat_rate;
    document.getElementById("editPOVatRate").value = vatRatePercent;
    
    // Store the PO ID and site ID for submission
    document.getElementById("editPOForm").dataset.poId = id;
    document.getElementById("editPOForm").dataset.siteId = po.site_id;
    
    // Load dropdowns with selected values
    await loadEditPOSuppliers(po.supplier_id);
    await loadEditPOStages(po.stage_id);
    
    // Load locations for the selected site
    if (po.site_id) {
      await loadEditPOLocations(po.site_id, po.location_id);
    }
    
    // Recalculate totals
    recalcEditPO();
    
  } catch (err) {
    showToast("Failed to load purchase order", "error");
    console.error(err);
    closeEditPOModal();
  }
}

function closeEditPOModal() {
  const modal = document.getElementById("editPOModal");
  modal.style.display = "none";
  document.getElementById("editPOForm").reset();
}

function addInvoice(id) {
  location.href = `invoice-entry.html?poId=${id}`;
}

async function deletePO(id) {
  if (!(await confirmDialog("Cancel this Purchase Order?\nThis cannot be undone."))) return;

  const res = await fetch(`/purchase-orders/${id}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });

  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || "Failed to cancel Purchase Order", "error");
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
  
  // Reset supplier dropdown button text
  const supplierBtn = document.querySelector('.searchable-select-btn');
  if (supplierBtn) {
    supplierBtn.innerHTML = 'Select Supplier <span style="color: #666;">▼</span>';
  }
  
  applyFilters();
}

/* ============================
   Searchable Supplier Filter
   ============================ */
function setupSearchableSupplierFilter() {
  // Create a wrapper for the custom dropdown
  const originalSelect = supplierFilter;
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  originalSelect.parentNode.insertBefore(wrapper, originalSelect);
  wrapper.appendChild(originalSelect);
  
  // Create button that shows current selection
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'searchable-select-btn';
  button.style.cssText = `
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    text-align: left;
    font-size: 0.95rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  button.innerHTML = 'Select Supplier <span style="color: #666;">▼</span>';
  
  // Hide the original select
  originalSelect.style.display = 'none';
  
  // Create dropdown menu
  const dropdown = document.createElement('div');
  dropdown.className = 'searchable-select-dropdown';
  dropdown.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    margin-top: 4px;
    z-index: 1000;
    display: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  `;
  
  // Create search input
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Type to filter...';
  searchInput.style.cssText = `
    width: 100%;
    padding: 0.5rem;
    border: none;
    border-bottom: 1px solid #eee;
    box-sizing: border-box;
    font-size: 0.9rem;
  `;
  
  // Create options container
  const optionsContainer = document.createElement('div');
  optionsContainer.className = 'searchable-select-options';
  optionsContainer.style.cssText = `
    max-height: 200px;
    overflow-y: auto;
  `;
  
  dropdown.appendChild(searchInput);
  dropdown.appendChild(optionsContainer);
  
  wrapper.appendChild(button);
  wrapper.appendChild(dropdown);
  
  // Get all suppliers from original select options
  function getSuppliers() {
    const options = [...originalSelect.options];
    return options
      .filter(opt => opt.value !== '')
      .map(opt => ({ value: opt.value, text: opt.textContent }))
      .sort((a, b) => a.text.localeCompare(b.text));
  }
  
  // Render options
  function renderOptions(filter = '') {
    optionsContainer.innerHTML = '';
    const suppliers = getSuppliers();
    const filtered = suppliers.filter(s => 
      s.text.toLowerCase().includes(filter.toLowerCase())
    );
    
    // "All" option
    const allDiv = document.createElement('div');
    allDiv.style.cssText = `
      padding: 0.5rem;
      cursor: pointer;
      border-bottom: 1px solid #f0f0f0;
      transition: background 0.2s;
    `;
    allDiv.textContent = 'All';
    allDiv.onmouseenter = () => allDiv.style.background = '#f5f5f5';
    allDiv.onmouseleave = () => allDiv.style.background = '';
    allDiv.onclick = () => {
      originalSelect.value = '';
      button.innerHTML = 'Select Supplier <span style="color: #666;">▼</span>';
      dropdown.style.display = 'none';
      applyFilters();
    };
    optionsContainer.appendChild(allDiv);
    
    if (filtered.length === 0) {
      const noResults = document.createElement('div');
      noResults.style.cssText = 'padding: 0.5rem; color: #999; text-align: center;';
      noResults.textContent = 'No suppliers found';
      optionsContainer.appendChild(noResults);
      return;
    }
    
    filtered.forEach(supplier => {
      const div = document.createElement('div');
      div.style.cssText = `
        padding: 0.5rem;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        transition: background 0.2s;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      
      const count = allPOs.filter(po => po.supplier === supplier.text).length;
      div.innerHTML = `
        <strong>${supplier.text}</strong>
        <span style="color: #999; font-size: 0.85rem;">(${count})</span>
      `;
      
      div.onmouseenter = () => div.style.background = '#f5f5f5';
      div.onmouseleave = () => div.style.background = '';
      div.onclick = () => {
        originalSelect.value = supplier.value;
        button.innerHTML = `${supplier.text} <span style="color: #666;">▼</span>`;
        dropdown.style.display = 'none';
        applyFilters();
      };
      
      optionsContainer.appendChild(div);
    });
  }
  
  // Toggle dropdown
  button.onclick = (e) => {
    e.preventDefault();
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    if (dropdown.style.display === 'block') {
      searchInput.focus();
      renderOptions();
    }
  };
  
  // Filter on input
  searchInput.addEventListener('input', (e) => {
    renderOptions(e.target.value);
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
  
  // Sync with original select changes
  originalSelect.addEventListener('change', () => {
    const selected = originalSelect.querySelector('option:checked');
    if (selected) {
      button.innerHTML = selected.value 
        ? `${selected.textContent} <span style="color: #666;">▼</span>`
        : 'Select Supplier <span style="color: #666;">▼</span>';
    }
  });
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

function toggleAdminMenu(btn) {
  openMenu(btn, "adminMenu");
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
   Create PO Modal Functions
   ============================ */

function openCreatePOModal() {
  const modal = document.getElementById("createPOModal");
  modal.style.display = "flex";
  
  // Set default date to today
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("poDate").value = today;
  
  // Load dropdown options
  loadPOSuppliers();
  loadPOSites();
  loadPOStages();
  
  // Reset form
  document.getElementById("poForm").reset();
  document.getElementById("poDate").value = today;
  document.getElementById("poVatAmount").textContent = "0.00";
  document.getElementById("poTotalAmount").textContent = "0.00";
  document.getElementById("poSupplierSearch").value = "";
  document.getElementById("poSupplier").value = "";
}

function closeCreatePOModal() {
  const modal = document.getElementById("createPOModal");
  modal.style.display = "none";
  document.getElementById("poForm").reset();
}

async function loadPOSuppliers() {
  try {
    const res = await fetch("/suppliers", {
      headers: { Authorization: "Bearer " + token }
    });
    const suppliers = await res.json();
    
    // Store suppliers globally for search
    window.poSuppliers = suppliers;
    
    // Set up searchable supplier input
    const searchInput = document.getElementById("poSupplierSearch");
    const dropdown = document.getElementById("poSupplierDropdown");
    const hiddenInput = document.getElementById("poSupplier");
    
    // Show all suppliers initially when focusing
    searchInput.addEventListener("focus", () => {
      filterAndShowSuppliers("");
    });
    
    // Filter as user types
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value;
      filterAndShowSuppliers(query);
    });
    
    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = "none";
      }
    });
    
    function filterAndShowSuppliers(query) {
      const filtered = window.poSuppliers.filter(s => 
        s.name.toLowerCase().includes(query.toLowerCase())
      );
      
      if (filtered.length === 0) {
        dropdown.innerHTML = '<div style="padding: 10px; color: #999;">No suppliers found</div>';
      } else {
        dropdown.innerHTML = filtered.map(s => 
          `<div class="supplier-option" data-id="${s.id}" data-name="${s.name}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;">${s.name}</div>`
        ).join('');
        
        // Add click handlers
        dropdown.querySelectorAll('.supplier-option').forEach(opt => {
          opt.addEventListener('click', () => {
            hiddenInput.value = opt.dataset.id;
            searchInput.value = opt.dataset.name;
            dropdown.style.display = 'none';
          });
          
          opt.addEventListener('mouseenter', () => {
            opt.style.backgroundColor = '#f0f0f0';
          });
          
          opt.addEventListener('mouseleave', () => {
            opt.style.backgroundColor = 'white';
          });
        });
      }
      
      dropdown.style.display = 'block';
      dropdown.style.width = searchInput.offsetWidth + 'px';
    }
    
  } catch (err) {
    console.error("Failed to load suppliers:", err);
  }
}

async function loadPOSites() {
  try {
    const res = await fetch("/sites", {
      headers: { Authorization: "Bearer " + token }
    });
    const sites = await res.json();
    
    const select = document.getElementById("poSite");
    select.innerHTML = '<option value="">Select Site</option>';
    sites.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load sites:", err);
  }
}

async function loadPOStages() {
  try {
    const res = await fetch("/stages", {
      headers: { Authorization: "Bearer " + token }
    });
    const stages = await res.json();
    
    const select = document.getElementById("poStage");
    select.innerHTML = '<option value="">Select Stage</option>';
    stages.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load stages:", err);
  }
}

// Site → Location cascade
document.addEventListener("DOMContentLoaded", () => {
  const poSiteSelect = document.getElementById("poSite");
  const poLocationSelect = document.getElementById("poLocation");
  
  if (poSiteSelect) {
    poSiteSelect.addEventListener("change", async () => {
      const siteId = poSiteSelect.value;
      poLocationSelect.innerHTML = '<option value="">Select Location</option>';
      
      if (!siteId) {
        poLocationSelect.disabled = true;
        return;
      }
      
      try {
        const res = await fetch(`/locations?siteId=${siteId}`, {
          headers: { Authorization: "Bearer " + token }
        });
        const locations = await res.json();
        
        locations.forEach(l => {
          const opt = document.createElement("option");
          opt.value = l.id;
          opt.textContent = l.name;
          poLocationSelect.appendChild(opt);
        });
        
        poLocationSelect.disabled = false;
      } catch (err) {
        console.error("Failed to load locations:", err);
      }
    });
  }
  
  // VAT calculation
  const netAmount = document.getElementById("poNetAmount");
  const vatRate = document.getElementById("poVatRate");
  const vatAmount = document.getElementById("poVatAmount");
  const totalAmount = document.getElementById("poTotalAmount");
  
  function recalcPO() {
    const net = Number(netAmount.value) || 0;
    const rate = Number(vatRate.value) || 0;
    const vat = net * (rate / 100);
    const total = net + vat;
    
    vatAmount.textContent = vat.toFixed(2);
    totalAmount.textContent = total.toFixed(2);
  }
  
  if (netAmount) netAmount.addEventListener("input", recalcPO);
  if (vatRate) vatRate.addEventListener("change", recalcPO);
  
  // Form submission
  const poForm = document.getElementById("poForm");
  if (poForm) {
    poForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const payload = {
        supplierId: document.getElementById("poSupplier").value,
        siteId: document.getElementById("poSite").value,
        locationId: document.getElementById("poLocation").value,
        stageId: document.getElementById("poStage").value,
        poDate: document.getElementById("poDate").value,
        description: document.getElementById("poDescription").value || "",
        netAmount: Number(document.getElementById("poNetAmount").value) || 0,
        vatRate: Number(document.getElementById("poVatRate").value) || 0
      };
      
      if (!payload.supplierId || !payload.siteId || !payload.locationId || !payload.poDate || !payload.stageId) {
        showToast("Supplier, site, location, stage and date are required", "error");
        return;
      }
      
      try {
        const res = await fetch("/purchase-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
          const err = await res.json();
          showToast(err.error || "Failed to create purchase order", "error");
          return;
        }
        
        const data = await res.json();
        showToast(`Purchase Order ${data.poNumber} created successfully`, "success");
        closeCreatePOModal();
        loadPOs(); // Reload the PO list
      } catch (err) {
        showToast("Failed to create purchase order", "error");
        console.error(err);
      }
    });
  }
});

/* ============================
   Edit PO Modal Functions
   ============================ */

async function loadEditPOSuppliers(selectedId) {
  try {
    const res = await fetch("/suppliers", {
      headers: { Authorization: "Bearer " + token }
    });
    const suppliers = await res.json();
    
    const select = document.getElementById("editPOSupplier");
    select.innerHTML = '<option value="">Select Supplier</option>';
    suppliers.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load suppliers:", err);
  }
}

async function loadEditPOSites(selectedId) {
  try {
    const res = await fetch("/sites", {
      headers: { Authorization: "Bearer " + token }
    });
    const sites = await res.json();
    
    const select = document.getElementById("editPOSite");
    select.innerHTML = '<option value="">Select Site</option>';
    sites.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load sites:", err);
  }
}

async function loadEditPOStages(selectedId) {
  try {
    const res = await fetch("/stages", {
      headers: { Authorization: "Bearer " + token }
    });
    const stages = await res.json();
    
    const select = document.getElementById("editPOStage");
    select.innerHTML = '<option value="">Select Stage</option>';
    stages.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load stages:", err);
  }
}

async function loadEditPOLocations(siteId, selectedId) {
  try {
    const res = await fetch(`/locations?siteId=${siteId}`, {
      headers: { Authorization: "Bearer " + token }
    });
    const locations = await res.json();
    
    const select = document.getElementById("editPOLocation");
    select.innerHTML = '<option value="">Select Location</option>';
    locations.forEach(l => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.name;
      if (l.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load locations:", err);
  }
}

function recalcEditPO() {
  const net = Number(document.getElementById("editPONetAmount").value) || 0;
  const rate = Number(document.getElementById("editPOVatRate").value) || 0;
  const vat = net * (rate / 100);
  const total = net + vat;
  
  document.getElementById("editPOVatAmount").textContent = vat.toFixed(2);
  document.getElementById("editPOTotalAmount").textContent = total.toFixed(2);
}

// Set up edit modal event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Note: Site is not editable in edit modal, so no site change listener needed
  
  // VAT calculation for edit modal
  const editNetAmount = document.getElementById("editPONetAmount");
  const editVatRate = document.getElementById("editPOVatRate");
  
  if (editNetAmount) editNetAmount.addEventListener("input", recalcEditPO);
  if (editVatRate) editVatRate.addEventListener("change", recalcEditPO);
  
  // Edit form submission
  const editPOForm = document.getElementById("editPOForm");
  if (editPOForm) {
    editPOForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const poId = e.target.dataset.poId;
      const siteId = e.target.dataset.siteId; // Get stored site ID
      
      const payload = {
        supplierId: document.getElementById("editPOSupplier").value,
        siteId: siteId, // Use stored site ID
        locationId: document.getElementById("editPOLocation").value,
        stageId: document.getElementById("editPOStage").value,
        poDate: document.getElementById("editPODate").value,
        description: document.getElementById("editPODescription").value || "",
        netAmount: Number(document.getElementById("editPONetAmount").value) || 0,
        vatRate: Number(document.getElementById("editPOVatRate").value) || 0
      };
      
      if (!payload.supplierId || !payload.siteId || !payload.locationId || !payload.poDate || !payload.stageId) {
        showToast("Supplier, site, location, stage and date are required", "error");
        return;
      }
      
      try {
        const res = await fetch(`/purchase-orders/${poId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
          const err = await res.json();
          showToast(err.error || "Failed to update purchase order", "error");
          return;
        }
        
        showToast("Purchase order updated successfully", "success");
        closeEditPOModal();
        loadPOs(); // Reload the PO list
      } catch (err) {
        showToast("Failed to update purchase order", "error");
        console.error(err);
      }
    });
  }
});

/* ============================
   Init
   ============================ */
(async () => {
  setDefaultDateFilter();
  await loadPOs();
  setupSearchableSupplierFilter();
})();
