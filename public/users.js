const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

/* ============================
   AUTH GUARD
   ============================ */
if (!token || role !== "super_admin") {
  location.href = "dashboard.html";
}

/* ============================
   DOM
   ============================ */
const userTable = document.getElementById("userTable");

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

    userTable.innerHTML += `
      <tr>
        <td>${u.first_name || ""} ${u.last_name || ""}</td>
        <td>${u.email}</td>

        <td>
          <select onchange="updateUserRole(${u.id}, this.value)">
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
          <div class="actions-menu">
              <button class="actions-trigger" onclick="toggleActions(this)">
                Actions
              </button>
              <div class="actions-dropdown hidden">

                <button class="btn-outline"
                  onclick="toggleUser(${u.id}, ${isActive ? 0 : 1})">
                  ${isActive ? "Disable" : "Enable"}
                </button>

                <button class="btn-outline"
                  onclick="sendInvite('${u.email}')">
                  Reset Password
                </button>

                <button class="btn-outline"
                  onclick="editUser(${u.id})">
                  Edit
                </button>
                <hr>
                <button class="btn-danger"
                  onclick="deleteUser(${u.id}, '${u.email}')">
                  Delete
                </button>
              </div>
          </div>
        </td>

      </tr>
    `;
  });
}

function editUser(id) {
  window.location.href = `edit-user.html?id=${id}`;
}

async function addUser() {
  if (role !== "super_admin") {
    showToast("Not authorized", "error");
    return;
  }

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
   NAVIGATION
   ============================ */
function back() {
  location.href = 'dashboard.html';
}

/* ============================
   INIT
   ============================ */
loadUsers();
