const token = localStorage.getItem("token");
const role = localStorage.getItem("role");
const usersSection = document.getElementById("usersSection");
const locationsSection = document.getElementById("locationsSection");

/* ============================
   ROLE-BASED UI VISIBILITY
   ============================ */
if (role === "admin") {
  if (usersSection) usersSection.style.display = "none";
}

// super_admin sees everything, hide backup button for non-super-admins
const backupBtn = document.querySelector('[onclick="goToBackupManagement()"]');
if (backupBtn && role !== 'super_admin') {
  backupBtn.style.display = 'none';
}

/* ============================
   AUTH GUARD
   ============================ */
if (!token || !["admin", "super_admin"].includes(role)) {
  location.href = "dashboard.html";
}

/* ============================
   DOM
   ============================ */
const userTable = document.getElementById("userTable");
const siteTable = document.getElementById("siteTable");
const locationTable = document.getElementById("locationTable");
const siteSelect = document.getElementById("siteSelect");

let editingSiteId = null;
let editingLocationId = null;

/* ============================
   HELPERS
   ============================ */
async function api(url, method = "GET", body) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Request failed");
  }

  return res.json();
}

function toggleActions(btn) {
  // Close any other open menus
  document.querySelectorAll('.actions-dropdown').forEach(m => {
    if (m !== btn.nextElementSibling) {
      m.classList.add('hidden');
    }
  });

  const menu = btn.nextElementSibling;
  menu.classList.toggle('hidden');
}

// Close on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.actions-menu')) {
    document
      .querySelectorAll('.actions-dropdown')
      .forEach(m => m.classList.add('hidden'));
  }
});


/* ============================
   USERS (SUPER ADMIN ONLY)
   ============================ */
async function loadUsers() {
  if (!userTable) return;

  const users = await api("/admin/users");
  userTable.innerHTML = "";

  users.forEach((u) => {
    const userRole = u.role || "viewer";
    const isActive = Number(u.active) === 1;
    const isSystemUser = u.id === 99;

    userTable.innerHTML += `
      <tr ${isSystemUser ? 'style="opacity: 0.6;"' : ''}>
        <td>${u.first_name || ""} ${u.last_name || ""}</td>
        <td>${u.email}</td>

        <td>
          <select onchange="updateUserRole(${u.id}, this.value)" ${isSystemUser ? 'disabled' : ''}>
            <option value="super_admin" ${
              userRole === "super_admin" ? "selected" : ""
            }>Super Admin</option>
            <option value="admin"  ${
              userRole === "admin" ? "selected" : ""
            }>Admin</option>
            <option value="staff"  ${
              userRole === "staff" ? "selected" : ""
            }>Staff</option>
            <option value="viewer" ${
              userRole === "viewer" ? "selected" : ""
            }>Viewer</option>
          </select>
        </td>

        <td>${isActive ? "Active" : "Disabled"}</td>

        <td class="user-actions">
          ${!isSystemUser ? `
          <div class="dropdown">
            <button class="btn btn-sm btn-primary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              Actions
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <a class="dropdown-item" href="#" onclick="toggleUser(${u.id}, ${isActive ? 0 : 1}); return false;">
                  ${isActive ? "Disable" : "Enable"}
                </a>
              </li>
              <li>
                <a class="dropdown-item" href="#" onclick="sendInvite('${u.email}'); return false;">
                  Reset Password
                </a>
              </li>
              <li>
                <a class="dropdown-item" href="#" onclick="editUser(${u.id}); return false;">
                  Edit
                </a>
              </li>
              <li><hr class="dropdown-divider"></li>
              <li>
                <a class="dropdown-item text-danger" href="#" onclick="deleteUser(${u.id}, '${u.email}'); return false;">
                  Delete
                </a>
              </li>
            </ul>
          </div>
          ` : ''}
        </td>

      </tr>
    `;
  });
}

function editUser(id) {
  window.location.href = `edit-user.html?id=${id}`;
}

