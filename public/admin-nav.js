const navToken = localStorage.getItem("token");
const navRole = localStorage.getItem("role");

function logout() {
  localStorage.clear();
  location.href = 'login.html';
}

function createPO() {
  location.href = 'create-po.html';
}

function closeMenus() {
  document.querySelectorAll(".dropdown-menu.portal").forEach((m) => m.remove());
  document.querySelector(".menu-backdrop")?.remove();
}

function openMenu(btn, menuId) {
  closeMenus();

  const original = document.getElementById(menuId);
  if (!original) return;

  const menu = original.cloneNode(true);
  menu.classList.add("portal");
  menu.classList.add("show");

  document.body.appendChild(menu);

  const rect = btn.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;

  let left = rect.left;
  let top = rect.bottom + 8;

  if (left + w > window.innerWidth - 8) {
    left = window.innerWidth - w - 8;
  }
  if (left < 8) left = 8;

  if (top + h > window.innerHeight - 8) {
    top = rect.top - h - 8;
  }

  menu.style.position = "fixed";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.zIndex = "10001";

  document.body.insertAdjacentHTML(
    "beforeend",
    '<div class="menu-backdrop" onclick="closeMenus()"></div>'
  );
}

function toggleActionsMenu(btn) {
  openMenu(btn, "actionsMenu");
}

function toggleReportsMenu(btn) {
  openMenu(btn, "reportsMenu");
}

function toggleAdminMenu(btn) {
  openMenu(btn, "adminMenu");
}

document.addEventListener("DOMContentLoaded", () => {
  const adminDropdown = document.getElementById("adminDropdown");
  const reportsDropdown = document.getElementById("reportsDropdown");

  if (!navRole || !["admin", "super_admin"].includes(navRole)) {
    adminDropdown?.remove();
  } else {
    adminDropdown.style.display = "block";

    if (navRole !== "super_admin") {
      document.getElementById("adminUsersBtn")?.remove();
      document.getElementById("adminSitesBtn")?.remove();
      document.getElementById("adminBackupBtn")?.remove();
    }
  }

  if (navRole === "super_admin") {
    if (reportsDropdown) reportsDropdown.style.display = "block";
  } else {
    reportsDropdown?.remove();
  }
});
