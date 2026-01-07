const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');
const usersSection     = document.getElementById('usersSection');
const sitesSection     = document.getElementById('sitesSection');
const locationsSection = document.getElementById('locationsSection');



/* ============================
   ROLE-BASED UI VISIBILITY
   ============================ */
if (role === 'admin') {
  if (usersSection) usersSection.style.display = 'none';
  if (sitesSection) sitesSection.style.display = 'none';
}

// super_admin sees everything


/* ============================
   AUTH GUARD
   ============================ */
if (!token || !['admin', 'super_admin'].includes(role)) {
  location.href = 'dashboard.html';
}

/* ============================
   DOM
   ============================ */
const userTable     = document.getElementById('userTable');
const siteTable     = document.getElementById('siteTable');
const locationTable = document.getElementById('locationTable');
const siteSelect    = document.getElementById('siteSelect');


let editingSiteId = null;
let editingLocationId = null;

/* ============================
   HELPERS
   ============================ */
async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

function showToast(message, type = 'success', timeout = 3000) {
  const toast = document.getElementById('toast');
  const backdrop = document.getElementById('toast-backdrop');
  if (!toast || !backdrop) return;

  toast.textContent = message;
  toast.className = `toast ${type}`;
  
  toast.classList.remove('hidden');
  backdrop.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
    backdrop.classList.add('hidden');
  }, timeout);

  backdrop.onclick = () => {
  toast.classList.add('hidden');
  backdrop.classList.add('hidden');
};
}




/* ============================
   USERS (SUPER ADMIN ONLY)
   ============================ */
async function loadUsers() {
  if (!userTable) return;

  const users = await api('/admin/users');
  userTable.innerHTML = '';

  users.forEach(u => {

    const userRole = u.role || 'viewer';
    const isActive = Number(u.active) === 1;

    userTable.innerHTML += `
      <tr>
        <td>${u.first_name || ''} ${u.last_name || ''}</td>
        <td>${u.email}</td>

        <td>
          <select onchange="updateUserRole(${u.id}, this.value)">
            <option value="super_admin" ${userRole === 'super_admin' ? 'selected' : ''}>Super Admin</option>
            <option value="admin"  ${userRole === 'admin'  ? 'selected' : ''}>Admin</option>
            <option value="staff"  ${userRole === 'staff'  ? 'selected' : ''}>Staff</option>
            <option value="viewer" ${userRole === 'viewer' ? 'selected' : ''}>Viewer</option>
          </select>
        </td>

        <td>${isActive ? 'Active' : 'Disabled'}</td>

        <td>
  <button class="btn-outline"
    onclick="toggleUser(${u.id}, ${isActive ? 0 : 1})">
    ${isActive ? 'Disable' : 'Enable'}
  </button>

  <button class="btn-outline"
    onclick="sendInvite('${u.email}')">
    Reset Password
  </button>

  <button class="btn-outline"
    onclick="editUser(${u.id})">
    Edit
  </button>

  <button class="btn-danger"
    onclick="deleteUser(${u.id}, '${u.email}')">
    Delete
  </button>
</td>

      </tr>
    `;
  });
}

function editUser(id) {
  window.location.href = `edit-user.html?id=${id}`;
}


