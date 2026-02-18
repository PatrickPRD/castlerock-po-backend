// Ensure user is authenticated before loading page
ensureAuthenticated();

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

/* ============================
   AUTH GUARD
   ============================ */
if (role !== "super_admin") {
  location.href = "dashboard.html";
}

/* ============================
   DOM
   ============================ */
const userTable = document.getElementById("userTable");
const addUserModal = document.getElementById("addUserModal");
const editUserModal = document.getElementById("editUserModal");
const openAddUserBtn = document.getElementById("openAddUser");
const resetPasswordBtn = document.getElementById("resetPasswordBtn");

const userCache = new Map();
let brandingCache = null;

/* ============================
  HELPERS
  ============================ */
async function api(url, method = "GET", body) {
  const options = { method };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  const res = await authenticatedFetch(url, options);

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Request failed");
  }

  return res.json();
}

function openModal(modal) {
  if (!modal) return;
  modal.style.display = "flex";
}

function closeModal(modal) {
  if (!modal) return;
  modal.style.display = "none";
}

function bindModalClosers() {
  document.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalId = btn.dataset.modalClose;
      closeModal(document.getElementById(modalId));
    });
  });
}


function resetAddForm() {
  document.getElementById("addFirstName").value = "";
  document.getElementById("addLastName").value = "";
  document.getElementById("addEmail").value = "";
  document.getElementById("addRole").value = "admin";
}

function resetEditForm() {
  document.getElementById("editUserId").value = "";
  document.getElementById("editFirstName").value = "";
  document.getElementById("editLastName").value = "";
  document.getElementById("editEmail").value = "";
  document.getElementById("editRole").value = "viewer";
  document.getElementById("editActive").value = "1";
}

