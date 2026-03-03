ensureAuthenticated();

const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const setupForm = document.getElementById('cashflowSetupForm');
const statusEl = document.getElementById('cashflowSetupStatus');
const overallStartDateInput = document.getElementById('overallStartDate');
const overallStartValueInput = document.getElementById('overallStartValue');
const openWizardModalBtn = document.getElementById('openWizardModalBtn');
const cashflowWizardModal = document.getElementById('cashflowWizardModal');
const closeWizardModalBtn = document.getElementById('closeWizardModalBtn');
const wizardCancelBtn = document.getElementById('wizardCancelBtn');
const wizardBackBtn = document.getElementById('wizardBackBtn');
const wizardNextBtn = document.getElementById('wizardNextBtn');
const wizardSaveLocationBtn = document.getElementById('wizardSaveLocationBtn');
const wizardStepCounter = document.getElementById('wizardStepCounter');
const wizardModalTitle = document.getElementById('wizardModalTitle');
const wizardSiteSelect = document.getElementById('wizardSiteSelect');
const wizardLocationSelect = document.getElementById('wizardLocationSelect');
const wizardTemplateSelect = document.getElementById('wizardTemplateSelect');
const wizardEstimatedCost = document.getElementById('wizardEstimatedCost');
const wizardSellingPrice = document.getElementById('wizardSellingPrice');
const wizardStartOnSiteDate = document.getElementById('wizardStartOnSiteDate');
const wizardCompletionDate = document.getElementById('wizardCompletionDate');
const wizardReview = document.getElementById('wizardReview');
const wizardProgress = document.getElementById('wizardProgress');
const configuredLocationsBody = document.getElementById('configuredLocationsBody');
const wizardSteps = [...document.querySelectorAll('.wizard-step')];
const openTemplateDraftModalBtn = document.getElementById('openTemplateDraftModalBtn');
const templateDraftModal = document.getElementById('templateDraftModal');
const closeTemplateDraftModalBtn = document.getElementById('closeTemplateDraftModalBtn');
const closeTemplateDraftCancelBtn = document.getElementById('closeTemplateDraftCancelBtn');
const templateFormTitle = document.getElementById('templateFormTitle');
const templateDraftName = document.getElementById('templateDraftName');
const templateDraftStage = document.getElementById('templateDraftStage');
const templateDraftPercent = document.getElementById('templateDraftPercent');
const templateDraftWeeks = document.getElementById('templateDraftWeeks');
const templateDraftAddRowBtn = document.getElementById('templateDraftAddRowBtn');
const templateDraftRowsBody = document.getElementById('templateDraftRowsBody');
const templateDraftTotals = document.getElementById('templateDraftTotals');
const templateDraftSaveBtn = document.getElementById('templateDraftSaveBtn');
const templateDraftCancelEditBtn = document.getElementById('templateDraftCancelEditBtn');
const templateAccordionBody = document.getElementById('templateAccordionBody');

