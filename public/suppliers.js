const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

if (!token || !["admin", "super_admin"].includes(role)) {
  location.href = "dashboard.html";
}

const table = document.getElementById("supplierTable");
const filterInput = document.getElementById("filterInput");

let suppliers = [];

/* =========================
   API helper
   ========================= */
async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}


/* =========================
   Load suppliers
   ========================= */
async function loadSuppliers() {
  const q = filterInput.value.trim();
  suppliers = await api(`/suppliers${q ? "?q=" + encodeURIComponent(q) : ""}`);
  render();
}

/* =========================
   Render
   ========================= */
function render() {
  table.innerHTML = "";

  suppliers.forEach((s) => {
    const main = document.createElement("tr");
    main.className = "main-row";
    main.innerHTML = `
      <td>${s.name}</td>
      <td>${s.main_contact || ""}</td>
    `;

    const details = document.createElement("tr");
    details.className = "details-row";
    details.style.display = "none";
    details.innerHTML = `
      <td colspan="2">
        <div class="details-grid">
          <div><strong>Email:</strong> ${s.email || "—"}</div>
          <div><strong>Phone:</strong> ${s.phone || "—"}</div>
          <div class="full-width">
            <strong>Notes:</strong><br>
            ${s.notes || "—"}
          </div>
        </div>

        <div class="details-actions">
          ${
            role === "super_admin"
              ? `
            <button class="btn btn-outline-primary"
  onclick="event.stopPropagation(); editSupplier(${s.id})">
  Edit
</button>

<button class="btn btn-danger"
  onclick="event.stopPropagation(); deleteSupplier(${s.id}, '${s.name.replace(
                  /'/g,
                  "\\'"
                )}')">
  Delete
</button>


            <button class="btn btn-outline-primary"
  onclick="event.stopPropagation(); mergeSupplier(${s.id})">
  Merge
</button>

          `
              : ""
          }
        </div>

      </td>
    `;

    main.onclick = () => {
      // Close all other details rows first
      const allDetailsRows = table.querySelectorAll('.details-row');
      allDetailsRows.forEach(row => {
        if (row !== details) {
          row.style.display = 'none';
        }
      });
      
      // Toggle current details row
      details.style.display =
        details.style.display === "none" ? "table-row" : "none";
    };

    table.appendChild(main);
    table.appendChild(details);
  });
}

/* =========================
   Actions
   ========================= */
function addSupplier() {
  location.href = "edit-supplier.html";
}

function editSupplier(id) {
  location.href = `edit-supplier.html?id=${id}`;
}

async function mergeSuppliers(sourceId, targetId) {
  const ok = await confirmDialog(
    "All purchase orders will be moved to the selected supplier.\nThis cannot be undone."
  );
  if (!ok) return;

  try {
    await api("/suppliers/merge", "POST", { sourceId, targetId });
    showToast("Suppliers merged successfully", "success");
    loadSuppliers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function mergeSupplier(sourceId) {
  const source = suppliers.find((s) => s.id === sourceId);
  if (!source) {
    showToast("Supplier not found", "error");
    return;
  }

  // Build options excluding source
  const options = suppliers
    .filter((s) => s.id !== sourceId)
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join("");

  if (!options) {
    showToast("No other suppliers available to merge into", "error");
    return;
  }

const backdrop = document.createElement("div");
backdrop.className = "ui-backdrop neutral active";

const modal = document.createElement("div");
modal.className = "ui-confirm";

modal.innerHTML = `
  <h3>Merge Supplier</h3>

  <p>
    <strong>${source.name}</strong> will be merged into:
  </p>

  <select id="mergeTarget" class="input">
    <option value="">Select target supplier</option>
    ${options}
  </select>

  <p class="warn-text">
    All purchase orders will be reassigned.<br>
    This action cannot be undone.
  </p>

  <div class="ui-confirm-actions">
    <button class="btn btn-outline-primary" id="mergeCancel">Cancel</button>
    <button class="btn btn-danger" id="mergeConfirm">Merge</button>
  </div>
`;

function closeMerge() {
  backdrop.remove();
  modal.remove();
}

backdrop.onclick = closeMerge;
modal.querySelector("#mergeCancel").onclick = closeMerge;

modal.querySelector("#mergeConfirm").onclick = async () => {
  const targetId = modal.querySelector("#mergeTarget").value;

  if (!targetId) {
    showToast("Please select a target supplier", "error");
    return;
  }

  closeMerge();

  try {
    await api("/suppliers/merge", "POST", {
      sourceId,
      targetId: Number(targetId),
    });

    showToast("Suppliers merged successfully", "success");
    loadSuppliers();
  } catch (err) {
    showToast(err.message, "error");
  }
};


document.body.appendChild(backdrop);
document.body.appendChild(modal);


  document.body.appendChild(modal);

  modal.querySelector("#mergeCancel").onclick = () => modal.remove();

  modal.querySelector("#mergeConfirm").onclick = async () => {
    const targetId = modal.querySelector("#mergeTarget").value;
    if (!targetId) {
      showToast("Please select a target supplier", "error");
      return;
    }

    modal.remove();

    try {
      await api("/suppliers/merge", "POST", {
        sourceId,
        targetId: Number(targetId),
      });

      showToast("Suppliers merged successfully", "success");
      loadSuppliers();
    } catch (err) {
      showToast(err.message, "error");
    }
  };
}

async function deleteSupplier(id, name) {
  const ok = await confirmDialog(
    `Delete supplier "${name}"?\nThis cannot be undone.`
  );
  if (!ok) return;

  try {
    await api(`/suppliers/${id}`, "DELETE");
    showToast("Supplier deleted", "success");
    loadSuppliers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function back() {
  location.href = "dashboard.html";
}

filterInput.addEventListener("input", loadSuppliers);

/* =========================
   Init
   ========================= */
loadSuppliers();
