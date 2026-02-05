const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || !['admin', 'super_admin'].includes(role)) {
  location.href = 'dashboard.html';
}

const rulesTable = document.getElementById('rulesTable');

const spreadModal = document.getElementById('spreadModal');
const spreadModalTitle = document.getElementById('spreadModalTitle');
const spreadForm = document.getElementById('spreadForm');
const sourceLocationSelect = document.getElementById('sourceLocation');
const sourceLocationLabel = document.getElementById('sourceLocationLabel');
const ruleNameInput = document.getElementById('ruleName');
const siteSpreadContainer = document.getElementById('siteSpreadContainer');

const addSiteBtn = document.getElementById('addSiteBtn');
const addSiteSelector = document.getElementById('addSiteSelector');
const addSiteSelect = document.getElementById('addSiteSelect');
const confirmAddSiteBtn = document.getElementById('confirmAddSiteBtn');
const cancelAddSiteBtn = document.getElementById('cancelAddSiteBtn');

let sites = [];
let locationsBySite = {};
let locationMap = {};
let rules = [];

let currentEditId = null;
let ruleForm = {
  sourceLocationId: null,
  name: '',
  sites: []
};

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Request failed');
  }

  return res.json();
}

function back() {
  location.href = 'dashboard.html';
}

/* =========================
   Load Sites & Locations
   ========================= */
