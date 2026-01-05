const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');

let initializing = true;

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
  alert('No Purchase Order selected');
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

/* =========================
   Viewer restrictions
   ========================= */
if (role === 'viewer') {
  saveBtn.style.display = 'none';
  document
    .querySelectorAll('input, select, textarea')
    .forEach(el => el.disabled = true);
}

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


function recalc() {
  const net  = Number(netAmountInp.value) || 0;
  const rate = Number(vatRateSelect.value) || 0;

  const vat   = net * (rate / 100);
  const total = net + vat;

  vatAmountSpan.textContent   = vat.toFixed(2);
  totalAmountSpan.textContent = total.toFixed(2);
}

/* =========================
   Load PO
   ========================= */
async function loadPO() {
  const res = await fetch('/purchase-orders/' + poId, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    alert('Failed to load Purchase Order');
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

  // ✅ Load dropdowns FIRST, then select values
  await loadOptions('/stages', stageSelect, po.stage_id);
  await loadOptions('/suppliers', supplierSelect, po.supplier_id);
  await loadOptions('/admin/sites', siteSelect, po.site_id);
  await loadOptions(
    '/locations?siteId=' + po.site_id,
    locationSelect,
    po.location_id
  );

  // ✅ Set VAT AFTER options exist
  vatRateSelect.value = String(po.vat_rate);
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
  if (initializing) return;

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
    alert(err.error || 'Failed to save changes');
    return;
  }

  window.location.href = 'dashboard.html';
});

/* =========================
   Events
   ========================= */
netAmountInp.addEventListener('input', recalc);
vatRateSelect.addEventListener('change', recalc);

initializing = false;


/* =========================
   Init
   ========================= */
loadPO();
