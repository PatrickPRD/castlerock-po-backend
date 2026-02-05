const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token || role !== "super_admin") {
  location.href = "dashboard.html";
}

const siteTable = document.getElementById("siteTable");
const siteSelect = document.getElementById("mappingSiteSelect");

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

/* ============================
   SITES
   ============================ */
async function loadSites() {
  const sites = await api("/admin/sites");
  siteTable.innerHTML = "";
  siteSelect.innerHTML = '<option value="">Select site</option>';

  sites.forEach((s) => {
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
  document.getElementById("siteName").value = name;
  editingSiteId = id;

  document.getElementById("siteEditNotice").style.display = "block";

  const btn = document.getElementById("saveSiteBtn");
  btn.textContent = "Save Changes";
  btn.classList.add("btn-warning");

  document.getElementById("siteName").focus();
}

function resetSiteForm() {
  editingSiteId = null;
  document.getElementById("siteName").value = "";
  document.getElementById("siteEditNotice").style.display = "none";

  const btn = document.getElementById("saveSiteBtn");
  btn.textContent = "Add Site";
  btn.classList.remove("btn-warning");
}

async function saveSite() {
  const name = document.getElementById("siteName").value.trim();
  const letterInput = document.getElementById("siteLetter");
  const siteLetter = letterInput ? letterInput.value.trim().toUpperCase() : "";

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
      await api(`/admin/sites/${editingSiteId}`, "PUT", { name });
    } else {
      await api("/admin/sites", "POST", {
        name,
        site_code: siteLetter,
      });
    }

    resetSiteForm();
    loadSites();
  } catch (err) {
    alert("Error: " + err.message);
  }
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

/* ============================
   AUTO-POPULATE SITES
   ============================ */
async function autoPopulateSites() {
  if (!confirm("This will auto-populate sites and locations from your Purchase Orders. Continue?")) return;

  try {
    const res = await api("/admin/auto-populate-sites", "POST", {});
    alert("Sites and locations auto-populated successfully!");
    loadSites();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

/* ============================
   SITE LETTER MAPPINGS
   ============================ */
async function loadSiteLetterMappings() {
  try {
    const mappings = await api("/admin/site-letters");
    const table = document.getElementById("siteLetterTable");
    if (!table) return;

    table.innerHTML = "";
    mappings.forEach(m => {
      table.innerHTML += `
        <tr>
          <td><strong>${m.letter}</strong></td>
          <td>${m.site_name}</td>
          <td>
            <div class="actions-menu">
              <button class="actions-btn" onclick="toggleActions(this)">⋮</button>
              <div class="actions-dropdown hidden">
                <button class="action-item" onclick="editSiteLetterMapping(${m.id}, '${m.letter}', ${m.site_id})">Edit</button>
                <button class="action-item delete" onclick="deleteSiteLetterMapping(${m.id})">Delete</button>
              </div>
            </div>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    alert("Error loading site letter mappings: " + err.message);
  }
}

async function addSiteLetterMapping() {
  const letter = document.getElementById("mappingLetter").value.trim().toUpperCase();
  const siteId = document.getElementById("mappingSiteSelect").value;

  if (!letter || !siteId) {
    alert("Letter and site are required");
    return;
  }

  if (letter.length !== 1) {
    alert("Letter must be a single character");
    return;
  }

  try {
    await api("/admin/site-letters", "POST", { letter, site_id: parseInt(siteId) });
    document.getElementById("mappingLetter").value = "";
    document.getElementById("mappingSiteSelect").value = "";
    loadSiteLetterMappings();
    alert("Site letter mapping created successfully");
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function editSiteLetterMapping(id, letter, siteId) {
  document.getElementById("mappingLetter").value = letter;
  document.getElementById("mappingSiteSelect").value = siteId;
  
  const btn = document.querySelector('[onclick="addSiteLetterMapping()"]');
  btn.onclick = () => updateSiteLetterMapping(id);
  btn.textContent = "Update Mapping";
}

async function updateSiteLetterMapping(id) {
  const letter = document.getElementById("mappingLetter").value.trim().toUpperCase();
  const siteId = document.getElementById("mappingSiteSelect").value;

  if (!letter || !siteId) {
    alert("Letter and site are required");
    return;
  }

  try {
    await api(`/admin/site-letters/${id}`, "PUT", { letter, site_id: parseInt(siteId) });
    document.getElementById("mappingLetter").value = "";
    document.getElementById("mappingSiteSelect").value = "";
    
    const btn = document.querySelector('[onclick*="addSiteLetterMapping"]');
    if (btn) {
      btn.onclick = () => addSiteLetterMapping();
      btn.textContent = "Add Mapping";
    }
    
    loadSiteLetterMappings();
    alert("Site letter mapping updated successfully");
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function deleteSiteLetterMapping(id) {
  if (!confirm("Delete this site letter mapping?")) return;

  try {
    await api(`/admin/site-letters/${id}`, "DELETE");
    loadSiteLetterMappings();
    alert("Site letter mapping deleted successfully");
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
loadSiteLetterMappings();