let currentLocations = [];
let cashflowTemplates = [];
const configuredLocations = new Map();
const expandedLocationIds = new Set();
let editingLocationId = null;
let wizardCurrentStep = 1;
const wizardTotalSteps = 5;
let templateDraftRows = [];
let editingTemplateKey = null;
const expandedTemplateKeys = new Set();

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.toggle('text-danger', !!isError);
  statusEl.classList.toggle('text-muted', !isError);
}

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let payload = {};
  try {
    payload = await res.json();
  } catch (_) {}

  if (!res.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function formatCurrency(value) {
  if (typeof window.formatMoney === 'function') return window.formatMoney(value);
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function rowTemplate(location) {
  const estimatedCost = location.estimated_construction_cost ?? '';
  const timescale = location.spend_timescale_months ?? '';
  const sellingPrice = location.selling_price ?? '';
  const predictedSpend = location.predicted_spend_percentage ?? '';
  const startOnSiteDate = location.start_on_site_date || '';
  const completionDate = location.completion_date || '';
  const spreadTotal = Number((Array.isArray(location.weekly_spread)
    ? location.weekly_spread.reduce((sum, value) => sum + (Number(value) || 0), 0)
    : 0).toFixed(2));
  const isExpanded = expandedLocationIds.has(Number(location.location_id));

  return `
    <tr>
      <td>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleConfiguredLocation(${location.location_id})">${isExpanded ? '−' : '+'}</button>
      </td>
      <td>
        <span class="location-name">${location.location_name}</span>
      </td>
      <td>
        ${location.template_name || location.template_key || '-'}
      </td>
      <td>
        ${formatCurrency(estimatedCost)}
      </td>
    </tr>
    <tr class="configured-location-details" style="display:${isExpanded ? 'table-row' : 'none'};">
      <td colspan="4">
        <div class="configured-location-panel">
          <div><strong>Site:</strong> ${location.site_name || '-'}</div>
          <div><strong>Spend Timescale (Weeks):</strong> ${timescale === null || timescale === '' ? '-' : timescale}</div>
          <div><strong>Location Selling Price:</strong> ${formatCurrency(sellingPrice)}</div>
          <div><strong>Start on Site Date:</strong> ${startOnSiteDate || '-'}</div>
          <div><strong>Completion Date:</strong> ${completionDate || '-'}</div>
          <div><strong>Predicted Spend %:</strong> ${predictedSpend === null || predictedSpend === '' ? '-' : predictedSpend}</div>
          <div><strong>Weekly Spread Total:</strong> ${spreadTotal}%</div>
          <div class="d-flex gap-2 pt-1">
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="editConfiguredLocation(${location.location_id})">Edit</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="removeConfiguredLocation(${location.location_id})">Remove</button>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderConfiguredRows() {
  if (!configuredLocationsBody) return;

  const rows = [...configuredLocations.values()].sort((a, b) => {
    const siteSort = String(a.site_name || '').localeCompare(String(b.site_name || ''), undefined, { sensitivity: 'base', numeric: true });
    if (siteSort !== 0) return siteSort;
    return String(a.location_name || '').localeCompare(String(b.location_name || ''), undefined, { sensitivity: 'base', numeric: true });
  });

  if (rows.length === 0) {
    configuredLocationsBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted py-4">No configured locations yet. Use the wizard above.</td>
      </tr>
    `;
    if (wizardProgress) wizardProgress.textContent = '0 locations configured';
    return;
  }

  configuredLocationsBody.innerHTML = rows.map(rowTemplate).join('');
  if (wizardProgress) {
    wizardProgress.textContent = `${rows.length} location${rows.length === 1 ? '' : 's'} configured`;
  }
}

function toggleConfiguredLocation(locationId) {
  const id = Number(locationId);
  if (expandedLocationIds.has(id)) {
    expandedLocationIds.delete(id);
  } else {
    expandedLocationIds.add(id);
  }
  renderConfiguredRows();
}

function getLocationById(locationId) {
  return currentLocations.find((row) => Number(row.location_id) === Number(locationId)) || null;
}

function renderLocationOptions() {
  if (!wizardLocationSelect) return;

  const selectedBefore = wizardLocationSelect.value;
  const selectedSiteId = Number(wizardSiteSelect?.value || 0);
  const options = currentLocations
    .filter((location) => {
      if (editingLocationId && Number(location.location_id) === Number(editingLocationId)) return true;
      if (configuredLocations.has(Number(location.location_id))) return false;
      if (selectedSiteId && Number(location.site_id) !== selectedSiteId) return false;
      return true;
    })
    .sort((a, b) => {
      const siteSort = String(a.site_name || '').localeCompare(String(b.site_name || ''), undefined, { sensitivity: 'base', numeric: true });
      if (siteSort !== 0) return siteSort;
      return String(a.location_name || '').localeCompare(String(b.location_name || ''), undefined, { sensitivity: 'base', numeric: true });
    });

  wizardLocationSelect.innerHTML = '<option value="">Select location</option>';
  options.forEach((location) => {
    const option = document.createElement('option');
    option.value = String(location.location_id);
    option.textContent = `${location.site_name} — ${location.location_name}`;
    wizardLocationSelect.appendChild(option);
  });

  if (selectedBefore && [...wizardLocationSelect.options].some((o) => o.value === selectedBefore)) {
    wizardLocationSelect.value = selectedBefore;
  }
}

function renderSiteOptions() {
  if (!wizardSiteSelect) return;

  const selectedBefore = wizardSiteSelect.value;

  const sitesById = new Map();
  currentLocations.forEach((location) => {
    sitesById.set(Number(location.site_id), {
      site_id: Number(location.site_id),
      site_name: String(location.site_name || '')
    });
  });

  const sites = [...sitesById.values()].sort((a, b) =>
    String(a.site_name).localeCompare(String(b.site_name), undefined, { sensitivity: 'base', numeric: true })
  );

  wizardSiteSelect.innerHTML = '<option value="">Select site</option>';
  sites.forEach((site) => {
    const option = document.createElement('option');
    option.value = String(site.site_id);
    option.textContent = site.site_name;
    wizardSiteSelect.appendChild(option);
  });

  if (selectedBefore && [...wizardSiteSelect.options].some((o) => o.value === selectedBefore)) {
    wizardSiteSelect.value = selectedBefore;
  }
}

function resetWizardForm() {
  wizardSiteSelect.value = '';
  wizardLocationSelect.value = '';
  wizardTemplateSelect.value = '';
  wizardEstimatedCost.value = '';
  wizardSellingPrice.value = '';
  wizardStartOnSiteDate.value = '';
  wizardCompletionDate.value = '';
  if (wizardReview) wizardReview.innerHTML = '';
}

function loadWizardFromConfigured(locationId) {
  const config = configuredLocations.get(Number(locationId));
  if (!config) return;

  editingLocationId = Number(locationId);
  wizardSiteSelect.value = String(config.site_id || '');
  renderLocationOptions();

  wizardLocationSelect.value = String(config.location_id);
  wizardEstimatedCost.value = config.estimated_construction_cost ?? '';
  wizardSellingPrice.value = config.selling_price ?? '';
  wizardStartOnSiteDate.value = config.start_on_site_date || '';
  wizardTemplateSelect.value = config.template_key || '';
  updateCompletionDateField();
}

function normalizeInputDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function getPredictedSpendPercent() {
  const spreadValues = getTemplateDefaultSpread();
  if (spreadValues.length) {
    return Number(spreadValues.reduce((sum, value) => sum + (Number(value) || 0), 0).toFixed(2));
  }

  const template = selectedTemplate();
  if (template && Array.isArray(template.default_spread) && template.default_spread.length) {
    return Number(template.default_spread.reduce((sum, value) => sum + (Number(value) || 0), 0).toFixed(2));
  }

  return 100;
}

function getTemplateDefaultSpread(templateKey = null) {
  const key = templateKey || wizardTemplateSelect?.value || null;
  if (!key) return [];

  const template = cashflowTemplates.find((entry) => entry.key === key);
  if (!template || !Array.isArray(template.default_spread) || !template.default_spread.length) {
    return [];
  }

  return normalizeSpreadTo100(template.default_spread.map((entry) => Number(entry)));
}

function getDerivedTimescaleWeeks(templateKey = null) {
  const key = templateKey || wizardTemplateSelect?.value || null;
  if (!key) return null;

  const template = cashflowTemplates.find((entry) => entry.key === key);
  const weeks = Number(template?.week_count || 0);
  if (!Number.isFinite(weeks) || weeks <= 0) return null;

  return Math.max(1, Math.round(weeks));
}

function deriveCompletionDate(startDateValue, templateKey = null) {
  const startDate = normalizeInputDate(startDateValue);
  const timescaleWeeks = getDerivedTimescaleWeeks(templateKey);
  if (!startDate || !timescaleWeeks) return null;

  const completion = new Date(`${startDate}T00:00:00`);
  completion.setDate(completion.getDate() + (timescaleWeeks * 7));
  return completion.toISOString().slice(0, 10);
}

function updateCompletionDateField() {
  if (!wizardCompletionDate) return;
  wizardCompletionDate.value = deriveCompletionDate(wizardStartOnSiteDate?.value, wizardTemplateSelect?.value) || '';
}

function openWizardModal(isEdit = false, locationId = null) {
  if (isEdit) {
    renderSiteOptions();
    loadWizardFromConfigured(locationId);
  } else {
    editingLocationId = null;
    renderSiteOptions();
    renderLocationOptions();
    resetWizardForm();
  }

  wizardCurrentStep = 1;
  updateWizardStepUI();

  if (wizardModalTitle) {
    wizardModalTitle.textContent = editingLocationId ? 'Edit Location in Cashflow' : 'Add Location to Cashflow';
  }

  if (cashflowWizardModal) {
    cashflowWizardModal.style.display = 'flex';
  }
}

function closeWizardModal() {
  if (cashflowWizardModal) {
    cashflowWizardModal.style.display = 'none';
  }
  editingLocationId = null;
  resetWizardForm();
  renderLocationOptions();
  wizardCurrentStep = 1;
  updateWizardStepUI();
}

function validateWizardInput(locationData) {
  if (!locationData.location_id) return 'Please select a location';
  if (locationData.estimated_construction_cost === null || Number.isNaN(locationData.estimated_construction_cost)) {
    return 'Estimated construction cost is required';
  }
  if (locationData.selling_price === null || Number.isNaN(locationData.selling_price)) {
    return 'Location selling price is required';
  }
  if (!locationData.start_on_site_date) {
    return 'Start on site date is required';
  }
  if (!locationData.completion_date) {
    return 'Completion date could not be calculated. Check start date and template';
  }

  if (locationData.estimated_construction_cost < 0) return 'Estimated construction cost cannot be negative';
  if (locationData.selling_price < 0) return 'Location selling price cannot be negative';
  if (locationData.predicted_spend_percentage !== null && (locationData.predicted_spend_percentage < 0 || locationData.predicted_spend_percentage > 100)) {
    return 'Predicted spend % must be between 0 and 100';
  }
  if (locationData.spend_timescale_months !== null && (!Number.isInteger(locationData.spend_timescale_months) || locationData.spend_timescale_months <= 0)) {
    return 'Spend timescale must be a positive whole number';
  }
  if (locationData.completion_date < locationData.start_on_site_date) {
    return 'Completion date cannot be before start on site date';
  }

  return null;
}

function validateStep(step) {
  if (step === 1 && !wizardSiteSelect.value) return 'Please select a site';
  if (step === 1 && !wizardLocationSelect.value) return 'Please select a location';

  if (step === 2 && !wizardTemplateSelect.value) return 'Please select a template';

  if (step === 3) {
    const value = parseNumber(wizardEstimatedCost.value);
    if (value === null || Number.isNaN(value)) return 'Estimated construction cost is required';
    if (value < 0) return 'Estimated construction cost cannot be negative';
  }

  if (step === 4) {
    const value = parseNumber(wizardSellingPrice.value);
    if (value === null || Number.isNaN(value)) return 'Location selling price is required';
    if (value < 0) return 'Location selling price cannot be negative';

    const startOnSite = normalizeInputDate(wizardStartOnSiteDate.value);
    if (!startOnSite) return 'Start on site date is required';

    const completionDate = deriveCompletionDate(startOnSite, wizardTemplateSelect.value);
    if (!completionDate) return 'Completion date could not be calculated. Check template and start date';
  }

  return null;
}

function selectedTemplate() {
  return cashflowTemplates.find((template) => template.key === wizardTemplateSelect.value) || null;
}

function normalizeSpreadTo100(values) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const rawTotal = values.reduce((sum, value) => sum + Number(value || 0), 0);
  if (rawTotal <= 0) {
    const even = Number((100 / values.length).toFixed(2));
    const spread = Array(values.length).fill(even);
    const diff = Number((100 - spread.reduce((sum, v) => sum + v, 0)).toFixed(2));
    spread[spread.length - 1] = Number((spread[spread.length - 1] + diff).toFixed(2));
    return spread;
  }

  const scaled = values.map((value) => Number(((Number(value || 0) / rawTotal) * 100).toFixed(2)));
  const diff = Number((100 - scaled.reduce((sum, value) => sum + value, 0)).toFixed(2));
  scaled[scaled.length - 1] = Number((scaled[scaled.length - 1] + diff).toFixed(2));
  return scaled;
}

