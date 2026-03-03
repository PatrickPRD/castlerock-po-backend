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
const wizardSpendPercent = document.getElementById('wizardSpendPercent');
const wizardTimescaleMonths = document.getElementById('wizardTimescaleMonths');
const wizardWeeklySpread = document.getElementById('wizardWeeklySpread');
const wizardSpreadTotal = document.getElementById('wizardSpreadTotal');
const wizardReview = document.getElementById('wizardReview');
const wizardProgress = document.getElementById('wizardProgress');
const configuredLocationsBody = document.getElementById('configuredLocationsBody');
const wizardSteps = [...document.querySelectorAll('.wizard-step')];
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
let editingLocationId = null;
let wizardCurrentStep = 1;
const wizardTotalSteps = 8;
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
  const spendPct = location.predicted_spend_percentage ?? '';
  const timescale = location.spend_timescale_months ?? '';
  const sellingPrice = location.selling_price ?? '';

  return `
    <tr>
      <td>
        <span class="location-name">${location.location_name}</span>
        <small class="text-muted site-name">${location.site_name}</small>
      </td>
      <td>
        ${location.template_name || location.template_key || '-'}
      </td>
      <td>
        ${formatCurrency(estimatedCost)}
      </td>
      <td>
        ${spendPct === null || spendPct === '' ? '-' : spendPct}
      </td>
      <td>
        ${timescale === null || timescale === '' ? '-' : timescale}
      </td>
      <td>
        ${formatCurrency(sellingPrice)}
      </td>
      <td>
        <button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="editConfiguredLocation(${location.location_id})">Edit</button>
        <button type="button" class="btn btn-sm btn-danger" onclick="removeConfiguredLocation(${location.location_id})">Remove</button>
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
        <td colspan="7" class="text-center text-muted py-4">No configured locations yet. Use the wizard above.</td>
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
  wizardSpendPercent.value = '';
  wizardTimescaleMonths.value = '';
  if (wizardWeeklySpread) wizardWeeklySpread.innerHTML = '';
  if (wizardSpreadTotal) wizardSpreadTotal.textContent = 'Total: 0%';
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
  wizardSpendPercent.value = config.predicted_spend_percentage ?? '';
  wizardTimescaleMonths.value = config.spend_timescale_months ?? '';
  wizardTemplateSelect.value = config.template_key || '';
  renderWeeklySpreadInputs(config.template_key, config.weekly_spread);
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
  if (locationData.predicted_spend_percentage === null || Number.isNaN(locationData.predicted_spend_percentage)) {
    return 'Predicted spend % is required';
  }
  if (locationData.spend_timescale_months === null || Number.isNaN(locationData.spend_timescale_months)) {
    return 'Spend timescale is required';
  }

  if (locationData.estimated_construction_cost < 0) return 'Estimated construction cost cannot be negative';
  if (locationData.selling_price < 0) return 'Location selling price cannot be negative';
  if (locationData.predicted_spend_percentage < 0 || locationData.predicted_spend_percentage > 100) {
    return 'Predicted spend % must be between 0 and 100';
  }
  if (!Number.isInteger(locationData.spend_timescale_months) || locationData.spend_timescale_months <= 0) {
    return 'Spend timescale must be a positive whole number';
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
  }

  if (step === 5) {
    const value = parseNumber(wizardSpendPercent.value);
    if (value === null || Number.isNaN(value)) return 'Predicted spend % is required';
    if (value < 0 || value > 100) return 'Predicted spend % must be between 0 and 100';
  }

  if (step === 6) {
    const value = parseNumber(wizardTimescaleMonths.value);
    if (value === null || Number.isNaN(value)) return 'Spend timescale is required';
    if (!Number.isInteger(value) || value <= 0) return 'Spend timescale must be a positive whole number';
  }

  if (step === 7) {
    const spreadValues = collectWeeklySpreadValues();
    if (!spreadValues.length) return 'Weekly spread values are required';
    if (spreadValues.some((entry) => Number.isNaN(entry) || entry < 0)) return 'Weekly spread values must be valid non-negative numbers';
    const total = Number(spreadValues.reduce((sum, value) => sum + value, 0).toFixed(2));
    if (Math.abs(total - 100) > 0.05) return 'Weekly spread must total 100%';
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

function renderWeeklySpreadInputs(templateKey, existingSpread = null) {
  if (!wizardWeeklySpread) return;
  const template = cashflowTemplates.find((item) => item.key === templateKey);

  if (!template) {
    wizardWeeklySpread.innerHTML = '<div class="text-muted small">Select a template to set weekly spread.</div>';
    if (wizardSpreadTotal) wizardSpreadTotal.textContent = 'Total: 0%';
    return;
  }

  const baseSpread = Array.isArray(existingSpread) && existingSpread.length === Number(template.week_count)
    ? existingSpread.map((entry) => Number(entry))
    : (Array.isArray(template.default_spread) ? template.default_spread.map((entry) => Number(entry)) : []);
  const normalized = normalizeSpreadTo100(baseSpread);

  wizardWeeklySpread.innerHTML = normalized.map((value, idx) => `
    <div class="weekly-row">
      <label class="small text-muted">Week ${idx + 1}</label>
      <input type="number" step="0.01" min="0" class="form-control weekly-spread-input" data-week-index="${idx}" value="${value}">
    </div>
  `).join('');

  updateSpreadTotal();

  wizardWeeklySpread.querySelectorAll('.weekly-spread-input').forEach((input) => {
    input.addEventListener('input', updateSpreadTotal);
  });
}

function updateSpreadTotal() {
  const values = collectWeeklySpreadValues();
  const total = Number(values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0).toFixed(2));
  if (wizardSpreadTotal) {
    wizardSpreadTotal.textContent = `Total: ${total}%`;
    wizardSpreadTotal.classList.toggle('text-danger', Math.abs(total - 100) > 0.05);
    wizardSpreadTotal.classList.toggle('text-muted', Math.abs(total - 100) <= 0.05);
  }
}

function collectWeeklySpreadValues() {
  if (!wizardWeeklySpread) return [];
  return [...wizardWeeklySpread.querySelectorAll('.weekly-spread-input')].map((input) => parseNumber(input.value));
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

function renderTemplateManagerList() {
  if (!templateManagerListBody) return;

  if (!cashflowTemplates.length) {
    templateManagerListBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-muted text-center py-3">No templates available</td>
      </tr>
    `;
    return;
  }

  templateManagerListBody.innerHTML = cashflowTemplates
    .map((template) => {
      const total = Number((template.default_spread || []).reduce((sum, value) => sum + (Number(value) || 0), 0).toFixed(2));
      return `
        <tr>
          <td>${template.name}</td>
          <td>${template.week_count}</td>
          <td>${total}%</td>
        </tr>
      `;
    })
    .join('');
}

