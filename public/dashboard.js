

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
let sortColumn = 'po_date';
let sortAscending = false;

let createLineItems = null;
let editLineItems = null;
let vatRatesCache = null;

async function ensureVatRates() {
  if (vatRatesCache) return vatRatesCache;
  try {
    const res = await fetch('/settings/financial', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    vatRatesCache = Array.isArray(data.vat_rates) ? data.vat_rates.map(Number) : [];
  } catch (_) {
    vatRatesCache = [];
  }
  return vatRatesCache;
}

function fillVatSelect(select, rates) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = '';
  if (!rates || rates.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No VAT rates configured';
    opt.disabled = true;
    opt.selected = true;
    select.appendChild(opt);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  rates.sort((a, b) => a - b).forEach(rate => {
    const opt = document.createElement('option');
    opt.value = rate;
    opt.textContent = `${rate}%`;
    select.appendChild(opt);
  });
  if (current) {
    const has = rates.some(r => String(r) === current);
    select.value = has ? current : String(rates[0] || 0);
  }
}

function initLineItemsManager({
  toggleBtn,
  section,
  body,
  addBtn,
  suggestions,
  descriptionInput,
  netAmountInput,
  onTotalsChange,
  readOnly = false
}) {
  if (!toggleBtn || !section || !body || !addBtn || !descriptionInput || !netAmountInput) {
    return null;
  }

  let lineItemsMode = false;
  let searchTimeout = null;

  function setLineItemsMode(enabled) {
    lineItemsMode = enabled;
    section.style.display = enabled ? 'block' : 'none';
    descriptionInput.style.display = enabled ? 'none' : 'block';
    toggleBtn.textContent = enabled ? 'Use Description' : 'Add Line Items';
    netAmountInput.disabled = enabled;

    // Only run description-to-line-items logic if there are no existing line items and not loading from .loadItems
    if (enabled && body.children.length === 0 && !initLineItemsManager._loadingFromLoadItems) {
      if (descriptionInput && descriptionInput.id === 'editPODescription' && netAmountInput && netAmountInput.id === 'editPONetAmount') {
        const net = Number(netAmountInput.value) || 0;
        const descriptionItems = descriptionInput.value
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);
        if (descriptionItems.length) {
          descriptionItems.forEach((item, idx) => {
            if (idx === 0) {
              addLineItemRow({ description: item, quantity: 1, unitPrice: net });
            } else {
              addLineItemRow({ description: item });
            }
          });
        } else {
          addLineItemRow({ quantity: 1, unitPrice: net });
        }
      } else {
        const descriptionItems = descriptionInput.value
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);
        if (descriptionItems.length) {
          descriptionItems.forEach(item => addLineItemRow({ description: item }));
        } else {
          addLineItemRow();
        }
      }
    }

    if (!enabled) {
      // When switching back, set description to comma-separated line item descriptions and net amount to total
      const descriptions = Array.from(body.querySelectorAll('[data-field="description"]'))
        .map(input => input.value.trim())
        .filter(Boolean);
      if (descriptions.length) {
        descriptionInput.value = descriptions.join(', ');
      }
      // Set net amount to total of line items
      const rows = Array.from(body.querySelectorAll('tr'));
      const total = rows.reduce((sum, row) => {
        const qty = Number(row.querySelector('[data-field="quantity"]').value) || 0;
        const unitPrice = Number(row.querySelector('[data-field="unitPrice"]').value) || 0;
        return sum + qty * unitPrice;
      }, 0);
      netAmountInput.value = total.toFixed(2);
    }

    if (enabled) {
      updateLineItemsNet();
    }

    onTotalsChange();
  }

  function updateLineItemsNet() {
    // Find all .line-item-card in the body and sum their values
    const cards = Array.from(body.querySelectorAll('.line-item-card'));
    const total = cards.reduce((sum, card) => {
      const qtyInput = card.querySelector('[data-field="quantity"]');
      const unitPriceInput = card.querySelector('[data-field="unitPrice"]');
      const qty = qtyInput ? Number(qtyInput.value) : 0;
      const unitPrice = unitPriceInput ? Number(unitPriceInput.value) : 0;
      return sum + qty * unitPrice;
    }, 0);

    netAmountInput.value = total.toFixed(2);
    onTotalsChange();
  }

  function handleLineItemInput(row) {
    const qtyInput = row.querySelector('[data-field="quantity"]');
    const unitPriceInput = row.querySelector('[data-field="unitPrice"]');
    const lineTotalCell = row.querySelector('[data-field="lineTotal"]');
    const qty = qtyInput ? Number(qtyInput.value) : 0;
    const unitPrice = unitPriceInput ? Number(unitPriceInput.value) : 0;
    if (lineTotalCell) {
      lineTotalCell.textContent = (qty * unitPrice).toFixed(2);
    }
    updateLineItemsNet();
  }

  function fetchLineItemSuggestions(query) {
    if (!suggestions) return;
    if (!query) {
      suggestions.innerHTML = '';
      return;
    }

    fetch(`/purchase-orders/line-items/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: 'Bearer ' + token }
    })
      .then(res => res.json())
      .then(items => {
        suggestions.innerHTML = '';
        items.forEach(item => {
          const opt = document.createElement('option');
          opt.value = item;
          suggestions.appendChild(opt);
        });
      })
      .catch(() => {
        suggestions.innerHTML = '';
      });
  }

  function addLineItemRow(item = {}) {
    // Create a card-like row for each line item
    const cardRow = document.createElement('tr');
    cardRow.classList.add('line-item-card-row');
    cardRow.innerHTML = `
      <td colspan="6" style="padding:0; border:none; background:transparent;">
        <div class="line-item-card">
          <div class="line-item-card-desc">
            <label class="line-item-label" style="font-size:11px; color:#888; margin-bottom:2px; display:block; text-align:left;">Description</label>
            <input class="line-item-input line-item-desc" data-field="description" type="text" list="${suggestions ? suggestions.id : ''}" value="${item.description || ''}" placeholder="Description">
          </div>
          <div class="line-item-card-fields">
            <div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;">
              <input class="line-item-input line-item-qty" data-field="quantity" type="number" step="0.01" min="0" value="${item.quantity || ''}" placeholder="0">
              <label class="line-item-label" style="font-size:10px; color:#888; margin-top:0; text-align:left;">Qty</label>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;">
              <input class="line-item-input line-item-unit" data-field="unit" type="text" value="${item.unit || ''}" placeholder="Unit">
              <label class="line-item-label" style="font-size:10px; color:#888; margin-top:0; text-align:left;">Unit</label>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;">
              <input class="line-item-input line-item-cost" data-field="unitPrice" type="number" step="0.01" min="0" value="${item.unit_price || item.unitPrice || ''}" placeholder="0.00">
              <label class="line-item-label" style="font-size:10px; color:#888; margin-top:0; text-align:left;">Unit Cost</label>
            </div>
            <span class="line-items-total" data-field="lineTotal" style="margin-left:8px;">0.00</span>
            <button type="button" class="btn btn-outline-danger btn-sm line-items-remove" aria-label="Remove line item" title="Delete" data-field="remove" style="margin-left:8px;">Del</button>
          </div>
        </div>
      </td>
    `;

    const descriptionField = cardRow.querySelector('[data-field="description"]');
    const qtyField = cardRow.querySelector('[data-field="quantity"]');
    const unitPriceField = cardRow.querySelector('[data-field="unitPrice"]');
    const removeBtn = cardRow.querySelector('[data-field="remove"]');

    descriptionField.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const query = descriptionField.value.trim();
      searchTimeout = setTimeout(() => {
        if (query.length >= 2) {
          fetchLineItemSuggestions(query);
        } else if (suggestions) {
          suggestions.innerHTML = '';
        }
      }, 200);
    });

    qtyField.addEventListener('input', () => handleLineItemInput(cardRow, descriptionField));
    unitPriceField.addEventListener('input', () => handleLineItemInput(cardRow, descriptionField));

    removeBtn.addEventListener('click', () => {
      cardRow.remove();
      updateLineItemsNet();
    });

    if (readOnly) {
      cardRow.querySelectorAll('input').forEach(input => input.disabled = true);
      descriptionField.disabled = true;
      removeBtn.disabled = true;
    }

    body.appendChild(cardRow);
    handleLineItemInput(cardRow, descriptionField);
  }

  function collectLineItems() {
    const rows = Array.from(body.querySelectorAll('tr'));
    const items = [];
    let hasIncomplete = false;

    rows.forEach(row => {
      const descriptionValue = row.querySelector('[data-field="description"]').value.trim();
      const quantityValue = row.querySelector('[data-field="quantity"]').value;
      const unitValue = row.querySelector('[data-field="unit"]').value.trim();
      const unitPriceValue = row.querySelector('[data-field="unitPrice"]').value;
      const hasAny = descriptionValue || quantityValue || unitValue || unitPriceValue;

      if (!hasAny) {
        return;
      }

      const quantity = Number(quantityValue);
      const unitPrice = Number(unitPriceValue);

      if (!descriptionValue || !quantity || !unitPrice) {
        hasIncomplete = true;
        return;
      }

      items.push({
        description: descriptionValue,
        quantity,
        unit: unitValue || null,
        unitPrice
      });
    });

    return { items, hasIncomplete };
  }

  function reset() {
    body.innerHTML = '';
    setLineItemsMode(false);
  }

  toggleBtn.addEventListener('click', () => setLineItemsMode(!lineItemsMode));
  addBtn.addEventListener('click', () => addLineItemRow());

  if (readOnly) {
    toggleBtn.style.display = 'none';
    addBtn.style.display = 'none';
  }

  return {
    setMode: setLineItemsMode,
    loadItems(items = []) {
      body.innerHTML = '';
      // Prevent description-to-line-items logic from running during .loadItems
      initLineItemsManager._loadingFromLoadItems = true;
      if (items.length > 0) {
        setLineItemsMode(true);
        items.forEach(item => addLineItemRow(item));
        updateLineItemsNet();
      } else {
        setLineItemsMode(false);
      }
      initLineItemsManager._loadingFromLoadItems = false;
    },
    collectItems: collectLineItems,
    isEnabled() {
      return lineItemsMode;
    },
    reset
  };
}

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
  if (window.formatMoney) return window.formatMoney(v);
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

  filtered
    .sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      if (['total_amount', 'net_amount'].includes(sortColumn)) {
        aVal = num(aVal);
        bVal = num(bVal);
      } else if (sortColumn === 'po_date') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }

      if (sortAscending) {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      }
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    })
    .forEach((po) => {
    totalNet += num(po.net_amount);
    totalGross += num(po.total_amount);
    renderPO(po);
    });

  poCountEl.textContent = filtered.length;

  // Update totals bar
  totalNetEl.textContent = euro(totalNet);
  totalGrossEl.textContent = euro(totalGross);

  updateSortIndicators();
}

function sortPOs(column) {
  if (sortColumn === column) {
    sortAscending = !sortAscending;
  } else {
    sortColumn = column;
    sortAscending = true;
  }
  applyFilters();
}

function updateSortIndicators() {
  const headers = document.querySelectorAll('th.sortable');
  const columnMap = ['po_number', 'po_date', 'supplier', 'location', 'stage', 'total_amount'];

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
          ${po.site_address ? `<div><strong>Site Address:</strong> ${po.site_address}</div>` : ''}
          <div><strong>VAT Rate:</strong> ${formatVat(po.vat_rate)}</div>
          <div><strong>Total (inc VAT):</strong> ${euro(Number(po.total_amount))}</div>
          <div>
            <strong>Uninvoiced (inc VAT):</strong>
            <span class="${
              po.uninvoiced_total < 0
                ? "over"
                : po.uninvoiced_total === 0
                ? "ok"
                : "warn"
            }">
              ${euro(Number(po.uninvoiced_total))}
            </span>
          </div>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div id="po-desc-wrapper-${po.id}">
            <div><strong>Description:</strong></div>
            <div id="po-desc-${po.id}" style="padding: 0.75rem; background: #f9f9f9; border-radius: 4px; border-left: 3px solid #007bff; word-wrap: break-word;">
              <span style="color: #999;">Loading…</span>
            </div>
          </div>
        </div>
      </div>
      <div class="invoice-container" id="inv-${po.id}">
        <p class="muted">Loading invoices…</p>
      </div>
      <div class="details-actions">
        <button class="btn btn-outline-primary" onclick="editPO(${po.id})">Edit PO</button>
        <button class="btn btn-outline-secondary" onclick="event.stopPropagation(); downloadPOPDF(${po.id}, this)">
          <i class="bi bi-download me-1"></i>Download PDF
        </button>
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
  let lineItemsLoaded = false;

  mainRow.onclick = async () => {
    const isOpen = detailsRow.classList.contains("open");

    // Close previously open PO
    if (openDetailsRow && openDetailsRow !== detailsRow) {
      openDetailsRow.classList.remove("open");
      openDetailsRow.style.display = "none";
      openDetailsRow.previousSibling?.classList.remove("open", "active");
    }

    if (isOpen) {
      detailsRow.classList.remove("open");
      detailsRow.style.display = "none";
      mainRow.classList.remove("open", "active");
      openDetailsRow = null;
    } else {
      detailsRow.style.display = "table-row";
      detailsRow.classList.add("open");
      mainRow.classList.add("open", "active");
      openDetailsRow = detailsRow;

      // Lazy load line items for this PO
      if (!lineItemsLoaded) {
        try {
          const res = await fetch(`/purchase-orders/${po.id}`, { headers: { Authorization: "Bearer " + token } });
          if (res.ok) {
            const data = await res.json();
            const descDiv = document.getElementById(`po-desc-${po.id}`);
            if (Array.isArray(data.line_items) && data.line_items.length > 0) {
              // Show line items as comma-separated values in the description wrapper
              const lineItemsText = data.line_items.map(item => item.description).filter(Boolean).join(', ');
              descDiv.innerHTML = lineItemsText || '<span style="color: #999;">No line items</span>';
            } else {
              descDiv.innerHTML = data.description || '<span style="color: #999;">No description</span>';
            }
          }
        } catch (e) {
          // fallback
          const descDiv = document.getElementById(`po-desc-${po.id}`);
          if (descDiv) descDiv.innerHTML = '<span style="color: #999;">Failed to load details</span>';
        }
        lineItemsLoaded = true;
      }

      if (!loaded) {
        loadInvoices(po.id, document.getElementById(`inv-${po.id}`));
        loaded = true;
      }

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
          <th>VAT</th>
          <th>Total (inc VAT)</th>
        </tr>
      </thead>
      <tbody>
`;

  invoices.forEach((i) => {
    const vatAmount = Number(i.vat_amount ?? (Number(i.net_amount) * Number(i.vat_rate)));
    html += `
    <tr>
      <td>${i.id}</td>
      <td>${i.invoice_number}</td>
      <td>${i.invoice_date}</td>
      <td>${euro(Number(i.net_amount))}</td>
      <td>${formatVat(i.vat_rate)}</td>
      <td>${euro(vatAmount)}</td>
      <td>${euro(Number(i.total_amount))}</td>
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
    let originalNetAmount = po.net_amount;
    
    const editVatSelect = document.getElementById("editPOVatRate");
    if (editVatSelect) {
      const rates = await ensureVatRates();
      fillVatSelect(editVatSelect, rates);
    }

    // Convert decimal VAT rate to percentage for dropdown (0.135 -> 13.5)
    const vatRatePercent = po.vat_rate < 1 ? po.vat_rate * 100 : po.vat_rate;
    if (editVatSelect) {
      const hasRate = Array.from(editVatSelect.options).some(opt => Number(opt.value) === Number(vatRatePercent));
      if (!hasRate) {
        const opt = document.createElement('option');
        opt.value = vatRatePercent;
        opt.textContent = `${vatRatePercent}%`;
        editVatSelect.appendChild(opt);
      }
      editVatSelect.value = String(vatRatePercent);
    }
    
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
    

    if (editLineItems) {
      editLineItems.loadItems(po.line_items || []);
      // If not in line items mode, restore the original net amount
      if (!editLineItems.isEnabled()) {
        document.getElementById("editPONetAmount").value = originalNetAmount;
      }
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
  if (editLineItems) {
    editLineItems.reset();
  }
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
  ensureVatRates().then(rates => {
    fillVatSelect(document.getElementById("poVatRate"), rates);
    const vatField = document.getElementById("poVatRate");
    if (vatField) vatField.dispatchEvent(new Event('change'));
  });
  
  // Reset form
  document.getElementById("poForm").reset();
  document.getElementById("poDate").value = today;
  document.getElementById("poVatAmount").textContent = "0.00";
  document.getElementById("poTotalAmount").textContent = "0.00";
  document.getElementById("poSupplierSearch").value = "";
  document.getElementById("poSupplier").value = "";

  if (createLineItems) {
    createLineItems.reset();
  }
}

function closeCreatePOModal() {
  const modal = document.getElementById("createPOModal");
  modal.style.display = "none";
  document.getElementById("poForm").reset();

  if (createLineItems) {
    createLineItems.reset();
  }
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
  const poDescription = document.getElementById("poDescription");
  const poToggleLineItems = document.getElementById("poToggleLineItems");
  const poLineItemsSection = document.getElementById("poLineItemsSection");
  const poLineItemsBody = document.getElementById("poLineItemsBody");
  const poAddLineItem = document.getElementById("poAddLineItem");
  const poLineItemSuggestions = document.getElementById("poLineItemSuggestions");
  
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

  createLineItems = initLineItemsManager({
    toggleBtn: poToggleLineItems,
    section: poLineItemsSection,
    body: poLineItemsBody,
    addBtn: poAddLineItem,
    suggestions: poLineItemSuggestions,
    descriptionInput: poDescription,
    netAmountInput: netAmount,
    onTotalsChange: recalcPO,
    readOnly: role === 'viewer'
  });
  
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

      if (createLineItems && createLineItems.isEnabled()) {
        const { items, hasIncomplete } = createLineItems.collectItems();
        if (hasIncomplete) {
          showToast("Please complete all line item fields", "error");
          return;
        }
        if (items.length === 0) {
          showToast("Add at least one line item", "error");
          return;
        }
        payload.lineItems = items;
        payload.description = '';
      }
      
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
  const editDescription = document.getElementById("editPODescription");
  const editToggleLineItems = document.getElementById("editPOToggleLineItems");
  const editLineItemsSection = document.getElementById("editPOLineItemsSection");
  const editLineItemsBody = document.getElementById("editPOLineItemsBody");
  const editAddLineItem = document.getElementById("editPOAddLineItem");
  const editLineItemSuggestions = document.getElementById("editPOLineItemSuggestions");
  
  if (editNetAmount) editNetAmount.addEventListener("input", recalcEditPO);
  if (editVatRate) editVatRate.addEventListener("change", recalcEditPO);

  editLineItems = initLineItemsManager({
    toggleBtn: editToggleLineItems,
    section: editLineItemsSection,
    body: editLineItemsBody,
    addBtn: editAddLineItem,
    suggestions: editLineItemSuggestions,
    descriptionInput: editDescription,
    netAmountInput: editNetAmount,
    onTotalsChange: recalcEditPO,
    readOnly: role === 'viewer'
  });
  
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

      if (editLineItems && editLineItems.isEnabled()) {
        const { items, hasIncomplete } = editLineItems.collectItems();
        if (hasIncomplete) {
          showToast("Please complete all line item fields", "error");
          return;
        }
        if (items.length === 0) {
          showToast("Add at least one line item", "error");
          return;
        }
        payload.lineItems = items;
        payload.description = '';
      }
      
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
  if (window.loadCurrencySettings) {
    try {
      await window.loadCurrencySettings();
    } catch (_) {}
  }
  setDefaultDateFilter();
  await loadPOs();
  setupSearchableSupplierFilter();
})();