async function addUser() {
  if (role !== "super_admin") return showToast(err.message, "error");

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("userEmail").value.trim();
  const userRole = document.getElementById("userRole").value;

  if (!email || !firstName || !lastName) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  try {
    // 1️⃣ Create user
    await api("/admin/users", "POST", {
      email,
      role: userRole,
      first_name: firstName,
      last_name: lastName,
    });

    // 2️⃣ Send invite email
    await fetch("/auth/request-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    // 3️⃣ Clear inputs
    document.getElementById("firstName").value = "";
    document.getElementById("lastName").value = "";
    document.getElementById("userEmail").value = "";

    // 4️⃣ Refresh table
    await loadUsers();

    // 5️⃣ User feedback
    showToast(`Invite sent to ${email}`, "success");
  } catch (err) {
    showToast(err.message || "Failed to create user", "error");
  }
}

async function toggleUser(id, active) {
  try {
    await api(`/admin/users/${id}`, "PUT", { active });
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
    loadUsers(); // 🔄 revert UI
  }
}

async function updateUserRole(id, role) {
  try {
    await api(`/admin/users/${id}`, "PUT", { role });
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
    loadUsers(); // 🔄 snap UI back to server truth
  }
}

async function deleteUser(id, email) {
  if (!(await confirmDialog(`Delete user ${email}?`))) return;

  try {
    await api(`/admin/users/${id}`, "DELETE");
    await loadUsers();
    showToast(`User ${email} deleted`, "success");
  } catch (err) {
    showToast(err.message || "Failed to delete user", "error");
  }
}

async function toggleUser(id, active) {
  await api(`/admin/users/${id}`, "PUT", { active });
  loadUsers();
}

async function sendInvite(email) {
  if (!(await confirmDialog(`Send password setup email to ${email}?`))) return;

  try {
    await fetch("/auth/request-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    showToast(`Invite email sent to ${email}`, "success");
  } catch (err) {
    showToast("Failed to send invite email", "error");
  }
}

/* ============================
   LOCATIONS
   ============================ */
async function loadLocations() {
  const locations = await api("/admin/locations");
  locationTable.innerHTML = "";

  locations.forEach((l) => {
    locationTable.innerHTML += `
      <tr>
        <td>${l.name}</td>
        <td>${l.type}</td>
        <td>${l.site}</td>
        <td>
          <button class="btn btn-outline-primary"
            onclick="editLocation(${l.id}, '${l.name}', ${l.site_id})">
            Edit
          </button>
          <button class="btn btn-danger" onclick="deleteLocation(${l.id})">
            Delete
          </button>
        </td>
      </tr>
    `;
  });
}

function editLocation(id, name, siteId) {
  document.getElementById("locationName").value = name;
  document.getElementById("siteSelect").value = siteId;

  editingLocationId = id;

  document.getElementById("locationEditNotice").style.display = "block";

  const btn = document.getElementById("saveLocationBtn");
  btn.textContent = "Save Changes";
  btn.classList.add("btn-warning");

  document.getElementById("locationName").focus();
}

async function saveLocation() {
  const nameEl = document.getElementById("locationName");
  const typeEl = document.getElementById("locationType");
  const siteEl = document.getElementById("siteSelect");

  const name = document.getElementById("locationName").value.trim();
  const type = document.getElementById("locationType").value.trim();
  const siteId = document.getElementById("siteSelect").value;

  if (!name) {
    showToast("Location name is required", "error");
    return;
  }
  if (!type) {
    showToast("Location type is required", "error");
    return;
  }
  if (!siteId) {
    showToast("Please select a site", "error");
    return;
  }

  if (editingLocationId) {
    await api(`/admin/locations/${editingLocationId}`, "PUT", {
      name,
      type,
      site_id: siteId,
    });
  } else {
    await api("/admin/locations", "POST", {
      name,
      type,
      site_id: siteId,
    });
  }

  resetLocationForm();
  loadLocations();
}

function resetLocationForm() {
  editingLocationId = null;
  document.getElementById("locationName").value = "";
  document.getElementById("siteSelect").value = "";

  document.getElementById("locationEditNotice").style.display = "none";

  const btn = document.getElementById("saveLocationBtn");
  btn.textContent = "Add Location";
  btn.classList.remove("btn-warning");
}

async function deleteLocation(id) {
  if (!(await confirmDialog("Delete this location?"))) return;

  try {
    await api(`/admin/locations/${id}`, "DELETE");
    loadLocations();
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ============================
   AUTO-POPULATE SITES & LOCATIONS
   ============================ */
async function autoPopulateSites() {
  if (!confirm('This will automatically update sites and locations based on PO data. Continue?')) {
    return;
  }

  try {
    showToast('Processing... This may take a moment.', 'info');
    
    const result = await api('/admin/auto-populate-sites', 'POST');
    
    let message = `✅ Auto-population complete!\n\n`;
    
    if (result.site_updates && result.site_updates.length > 0) {
      message += `Sites Updated: ${result.site_updates.length}\n`;
      result.site_updates.forEach(u => {
        message += `  • ${u.old_name} → ${u.new_name} (Letter: ${u.letter})\n`;
      });
    }
    
    showToast(message, 'success');
    await Promise.all([loadUsers(), loadLocations()]);
  } catch (err) {
    showToast(err.message || 'Auto-population failed', 'error');
  }
}

/* ============================
   NAVIGATION
   ============================ */
function back() {
  location.href = 'dashboard.html';
}

function goToBackupManagement() {
  location.href = 'backup-management.html';
}

function goToLocationSpread() {
  location.href = 'location-spread.html';
}

function goToSites() {
  location.href = 'sites.html';
}

/* ============================
   INIT
   ============================ */
if (role === "super_admin") {
  loadUsers();
  loadLocations();
}

/* ============================
   MERGE LOCATIONS – SUPER ADMIN ONLY
   ============================== */

// Show merge button only for super admin
const mergeBtn = document.getElementById('mergeMergeBtn');
if (mergeBtn) {
  if (role === 'super_admin') {
    mergeBtn.style.display = 'inline-block';
  } else {
    mergeBtn.style.display = 'none';
  }
}

function openMergeLocationModal() {
  const modal = document.getElementById('mergeLocationModal');
  const mergeFromSelect = document.getElementById('mergeFromLocation');
  const mergeToSelect = document.getElementById('mergeToLocation');

  // Populate location dropdowns
  api('/admin/locations')
    .then(locations => {
      // Store all locations for filtering
      window.allLocationsForMerge = locations;

      mergeFromSelect.innerHTML = '<option value="">-- Select location --</option>';
      mergeToSelect.innerHTML = '<option value="">-- Select location --</option>';
      mergeToSelect.disabled = true;

      locations.forEach(loc => {
        const opt1 = document.createElement('option');
        opt1.value = loc.id;
        opt1.textContent = `${loc.name} (${loc.site})`;
        mergeFromSelect.appendChild(opt1);
      });

      modal.style.display = 'flex';
    });

  // Update button disabled state
  updateMergeButtonState();
}

function closeMergeLocationModal() {
  const modal = document.getElementById('mergeLocationModal');
  modal.style.display = 'none';
  document.getElementById('mergeFromLocation').value = '';
  document.getElementById('mergeToLocation').value = '';
}

function updateMergeButtonState() {
  const confirmBtn = document.getElementById('confirmMergeBtn');
  const fromId = document.getElementById('mergeFromLocation').value;
  const toId = document.getElementById('mergeToLocation').value;

  // Button enabled only if both locations selected and they're different
  confirmBtn.disabled = !fromId || !toId || fromId === toId;
}

// Add event listeners to disable merge if same location selected
document.addEventListener('DOMContentLoaded', () => {
  const mergeFromSelect = document.getElementById('mergeFromLocation');
  const mergeToSelect = document.getElementById('mergeToLocation');

  if (mergeFromSelect) {
    mergeFromSelect.addEventListener('change', () => {
      const selectedId = mergeFromSelect.value;
      const allLocations = window.allLocationsForMerge || [];

      // Enable/disable the second dropdown
      if (selectedId) {
        mergeToSelect.disabled = false;

        // Populate second dropdown excluding selected location
        mergeToSelect.innerHTML = '<option value="">-- Select location --</option>';
        allLocations.forEach(loc => {
          if (loc.id !== parseInt(selectedId)) {
            const opt = document.createElement('option');
            opt.value = loc.id;
            opt.textContent = `${loc.name} (${loc.site})`;
            mergeToSelect.appendChild(opt);
          }
        });
      } else {
        mergeToSelect.disabled = true;
        mergeToSelect.innerHTML = '<option value="">-- Select location --</option>';
      }

      updateMergeButtonState();
    });
  }

  if (mergeToSelect) {
    mergeToSelect.addEventListener('change', updateMergeButtonState);
  }
});

async function confirmMergeLocations() {
  const fromId = document.getElementById('mergeFromLocation').value;
  const toId = document.getElementById('mergeToLocation').value;

  if (!fromId || !toId || fromId === toId) {
    alert('Please select two different locations');
    return;
  }

  // Get location names for confirmation
  const mergeFromSelect = document.getElementById('mergeFromLocation');
  const mergeToSelect = document.getElementById('mergeToLocation');
  const fromName = mergeFromSelect.options[mergeFromSelect.selectedIndex].text;
  const toName = mergeToSelect.options[mergeToSelect.selectedIndex].text;

  const confirmed = confirm(
    `Are you sure you want to merge "${toName}" into "${fromName}"?\n\n` +
    `This will:\n` +
    `- Update all Purchase Orders from "${toName}" to "${fromName}"\n` +
    `- Update all Location Spread Rules\n` +
    `- Permanently delete "${toName}"\n\n` +
    `This action cannot be undone.`
  );

  if (!confirmed) return;

  try {
    const res = await api('/admin/merge-locations', 'POST', {
      keep_location_id: parseInt(fromId),
      merge_location_id: parseInt(toId)
    });

    alert(`Successfully merged "${toName}" into "${fromName}"`);
    closeMergeLocationModal();
    loadLocations();

  } catch (err) {
    console.error('Merge error:', err);
    alert(`Failed to merge locations: ${err.message}`);
  }
}