function templateNameByKey(key) {
  const template = cashflowTemplates.find((item) => item.key === key);
  return template ? template.name : key;
}

function renderTemplateOptions() {
  if (!wizardTemplateSelect) return;
  const selectedBefore = wizardTemplateSelect.value;
  wizardTemplateSelect.innerHTML = '<option value="">Select template</option>';
  cashflowTemplates.forEach((template) => {
    const option = document.createElement('option');
    option.value = template.key;
    option.textContent = `${template.name} (${template.week_count} weeks)`;
    wizardTemplateSelect.appendChild(option);
  });
  if (selectedBefore && [...wizardTemplateSelect.options].some((o) => o.value === selectedBefore)) {
    wizardTemplateSelect.value = selectedBefore;
  }
}

function setTemplateDraftMode(editMode) {
  if (templateFormTitle) {
    templateFormTitle.textContent = editMode ? 'Edit Template' : 'Create Template';
  }
  if (templateDraftSaveBtn) {
    templateDraftSaveBtn.textContent = editMode ? 'Update Template' : 'Create Template';
  }
  if (templateDraftCancelEditBtn) {
    templateDraftCancelEditBtn.style.display = editMode ? 'inline-block' : 'none';
  }
}

function resetTemplateDraftForm() {
  editingTemplateKey = null;
  templateDraftRows = [];
  if (templateDraftName) templateDraftName.value = '';
  if (templateDraftStage) templateDraftStage.value = '';
  if (templateDraftPercent) templateDraftPercent.value = '';
  if (templateDraftWeeks) templateDraftWeeks.value = '';
  setTemplateDraftMode(false);
  renderTemplateDraftRows();
}

