
(function() {
  // Prevent global scope pollution and redeclaration errors
  console.log('[setLineItemsMode] called with enabled =', typeof enabled !== 'undefined' ? enabled : '(not set)');
  const token = localStorage.getItem('token');
  const role  = localStorage.getItem('role');
  let poVatRate = null;

  /* =========================
     Auth guard
     ========================= */
  if (!token) {
    window.location.href = 'login.html';
  }

  if (!['super_admin', 'admin', 'staff', 'viewer'].includes(role)) {
    window.location.href = 'login.html';
  }

  /* =========================
     Params
     ========================= */
  const params = new URLSearchParams(window.location.search);
  const poId = params.get('id');

  if (!poId) {
    showToast('No Purchase Order selected', 'error');
    window.location.href = 'dashboard.html';
  }

  /* =========================
     Elements
     ========================= */
  const supplierSelect = document.getElementById('supplier');
  const siteSelect     = document.getElementById('site');
  const locationSelect = document.getElementById('location');
  const stageSelect = document.getElementById('stage');

  const poNumberInput  = document.getElementById('poNumber');
  const poDateInput    = document.getElementById('poDate');
  const descriptionInp = document.getElementById('description');
  const netAmountInp   = document.getElementById('netAmount');
  const vatRateSelect  = document.getElementById('vatRate');
  const vatAmountSpan  = document.getElementById('vatAmount');
  const totalAmountSpan= document.getElementById('totalAmount');
  const saveBtn        = document.getElementById('saveBtn');
  const toggleLineItemsBtn = document.getElementById('editPOToggleLineItems');
  const lineItemsSection = document.getElementById('lineItemsSection');
  const lineItemsBody = document.getElementById('lineItemsBody');
  const addLineItemBtn = document.getElementById('addLineItem');
  const lineItemSuggestions = document.getElementById('lineItemSuggestions');

  let lineItemsMode = false;
  let lineItemSearchTimeout = null;

  /* =========================
     Viewer restrictions
     ========================= */
  if (role === 'viewer') {
    saveBtn.style.display = 'none';
  }

  // ...existing code (move all remaining code inside this IIFE)...


  /* =========================
     Events
     ========================= */
  netAmountInp.addEventListener('input', recalc);
  vatRateSelect.addEventListener('change', recalc);
  if (toggleLineItemsBtn) {
    // Event listener is attached in DOMContentLoaded
  } else {
    console.warn('[edit-po.js] toggleLineItemsBtn is null at top level');
  }
  addLineItemBtn.addEventListener('click', () => addLineItemRow());

  /* =========================
     Init
     ========================= */
  loadPO();

  document.addEventListener('DOMContentLoaded', () => {
    const toggleLineItemsBtn = document.getElementById('editPOToggleLineItems');
    console.log('[edit-po.js] DOMContentLoaded fired');
    if (toggleLineItemsBtn) {
        console.log('[edit-po.js] Attaching click handler to #editPOToggleLineItems');
      toggleLineItemsBtn.addEventListener('click', () => {
        console.log('[edit-po.js] #editPOToggleLineItems clicked');
        setLineItemsMode(!lineItemsMode);
      });
    } else {
      console.log('toggleLineItemsBtn not found in DOM');
    }
  });

})();

/* =========================
   Helpers
   ========================= */
async function loadOptions(url, selectEl, selectedId) {
  if (!selectEl) {
    console.error('loadOptions called with null element for', url);
    return;
  }

  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) return;

  const data = await res.json();
  selectEl.innerHTML = '<option value="">Select</option>';

  data.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    if (String(item.id) === String(selectedId)) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function setVatRate(rate) {
  const target = Number(rate);

  for (const opt of vatRateSelect.options) {
    if (Number(opt.value) === target) {
      vatRateSelect.value = opt.value;
      return;
    }
  }

  // fallback – clear if no match
  vatRateSelect.value = '';
}


function recalc() {
  const net  = Number(netAmountInp.value) || 0;
  const rate = Number(vatRateSelect.value) || 0;

  const vat   = net * (rate / 100);
  const total = net + vat;

  vatAmountSpan.textContent   = vat.toFixed(2);
  totalAmountSpan.textContent = total.toFixed(2);
}

