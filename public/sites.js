const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token || role !== "super_admin") {
  location.href = "dashboard.html";
}

const siteTable = document.getElementById("siteTable");
const siteModalElement = document.getElementById("siteModal");
const hasBootstrapModal =
  typeof bootstrap !== "undefined" &&
  bootstrap.Modal &&
  typeof bootstrap.Modal === "function";
const siteModal =
  siteModalElement && hasBootstrapModal
    ? new bootstrap.Modal(siteModalElement)
    : null;

let editingSiteId = null;

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

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ============================
   SITES
   ============================ */
async function loadSites() {
  const sites = await api("/admin/sites");
  siteTable.innerHTML = "";

  sites.forEach((s) => {
    const safeName = escapeHtml(s.name);
    const safeAddress = escapeHtml(s.address).replace(/\n/g, "<br>");
    const dataName = encodeURIComponent(s.name || "");
    const dataAddress = encodeURIComponent(s.address || "");
    const dataLetter = encodeURIComponent(s.site_letter || "");
    siteTable.innerHTML += `
      <tr>
        <td data-label="Site">${safeName}</td>
        <td data-label="Site Letter"><strong>${s.site_letter}</strong></td>
        <td data-label="Address">${safeAddress}</td>
        <td data-label="Actions" class="actions-cell">
          <button class="btn btn-outline-primary edit-site"
            data-id="${s.id}"
            data-name="${dataName}"
            data-address="${dataAddress}"
            data-letter="${dataLetter}">Edit</button>
          <button class="btn btn-danger delete-site" data-id="${s.id}">Delete</button>
        </td>
      </tr>
    `;
  });
}

siteTable.addEventListener("click", (event) => {
  const editBtn = event.target.closest(".edit-site");
  if (editBtn) {
    const id = Number(editBtn.dataset.id);
    const name = decodeURIComponent(editBtn.dataset.name || "");
    const address = decodeURIComponent(editBtn.dataset.address || "");
    const letter = decodeURIComponent(editBtn.dataset.letter || "");
    editSite(id, name, address, letter);
    return;
  }

  const deleteBtn = event.target.closest(".delete-site");
  if (deleteBtn) {
    const id = Number(deleteBtn.dataset.id);
    deleteSite(id);
  }
});

function editSite(id, name, address, siteLetter) {
  document.getElementById("siteName").value = name;
  document.getElementById("siteAddress").value = address || "";
  const letterInput = document.getElementById("siteLetter");
  letterInput.value = siteLetter || "";
  letterInput.disabled = true;

  editingSiteId = id;

  document.getElementById("siteEditNotice").style.display = "block";

  const btn = document.getElementById("saveSiteBtn");
  btn.textContent = "Save Changes";
  btn.classList.remove("btn-primary");
  btn.classList.add("btn-warning");

  const modalTitle = document.getElementById("siteModalLabel");
  if (modalTitle) modalTitle.textContent = "Edit Site";

  showSiteModal();
  document.getElementById("siteName").focus();
}

function openAddSiteModal() {
  resetSiteForm();
  showSiteModal();
  document.getElementById("siteName").focus();
}

function resetSiteForm() {
  editingSiteId = null;
  document.getElementById("siteName").value = "";
  document.getElementById("siteAddress").value = "";
  const letterInput = document.getElementById("siteLetter");
  letterInput.value = "";
  letterInput.disabled = false;
  document.getElementById("siteEditNotice").style.display = "none";

  const btn = document.getElementById("saveSiteBtn");
  btn.textContent = "Add Site";
  btn.classList.remove("btn-warning");
  btn.classList.add("btn-primary");

  const modalTitle = document.getElementById("siteModalLabel");
  if (modalTitle) modalTitle.textContent = "Add Site";
}

async function saveSite() {
  const name = document.getElementById("siteName").value.trim();
  const letterInput = document.getElementById("siteLetter");
  const siteLetter = letterInput ? letterInput.value.trim().toUpperCase() : "";
  const address = document.getElementById("siteAddress").value.trim();

  if (!name) {
    alert("Site name is required");
    return;
  }

  if (!editingSiteId) {
    if (!siteLetter || siteLetter.length !== 1) {
      alert("Site letter is required and must be a single character");
      return;
    }
  }

  try {
    if (editingSiteId) {
      await api(`/admin/sites/${editingSiteId}`, "PUT", { name, address });
    } else {
      await api("/admin/sites", "POST", {
        name,
        site_code: siteLetter,
        address,
      });
    }

    resetSiteForm();
    hideSiteModal();
    loadSites();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

function showSiteModal() {
  if (siteModal) {
    siteModal.show();
    return;
  }

  if (!siteModalElement) return;
  siteModalElement.classList.add("show");
  siteModalElement.style.display = "flex";
  siteModalElement.removeAttribute("aria-hidden");
  document.body.classList.add("modal-open");
}

function hideSiteModal() {
  if (siteModal) {
    siteModal.hide();
    return;
  }

  if (!siteModalElement) return;
  siteModalElement.classList.remove("show");
  siteModalElement.style.display = "none";
  siteModalElement.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

if (!siteModal && siteModalElement) {
  const dismissButtons = siteModalElement.querySelectorAll(
    '[data-bs-dismiss="modal"], .btn-close'
  );
  dismissButtons.forEach((btn) => {
    btn.addEventListener("click", hideSiteModal);
  });
}

async function deleteSite(id) {
  if (!confirm("Delete this site?")) return;

  try {
    await api(`/admin/sites/${id}`, "DELETE");
    loadSites();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

function back() {
  location.href = "dashboard.html";
}

/* ============================
   INIT
   ============================ */
loadSites();
