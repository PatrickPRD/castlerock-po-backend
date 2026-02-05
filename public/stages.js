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
const stageTable = document.getElementById("stageTable");

let editingStageId = null;

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
   LOAD STAGES
   ============================ */
async function loadStages() {
  try {
    const stages = await api("/admin/stages");
    
    stageTable.innerHTML = "";

    stages.forEach((stage) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${escapeHtml(stage.name)}</td>
        <td>${stage.active ? '<span style="color: green;">✓ Yes</span>' : '<span style="color: #999;">No</span>'}</td>
        <td>${stage.po_count || 0} PO(s)</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editStage(${stage.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteStage(${stage.id}, ${stage.po_count || 0})">Delete</button>
        </td>
      `;

      stageTable.appendChild(row);
    });
  } catch (error) {
    alert("Error loading stages: " + error.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* ============================
   ADD/EDIT STAGE MODAL
   ============================ */
function openStageModal() {
  editingStageId = null;
  document.getElementById("stageModalTitle").textContent = "Add Stage";
  document.getElementById("stageForm").reset();
  document.getElementById("stageId").value = "";
  document.getElementById("stageActive").value = "1";
  document.getElementById("stageModal").style.display = "flex";
}

function closeStageModal() {
  document.getElementById("stageModal").style.display = "none";
  editingStageId = null;
}

async function editStage(id) {
  try {
    const stages = await api("/admin/stages");
    const stage = stages.find(s => s.id === id);
    
    if (!stage) {
      alert("Stage not found");
      return;
    }

    editingStageId = id;
    document.getElementById("stageModalTitle").textContent = "Edit Stage";
    document.getElementById("stageId").value = stage.id;
    document.getElementById("stageName").value = stage.name;
    document.getElementById("stageActive").value = stage.active ? "1" : "0";
    document.getElementById("stageModal").style.display = "flex";
  } catch (error) {
    alert("Error loading stage: " + error.message);
  }
}

/* ============================
   SAVE STAGE
   ============================ */
document.getElementById("stageForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("stageId").value;
  const name = document.getElementById("stageName").value.trim();
  const active = document.getElementById("stageActive").value;

  if (!name) {
    alert("Stage name is required");
    return;
  }

  try {
    if (id) {
      // Update
      await api(`/admin/stages/${id}`, "PUT", { name, active: active === "1" });
    } else {
      // Create
      await api("/admin/stages", "POST", { name, active: active === "1" });
    }

    closeStageModal();
    await loadStages();
    alert(id ? "Stage updated successfully" : "Stage created successfully");
  } catch (error) {
    alert("Error saving stage: " + error.message);
  }
});

/* ============================
   DELETE STAGE
   ============================ */
async function deleteStage(id, poCount) {
  if (poCount > 0) {
    alert(`Cannot delete this stage. It has ${poCount} associated Purchase Order(s).\n\nPlease use the Merge Stages feature to move POs to another stage first.`);
    return;
  }

  if (!confirm("Are you sure you want to delete this stage?")) {
    return;
  }

  try {
    await api(`/admin/stages/${id}`, "DELETE");
    await loadStages();
    alert("Stage deleted successfully");
  } catch (error) {
    alert("Error deleting stage: " + error.message);
  }
}

/* ============================
   MERGE STAGES
   ============================ */
function openMergeStageModal() {
  loadStagesForMerge();
  // Disable merge dropdown until keep stage is selected
  document.getElementById("mergeMergeStage").disabled = true;
  document.getElementById("mergeStageModal").style.display = "flex";
}

function closeMergeStageModal() {
  document.getElementById("mergeStageModal").style.display = "none";
  document.getElementById("mergeKeepStage").value = "";
  document.getElementById("mergeMergeStage").value = "";
  document.getElementById("mergeMergeStage").disabled = true;
}

let allStages = [];

async function loadStagesForMerge() {
  try {
    allStages = await api("/admin/stages");

    const keepSelect = document.getElementById("mergeKeepStage");
    const mergeSelect = document.getElementById("mergeMergeStage");

    keepSelect.innerHTML = '<option value="">-- Select stage --</option>';
    mergeSelect.innerHTML = '<option value="">-- Select stage --</option>';

    allStages.forEach((stage) => {
      const optKeep = document.createElement("option");
      optKeep.value = stage.id;
      optKeep.textContent = `${stage.name} (${stage.po_count || 0} POs)`;
      keepSelect.appendChild(optKeep);
    });

    // Add event listener to keep stage dropdown
    keepSelect.onchange = updateMergeStageOptions;
  } catch (error) {
    alert("Error loading stages: " + error.message);
  }
}

function updateMergeStageOptions() {
  const keepId = document.getElementById("mergeKeepStage").value;
  const mergeSelect = document.getElementById("mergeMergeStage");

  if (!keepId) {
    mergeSelect.disabled = true;
    mergeSelect.innerHTML = '<option value="">-- Select stage --</option>';
    return;
  }

  // Enable the merge dropdown
  mergeSelect.disabled = false;
  mergeSelect.innerHTML = '<option value="">-- Select stage --</option>';

  // Populate with all stages except the selected keep stage
  allStages.forEach((stage) => {
    if (stage.id.toString() !== keepId) {
      const opt = document.createElement("option");
      opt.value = stage.id;
      opt.textContent = `${stage.name} (${stage.po_count || 0} POs)`;
      mergeSelect.appendChild(opt);
    }
  });
}

async function mergeStages() {
  const keepId = document.getElementById("mergeKeepStage").value;
  const mergeId = document.getElementById("mergeMergeStage").value;

  if (!keepId || !mergeId) {
    alert("Please select both stages");
    return;
  }

  if (keepId === mergeId) {
    alert("Please select two different stages");
    return;
  }

  const keepStage = document.getElementById("mergeKeepStage").options[document.getElementById("mergeKeepStage").selectedIndex].text;
  const mergeStage = document.getElementById("mergeMergeStage").options[document.getElementById("mergeMergeStage").selectedIndex].text;

  if (!confirm(`Are you sure you want to merge:\n\n"${mergeStage}"\n\ninto\n\n"${keepStage}"?\n\nAll POs will be moved and the merged stage will be deleted.`)) {
    return;
  }

  try {
    await api("/admin/merge-stages", "POST", {
      keep_stage_id: keepId,
      merge_stage_id: mergeId,
    });

    closeMergeStageModal();
    await loadStages();
    alert("Stages merged successfully!");
  } catch (error) {
    alert("Error merging stages: " + error.message);
  }
}

/* ============================
   INIT
   ============================ */
loadStages();