async function fetchBrandingSettings() {
  try {
    const res = await fetch("/settings/public", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

async function getHeaderBranding() {
  if (brandingCache) return brandingCache;

  const settings = await fetchBrandingSettings();
  if (settings) {
    const logoLabel = settings.header_logo_text || "Castlerock Homes";
    const logoUrl = settings.logo_path || "";
    brandingCache = {
      headerColor: settings.header_color || "#b7342b",
      logoUrl: settings.header_logo_mode === "image" ? logoUrl : "",
      logoLabel: settings.header_logo_mode === "text" ? logoLabel : "Castlerock Homes"
    };
    return brandingCache;
  }

  const nav = document.getElementById("mainHeaderNav");
  const logoImage = document.getElementById("headerBrandImage");
  const logoText = document.getElementById("headerBrandText");
  const rootStyles = getComputedStyle(document.documentElement);
  const logoImageStyle = logoImage ? getComputedStyle(logoImage) : null;
  const logoTextStyle = logoText ? getComputedStyle(logoText) : null;

  const headerColor = (nav && getComputedStyle(nav).backgroundColor) || rootStyles.getPropertyValue("--md-primary").trim() || "#b7342b";
  const logoUrl = (logoImage && logoImageStyle && logoImageStyle.display !== "none") ? logoImage.src : "";
  const logoLabel = (logoText && logoTextStyle && logoTextStyle.display !== "none") ? logoText.textContent.trim() : "Castlerock Homes";

  brandingCache = {
    headerColor,
    logoUrl,
    logoLabel: logoLabel || "Castlerock Homes"
  };

  return brandingCache;
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
  userCache.clear();

  users.forEach((u) => {
    userCache.set(u.id, u);
    const userRole = u.role || "viewer";
    const isActive = Number(u.active) === 1;
    const isSystemUser = u.id === 99;

    userTable.innerHTML += `
      <tr ${isSystemUser ? 'style="opacity: 0.6;"' : ''}>
        <td>${u.first_name || ""} ${u.last_name || ""}</td>

        <td>
          <select onchange="updateUserRole(${u.id}, this.value, this)" data-current-role="${userRole}" ${isSystemUser ? 'disabled' : ''}>
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
  openEditModal(id);
}

async function addUser() {
  if (role !== "super_admin") {
    showToast("Not authorized", "error");
    return;
  }

  const firstName = document.getElementById("addFirstName").value.trim();
  const lastName = document.getElementById("addLastName").value.trim();
  const email = document.getElementById("addEmail").value.trim();
  const userRole = document.getElementById("addRole").value;

  if (!email || !firstName || !lastName) {
    showToast("Please fill in all required fields", "error");
    return;
  }

  if (userRole === "super_admin") {
    const confirmed = await confirmDialog(
      "Create Super Admin? This grants full access to users, backups, and system settings."
    );
    if (!confirmed) return;
  }

  try {
    // Create user - password will be set via email link
    await api("/admin/users", "POST", {
      email,
      role: userRole,
      first_name: firstName,
      last_name: lastName
    });

    // Clear inputs
    resetAddForm();
    closeModal(addUserModal);

    // Refresh table
    await loadUsers();

    // User feedback
    showToast(`User ${email} created successfully. Welcome email sent.`, "success");
  } catch (err) {
    showToast(err.message || "Failed to create user", "error");
  }
}

async function openEditModal(id) {
  if (role !== "super_admin") {
    showToast("Not authorized", "error");
    return;
  }

  resetEditForm();
  openModal(editUserModal);

  try {
    const user = await api(`/admin/users/${id}`);
    document.getElementById("editUserId").value = id;
    document.getElementById("editFirstName").value = user.first_name || "";
    document.getElementById("editLastName").value = user.last_name || "";
    document.getElementById("editEmail").value = user.email || "";
    document.getElementById("editRole").value = user.role || "viewer";
    document.getElementById("editRole").dataset.currentRole = user.role || "viewer";
    document.getElementById("editActive").value = Number(user.active) === 1 ? "1" : "0";
  } catch (err) {
    closeModal(editUserModal);
    showToast(err.message || "Failed to load user", "error");
  }
}

async function resetPassword(id, email) {
  if (!(await confirmDialog(`Send password reset email to ${email}?`))) return;

  try {
    await api(`/admin/users/${id}/reset-password`, "POST");
    showToast(`Password reset email sent to ${email}`, "success");
    closeModal(editUserModal);
  } catch (err) {
    showToast(err.message || "Failed to send password reset email", "error");
  }
}

async function saveEditUser() {
  const id = document.getElementById("editUserId").value;
  if (!id) return;

  const editRoleEl = document.getElementById("editRole");
  const previousRole = editRoleEl?.dataset.currentRole;
  const nextRole = editRoleEl?.value;
  if (nextRole === "super_admin" && previousRole !== "super_admin") {
    const confirmed = await confirmDialog(
      "Promote to Super Admin? This grants full access to users, backups, and system settings."
    );
    if (!confirmed) return;
  }

  const payload = {
    first_name: document.getElementById("editFirstName").value.trim(),
    last_name: document.getElementById("editLastName").value.trim(),
    role: nextRole,
    active: Number(document.getElementById("editActive").value),
  };

  try {
    await api(`/admin/users/${id}`, "PUT", payload);
    closeModal(editUserModal);
    await loadUsers();
    showToast("User updated", "success");
  } catch (err) {
    showToast(err.message || "Update failed", "error");
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

async function updateUserRole(id, role, selectEl) {
  const previousRole = selectEl?.dataset.currentRole;
  const isPromotion = role === "super_admin" && previousRole !== "super_admin";

  if (isPromotion) {
    const confirmed = await confirmDialog(
      "Promote to Super Admin? This grants full access to users, backups, and system settings."
    );
    if (!confirmed) {
      if (selectEl && previousRole) {
        selectEl.value = previousRole;
      }
      return;
    }
  }

  try {
    await api(`/admin/users/${id}`, "PUT", { role });
    if (selectEl) {
      selectEl.dataset.currentRole = role;
    }
    loadUsers();
  } catch (err) {
    showToast(err.message, "error");
    if (selectEl && previousRole) {
      selectEl.value = previousRole;
    }
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

/* ============================
   NAVIGATION
   ============================ */
function back() {
  location.href = 'dashboard.html';
}

/* ============================
   INIT
   ============================ */
loadUsers();
bindModalClosers();

if (openAddUserBtn) {
  openAddUserBtn.addEventListener("click", () => {
    resetAddForm();
    openModal(addUserModal);
  });
}

const addUserForm = document.getElementById("addUserForm");
if (addUserForm) {
  addUserForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addUser();
  });
}

const editUserForm = document.getElementById("editUserForm");
if (editUserForm) {
  editUserForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveEditUser();
  });
}

if (resetPasswordBtn) {
  resetPasswordBtn.addEventListener("click", () => {
    const id = document.getElementById("editUserId").value;
    const email = document.getElementById("editEmail").value;
    if (id && email) {
      resetPassword(id, email);
    }
  });
}


