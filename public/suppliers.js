const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');

if (!token || !['admin', 'super_admin'].includes(role)) {
  location.href = 'dashboard.html';
}

const table = document.getElementById('supplierTable');
const filterInput = document.getElementById('filterInput');

let suppliers = [];

/* =========================
   API helper
   ========================= */
async function api(url) {
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });
  return res.json();
}

/* =========================
   Load suppliers
   ========================= */
async function loadSuppliers() {
  const q = filterInput.value.trim();
  suppliers = await api(`/suppliers${q ? '?q=' + encodeURIComponent(q) : ''}`);
  render();
}

/* =========================
   Render
   ========================= */
function render() {
  table.innerHTML = '';

  suppliers.forEach(s => {
    const main = document.createElement('tr');
    main.className = 'main-row';
    main.innerHTML = `
      <td>${s.name}</td>
      <td>${s.main_contact || ''}</td>
    `;

    const details = document.createElement('tr');
    details.className = 'details-row';
    details.style.display = 'none';
    details.innerHTML = `
      <td colspan="2">
        <div class="details-grid">
          <div><strong>Email:</strong> ${s.email || '—'}</div>
          <div><strong>Phone:</strong> ${s.phone || '—'}</div>
          <div class="full-width">
            <strong>Notes:</strong><br>
            ${s.notes || '—'}
          </div>
        </div>

        <div class="details-actions">
          ${role === 'super_admin' ? `
            <button class="btn-outline" onclick="editSupplier(${s.id})">
              Edit
            </button>
            <button class="btn-danger" onclick="deleteSupplier(${s.id})">
              Delete
            </button>
            <button class="btn-outline" onclick="mergeSupplier(${s.id})">
              Merge
            </button>
          ` : ''}
        </div>

      </td>
    `;

    main.onclick = () => {
      details.style.display =
        details.style.display === 'none' ? 'table-row' : 'none';
    };

    table.appendChild(main);
    table.appendChild(details);
  });
}

/* =========================
   Actions
   ========================= */
function addSupplier() {
  location.href = 'edit-supplier.html';
}

function editSupplier(id) {
  location.href = `edit-supplier.html?id=${id}`;
}

async function mergeSuppliers(sourceId, targetId) {
  const ok = await confirmDialog(
    'All purchase orders will be moved to the selected supplier.\nThis cannot be undone.'
  );
  if (!ok) return;

  try {
    await api('/suppliers/merge', 'POST', { sourceId, targetId });
    showToast('Suppliers merged successfully', 'success');
    loadSuppliers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}




async function deleteSupplier(id, name) {
  const ok = await confirmDialog(
    `Delete supplier "${name}"?\nThis cannot be undone.`
  );
  if (!ok) return;

  try {
    await api(`/suppliers/${id}`, 'DELETE');
    showToast('Supplier deleted', 'success');
    loadSuppliers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

if (role !== 'super_admin') {
  showToast('Access denied', 'error');
  setTimeout(() => location.href = 'suppliers.html', 800);
}


function back() {
  location.href = 'dashboard.html';
}

filterInput.addEventListener('input', loadSuppliers);

/* =========================
   Init
   ========================= */
loadSuppliers();