function updateTemplateRowsTotals() {
  const totalPercent = Number(templateRows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0).toFixed(2));
  const totalWeeks = Number(templateRows.reduce((sum, row) => sum + (Number(row.weeks) || 0), 0));
  if (templateRowsTotals) {
    templateRowsTotals.textContent = `Total: ${totalPercent}% | ${totalWeeks} weeks`;
    templateRowsTotals.classList.toggle('text-danger', Math.abs(totalPercent - 100) > 0.05);
    templateRowsTotals.classList.toggle('text-muted', Math.abs(totalPercent - 100) <= 0.05);
  }
}

function renderTemplateRowsTable() {
  if (!templateRowsBody) return;

  if (!templateRows.length) {
    templateRowsBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-muted text-center py-3">No rows added yet.</td>
      </tr>
    `;
    updateTemplateRowsTotals();
    return;
  }

  templateRowsBody.innerHTML = templateRows
    .map((row, index) => `
      <tr>
        <td>${row.stage}</td>
        <td>${row.percent}</td>
        <td>${row.weeks}</td>
        <td>
          <div class="d-flex gap-1">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="moveTemplateRowUp(${index})" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="moveTemplateRowDown(${index})" ${index === templateRows.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeTemplateRow(${index})">Remove</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  updateTemplateRowsTotals();
}

function addTemplateRow() {
  const stage = String(templateRowStage?.value || '').trim();
  const percent = parseNumber(templateRowPercent?.value);
  const weeks = parseNumber(templateRowWeeks?.value);

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

  templateRows.push({ stage, percent, weeks });
  renderTemplateRowsTable();

  if (templateRowStage) templateRowStage.value = '';
  if (templateRowPercent) templateRowPercent.value = '';
  if (templateRowWeeks) templateRowWeeks.value = '';
  setStatus('');
}

function removeTemplateRow(index) {
  templateRows = templateRows.filter((_, rowIndex) => rowIndex !== Number(index));
  renderTemplateRowsTable();
}

function moveTemplateRowUp(index) {
  const rowIndex = Number(index);
  if (!Number.isInteger(rowIndex) || rowIndex <= 0 || rowIndex >= templateRows.length) return;

  const reordered = [...templateRows];
  const [current] = reordered.splice(rowIndex, 1);
  reordered.splice(rowIndex - 1, 0, current);
  templateRows = reordered;
  renderTemplateRowsTable();
}

function moveTemplateRowDown(index) {
  const rowIndex = Number(index);
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= templateRows.length - 1) return;

  const reordered = [...templateRows];
  const [current] = reordered.splice(rowIndex, 1);
  reordered.splice(rowIndex + 1, 0, current);
  templateRows = reordered;
  renderTemplateRowsTable();
}

function resetTemplateWizard() {
  templateWizardCurrentStep = 1;
  templateRows = [];
  if (templateWizardName) templateWizardName.value = '';
  if (templateRowStage) templateRowStage.value = '';
  if (templateRowPercent) templateRowPercent.value = '';
  if (templateRowWeeks) templateRowWeeks.value = '';
  if (templateWizardReview) templateWizardReview.innerHTML = '';
  renderTemplateRowsTable();
}

function openTemplateManagerModal() {
  resetTemplateWizard();
  renderTemplateManagerList();
  updateTemplateWizardStepUI();
  if (templateManagerModal) templateManagerModal.style.display = 'flex';
}

function closeTemplateManagerModal() {
  if (templateManagerModal) templateManagerModal.style.display = 'none';
  resetTemplateWizard();
}

function validateTemplateStep(step) {
  if (step === 1) {
    if (!String(templateWizardName?.value || '').trim()) return 'Template name is required';
  }

  if (step === 2) {
    if (!templateRows.length) {
      return 'Add at least one row to the template';
    }

    if (templateRows.some((row) => !row.stage || Number.isNaN(Number(row.percent)) || Number(row.percent) < 0 || !Number.isInteger(Number(row.weeks)) || Number(row.weeks) <= 0)) {
      return 'Template rows must have valid Stage, Percent, and Weeks values';
    }

    const total = Number(templateRows.reduce((sum, row) => sum + Number(row.percent || 0), 0).toFixed(2));
    if (Math.abs(total - 100) > 0.05) return 'Weekly spread must total 100%';
  }

  return null;
}

function updateTemplateWizardReview() {
  if (!templateWizardReview) return;
  const name = String(templateWizardName?.value || '').trim();
  const weekCount = Number(templateRows.reduce((sum, row) => sum + Number(row.weeks || 0), 0));
  const total = Number(templateRows.reduce((sum, row) => sum + Number(row.percent || 0), 0).toFixed(2));

  templateWizardReview.innerHTML = `
    <div><strong>Name:</strong> ${name || '-'}</div>
    <div><strong>Weeks:</strong> ${weekCount || '-'}</div>
    <div><strong>Rows:</strong> ${templateRows.length}</div>
    <div><strong>Spread Total:</strong> ${total}%</div>
  `;
}

function updateTemplateWizardStepUI() {
  templateSteps.forEach((stepEl) => {
    const step = Number(stepEl.getAttribute('data-template-step'));
    stepEl.style.display = step === templateWizardCurrentStep ? 'block' : 'none';
  });

  if (templateWizardStepCounter) {
    templateWizardStepCounter.textContent = `Step ${templateWizardCurrentStep} of ${templateWizardTotalSteps}`;
  }

  templateWizardBackBtn.disabled = templateWizardCurrentStep === 1;
  templateWizardNextBtn.style.display = templateWizardCurrentStep === templateWizardTotalSteps ? 'none' : 'inline-block';
  templateWizardSaveBtn.style.display = templateWizardCurrentStep === templateWizardTotalSteps ? 'inline-block' : 'none';

  if (templateWizardCurrentStep === templateWizardTotalSteps) {
    updateTemplateWizardReview();
  }
}

function nextTemplateWizardStep() {
  const error = validateTemplateStep(templateWizardCurrentStep);
  if (error) {
    setStatus(error, true);
    return;
  }

  setStatus('');
  templateWizardCurrentStep = Math.min(templateWizardTotalSteps, templateWizardCurrentStep + 1);
  updateTemplateWizardStepUI();
}

function previousTemplateWizardStep() {
  templateWizardCurrentStep = Math.max(1, templateWizardCurrentStep - 1);
  setStatus('');
  updateTemplateWizardStepUI();
}

async function saveTemplateFromWizard() {
  const validationError = validateTemplateStep(2);
  if (validationError) {
    setStatus(validationError, true);
    return;
  }

  const payload = {
    name: String(templateWizardName?.value || '').trim(),
    rows: templateRows.map((row) => ({
      stage: row.stage,
      percent: Number(row.percent),
      weeks: Number(row.weeks)
    }))
  };

  try {
    const response = await api('/cashflow/templates', 'POST', payload);
    if (response?.template) {
      cashflowTemplates.push(response.template);
      cashflowTemplates.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true }));
      renderTemplateOptions();
      renderTemplateManagerList();
      setStatus('Template created successfully.');
      closeTemplateManagerModal();
    }
  } catch (error) {
    setStatus(error.message || 'Failed to create template', true);
  }
}

