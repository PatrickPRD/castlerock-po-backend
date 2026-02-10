const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

/* ============================
   AUTH GUARD
   ============================ */
if (!token || !["admin", "super_admin"].includes(role)) {
  location.href = "dashboard.html";
}

/* ============================
   DOM
   ============================ */
const locationTable = document.getElementById("locationTable");
const siteSelect = document.getElementById("siteSelect");

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

/* ============================
   SITES (FOR LOCATION SELECT)
   ============================ */
async function loadSitesForLocations() {
  if (!siteSelect) return;

  const sites = await api("/admin/sites");
  siteSelect.innerHTML = '<option value="">Select site</option>';

  sites.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    siteSelect.appendChild(opt);
  });
}

/* ============================
   LOCATIONS
   ============================ */
async function loadLocations() {
  const locations = await api("/admin/locations");
  locations.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true }));
  locationTable.innerHTML = "";

  locations.forEach((l) => {
    const escapedName = (l.name || '').replace(/'/g, "\\'");
    const escapedType = (l.type || '').replace(/'/g, "\\'");
    
    locationTable.innerHTML += `
      <tr>
        <td>${l.name}</td>
        <td>${l.type || ''}</td>
        <td>${l.site}</td>
        <td>
          <button class="btn btn-outline-primary"
            onclick="editLocation(${l.id}, '${escapedName}', '${escapedType}', ${l.site_id})">
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

function openLocationModal() {
  resetLocationForm();
  const modal = document.getElementById("locationModal");
  modal.style.display = "flex";
  document.getElementById("locationName").focus();
}

function closeLocationModal() {
  const modal = document.getElementById("locationModal");
  modal.style.display = "none";
  resetLocationForm();
}

function editLocation(id, name, type, siteId) {
  document.getElementById("locationName").value = name;
  document.getElementById("locationType").value = type || "";
  document.getElementById("siteSelect").value = siteId;

  editingLocationId = id;

  document.getElementById("locationEditNotice").style.display = "block";
  document.getElementById("locationModalTitle").textContent = "Edit Location";

  const btn = document.getElementById("saveLocationBtn");
  btn.textContent = "Save Changes";
  btn.classList.remove("btn-primary");
  btn.classList.add("btn-warning");

  const modal = document.getElementById("locationModal");
  modal.style.display = "flex";
  
  document.getElementById("locationName").focus();
}

async function saveLocation() {
  const name = document.getElementById("locationName").value.trim();
  const type = document.getElementById("locationType").value.trim();
  const siteId = document.getElementById("siteSelect").value;

  if (!name) {
    showToast("Location name is required", "error");
    return;
  }
  if (!siteId) {
    showToast("Please select a site", "error");
    return;
  }

  try {
    if (editingLocationId) {
      await api(`/admin/locations/${editingLocationId}`, "PUT", {
        name,
        type,
        site_id: siteId,
      });
      showToast("Location updated successfully", "success");
    } else {
      await api("/admin/locations", "POST", {
        name,
        type,
        site_id: siteId,
      });
      showToast("Location added successfully", "success");
    }

    closeLocationModal();
    loadLocations();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function resetLocationForm() {
  editingLocationId = null;
  document.getElementById("locationName").value = "";
  document.getElementById("locationType").value = "";
  document.getElementById("siteSelect").value = "";

  document.getElementById("locationEditNotice").style.display = "none";
  document.getElementById("locationModalTitle").textContent = "Add Location";

  const btn = document.getElementById("saveLocationBtn");
  btn.textContent = "Add Location";
  btn.classList.remove("btn-warning");
  btn.classList.add("btn-primary");
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
   NAVIGATION
   ============================ */
function back() {
  location.href = 'dashboard.html';
}

/* ============================
   INIT
   ============================ */
loadSitesForLocations();
loadLocations();

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

  const confirmed = await confirmDialog(
    `Are you sure you want to merge "${toName}" into "${fromName}"?\n\n` +
    `This will:\n` +
    `- Update all Purchase Orders from "${toName}" to "${fromName}"\n` +
    `- Update all Location Spread Rules\n` +
    `- Permanently delete "${toName}"\n\n` +
    `This action cannot be undone.`
  );

  if (!confirmed) return;

  try {
    await api('/admin/merge-locations', 'POST', {
      keep_location_id: parseInt(fromId),
      merge_location_id: parseInt(toId)
    });

    showToast(`Successfully merged "${toName}" into "${fromName}"`, 'success');
    closeMergeLocationModal();
    loadLocations();

  } catch (err) {
    console.error('Merge error:', err);
    showToast(`Failed to merge locations: ${err.message}`, 'error');
  }
}