function setLineItemsMode(enabled) {
  lineItemsMode = enabled;
  lineItemsSection.style.display = enabled ? 'block' : 'none';
  descriptionInp.style.display = enabled ? 'none' : 'block';
  toggleLineItemsBtn.textContent = enabled ? 'Use Description' : 'Add Line Items';
  netAmountInp.disabled = enabled;

  if (enabled && lineItemsBody.children.length === 0) {
    // Always use netAmountInp for the first line item unitPrice and quantity 1
    const net = Number(netAmountInp.value) || 0;
    console.log('[setLineItemsMode] Switching to line items, netAmountInp.value:', netAmountInp.value, 'parsed net:', net);
    addLineItemRow({
      description: '',
      quantity: 1,
      unit: '',
      unitPrice: net
    });
    setTimeout(() => {
      const firstRow = lineItemsBody.querySelector('tr');
      if (firstRow) {
        const qtyInput = firstRow.querySelector('[data-field="quantity"]');
        const unitPriceInput = firstRow.querySelector('[data-field="unitPrice"]');
        if (qtyInput && unitPriceInput) {
          console.log('[setLineItemsMode] Before force: qtyInput.value =', qtyInput.value, ', unitPriceInput.value =', unitPriceInput.value);
          qtyInput.value = 1;
          unitPriceInput.value = net;
          qtyInput.dispatchEvent(new Event('input'));
          unitPriceInput.dispatchEvent(new Event('input'));
          handleLineItemInput(firstRow);
          console.log('[setLineItemsMode] After force: qtyInput.value =', qtyInput.value, ', unitPriceInput.value =', unitPriceInput.value);
        } else {
          console.log('[setLineItemsMode] qtyInput or unitPriceInput not found in firstRow:', firstRow);
        }
      } else {
        console.log('[setLineItemsMode] No firstRow found in lineItemsBody after addLineItemRow');
      }
    }, 0);
  }

  if (!enabled) {
    const descriptions = Array.from(lineItemsBody.querySelectorAll('[data-field="description"]'))
      .map(input => input.value.trim())
      .filter(Boolean);
    if (descriptions.length) {
      descriptionInp.value = descriptions.join(', ');
    }
    netAmountInp.value = updateLineItemsNet(true);
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
    netAmountInp.value = total.toFixed(2);
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
  if (!query) {
    lineItemSuggestions.innerHTML = '';
    return;
  }

  fetch(`/purchase-orders/line-items/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(items => {
      lineItemSuggestions.innerHTML = '';
      items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        lineItemSuggestions.appendChild(opt);
      });
    })
    .catch(() => {
      lineItemSuggestions.innerHTML = '';
    });
}

function addLineItemRow(item = {}) {
  // Create two rows: one for numbers/buttons, one for description
  const row = document.createElement('tr');
  row.classList.add('line-item-main-row');
  row.innerHTML = `
    <td colspan="1" class="line-item-desc-cell" style="padding-bottom:0;border-bottom:none;background:transparent;"></td>
    <td><input class="line-item-input line-item-qty" data-field="quantity" type="number" step="0.01" min="0" value="${typeof item.quantity !== 'undefined' ? item.quantity : ''}" placeholder="0"></td>
    <td><input class="line-item-input line-item-unit" data-field="unit" type="text" value="${item.unit || ''}" placeholder="Unit"></td>
    <td><input class="line-item-input line-item-cost" data-field="unitPrice" type="number" step="0.01" min="0" value="${typeof item.unitPrice !== 'undefined' ? item.unitPrice : (typeof item.unit_price !== 'undefined' ? item.unit_price : '')}" placeholder="0.00"></td>
    <td class="line-items-total" data-field="lineTotal">0.00</td>
    <td><button type="button" class="btn btn-outline-danger btn-sm line-items-remove" aria-label="Remove line item" title="Remove" data-field="remove">&times;</button></td>
  `;

  // Second row for description
  const descRow = document.createElement('tr');
  descRow.classList.add('line-item-desc-row');
  descRow.innerHTML = `
    <td colspan="6" style="padding-top:0;border-top:none;">
      <input class="line-item-input line-item-desc" data-field="description" type="text" list="lineItemSuggestions" value="${item.description || ''}" placeholder="Description" style="width:99%;margin-top:-2px;">
    </td>
  `;

  const descriptionInput = descRow.querySelector('[data-field="description"]');
  const qtyInput = row.querySelector('[data-field="quantity"]');
  const unitPriceInput = row.querySelector('[data-field="unitPrice"]');
  const removeBtn = row.querySelector('[data-field="remove"]');

  descriptionInput.addEventListener('input', () => {
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

  qtyInput.addEventListener('input', () => handleLineItemInput(row, descriptionInput));
  unitPriceInput.addEventListener('input', () => handleLineItemInput(row, descriptionInput));

  removeBtn.addEventListener('click', () => {
    row.remove();
    descRow.remove();
    updateLineItemsNet();
  });

  if (role === 'viewer') {
    row.querySelectorAll('input').forEach(input => input.disabled = true);
    descriptionInput.disabled = true;
    removeBtn.disabled = true;
  }

  lineItemsBody.appendChild(row);
  lineItemsBody.appendChild(descRow);
  handleLineItemInput(row, descriptionInput);
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
      unitPrice
    });
  });

  return { items, hasIncomplete };
}

/* =========================
   Load PO
   ========================= */
async function loadPO() {
  const res = await fetch('/purchase-orders/' + poId, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    showToast('Failed to load Purchase Order', 'error');
    window.location.href = 'dashboard.html';
    return;
  }

  const po = await res.json();

  // Lock PO number
  poNumberInput.value = po.po_number;
  poNumberInput.disabled = true;

  poDateInput.value    = po.po_date;
  descriptionInp.value = po.description || '';
  netAmountInp.value   = po.net_amount;

  if (po.line_items && po.line_items.length > 0) {
    setLineItemsMode(true);
    lineItemsBody.innerHTML = '';
    po.line_items.forEach(item => addLineItemRow(item));
    updateLineItemsNet();
  }

// store VAT immediately
poVatRate = String(po.vat_rate);

await loadOptions('/stages', stageSelect, po.stage_id);
await loadOptions('/suppliers', supplierSelect, po.supplier_id);
await loadOptions('/sites', siteSelect, po.site_id);

// Lock site selection - cannot change site once PO is created
siteSelect.disabled = true;

await loadOptions(
  '/locations?siteId=' + po.site_id,
  locationSelect,
  po.location_id
);

// apply VAT once, after all async work
setVatRate(po.vat_rate);
recalc();




console.log({
  supplier: supplierSelect.value,
  site: siteSelect.value,
  location: locationSelect.value,
  stage: stageSelect.value,
  vat: vatRateSelect.value
});

  recalc();
}


/* =========================
   Site → Location cascade
   ========================= */
siteSelect.addEventListener('change', async () => {


  const siteId = siteSelect.value;
  locationSelect.innerHTML = '<option value="">Select</option>';

  if (!siteId) return;

  await loadOptions('/locations?siteId=' + siteId, locationSelect);
});



/* =========================
   Save changes
   ========================= */
document.getElementById('poForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (role === 'viewer') return;

  const payload = {
    supplierId: supplierSelect.value,
    siteId: siteSelect.value,
    locationId: locationSelect.value,
    poDate: poDateInput.value,
    description: descriptionInp.value || '',
    netAmount: Number(netAmountInp.value) || 0,
    vatRate: Number(vatRateSelect.value) || 0,
    stageId: stageSelect.value
  };

  if (lineItemsMode) {
    const { items, hasIncomplete } = collectLineItems();
    if (hasIncomplete) {
      showToast('Please complete all line item fields', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Add at least one line item', 'error');
      return;
    }
    payload.lineItems = items;
    payload.description = '';
  }

  const res = await fetch('/purchase-orders/' + poId, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to save changes', 'error');
    return;
  }

  window.location.href = 'dashboard.html';
});

/* =========================
   Events
   ========================= */
netAmountInp.addEventListener('input', recalc);
vatRateSelect.addEventListener('change', recalc);
if (toggleLineItemsBtn) {
  // Event listener is attached in DOMContentLoaded
} else {
  console.warn('[edit-po.js] toggleLineItemsBtn is null at top level');
}
addLineItemBtn.addEventListener('click', () => addLineItemRow());

initializing = false;


/* =========================
   Init
   ========================= */
loadPO();

document.addEventListener('DOMContentLoaded', () => {
  const toggleLineItemsBtn = document.getElementById('editPOToggleLineItems');
  console.log('[edit-po.js] DOMContentLoaded fired');
  if (toggleLineItemsBtn) {
      console.log('[edit-po.js] Attaching click handler to #editPOToggleLineItems');
    toggleLineItemsBtn.addEventListener('click', () => {
      console.log('[edit-po.js] #editPOToggleLineItems clicked');
      setLineItemsMode(!lineItemsMode);
    });
  } else {
    console.log('toggleLineItemsBtn not found in DOM');
  }
});
