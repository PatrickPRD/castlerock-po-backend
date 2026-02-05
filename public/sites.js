const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token || role !== "super_admin") {
  location.href = "dashboard.html";
}

const siteTable = document.getElementById("siteTable");

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

function back() {
  location.href = "dashboard.html";
}

/* ============================
   INIT
   ============================ */
loadSites();