async function loadSitesAndLocations() {
  const res = await fetch('/sites', {
    headers: { Authorization: 'Bearer ' + token }
  });

  sites = await res.json();
  locationsBySite = {};
  locationMap = {};

  for (const s of sites) {
    const locRes = await fetch(`/locations?siteId=${s.id}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const locs = await locRes.json();
    locationsBySite[s.id] = locs;
    locs.forEach(l => {
      locationMap[l.id] = { id: l.id, name: l.name, siteId: s.id, siteName: s.name };
    });
  }

  buildSourceLocationOptions();
}

function buildSourceLocationOptions() {
  sourceLocationSelect.innerHTML = '<option value="">Select location</option>';

  // Get all spread source location IDs
  const usedSourceLocations = new Set(
    rules.map(r => r.sourceLocationId)
  );

  // If editing (dropdown hidden), allow its own source location if ever shown
  if (currentEditId) {
    const currentRule = rules.find(r => r.id === currentEditId);
    if (currentRule) {
      usedSourceLocations.delete(currentRule.sourceLocationId);
    }
  }

  sites.forEach(s => {
    const group = document.createElement('optgroup');
    group.label = s.name;

    (locationsBySite[s.id] || []).forEach(l => {
      // Skip if this location is already used as a source in any rule
      if (usedSourceLocations.has(l.id)) return;

      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      group.appendChild(opt);
    });

    sourceLocationSelect.appendChild(group);
  });
}

/* =========================
   Load Rules
   ========================= */
async function loadRules() {
  rules = await api('/location-spread-rules');
  renderRules();
  // Rebuild source location options to filter out already-spread locations
  buildSourceLocationOptions();
}

function renderRules() {
  rulesTable.innerHTML = '';

  if (rules.length === 0) {
    rulesTable.innerHTML = `
      <tr>
        <td colspan="2" style="text-align:center; padding: 2rem; color: #9ca3af;">
          No spread rules found
        </td>
      </tr>
    `;
    return;
  }

  rules.forEach((rule, index) => {
    const rowId = `rule-${index}`;
    rulesTable.innerHTML += `
      <tr class="main-row" data-target="${rowId}">
        <td>${rule.sourceLocationName}</td>
        <td>${rule.name || ''}</td>
      </tr>
      <tr class="details-row" id="${rowId}">
        <td colspan="2">
          <div class="details-wrapper">
            <div class="spread-actions">
              <button class="btn btn-outline-primary" onclick="event.stopPropagation(); openEditRuleModal(${rule.id});">Edit</button>
              <button class="btn btn-danger" onclick="event.stopPropagation(); deleteRule(${rule.id});">Delete</button>
            </div>
            <div>
              ${renderRuleTargets(rule)}
            </div>
          </div>
        </td>
      </tr>
    `;
  });
}

function renderRuleTargets(rule) {
  if (!rule.sites || rule.sites.length === 0) {
    return '<p class="muted">No locations selected</p>';
  }

  return rule.sites.map(site => {
    if (site.spreadAll) {
      return `
        <div class="site-group">
          <h4>${site.siteName}</h4>
          <p class="muted">All locations on this site</p>
        </div>
      `;
    }

    const list = (site.locations || []).map(l => `<li>${l.name}</li>`).join('');
    return `
      <div class="site-group">
        <h4>${site.siteName}</h4>
        <ul>${list || '<li>No locations selected</li>'}</ul>
      </div>
    `;
  }).join('');
}

rulesTable.addEventListener('click', e => {
  const row = e.target.closest('.main-row');
  if (!row) return;

  const targetId = row.dataset.target;
  const details = document.getElementById(targetId);
  const isOpen = details.classList.contains('open');

  document.querySelectorAll('.details-row').forEach(r => r.classList.remove('open'));
  document.querySelectorAll('.main-row').forEach(r => r.classList.remove('open'));

  if (!isOpen) {
    details.classList.add('open');
    row.classList.add('open');
  }
});

/* =========================
   Modal Handling
   ========================= */
function openAddRuleModal() {
  currentEditId = null;
  spreadModalTitle.textContent = 'Add Location Spread Rule';
  sourceLocationSelect.style.display = 'block';
  sourceLocationSelect.required = true;
  sourceLocationLabel.style.display = 'none';
  resetRuleForm();
  spreadModal.style.display = 'flex';
}

function openEditRuleModal(ruleId) {
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return;

  currentEditId = ruleId;
  spreadModalTitle.textContent = 'Edit Location Spread Rule';
  ruleForm = {
    sourceLocationId: rule.sourceLocationId,
    name: rule.name || '',
    sites: rule.sites.map(s => ({
      siteId: s.siteId,
      spreadAll: s.spreadAll,
      locationIds: (s.locations || []).map(l => l.id)
    }))
  };

  // Show label, hide dropdown for edit mode
  sourceLocationSelect.style.display = 'none';
  sourceLocationSelect.required = false;
  sourceLocationLabel.style.display = 'block';
  sourceLocationLabel.textContent = rule.sourceLocationName;
  
  ruleNameInput.value = rule.name || '';
  renderSiteSections();
  updateAddSiteControls();
  spreadModal.style.display = 'flex';
}

function closeRuleModal() {
  spreadModal.style.display = 'none';
  resetRuleForm();
}

function resetRuleForm() {
  ruleForm = { sourceLocationId: null, name: '', sites: [] };
  sourceLocationSelect.value = '';
  ruleNameInput.value = '';
  siteSpreadContainer.innerHTML = '';
  addSiteSelector.classList.add('hidden');
  updateAddSiteControls();
}

sourceLocationSelect.addEventListener('change', () => {
  const locationId = Number(sourceLocationSelect.value);
  if (!locationId || !locationMap[locationId]) {
    ruleForm.sourceLocationId = null;
    ruleForm.sites = [];
    renderSiteSections();
    updateAddSiteControls();
    return;
  }

  const sourceSiteId = locationMap[locationId].siteId;
  ruleForm.sourceLocationId = locationId;
  ruleForm.sites = [{ siteId: sourceSiteId, spreadAll: false, locationIds: [] }];
  renderSiteSections();
  updateAddSiteControls();
});

function renderSiteSections() {
  siteSpreadContainer.innerHTML = '';

  ruleForm.sites.forEach(siteRule => {
    const site = sites.find(s => s.id === siteRule.siteId);
    if (!site) return;

    const section = document.createElement('div');
    section.className = 'site-spread-section';
    section.dataset.siteId = siteRule.siteId;

    const isSourceSite = locationMap[ruleForm.sourceLocationId]?.siteId === siteRule.siteId;

    section.innerHTML = `
      <div class="site-spread-header">
        <h4>${site.name}</h4>
        ${!isSourceSite ? '<button type="button" class="btn btn-outline-primary remove-site-btn">Remove site from spread</button>' : ''}
      </div>
      <label class="checkbox-row">
        <input type="checkbox" class="spread-all-checkbox" ${siteRule.spreadAll ? 'checked' : ''}>
        Spreads across all locations on this site
      </label>
      <div class="list-controls">
        <div class="list-box">
          <label>Selected locations</label>
          <select multiple class="selected-locations"></select>
        </div>
        <div class="list-buttons">
          <button type="button" class="btn btn-outline-primary add-location-btn">+</button>
          <button type="button" class="btn btn-outline-primary remove-location-btn">−</button>
        </div>
        <div class="list-box">
          <label>Available locations</label>
          <select multiple class="available-locations"></select>
        </div>
      </div>
    `;

    const selectedSelect = section.querySelector('.selected-locations');
    const availableSelect = section.querySelector('.available-locations');

    const selectedIds = siteRule.locationIds || [];
    const sourceLocationId = ruleForm.sourceLocationId;
    const usedSourceLocations = new Set(rules.map(r => r.sourceLocationId));
    // Filter out: locations already selected + source location itself + any location that is already a source in another rule
    const availableLocations = (locationsBySite[siteRule.siteId] || []).filter(l => 
      !selectedIds.includes(l.id) && l.id !== sourceLocationId && !usedSourceLocations.has(l.id)
    );

    selectedIds.forEach(id => {
      const loc = locationMap[id];
      if (!loc) return;
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = loc.name;
      selectedSelect.appendChild(opt);
    });

    availableLocations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = loc.name;
      availableSelect.appendChild(opt);
    });

    section.querySelector('.add-location-btn').addEventListener('click', () => {
      const selected = Array.from(availableSelect.selectedOptions).map(o => Number(o.value));
      if (selected.length === 0) return;
      
      // Save scroll position before re-rendering
      const siteId = siteRule.siteId;
      const scrollTop = availableSelect.scrollTop;
      
      selected.forEach(val => {
        if (!siteRule.locationIds.includes(val)) {
          siteRule.locationIds.push(val);
        }
      });
      
      renderSiteSections();
      
      // Restore scroll position after re-rendering
      setTimeout(() => {
        const section = document.querySelector(`[data-site-id="${siteId}"]`);
        if (section) {
          const newAvailableSelect = section.querySelector('.available-locations');
          if (newAvailableSelect) {
            newAvailableSelect.scrollTop = scrollTop;
          }
        }
      }, 0);
    });

    section.querySelector('.remove-location-btn').addEventListener('click', () => {
      const selected = Array.from(selectedSelect.selectedOptions).map(o => Number(o.value));
      if (selected.length === 0) return;
      siteRule.locationIds = siteRule.locationIds.filter(id => !selected.includes(id));
      renderSiteSections();
    });

    section.querySelector('.spread-all-checkbox').addEventListener('change', (e) => {
      siteRule.spreadAll = e.target.checked;
      renderSiteSections();
    });

    const removeBtn = section.querySelector('.remove-site-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        const ok = await confirmDialog('Remove this site from the spread rule?');
        if (!ok) return;
        ruleForm.sites = ruleForm.sites.filter(s => s.siteId !== siteRule.siteId);
        renderSiteSections();
        updateAddSiteControls();
      });
    }

    if (siteRule.spreadAll) {
      section.classList.add('disabled');
    }

    siteSpreadContainer.appendChild(section);
  });
}

function updateAddSiteControls() {
  const usedSiteIds = new Set(ruleForm.sites.map(s => s.siteId));
  const remainingSites = sites.filter(s => !usedSiteIds.has(s.id));

  if (remainingSites.length === 0) {
    addSiteBtn.classList.add('hidden');
    addSiteSelector.classList.add('hidden');
    return;
  }

  addSiteBtn.classList.remove('hidden');
  addSiteSelect.innerHTML = '';

  remainingSites.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    addSiteSelect.appendChild(opt);
  });
}

addSiteBtn.addEventListener('click', () => {
  addSiteSelector.classList.remove('hidden');
});

cancelAddSiteBtn.addEventListener('click', () => {
  addSiteSelector.classList.add('hidden');
});

confirmAddSiteBtn.addEventListener('click', () => {
  const siteId = Number(addSiteSelect.value);
  if (!siteId) return;

  ruleForm.sites.push({ siteId, spreadAll: false, locationIds: [] });
  addSiteSelector.classList.add('hidden');
  renderSiteSections();
  updateAddSiteControls();
});

spreadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!ruleForm.sourceLocationId) {
    showToast('Please select a location to spread', 'error');
    return;
  }

  if (!ruleForm.name.trim()) {
    const loc = locationMap[ruleForm.sourceLocationId];
    ruleForm.name = loc ? `${loc.name} Spread` : 'Spread Rule';
    ruleNameInput.value = ruleForm.name;
  } else {
    ruleForm.name = ruleNameInput.value.trim();
  }

  for (const s of ruleForm.sites) {
    if (!s.spreadAll && (!s.locationIds || s.locationIds.length === 0)) {
      showToast('Each site must have at least one location selected or be set to spread across all locations.', 'error');
      return;
    }
  }

  const payload = {
    name: ruleForm.name,
    sourceLocationId: ruleForm.sourceLocationId,
    sites: ruleForm.sites.map(s => ({
      siteId: s.siteId,
      spreadAll: !!s.spreadAll,
      locationIds: s.locationIds
    }))
  };

  try {
    if (currentEditId) {
      await api(`/location-spread-rules/${currentEditId}`, 'PUT', payload);
      showToast('Spread rule updated', 'success');
    } else {
      await api('/location-spread-rules', 'POST', payload);
      showToast('Spread rule created', 'success');
    }

    closeRuleModal();
    loadRules();
  } catch (err) {
    showToast(err.message || 'Failed to save rule', 'error');
  }
});

spreadModal.addEventListener('click', e => {
  if (e.target === spreadModal) closeRuleModal();
});

/* =========================
   Actions
   ========================= */
async function deleteRule(ruleId) {
  const ok = await confirmDialog('Delete this spread rule?');
  if (!ok) return;

  try {
    await api(`/location-spread-rules/${ruleId}`, 'DELETE');
    showToast('Spread rule deleted', 'success');
    loadRules();
  } catch (err) {
    showToast(err.message || 'Failed to delete rule', 'error');
  }
}


/* =========================
   Init
   ========================= */
loadSitesAndLocations().then(loadRules);
