// Ensure user is authenticated before loading page
ensureAuthenticated();

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (role !== "super_admin") {
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
let currentCapitalCostSiteId = null;
let editingCapitalCostId = null;

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
        <td data-label="Capital Cost" style="text-align:right;">€${Math.round(parseFloat(s.total_capital_cost) || 0).toLocaleString()}</td>
        <td data-label="Actions" class="actions-cell">
          <div style="display:flex; gap:6px; flex-wrap:nowrap;">
            <button class="btn btn-outline-secondary btn-sm capital-costs-btn" data-id="${s.id}" data-name="${dataName}">Capital Costs</button>
            <button class="btn btn-outline-primary btn-sm edit-site"
              data-id="${s.id}"
              data-name="${dataName}"
              data-address="${dataAddress}"
              data-letter="${dataLetter}">Edit</button>
            <button class="btn btn-danger btn-sm delete-site" data-id="${s.id}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  });
}

siteTable.addEventListener("click", (event) => {
  const capitalCostsBtn = event.target.closest(".capital-costs-btn");
  if (capitalCostsBtn) {
    const id = Number(capitalCostsBtn.dataset.id);
    const name = decodeURIComponent(capitalCostsBtn.dataset.name || "");
    openCapitalCosts(id, name);
    return;
  }

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
   CAPITAL COSTS
   ============================ */
const capitalCostsListModalElement = document.getElementById("capitalCostsListModal");
const capitalCostsListModal =
  capitalCostsListModalElement && hasBootstrapModal
    ? new bootstrap.Modal(capitalCostsListModalElement)
    : null;
const capitalCostsTable = document.getElementById("capitalCostsTable");

function openCapitalCosts(siteId, siteName) {
  currentCapitalCostSiteId = siteId;
  document.getElementById("capitalCostsListModalLabel").textContent =
    "Capital Costs — " + escapeHtml(siteName);
  cancelCapitalCostForm();
  loadCapitalCosts();
  showCapitalCostsListModal();
}

function showCapitalCostsListModal() {
  if (capitalCostsListModal) {
    capitalCostsListModal.show();
    return;
  }
  if (!capitalCostsListModalElement) return;
  capitalCostsListModalElement.classList.add("show");
  capitalCostsListModalElement.style.display = "flex";
  capitalCostsListModalElement.removeAttribute("aria-hidden");
  document.body.classList.add("modal-open");
}

function hideCapitalCostsListModal() {
  currentCapitalCostSiteId = null;
  loadSites();
  if (capitalCostsListModal) {
    capitalCostsListModal.hide();
    return;
  }
  if (!capitalCostsListModalElement) return;
  capitalCostsListModalElement.classList.remove("show");
  capitalCostsListModalElement.style.display = "none";
  capitalCostsListModalElement.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

if (!capitalCostsListModal && capitalCostsListModalElement) {
  const dismissButtons = capitalCostsListModalElement.querySelectorAll(
    '[data-bs-dismiss="modal"], .btn-close'
  );
  dismissButtons.forEach((btn) => {
    btn.addEventListener("click", hideCapitalCostsListModal);
  });
}

async function loadCapitalCosts() {
  if (!currentCapitalCostSiteId) return;
  const items = await api(
    `/admin/sites/${currentCapitalCostSiteId}/capital-costs`
  );
  capitalCostsTable.innerHTML = "";

  let total = 0;
  items.forEach((item) => {
    const safeTitle = escapeHtml(item.title);
    const safeDesc = escapeHtml(item.description).replace(/\n/g, "<br>");
    const costVal = parseFloat(item.cost) || 0;
    total += costVal;

    capitalCostsTable.innerHTML += `
      <tr>
        <td data-label="Title">${safeTitle}</td>
        <td data-label="Description">${safeDesc}</td>
        <td data-label="Cost" style="text-align:right;">${costVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td data-label="Actions" class="actions-cell">
          <button class="btn btn-outline-primary btn-sm edit-capital-cost"
            data-id="${item.id}"
            data-title="${encodeURIComponent(item.title || "")}"
            data-description="${encodeURIComponent(item.description || "")}"
            data-cost="${item.cost}">Edit</button>
          <button class="btn btn-danger btn-sm delete-capital-cost" data-id="${item.id}">Delete</button>
        </td>
      </tr>
    `;
  });

  document.getElementById("capitalCostsTotal").textContent = total.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

capitalCostsTable.addEventListener("click", (event) => {
  const editBtn = event.target.closest(".edit-capital-cost");
  if (editBtn) {
    editingCapitalCostId = Number(editBtn.dataset.id);
    document.getElementById("capitalCostTitle").value = decodeURIComponent(
      editBtn.dataset.title || ""
    );
    document.getElementById("capitalCostDescription").value =
      decodeURIComponent(editBtn.dataset.description || "");
    document.getElementById("capitalCostAmount").value = editBtn.dataset.cost || "";

    document.getElementById("capitalCostFormLabel").textContent = "Edit Capital Cost";
    const btn = document.getElementById("saveCapitalCostBtn");
    btn.textContent = "Save Changes";
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-warning");

    document.getElementById("capitalCostForm").style.display = "block";
    document.getElementById("addCapitalCostBtn").style.display = "none";
    document.getElementById("capitalCostTitle").focus();
    return;
  }

  const deleteBtn = event.target.closest(".delete-capital-cost");
  if (deleteBtn) {
    deleteCapitalCost(Number(deleteBtn.dataset.id));
  }
});

function openAddCapitalCostForm() {
  cancelCapitalCostForm();
  document.getElementById("capitalCostForm").style.display = "block";
  document.getElementById("addCapitalCostBtn").style.display = "none";
  document.getElementById("capitalCostTitle").focus();
}

function cancelCapitalCostForm() {
  editingCapitalCostId = null;
  document.getElementById("capitalCostTitle").value = "";
  document.getElementById("capitalCostDescription").value = "";
  document.getElementById("capitalCostAmount").value = "";

  document.getElementById("capitalCostFormLabel").textContent = "Add Capital Cost";
  const btn = document.getElementById("saveCapitalCostBtn");
  btn.textContent = "Add Capital Cost";
  btn.classList.remove("btn-warning");
  btn.classList.add("btn-primary");

  document.getElementById("capitalCostForm").style.display = "none";
  document.getElementById("addCapitalCostBtn").style.display = "";
}

async function saveCapitalCost() {
  const title = document.getElementById("capitalCostTitle").value.trim();
  const description = document.getElementById("capitalCostDescription").value.trim();
  const cost = document.getElementById("capitalCostAmount").value;

  if (!title) {
    alert("Title is required");
    return;
  }

  if (!cost || isNaN(parseFloat(cost)) || parseFloat(cost) < 0) {
    alert("Cost must be a valid non-negative number");
    return;
  }

  try {
    if (editingCapitalCostId) {
      await api(
        `/admin/sites/${currentCapitalCostSiteId}/capital-costs/${editingCapitalCostId}`,
        "PUT",
        { title, description, cost: parseFloat(cost) }
      );
    } else {
      await api(
        `/admin/sites/${currentCapitalCostSiteId}/capital-costs`,
        "POST",
        { title, description, cost: parseFloat(cost) }
      );
    }

    cancelCapitalCostForm();
    loadCapitalCosts();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteCapitalCost(id) {
  if (!confirm("Delete this capital cost?")) return;

  try {
    await api(
      `/admin/sites/${currentCapitalCostSiteId}/capital-costs/${id}`,
      "DELETE"
    );
    loadCapitalCosts();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

/* ============================
   INIT
   ============================ */
loadSites();