function openTemplateDraftModal() {
  if (templateDraftModal) {
    templateDraftModal.style.display = 'flex';
  }
}

function closeTemplateDraftModal() {
  if (templateDraftModal) {
    templateDraftModal.style.display = 'none';
  }
  resetTemplateDraftForm();
}

function updateTemplateDraftTotals() {
  const totalPercent = Number(templateDraftRows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0).toFixed(2));
  const totalWeeks = Number(templateDraftRows.reduce((sum, row) => sum + (Number(row.weeks) || 0), 0));
  if (templateDraftTotals) {
    templateDraftTotals.textContent = `Total: ${totalPercent}% | ${totalWeeks} weeks`;
    templateDraftTotals.classList.toggle('text-danger', Math.abs(totalPercent - 100) > 0.05);
    templateDraftTotals.classList.toggle('text-muted', Math.abs(totalPercent - 100) <= 0.05);
  }
}

function renderTemplateDraftRows() {
  if (!templateDraftRowsBody) return;

  if (!templateDraftRows.length) {
    templateDraftRowsBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-muted text-center py-3">No rows added yet.</td>
      </tr>
    `;
    updateTemplateDraftTotals();
    return;
  }

  templateDraftRowsBody.innerHTML = templateDraftRows
    .map((row, index) => `
      <tr>
        <td>${row.stage}</td>
        <td>${row.percent}</td>
        <td>${row.weeks}</td>
        <td>
          <div class="d-flex gap-1">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="moveTemplateDraftRowUp(${index})" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="moveTemplateDraftRowDown(${index})" ${index === templateDraftRows.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeTemplateDraftRow(${index})">Remove</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  updateTemplateDraftTotals();
}

function renderTemplateAccordion() {
  if (!templateAccordionBody) return;

  if (!cashflowTemplates.length) {
    templateAccordionBody.innerHTML = `
      <tr>
        <td colspan="5" class="text-muted text-center py-3">No templates available.</td>
      </tr>
    `;
    return;
  }

  templateAccordionBody.innerHTML = cashflowTemplates
    .map((template) => {
      const percentTotal = Number((template.rows || []).reduce((sum, row) => sum + (Number(row.percent) || 0), 0).toFixed(2));
      const isExpanded = expandedTemplateKeys.has(template.key);
      const rowsHtml = (template.rows || [])
        .map((row) => `<tr><td>${row.stage}</td><td>${row.percent}</td><td>${row.weeks}</td></tr>`)
        .join('') || '<tr><td colspan="3" class="text-muted text-center">No rows</td></tr>';

      return `
        <tr>
          <td>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleTemplateAccordion('${template.key}')">${isExpanded ? '−' : '+'}</button>
          </td>
          <td>${template.name}</td>
          <td>${template.week_count}</td>
          <td>${percentTotal}%</td>
          <td>
            <div class="d-flex gap-1">
              <button type="button" class="btn btn-sm btn-outline-primary" onclick="startTemplateEdit('${template.key}')">Edit</button>
              <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteTemplate('${template.key}')">Delete</button>
            </div>
          </td>
        </tr>
        <tr style="display:${isExpanded ? 'table-row' : 'none'};">
          <td colspan="5">
            <div class="p-2 border rounded bg-white">
              <div class="fw-semibold mb-2">Template Rows</div>
              <div class="table-responsive">
                <table class="table table-sm mb-0">
                  <thead>
                    <tr><th>Stage</th><th>Percent</th><th>Weeks</th></tr>
                  </thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function addTemplateDraftRow() {
  const stage = String(templateDraftStage?.value || '').trim();
  const percent = parseNumber(templateDraftPercent?.value);
  const weeks = parseNumber(templateDraftWeeks?.value);

  if (!stage) {
    setStatus('Stage is required', true);
    return;
  }
  if (percent === null || Number.isNaN(percent) || percent < 0) {
    setStatus('Percent must be a valid non-negative number', true);
    return;
  }
  if (weeks === null || Number.isNaN(weeks) || !Number.isInteger(weeks) || weeks <= 0) {
    setStatus('Weeks must be a positive whole number', true);
    return;
  }

  templateDraftRows.push({ stage, percent, weeks });
  renderTemplateDraftRows();

  if (templateDraftStage) templateDraftStage.value = '';
  if (templateDraftPercent) templateDraftPercent.value = '';
  if (templateDraftWeeks) templateDraftWeeks.value = '';
  setStatus('');
}

function removeTemplateDraftRow(index) {
  templateDraftRows = templateDraftRows.filter((_, rowIndex) => rowIndex !== Number(index));
  renderTemplateDraftRows();
}

function moveTemplateDraftRowUp(index) {
  const rowIndex = Number(index);
  if (!Number.isInteger(rowIndex) || rowIndex <= 0 || rowIndex >= templateDraftRows.length) return;

  const reordered = [...templateDraftRows];
  const [current] = reordered.splice(rowIndex, 1);
  reordered.splice(rowIndex - 1, 0, current);
  templateDraftRows = reordered;
  renderTemplateDraftRows();
}

function moveTemplateDraftRowDown(index) {
  const rowIndex = Number(index);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= templateDraftRows.length - 1) return;

  const reordered = [...templateDraftRows];
  const [current] = reordered.splice(rowIndex, 1);
  reordered.splice(rowIndex + 1, 0, current);
  templateDraftRows = reordered;
  renderTemplateDraftRows();
}

function startTemplateEdit(templateKey) {
  const template = cashflowTemplates.find((entry) => entry.key === templateKey);
  if (!template) {
    setStatus('Template not found', true);
    return;
  }

  editingTemplateKey = template.key;
  templateDraftRows = (template.rows || []).map((row) => ({
    stage: String(row.stage || ''),
    percent: Number(row.percent),
    weeks: Number(row.weeks)
  }));
  if (templateDraftName) templateDraftName.value = template.name || '';
  setTemplateDraftMode(true);
  renderTemplateDraftRows();
  openTemplateDraftModal();
  setStatus('Editing template. Update rows and save when ready.');
}

function toggleTemplateAccordion(templateKey) {
  if (expandedTemplateKeys.has(templateKey)) {
    expandedTemplateKeys.delete(templateKey);
  } else {
    expandedTemplateKeys.add(templateKey);
  }
  renderTemplateAccordion();
}

async function saveTemplateDraft() {
  const templateName = String(templateDraftName?.value || '').trim();
  if (!templateName) {
    setStatus('Template name is required', true);
    return;
  }
  if (!templateDraftRows.length) {
    setStatus('Add at least one row to the template', true);
    return;
  }

  const totalPercent = Number(templateDraftRows.reduce((sum, row) => sum + Number(row.percent || 0), 0).toFixed(2));
  if (Math.abs(totalPercent - 100) > 0.05) {
    setStatus('Template rows must total 100%', true);
    return;
  }

  const payload = {
    name: templateName,
    rows: templateDraftRows.map((row) => ({
      stage: row.stage,
      percent: Number(row.percent),
      weeks: Number(row.weeks)
    }))
  };

  try {
    const isEdit = !!editingTemplateKey;
    const endpoint = editingTemplateKey ? `/cashflow/templates/${editingTemplateKey}` : '/cashflow/templates';
    const method = editingTemplateKey ? 'PUT' : 'POST';
    const response = await api(endpoint, method, payload);

    if (response?.template) {
      const idx = cashflowTemplates.findIndex((entry) => entry.key === response.template.key);
      if (idx >= 0) {
        cashflowTemplates[idx] = response.template;
      } else {
        cashflowTemplates.push(response.template);
      }
      cashflowTemplates.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true }));

      renderTemplateOptions();
      renderTemplateAccordion();
      resetTemplateDraftForm();
      if (templateDraftModal) templateDraftModal.style.display = 'none';
      setStatus(isEdit ? 'Template updated successfully.' : 'Template created successfully.');
    }
  } catch (error) {
    setStatus(error.message || 'Failed to save template', true);
  }
}

async function deleteTemplate(templateKey) {
  const template = cashflowTemplates.find((entry) => entry.key === templateKey);
  if (!template) return;

  const confirmed = window.confirm(`Delete template "${template.name}"?`);
  if (!confirmed) return;

  try {
    await api(`/cashflow/templates/${templateKey}`, 'DELETE');
    cashflowTemplates = cashflowTemplates.filter((entry) => entry.key !== templateKey);
    expandedTemplateKeys.delete(templateKey);

    if (editingTemplateKey === templateKey) {
      resetTemplateDraftForm();
    }

    renderTemplateOptions();
    renderTemplateAccordion();
    setStatus('Template deleted successfully.');
  } catch (error) {
    setStatus(error.message || 'Failed to delete template', true);
  }
}

window.removeTemplateDraftRow = removeTemplateDraftRow;
window.moveTemplateDraftRowUp = moveTemplateDraftRowUp;
window.moveTemplateDraftRowDown = moveTemplateDraftRowDown;
window.startTemplateEdit = startTemplateEdit;
window.deleteTemplate = deleteTemplate;
window.toggleTemplateAccordion = toggleTemplateAccordion;

function updateWizardReview() {
  if (!wizardReview) return;
  const selectedId = Number(wizardLocationSelect.value || 0);
  const sourceLocation = getLocationById(selectedId);

  wizardReview.innerHTML = `
    <div><strong>Location:</strong> ${sourceLocation ? `${sourceLocation.site_name} — ${sourceLocation.location_name}` : '-'}</div>
    <div><strong>Template:</strong> ${templateNameByKey(wizardTemplateSelect.value) || '-'}</div>
    <div><strong>Est. Construction Cost:</strong> ${formatCurrency(parseNumber(wizardEstimatedCost.value) || 0)}</div>
    <div><strong>Location Selling Price:</strong> ${formatCurrency(parseNumber(wizardSellingPrice.value) || 0)}</div>
    <div><strong>Start on Site Date:</strong> ${normalizeInputDate(wizardStartOnSiteDate.value) || '-'}</div>
    <div><strong>Completion Date:</strong> ${deriveCompletionDate(wizardStartOnSiteDate.value, wizardTemplateSelect.value) || '-'}</div>
    <div><strong>Predicted Spend %:</strong> ${getPredictedSpendPercent()}</div>
    <div><strong>Spend Timescale (Weeks):</strong> ${getDerivedTimescaleWeeks() ?? '-'}</div>
    <div><strong>Weekly Spread Total:</strong> ${Number(getTemplateDefaultSpread().reduce((sum, value) => sum + (Number(value) || 0), 0).toFixed(2))}%</div>
  `;
}

function updateWizardStepUI() {
  wizardSteps.forEach((stepEl) => {
    const step = Number(stepEl.getAttribute('data-step'));
    stepEl.style.display = step === wizardCurrentStep ? 'block' : 'none';
  });

  if (wizardStepCounter) {
    wizardStepCounter.textContent = `Step ${wizardCurrentStep} of ${wizardTotalSteps}`;
  }

  wizardBackBtn.disabled = wizardCurrentStep === 1;
  wizardNextBtn.style.display = wizardCurrentStep === wizardTotalSteps ? 'none' : 'inline-block';
  wizardSaveLocationBtn.style.display = wizardCurrentStep === wizardTotalSteps ? 'inline-block' : 'none';
  wizardSaveLocationBtn.textContent = editingLocationId ? 'Update Location' : 'Add Location';

  if (wizardCurrentStep === wizardTotalSteps) {
    updateWizardReview();
  }
}

function goToNextStep() {
  const error = validateStep(wizardCurrentStep);
  if (error) {
    setStatus(error, true);
    return;
  }

  setStatus('');
  wizardCurrentStep = Math.min(wizardTotalSteps, wizardCurrentStep + 1);
  updateWizardStepUI();
}

function goToPreviousStep() {
  wizardCurrentStep = Math.max(1, wizardCurrentStep - 1);
  setStatus('');
  updateWizardStepUI();
}

function buildWizardLocationData() {
  const selectedId = Number(wizardLocationSelect.value || 0);
  const sourceLocation = getLocationById(selectedId);
  if (!sourceLocation) return null;

  return {
    location_id: sourceLocation.location_id,
    location_name: sourceLocation.location_name,
    site_id: sourceLocation.site_id,
    site_name: sourceLocation.site_name,
    include_in_cashflow: true,
    template_key: wizardTemplateSelect.value,
    template_name: templateNameByKey(wizardTemplateSelect.value),
    weekly_spread: getTemplateDefaultSpread(),
    estimated_construction_cost: parseNumber(wizardEstimatedCost.value),
    predicted_spend_percentage: getPredictedSpendPercent(),
    spend_timescale_months: getDerivedTimescaleWeeks(),
    start_on_site_date: normalizeInputDate(wizardStartOnSiteDate.value),
    completion_date: deriveCompletionDate(wizardStartOnSiteDate.value, wizardTemplateSelect.value),
    selling_price: parseNumber(wizardSellingPrice.value)
  };
}

function addOrUpdateWizardLocation() {
  const locationData = buildWizardLocationData();
  if (!locationData) {
    setStatus('Please select a location', true);
    return;
  }

  const validationError = validateWizardInput(locationData);
  if (validationError) {
    setStatus(validationError, true);
    return;
  }

  const wasEditing = !!editingLocationId;
  configuredLocations.set(Number(locationData.location_id), locationData);
  renderConfiguredRows();
  closeWizardModal();
  setStatus(wasEditing ? 'Location updated in cashflow plan.' : 'Location added to cashflow plan.');
}

function parseNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function collectPayload() {
  const locations = currentLocations.map((location) => {
    const configured = configuredLocations.get(Number(location.location_id));
    if (configured) {
      const derivedTimescale = configured.spend_timescale_months ?? getDerivedTimescaleWeeks(configured.template_key);
      const derivedSpread = getTemplateDefaultSpread(configured.template_key);
      const derivedCompletionDate = deriveCompletionDate(configured.start_on_site_date, configured.template_key) || configured.completion_date || null;
      return {
        location_id: location.location_id,
        include_in_cashflow: true,
        template_key: configured.template_key,
        weekly_spread: derivedSpread,
        estimated_construction_cost: configured.estimated_construction_cost,
        predicted_spend_percentage: configured.predicted_spend_percentage,
        spend_timescale_months: derivedTimescale,
        start_on_site_date: configured.start_on_site_date || null,
        completion_date: derivedCompletionDate,
        selling_price: configured.selling_price
      };
    }

    return {
      location_id: location.location_id,
      include_in_cashflow: false,
      template_key: null,
      weekly_spread: null,
      estimated_construction_cost: null,
      predicted_spend_percentage: null,
      spend_timescale_months: null,
      start_on_site_date: null,
      completion_date: null,
      selling_price: null
    };
  });

  return {
    overallStartDate: overallStartDateInput?.value || null,
    overallStartValue: parseNumber(overallStartValueInput?.value),
    locations
  };
}

function validatePayload(payload) {
  if (Number.isNaN(payload.overallStartValue)) {
    return 'Overall cashflow start point must be a valid number';
  }
  if (payload.overallStartValue !== null && payload.overallStartValue < 0) {
    return 'Overall cashflow start point cannot be negative';
  }

  if (!payload.locations.some((location) => location.include_in_cashflow)) {
    return 'Add at least one location in the wizard before saving';
  }

  for (const location of payload.locations) {
    if (!location.include_in_cashflow) continue;

    if (Number.isNaN(location.estimated_construction_cost)) {
      return 'Estimated construction cost must be a valid number';
    }
    if (Number.isNaN(location.predicted_spend_percentage)) {
      return 'Predicted spend % must be a valid number';
    }
    if (Number.isNaN(location.spend_timescale_months)) {
      return 'Spend timescale must be a whole number';
    }
    if (Number.isNaN(location.selling_price)) {
      return 'Location selling price must be a valid number';
    }
    if (!location.start_on_site_date) {
      return 'Start on site date is required for each included location';
    }
    if (!location.completion_date) {
      return 'Completion date is required for each included location';
    }

    if (!location.template_key) {
      return 'Template is required for each included location';
    }

    if (!Array.isArray(location.weekly_spread) || location.weekly_spread.length === 0) {
      return 'Weekly spread is required for each included location';
    }

    const spreadTotal = Number(location.weekly_spread.reduce((sum, value) => sum + (Number(value) || 0), 0).toFixed(2));
    if (Math.abs(spreadTotal - 100) > 0.05) {
      return 'Weekly spread must total 100%';
    }

    if (
      location.predicted_spend_percentage !== null &&
      (location.predicted_spend_percentage < 0 || location.predicted_spend_percentage > 100)
    ) {
      return 'Predicted spend % must be between 0 and 100';
    }

    if (
      location.spend_timescale_months !== null &&
      (!Number.isInteger(location.spend_timescale_months) || location.spend_timescale_months <= 0)
    ) {
      return 'Spend timescale must be a positive whole number';
    }

    if (location.completion_date < location.start_on_site_date) {
      return 'Completion date cannot be before start on site date';
    }
  }

  return null;
}

async function loadSettings() {
  try {
    setStatus('Loading...');
    const data = await api('/cashflow/settings');

    if (typeof window.loadCurrencySettings === 'function') {
      await window.loadCurrencySettings();
    }
    if (typeof window.applyCurrencySymbols === 'function') {
      await window.applyCurrencySymbols();
    }

    currentLocations = Array.isArray(data.locations) ? data.locations : [];
    cashflowTemplates = Array.isArray(data.templates) ? data.templates : [];
    if (overallStartDateInput) {
      overallStartDateInput.value = data.overall_start_date || '';
    }
    if (overallStartValueInput) {
      overallStartValueInput.value = data.overall_start_value ?? '';
    }

    configuredLocations.clear();
    currentLocations
      .filter((location) => location.include_in_cashflow)
      .forEach((location) => {
        configuredLocations.set(Number(location.location_id), {
          ...location,
          template_name: templateNameByKey(location.template_key),
          include_in_cashflow: true
        });
      });

    renderConfiguredRows();
    renderTemplateOptions();
    renderTemplateAccordion();
    resetTemplateDraftForm();
    renderSiteOptions();
    renderLocationOptions();
    resetWizardForm();
    setStatus('');
  } catch (error) {
    setStatus(error.message || 'Failed to load cashflow settings', true);
  }
}

async function handleSave(event) {
  event.preventDefault();

  const payload = collectPayload();
  const validationError = validatePayload(payload);

  if (validationError) {
    setStatus(validationError, true);
    return;
  }

  try {
    setStatus('Saving...');
    await api('/cashflow/settings', 'PUT', payload);
    setStatus('Saved successfully.');
  } catch (error) {
    setStatus(error.message || 'Failed to save cashflow settings', true);
  }
}

function editConfiguredLocation(locationId) {
  openWizardModal(true, locationId);
}

function removeConfiguredLocation(locationId) {
  configuredLocations.delete(Number(locationId));
  expandedLocationIds.delete(Number(locationId));
  renderConfiguredRows();
  if (editingLocationId && Number(editingLocationId) === Number(locationId)) {
    resetWizardForm();
  } else {
    renderLocationOptions();
  }
  setStatus('Location removed from cashflow plan.');
}

window.editConfiguredLocation = editConfiguredLocation;
window.removeConfiguredLocation = removeConfiguredLocation;
window.toggleConfiguredLocation = toggleConfiguredLocation;

openWizardModalBtn?.addEventListener('click', () => openWizardModal(false));
closeWizardModalBtn?.addEventListener('click', closeWizardModal);
wizardCancelBtn?.addEventListener('click', closeWizardModal);
wizardNextBtn?.addEventListener('click', goToNextStep);
wizardBackBtn?.addEventListener('click', goToPreviousStep);
wizardSaveLocationBtn?.addEventListener('click', addOrUpdateWizardLocation);
openTemplateDraftModalBtn?.addEventListener('click', () => {
  resetTemplateDraftForm();
  openTemplateDraftModal();
});
closeTemplateDraftModalBtn?.addEventListener('click', closeTemplateDraftModal);
closeTemplateDraftCancelBtn?.addEventListener('click', closeTemplateDraftModal);
templateDraftAddRowBtn?.addEventListener('click', addTemplateDraftRow);
templateDraftSaveBtn?.addEventListener('click', saveTemplateDraft);
templateDraftCancelEditBtn?.addEventListener('click', () => {
  resetTemplateDraftForm();
  setStatus('Template edit cancelled.');
});
wizardTemplateSelect?.addEventListener('change', () => {
  updateCompletionDateField();
  if (wizardCurrentStep === wizardTotalSteps) {
    updateWizardReview();
  }
});
wizardStartOnSiteDate?.addEventListener('change', () => {
  updateCompletionDateField();
  if (wizardCurrentStep === wizardTotalSteps) {
    updateWizardReview();
  }
});
wizardSiteSelect?.addEventListener('change', () => {
  wizardLocationSelect.value = '';
  renderLocationOptions();
});

cashflowWizardModal?.addEventListener('click', (event) => {
  if (event.target === cashflowWizardModal) {
    closeWizardModal();
  }
});

templateDraftModal?.addEventListener('click', (event) => {
  if (event.target === templateDraftModal) {
    closeTemplateDraftModal();
  }
});

setupForm?.addEventListener('submit', handleSave);
loadSettings();
