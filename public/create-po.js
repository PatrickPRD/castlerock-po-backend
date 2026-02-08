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
const stageSelect = document.getElementById('stage');
const toggleLineItemsBtn = document.getElementById('toggleLineItems');
const lineItemsSection = document.getElementById('lineItemsSection');
const lineItemsBody = document.getElementById('lineItemsBody');
const addLineItemBtn = document.getElementById('addLineItem');
const lineItemSuggestions = document.getElementById('lineItemSuggestions');

let lineItemsMode = false;
let lineItemSearchTimeout = null;


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
  const row = document.createElement('tr');

  row.innerHTML = `
    <td><input class="line-item-input line-item-desc" data-field="description" type="text" list="lineItemSuggestions" value="${item.description || ''}" placeholder="Description"></td>
    <td><input class="line-item-input line-item-qty" data-field="quantity" type="number" step="0.01" min="0" value="${item.quantity || ''}" placeholder="0"></td>
    <td><input class="line-item-input line-item-unit" data-field="unit" type="text" value="${item.unit || ''}" placeholder="Unit"></td>
    <td><input class="line-item-input line-item-cost" data-field="unitPrice" type="number" step="0.01" min="0" value="${item.unit_price || item.unitPrice || ''}" placeholder="0.00"></td>
    <td class="line-items-total" data-field="lineTotal">0.00</td>
    <td><button type="button" class="btn btn-outline-danger btn-sm line-items-remove" aria-label="Remove line item" title="Remove" data-field="remove">&times;</button></td>
  `;

  const descriptionInput = row.querySelector('[data-field="description"]');
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

  qtyInput.addEventListener('input', () => handleLineItemInput(row));
  unitPriceInput.addEventListener('input', () => handleLineItemInput(row));

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
      unitPrice
    });
  });

  return { items, hasIncomplete };
}

netAmount.addEventListener('input', recalc);
vatRate.addEventListener('change', recalc);
toggleLineItemsBtn.addEventListener('click', () => setLineItemsMode(!lineItemsMode));
addLineItemBtn.addEventListener('click', () => addLineItemRow());

/* =========================
   Submit PO
   ========================= */
document.getElementById('poForm').addEventListener('submit', async e => {
  e.preventDefault();

  const payload = {
    supplierId: supplierSelect.value,
    siteId: siteSelect.value,
    locationId: locationSelect.value,
    poDate: poDate.value,
    description: description.value || '',
    netAmount: Number(netAmount.value) || 0,
    vatRate: Number(vatRate.value) || 0,
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

console.log(payload);


if (!payload.supplierId || !payload.siteId || !payload.locationId || !payload.poDate || !payload.stageId) {
  showToast('Supplier, site, location, stage and date are required', 'error');
  return;
}


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
});

