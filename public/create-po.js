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
loadOptions('/admin/sites', siteSelect);
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

netAmount.addEventListener('input', recalc);
vatRate.addEventListener('change', recalc);

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

console.log(payload);


if (!payload.supplierId || !payload.siteId || !payload.locationId || !payload.poDate || !payload.stageId) {
  alert('Supplier, site, location, stage and date are required');
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
    alert(err.error || 'Failed to create purchase order');
    return;
  }

const data = await res.json();
alert(`Purchase Order ${data.poNumber} created successfully`);
window.location.href = 'dashboard.html';

});
});

