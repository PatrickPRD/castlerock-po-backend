document.addEventListener('DOMContentLoaded', () => {



const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');





/* =========================
   Auth guard (FIXED)
   ========================= */
if (!token || !['super_admin', 'admin', 'staff'].includes(role)) {
  window.location.href = 'login.html';
}

/* =========================
   Elements
   ========================= */
const supplierSelect = document.getElementById('supplier');
const siteSelect     = document.getElementById('site');
const locationSelect = document.getElementById('location');
const netAmount      = document.getElementById('netAmount');
const vatRate        = document.getElementById('vatRate');
const vatAmount      = document.getElementById('vatAmount');
const totalAmount    = document.getElementById('totalAmount');
const poDate         = document.getElementById('poDate');
const description    = document.getElementById('description');
const deliveryNotes  = document.getElementById('deliveryNotes');
const stageSelect = document.getElementById('stage');
const toggleLineItemsBtn = document.getElementById('toggleLineItems');
const lineItemsSection = document.getElementById('lineItemsSection');
const lineItemsBody = document.getElementById('lineItemsBody');
const addLineItemBtn = document.getElementById('addLineItem');
const lineItemSuggestions = document.getElementById('lineItemSuggestions');
const costItemLookup = window.createCostItemLookup
  ? window.createCostItemLookup({
      suggestionsElement: lineItemSuggestions,
      headers: { Authorization: 'Bearer ' + token }
    })
  : null;

let lineItemsMode = false;
let lineItemSearchTimeout = null;
let availableVatRates = [];
let allTemplates = [];

/* =========================
   Template Selector
   ========================= */
const templateSelectorWrap = document.getElementById('templateSelectorWrap');
const templateSearchInput = document.getElementById('templateSearch');
const templateDropdown = document.getElementById('templateDropdown');

async function loadTemplates() {
  try {
    const res = await fetch('/po-templates', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return;
    allTemplates = await res.json();
    if (allTemplates.length > 0) {
      templateSelectorWrap.style.display = 'block';
    }
  } catch (_) {
    // templates optional
  }
}

function filterAndShowTemplates(query) {
  if (!templateSearchInput || !templateDropdown) return;

  const q = (query || '').trim().toLowerCase();
  const filtered = q
    ? allTemplates.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.stage_name && t.stage_name.toLowerCase().includes(q))
      )
    : allTemplates;

  if (filtered.length === 0) {
    templateDropdown.innerHTML = '<div style="padding: 10px; color: #999;">No templates found</div>';
  } else {
    templateDropdown.innerHTML = filtered.map(t => {
      const stage = t.stage_name ? ' [' + t.stage_name + ']' : '';
      const label = t.name + stage + ' (' + t.line_item_count + ' items)';
      return '<div class="template-option" data-id="' + t.id + '" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;">' + label + '</div>';
    }).join('');

    templateDropdown.querySelectorAll('.template-option').forEach(opt => {
      opt.addEventListener('click', async () => {
        const id = opt.dataset.id;
        templateSearchInput.value = opt.textContent;
        templateDropdown.style.display = 'none';
        await applyTemplate(id);
      });
      opt.addEventListener('mouseenter', () => { opt.style.backgroundColor = '#f0f0f0'; });
      opt.addEventListener('mouseleave', () => { opt.style.backgroundColor = 'white'; });
    });
  }

  templateDropdown.style.display = 'block';
  templateDropdown.style.width = templateSearchInput.offsetWidth + 'px';
}

async function applyTemplate(id) {
  try {
    const res = await fetch('/po-templates/' + id, {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed to load template');
    const t = await res.json();

    // Apply stage if template has one
    if (t.stage_id && stageSelect) {
      stageSelect.value = String(t.stage_id);
    }

    // Apply delivery notes if template has them
    if (t.delivery_notes && deliveryNotes) {
      deliveryNotes.value = t.delivery_notes;
    }

    // Switch to line items mode and populate
    if (t.line_items && t.line_items.length) {
      lineItemsBody.innerHTML = '';
      // Set mode flags without triggering the default empty row
      lineItemsMode = true;
      lineItemsSection.style.display = 'block';
      description.style.display = 'none';
      toggleLineItemsBtn.textContent = 'Use Description';
      netAmount.disabled = true;

      t.line_items.forEach(item => addLineItemRow(item));
      updateLineItemsNet();
    }

    showToast('Template "' + t.name + '" loaded', 'success');
  } catch (err) {
    showToast('Error loading template: ' + err.message, 'error');
  }
}

templateSearchInput.addEventListener('focus', () => {
  filterAndShowTemplates('');
});

templateSearchInput.addEventListener('input', (e) => {
  filterAndShowTemplates(e.target.value);
});

document.addEventListener('click', (e) => {
  if (templateSearchInput && templateDropdown &&
      !templateSearchInput.contains(e.target) && !templateDropdown.contains(e.target)) {
    templateDropdown.style.display = 'none';
  }
});


/* =========================
   Default PO Date = Today
   ========================= */
(function setDefaultDate() {
  const today = new Date().toISOString().slice(0, 10);
  poDate.value = today;
})();


/* =========================
   Generic loader
   ========================= */
function loadOptions(url, selectEl) {
  const label =
    selectEl.id === 'supplier' ? 'Supplier' :
    selectEl.id === 'site'     ? 'Site' :
    selectEl.id === 'location' ? 'Location' :
    selectEl.id === 'stage'    ? 'Stage' :
    'Select';

  selectEl.innerHTML = `<option value="" disabled>${label}</option>`;

  fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(data => {
      data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        selectEl.appendChild(opt);
      });

      // 🔑 IMPORTANT: reset value AFTER options load
      selectEl.value = '';
    });
}


/* =========================
   Load initial data
   ========================= */
loadOptions('/suppliers', supplierSelect);
loadOptions('/sites', siteSelect);
loadOptions('/stages', stageSelect);
loadVatRates();
loadTemplates();

/* =========================
   Site → Location cascade
   ========================= */
siteSelect.addEventListener('change', async () => {
  const siteId = siteSelect.value;
  locationSelect.innerHTML = '<option value="">Select</option>';

  if (!siteId) return;

  loadOptions(`/locations?siteId=${siteId}`, locationSelect);
});

/* =========================
   VAT calculation
   ========================= */
function recalc() {
  const net  = Number(netAmount.value) || 0;
  const rate = Number(vatRate.value) || 0;

  const vat = net * (rate / 100);
  const total = net + vat;

  vatAmount.textContent   = vat.toFixed(2);
  totalAmount.textContent = total.toFixed(2);
}

async function loadVatRates() {
  try {
    const res = await fetch('/settings/financial', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    availableVatRates = Array.isArray(data.vat_rates) ? data.vat_rates.map(Number) : [];
  } catch (_) {
    availableVatRates = [];
  }

  vatRate.innerHTML = '';
  if (!availableVatRates.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No VAT rates configured';
    opt.disabled = true;
    opt.selected = true;
    vatRate.appendChild(opt);
    vatRate.disabled = true;
    recalc();
    return;
  }
  vatRate.disabled = false;
  availableVatRates
    .sort((a, b) => a - b)
    .forEach(rate => {
      const opt = document.createElement('option');
      opt.value = rate;
      opt.textContent = `${rate}%`;
      vatRate.appendChild(opt);
    });
  // keep existing selection if possible
  if (!vatRate.value) {
    vatRate.value = String(availableVatRates[0]);
  }
  recalc();
}

function setLineItemsMode(enabled) {
  lineItemsMode = enabled;
  lineItemsSection.style.display = enabled ? 'block' : 'none';
  description.style.display = enabled ? 'none' : 'block';
  toggleLineItemsBtn.textContent = enabled ? 'Use Description' : 'Add Line Items';
  netAmount.disabled = enabled;

  if (enabled && lineItemsBody.children.length === 0) {
    // Use totalAmount for the first line item unitPrice
    addLineItemRow({
      description: '',
      quantity: 1,
      unit: '',
      unitPrice: Number(totalAmount.textContent) || 0
    });
  }

  if (!enabled) {
    const descriptions = Array.from(lineItemsBody.querySelectorAll('[data-field="description"]'))
      .map(input => input.value.trim())
      .filter(Boolean);
    if (descriptions.length) {
      description.value = descriptions.join(', ');
    }
    netAmount.value = updateLineItemsNet(true);
  }

  if (enabled) {
    updateLineItemsNet();
  }

  recalc();
}

function updateLineItemsNet(onlyReturnTotal = false) {
  const rows = Array.from(lineItemsBody.querySelectorAll('tr'));
  const total = rows.reduce((sum, row) => {
    const qty = Number(row.querySelector('[data-field="quantity"]').value) || 0;
    const unitPrice = Number(row.querySelector('[data-field="unitPrice"]').value) || 0;
    return sum + qty * unitPrice;
  }, 0);

  if (!onlyReturnTotal) {
    netAmount.value = total.toFixed(2);
    recalc();
  }
  return total.toFixed(2);
}

function handleLineItemInput(row) {
  const qty = Number(row.querySelector('[data-field="quantity"]').value) || 0;
  const unitPrice = Number(row.querySelector('[data-field="unitPrice"]').value) || 0;
  row.querySelector('[data-field="lineTotal"]').textContent = (qty * unitPrice).toFixed(2);
  updateLineItemsNet();
}

function fetchLineItemSuggestions(query) {
  if (!costItemLookup || !query) {
    lineItemSuggestions.innerHTML = '';
    return;
  }

  costItemLookup.fetchSuggestions(query)
    .catch(() => {
      lineItemSuggestions.innerHTML = '';
    });
}

function addLineItemRow(item = {}) {
  const row = document.createElement('tr');

  row.innerHTML = `
    <td>
      <input class="line-item-input line-item-desc" data-field="description" type="text" list="lineItemSuggestions" value="${item.description || ''}" placeholder="Description">
      <input data-field="costItemId" type="hidden" value="${item.cost_item_id || item.costItemId || ''}">
      <input data-field="costItemCode" type="hidden" value="${item.cost_item_code || item.costItemCode || ''}">
      <input data-field="costItemType" type="hidden" value="${item.cost_item_type || item.costItemType || ''}">
      <span data-field="costItemBadge"${(item.cost_item_id || item.costItemId || item.cost_item_code || item.costItemCode) ? '' : ' hidden'} class="cost-item-linked-badge">
        <span class="cost-item-badge-text">Cost DB: <span data-badge-code>${item.cost_item_code || item.costItemCode || ''}</span></span>
        <button type="button" data-badge-unlink class="cost-item-badge-unlink" aria-label="Unlink cost item" title="Remove link to cost database">&times;</button>
      </span>
    </td>
    <td><input class="line-item-input line-item-qty" data-field="quantity" type="number" step="0.01" min="0" value="${item.quantity || ''}" placeholder="0"></td>
    <td><input class="line-item-input line-item-unit" data-field="unit" type="text" value="${item.unit || ''}" placeholder="Unit"></td>
    <td><input class="line-item-input line-item-cost" data-field="unitPrice" type="number" step="0.01" min="0" value="${item.unit_price || item.unitPrice || ''}" placeholder="0.00"></td>
    <td class="line-items-total" data-field="lineTotal">0.00</td>
    <td><button type="button" class="btn btn-outline-danger btn-sm line-items-remove" aria-label="Remove line item" title="Remove" data-field="remove">&times;</button></td>
  `;

  const descriptionInput = row.querySelector('[data-field="description"]');
  const unitInput = row.querySelector('[data-field="unit"]');
  const qtyInput = row.querySelector('[data-field="quantity"]');
  const unitPriceInput = row.querySelector('[data-field="unitPrice"]');
  const removeBtn = row.querySelector('[data-field="remove"]');

  descriptionInput.addEventListener('input', () => {
    if (costItemLookup) {
      costItemLookup.clearSelectionForRow(row);
    }
    clearTimeout(lineItemSearchTimeout);
    const query = descriptionInput.value.trim();
    lineItemSearchTimeout = setTimeout(() => {
      if (query.length >= 2) {
        fetchLineItemSuggestions(query);
      } else {
        lineItemSuggestions.innerHTML = '';
      }
    }, 200);
  });

  descriptionInput.addEventListener('change', () => {
    if (costItemLookup && costItemLookup.applySelectionFromInput(row)) {
      handleLineItemInput(row);
    }
  });

  descriptionInput.addEventListener('blur', () => {
    if (costItemLookup && costItemLookup.applySelectionFromInput(row)) {
      handleLineItemInput(row);
    }
  });

  qtyInput.addEventListener('input', () => handleLineItemInput(row));
  unitPriceInput.addEventListener('input', () => handleLineItemInput(row));
  unitInput.addEventListener('input', () => {
    if (costItemLookup) {
      costItemLookup.clearSelectionForRow(row);
    }
  });

  removeBtn.addEventListener('click', () => {
    row.remove();
    updateLineItemsNet();
  });

  lineItemsBody.appendChild(row);
  handleLineItemInput(row);
}

function collectLineItems() {
  const rows = Array.from(lineItemsBody.querySelectorAll('tr'));
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
      unitPrice,
      costItemId: Number(row.querySelector('[data-field="costItemId"]').value) || null,
      costItemCode: row.querySelector('[data-field="costItemCode"]').value || null,
      costItemType: row.querySelector('[data-field="costItemType"]').value || null
    });
  });

  return { items, hasIncomplete };
}

