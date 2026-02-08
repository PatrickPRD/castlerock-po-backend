const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');

if (!token || !['admin', 'super_admin'].includes(role)) {
  location.href = 'dashboard.html';
}

const params = new URLSearchParams(location.search);
const supplierId = params.get('id');

const pageTitle = document.getElementById('pageTitle');
const form = document.getElementById('supplierForm');

const nameEl    = document.getElementById('name');
const contactEl = document.getElementById('contact');
const emailEl   = document.getElementById('email');
const phoneEl   = document.getElementById('phone');
const addressEl = document.getElementById('address');

/* =========================
   Load supplier (edit)
   ========================= */
if (supplierId) {
  pageTitle.textContent = 'Edit Supplier';
  loadSupplier();
}

async function loadSupplier() {
  const res = await fetch(`/suppliers/${supplierId}`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const s = await res.json();

  nameEl.value    = s.name;
  contactEl.value = s.contact_person || '';
  emailEl.value   = s.email || '';
  phoneEl.value   = s.phone || '';
  addressEl.value = s.address || '';
}

/* =========================
   Save
   ========================= */
form.onsubmit = async e => {
  e.preventDefault();

  const payload = {
    name: nameEl.value.trim(),
    contact_person: contactEl.value.trim(),
    email: emailEl.value.trim(),
    phone: phoneEl.value.trim(),
    address: addressEl.value.trim()
  };

  if (!payload.name) {
    showToast('Supplier name is required', 'error');
    return;
  }

  const url = supplierId
    ? `/suppliers/${supplierId}`
    : '/suppliers';

  const method = supplierId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    showToast(data.error || 'Failed to save supplier', 'error');
    return;
  }

  location.href = 'suppliers.html';
};

function back() {
  location.href = 'suppliers.html';
}