window.removeTemplateRow = removeTemplateRow;
window.moveTemplateRowUp = moveTemplateRowUp;
window.moveTemplateRowDown = moveTemplateRowDown;

function updateWizardReview() {
  if (!wizardReview) return;
  const selectedId = Number(wizardLocationSelect.value || 0);
  const sourceLocation = getLocationById(selectedId);

  wizardReview.innerHTML = `
    <div><strong>Location:</strong> ${sourceLocation ? `${sourceLocation.site_name} — ${sourceLocation.location_name}` : '-'}</div>
    <div><strong>Template:</strong> ${templateNameByKey(wizardTemplateSelect.value) || '-'}</div>
    <div><strong>Est. Construction Cost:</strong> ${formatCurrency(parseNumber(wizardEstimatedCost.value) || 0)}</div>
    <div><strong>Location Selling Price:</strong> ${formatCurrency(parseNumber(wizardSellingPrice.value) || 0)}</div>
    <div><strong>Predicted Spend %:</strong> ${parseNumber(wizardSpendPercent.value) ?? '-'}</div>
    <div><strong>Spend Timescale (Months):</strong> ${parseNumber(wizardTimescaleMonths.value) ?? '-'}</div>
    <div><strong>Weekly Spread Total:</strong> ${Number(collectWeeklySpreadValues().reduce((sum, value) => sum + (Number(value) || 0), 0).toFixed(2))}%</div>
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
    weekly_spread: collectWeeklySpreadValues(),
    estimated_construction_cost: parseNumber(wizardEstimatedCost.value),
    predicted_spend_percentage: parseNumber(wizardSpendPercent.value),
    spend_timescale_months: parseNumber(wizardTimescaleMonths.value),
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
      return {
        location_id: location.location_id,
        include_in_cashflow: true,
        template_key: configured.template_key,
        weekly_spread: configured.weekly_spread,
        estimated_construction_cost: configured.estimated_construction_cost,
        predicted_spend_percentage: configured.predicted_spend_percentage,
        spend_timescale_months: configured.spend_timescale_months,
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

openWizardModalBtn?.addEventListener('click', () => openWizardModal(false));
closeWizardModalBtn?.addEventListener('click', closeWizardModal);
wizardCancelBtn?.addEventListener('click', closeWizardModal);
wizardNextBtn?.addEventListener('click', goToNextStep);
wizardBackBtn?.addEventListener('click', goToPreviousStep);
wizardSaveLocationBtn?.addEventListener('click', addOrUpdateWizardLocation);
openTemplateManagerModalBtn?.addEventListener('click', openTemplateManagerModal);
closeTemplateManagerModalBtn?.addEventListener('click', closeTemplateManagerModal);
templateWizardCancelBtn?.addEventListener('click', closeTemplateManagerModal);
templateWizardNextBtn?.addEventListener('click', nextTemplateWizardStep);
templateWizardBackBtn?.addEventListener('click', previousTemplateWizardStep);
templateWizardSaveBtn?.addEventListener('click', saveTemplateFromWizard);
templateAddRowBtn?.addEventListener('click', addTemplateRow);
wizardTemplateSelect?.addEventListener('change', () => {
  renderWeeklySpreadInputs(wizardTemplateSelect.value);
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

templateManagerModal?.addEventListener('click', (event) => {
  if (event.target === templateManagerModal) {
    closeTemplateManagerModal();
  }
});

setupForm?.addEventListener('submit', handleSave);
loadSettings();