netAmount.addEventListener('input', recalc);
vatRate.addEventListener('change', recalc);
toggleLineItemsBtn.addEventListener('click', () => setLineItemsMode(!lineItemsMode));
addLineItemBtn.addEventListener('click', () => addLineItemRow());

/* =========================
   Build PO Payload
   ========================= */
async function buildPOPayload() {
  const payload = {
    supplierId: supplierSelect.value,
    siteId: siteSelect.value,
    locationId: locationSelect.value,
    poDate: poDate.value,
    description: description.value || '',
    deliveryNotes: deliveryNotes.value || '',
    netAmount: Number(netAmount.value) || 0,
    vatRate: Number(vatRate.value) || 0,
    stageId: stageSelect.value
  };

  if (lineItemsMode) {
    const { items, hasIncomplete } = collectLineItems();
    if (hasIncomplete) {
      showToast('Please complete all line item fields', 'error');
      return null;
    }
    if (items.length === 0) {
      showToast('Add at least one line item', 'error');
      return null;
    }
    payload.lineItems = items;
    payload.description = '';
  }

  if (!payload.supplierId || !payload.siteId || !payload.locationId || !payload.poDate || !payload.stageId) {
    showToast('Supplier, site, location, stage and date are required', 'error');
    return null;
  }

  return payload;
}