async function addUser() {
  if (role !== 'super_admin') return showToast(err.message, 'error');;

  const firstName = document.getElementById('firstName').value.trim();
  const lastName  = document.getElementById('lastName').value.trim();
  const email     = document.getElementById('userEmail').value.trim();
  const userRole  = document.getElementById('userRole').value;

  if (!email || !firstName || !lastName) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  try {
    // 1️⃣ Create user
    await api('/admin/users', 'POST', {
      email,
      role: userRole,
      first_name: firstName,
      last_name: lastName
    });

    // 2️⃣ Send invite email
    await fetch('/auth/request-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    // 3️⃣ Clear inputs
    document.getElementById('firstName').value = '';
    document.getElementById('lastName').value  = '';
    document.getElementById('userEmail').value = '';

    // 4️⃣ Refresh table
    await loadUsers();

    // 5️⃣ User feedback
showToast(`Invite sent to ${email}`, 'success');



  } catch (err) {
    showToast(err.message || 'Failed to create user', 'error');
  }
}


async function toggleUser(id, active) {
  try {
    await api(`/admin/users/${id}`, 'PUT', { active });
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
    loadUsers(); // 🔄 revert UI
  }
}

async function updateUserRole(id, role) {
  try {
    await api(`/admin/users/${id}`, 'PUT', { role });
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
    loadUsers(); // 🔄 snap UI back to server truth
  }
}

async function deleteUser(id, email) {
  if (!confirm(`Delete user ${email}?\n\nThis cannot be undone.`)) {
    return;
  }

  try {
    await api(`/admin/users/${id}`, 'DELETE');
    await loadUsers();
    showToast(`User ${email} deleted`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to delete user', 'error');

  }
}


async function toggleUser(id, active) {
  await api(`/admin/users/${id}`, 'PUT', { active });
  loadUsers();
}

async function sendInvite(email) {
  if (!confirm(`Send password setup email to ${email}?`)) return;

  try {
    await fetch('/auth/request-reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    showToast(`Invite email sent to ${email}`, 'success');
  } catch (err) {
    showToast('Failed to send invite email', 'error');

  }
}




/* ============================
   SITES (SUPER ADMIN ONLY)
   ============================ */
async function loadSites() {
  const sites = await api('/admin/sites');
  siteTable.innerHTML = '';
  siteSelect.innerHTML = '<option value="">Select site</option>';

  sites.forEach(s => {
    siteTable.innerHTML += `
      <tr>
        <td>${s.name}</td>
        <td><strong>${s.site_letter}</strong></td>
        <td>
          <button class="btn-outline" onclick="editSite(${s.id}, '${s.name}')">Edit</button>
          <button class="btn-danger" onclick="deleteSite(${s.id})">Delete</button>
        </td>
      </tr>
    `;

    siteSelect.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  });
}

function editSite(id, name) {
  document.getElementById('siteName').value = name;
  editingSiteId = id;

  document.getElementById('siteEditNotice').style.display = 'block';

  const btn = document.getElementById('saveSiteBtn');
  btn.textContent = 'Save Changes';

  btn.classList.add('btn-warning');

  document.getElementById('siteName').focus();

  loadLocations();
}


function resetSiteForm() {
  editingSiteId = null;
  document.getElementById('siteName').value = '';

  document.getElementById('siteEditNotice').style.display = 'none';

  const btn = document.getElementById('saveSiteBtn');
  btn.textContent = 'Add Site';
  btn.classList.remove('btn-warning');
 
}



function back() {
  window.location.href = 'dashboard.html';
}

async function saveSite() {
  const name = document.getElementById('siteName').value.trim();

  // 🔹 NEW: site letter input (super_admin only)
  const letterInput = document.getElementById('siteLetter');
  const siteLetter = letterInput ? letterInput.value.trim().toUpperCase() : '';

  if (!name) {
    showToast('Site name is required', 'error');
    return;
  }

  // Creating new site → require site letter
  if (!editingSiteId) {
    if (!siteLetter || siteLetter.length !== 1) {
      showToast('Site letter is required and must be a single character', 'error');
      return;
    }
  }

  try {
    if (editingSiteId) {
      // 🔒 Do NOT allow changing site letter on edit
      await api(`/admin/sites/${editingSiteId}`, 'PUT', { name });
    } else {
      await api('/admin/sites', 'POST', {
        name,
        site_code: siteLetter
      });
    }

    resetSiteForm();
    loadSites();

  } catch (err) {
    // 🔥 This will catch "site letter already exists"
  showToast(err.message, 'error');
  }
}



async function deleteSite(id) {
  if (!confirm('Delete this site?')) return;

  try {
    await api(`/admin/sites/${id}`, 'DELETE');
    loadSites();
  } catch (err) {
    showToast(err.message, 'error');
  }
}



/* ============================
   LOCATIONS
   ============================ */
async function loadLocations() {
  const locations = await api('/admin/locations');
  locationTable.innerHTML = '';

  locations.forEach(l => {
    locationTable.innerHTML += `
      <tr>
        <td>${l.name}</td>
        <td>${l.type}</td>
        <td>${l.site}</td>
        <td>
          <button class="btn-outline"
            onclick="editLocation(${l.id}, '${l.name}', ${l.site_id})">
            Edit
          </button>
          <button class="btn-danger" onclick="deleteLocation(${l.id})">
            Delete
          </button>
        </td>
      </tr>
    `;
  });
}

function editLocation(id, name, siteId) {
  document.getElementById('locationName').value = name;
  document.getElementById('siteSelect').value = siteId;

  editingLocationId = id;

  document.getElementById('locationEditNotice').style.display = 'block';

  const btn = document.getElementById('saveLocationBtn');
  btn.textContent = 'Save Changes';
  btn.classList.add('btn-warning');

  document.getElementById('locationName').focus();
}



async function saveLocation() {

const nameEl = document.getElementById('locationName');
const typeEl = document.getElementById('locationType');
const siteEl = document.getElementById('siteSelect');

  const name = document.getElementById('locationName').value.trim();
  const type = document.getElementById('locationType').value.trim();
  const siteId = document.getElementById('siteSelect').value;

  if (!name) {
  showToast('Location name is required', 'error');
  return;
}
if (!type) {
  showToast('Location type is required', 'error');
  return;
}
if (!siteId) {
  showToast('Please select a site', 'error');
  return;
}


  if (editingLocationId) {
    await api(`/admin/locations/${editingLocationId}`, 'PUT', {
      name,
      type,
      site_id: siteId
    });
  } else {
    await api('/admin/locations', 'POST', {
      name,
      type,
      site_id: siteId
    });
  }

  resetLocationForm();
  loadLocations();
}

function resetLocationForm() {
  editingLocationId = null;
  document.getElementById('locationName').value = '';
  document.getElementById('siteSelect').value = '';

  document.getElementById('locationEditNotice').style.display = 'none';

  const btn = document.getElementById('saveLocationBtn');
  btn.textContent = 'Add Location';
  btn.classList.remove('btn-warning');

}



async function deleteLocation(id) {
  if (!confirm('Delete this location?')) return;

  try {
    await api(`/admin/locations/${id}`, 'DELETE');
    loadLocations();
  } catch (err) {
    showToast(err.message, 'error');
  }
}


/* ============================
   INIT
   ============================ */
if (role === 'super_admin') {
  loadUsers();
  loadSites();
  loadLocations();
}

if (role === 'admin') {
  loadLocations();
}