async function resolveCreatedPOId(data) {
  if (!data || typeof data !== 'object') return null;

  const directId = data.id ?? data.poId ?? data.insertId;
  if (directId) return directId;

  const poNumber = data.poNumber;
  if (!poNumber) return null;

  try {
    const res = await fetch('/purchase-orders', {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!res.ok) return null;

    const rows = await res.json();
    if (!Array.isArray(rows)) return null;

    const match = rows.find(row => row && row.po_number === poNumber);
    return match ? match.id : null;
  } catch (_) {
    return null;
  }
}

/* =========================
   Submit PO
   ========================= */
document.getElementById('poForm').addEventListener('submit', async e => {
  e.preventDefault();

  const payload = await buildPOPayload();
  if (!payload) return;

  const res = await fetch('/purchase-orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to create purchase order', 'error');
    return;
  }

  const data = await res.json();

  sessionStorage.setItem(
    'toast',
    JSON.stringify({
      message: `Purchase Order ${data.poNumber} created successfully`,
      type: 'success'
    })
  );

  window.location.href = 'dashboard.html';
});

/* =========================
   Save & Add Invoices
   ========================= */
document.getElementById('saveAndAddInvoicesBtn').addEventListener('click', async e => {
  e.preventDefault();

  const payload = await buildPOPayload();
  if (!payload) return;

  const res = await fetch('/purchase-orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to create purchase order', 'error');
    return;
  }

  const data = await res.json();

  sessionStorage.setItem(
    'toast',
    JSON.stringify({
      message: `Purchase Order ${data.poNumber} created successfully`,
      type: 'success'
    })
  );

  const poId = await resolveCreatedPOId(data);
  if (!poId) {
    showToast('Purchase order created but could not open invoice entry', 'error');
    return;
  }
  window.location.href = `invoice-entry.html?poId=${poId}`;
});
});

