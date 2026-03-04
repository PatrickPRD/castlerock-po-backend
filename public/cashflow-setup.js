ensureAuthenticated();

const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const setupForm = document.getElementById('cashflowSetupForm');
const statusEl = document.getElementById('cashflowSetupStatus');
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
const wizardHouseHandoverDate = document.getElementById('wizardHouseHandoverDate');
const wizardRemoveFeesPercentage = document.getElementById('wizardRemoveFeesPercentage');
const wizardRemoveVatRate = document.getElementById('wizardRemoveVatRate');
const wizardCalculatedIncome = document.getElementById('wizardCalculatedIncome');
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
const openCapitalCostModalBtn = document.getElementById('openCapitalCostModalBtn');
const capitalCostModal = document.getElementById('capitalCostModal');
const capitalCostModalTitle = document.getElementById('capitalCostModalTitle');
const closeCapitalCostModalBtn = document.getElementById('closeCapitalCostModalBtn');
const capitalCostModalCancelBtn = document.getElementById('capitalCostModalCancelBtn');
const capitalCostTitleInput = document.getElementById('capitalCostTitle');
const capitalCostDescriptionInput = document.getElementById('capitalCostDescription');
const capitalCostCostExVatInput = document.getElementById('capitalCostCostExVat');
const capitalCostVatRateSelect = document.getElementById('capitalCostVatRate');
const capitalCostTotalIncVatInput = document.getElementById('capitalCostTotalIncVat');
const capitalCostDateAppliedInput = document.getElementById('capitalCostDateApplied');
const capitalCostUseProjectStartInput = document.getElementById('capitalCostUseProjectStart');
const capitalCostSaveBtn = document.getElementById('capitalCostSaveBtn');
const capitalCostDeleteModal = document.getElementById('capitalCostDeleteModal');
const capitalCostDeleteTitle = document.getElementById('capitalCostDeleteTitle');
const closeCapitalCostDeleteModalBtn = document.getElementById('closeCapitalCostDeleteModalBtn');
const capitalCostDeleteCancelBtn = document.getElementById('capitalCostDeleteCancelBtn');
const capitalCostDeleteConfirmBtn = document.getElementById('capitalCostDeleteConfirmBtn');
const capitalCostsBody = document.getElementById('capitalCostsBody');
const capitalCostsStatusEl = document.getElementById('capitalCostsStatus');
const capitalCostsSummary = document.getElementById('capitalCostsSummary');
const templateDraftLocationTypes = document.getElementById('templateDraftLocationTypes');

let currentLocations = [];
let cashflowTemplates = [];
const configuredLocations = new Map();
const expandedLocationIds = new Set();
let editingLocationId = null;
let wizardCurrentStep = 1;
const wizardTotalSteps = 1;
let templateDraftRows = [];
let editingTemplateKey = null;
const expandedTemplateKeys = new Set();
let isLoadingSettings = false;
let autoSaveTimer = null;
let availableVatRates = [0, 13.5, 23];
let lastAutoHandoverDate = null;
let capitalCosts = [];
let editingCapitalCostId = null;
let deletingCapitalCostId = null;
let projectStartDate = null;
const expandedCapitalCostIds = new Set();
let availableLocationTypes = [];

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.toggle('text-danger', !!isError);
  statusEl.classList.toggle('text-muted', !isError);
}

function setCapitalCostsStatus(message, isError = false) {
  if (!capitalCostsStatusEl) return;
  capitalCostsStatusEl.textContent = message || '';
  capitalCostsStatusEl.classList.toggle('text-danger', !!isError);
  capitalCostsStatusEl.classList.toggle('text-muted', !isError);
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

function toRateKey(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(3)) : null;
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function calculateCapitalCostTotal(costExVatInput, vatRateInput) {
  const costExVat = Number.isFinite(Number(costExVatInput)) ? Number(costExVatInput) : 0;
  const vatRate = Number.isFinite(Number(vatRateInput)) ? Number(vatRateInput) : 0;
  const clampedVatRate = Math.max(0, Math.min(100, vatRate));
  return roundMoney(costExVat * (1 + (clampedVatRate / 100)));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deriveHouseHandoverDate(completionDateValue) {
  const completionDate = normalizeInputDate(completionDateValue);
  if (!completionDate) return null;
  const date = new Date(`${completionDate}T00:00:00`);
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function calculateIncomeBreakdown(sellingPriceInput, removeVatRateInput, removeFeesInput) {
  const sellingPrice = Number.isFinite(Number(sellingPriceInput)) ? Number(sellingPriceInput) : 0;
  const removeVatRate = Number.isFinite(Number(removeVatRateInput)) ? Number(removeVatRateInput) : 0;
  const removeFeesPercentage = Number.isFinite(Number(removeFeesInput)) ? Number(removeFeesInput) : 0;

  const clampedVatRate = Math.max(0, Math.min(100, removeVatRate));
  const clampedFeesPercentage = Math.max(0, Math.min(100, removeFeesPercentage));

  const vatAmount = clampedVatRate > 0
    ? roundMoney(sellingPrice * (clampedVatRate / (100 + clampedVatRate)))
    : 0;
  const sellingPriceBeforeVat = roundMoney(sellingPrice - vatAmount);
  const feesAmount = roundMoney(sellingPriceBeforeVat * (clampedFeesPercentage / 100));
  const calculatedIncome = roundMoney(sellingPrice - vatAmount - feesAmount);

  return {
    vatAmount,
    feesAmount,
    calculatedIncome
  };
}

async function loadFinancialVatRates() {
  try {
    const financial = await api('/settings/financial');
    const rates = Array.isArray(financial?.vat_rates)
      ? financial.vat_rates.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 100)
      : [];
    availableVatRates = rates.length ? rates : [0, 13.5, 23];
  } catch (_) {
    availableVatRates = [0, 13.5, 23];
  }
}

function renderRemoveVatOptions(selectedRate = null) {
  if (!wizardRemoveVatRate) return;

  const previousValue = selectedRate !== null && selectedRate !== undefined
    ? String(selectedRate)
    : wizardRemoveVatRate.value;
  wizardRemoveVatRate.innerHTML = '<option value="">Select VAT rate</option>';

  const sortedRates = [...availableVatRates].sort((a, b) => a - b);
  sortedRates.forEach((rate) => {
    const option = document.createElement('option');
    option.value = String(rate);
    option.textContent = `${rate}%`;
    wizardRemoveVatRate.appendChild(option);
  });

  const hasPrevious = previousValue && [...wizardRemoveVatRate.options].some((option) => option.value === previousValue);
  if (hasPrevious) {
    wizardRemoveVatRate.value = previousValue;
  } else if (sortedRates.length > 0) {
    wizardRemoveVatRate.value = String(sortedRates[0]);
  }
}

function renderCapitalVatRateOptions(selectedRate = null) {
  if (!capitalCostVatRateSelect) return;

  const previousValue = selectedRate !== null && selectedRate !== undefined
    ? String(selectedRate)
    : capitalCostVatRateSelect.value;
  capitalCostVatRateSelect.innerHTML = '<option value="">Select VAT rate</option>';

  const sortedRates = [...availableVatRates].sort((a, b) => a - b);
  sortedRates.forEach((rate) => {
    const option = document.createElement('option');
    option.value = String(rate);
    option.textContent = `${rate}%`;
    capitalCostVatRateSelect.appendChild(option);
  });

  const hasPrevious = previousValue && [...capitalCostVatRateSelect.options].some((option) => option.value === previousValue);
  if (hasPrevious) {
    capitalCostVatRateSelect.value = previousValue;
  } else if (sortedRates.length > 0) {
    capitalCostVatRateSelect.value = String(sortedRates[0]);
  }
}

function updateCapitalCostTotalField() {
  if (!capitalCostTotalIncVatInput) return;

  const costExVat = parseNumber(capitalCostCostExVatInput?.value);
  const vatRate = parseNumber(capitalCostVatRateSelect?.value);
  const normalizedCostExVat = costExVat === null || Number.isNaN(costExVat) ? 0 : costExVat;
  const normalizedVatRate = vatRate === null || Number.isNaN(vatRate) ? 0 : vatRate;
  const totalIncVat = calculateCapitalCostTotal(normalizedCostExVat, normalizedVatRate);

  capitalCostTotalIncVatInput.value = formatCurrency(totalIncVat);
}

function syncCapitalCostDateWithProjectStart() {
  if (!capitalCostDateAppliedInput || !capitalCostUseProjectStartInput) return;

  const useProjectStartDate = !!capitalCostUseProjectStartInput.checked;
  capitalCostDateAppliedInput.readOnly = useProjectStartDate;

  if (!useProjectStartDate) {
    return;
  }

  const normalizedProjectStartDate = normalizeInputDate(projectStartDate);
  if (normalizedProjectStartDate) {
    capitalCostDateAppliedInput.value = normalizedProjectStartDate;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  capitalCostDateAppliedInput.value = today;
}

/* ======================================================
   LOCATION TYPE TO TEMPLATE MAPPINGS
   ====================================================== */

async function loadAvailableLocationTypes() {
  try {
    const locationTypesData = await api('/cashflow/location-types');
    availableLocationTypes = Array.isArray(locationTypesData) ? locationTypesData : [];
  } catch (error) {
    console.error('Error loading available location types:', error);
    availableLocationTypes = [];
  }
}

function renderTemplateTagSelector(selectedTypes = []) {
  const tagsContainer = document.getElementById('templateDraftTagsContainer');
  if (!tagsContainer) return;

  const input = document.getElementById('templateDraftTypeInput');
  const selectedSet = new Set(selectedTypes);

  // Clear container but keep input
  const existingTags = tagsContainer.querySelectorAll('.template-type-tag');
  existingTags.forEach(tag => tag.remove());

  // Render tags before input
  selectedSet.forEach(type => {
    const tag = document.createElement('div');
    tag.className = 'template-type-tag d-flex align-items-center gap-1 px-2 py-1 rounded-pill';
    tag.style.background = '#0d6efd';
    tag.style.color = 'white';
    tag.style.fontSize = '0.85rem';
    tag.style.whiteSpace = 'nowrap';
    tag.dataset.type = type; // Store the type value for later retrieval
    tag.innerHTML = `
      ${type}
      <button type="button" class="btn-close btn-close-white" style="width: 1rem; height: 1rem;" aria-label="Remove ${type}"></button>
    `;
    
    const removeBtn = tag.querySelector('.btn-close');
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      selectedSet.delete(type);
      renderTemplateTagSelector(Array.from(selectedSet));
    });
    
    tagsContainer.insertBefore(tag, input);
  });

  // Attach input event listeners
  attachTagInputHandlers(selectedSet);
}

function attachTagInputHandlers(selectedSet = new Set()) {
  const input = document.getElementById('templateDraftTypeInput');
  const suggestionsDiv = document.getElementById('templateDraftTypeSuggestions');
  
  if (!input || !suggestionsDiv) return;

  input.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    
    if (!query) {
      suggestionsDiv.style.display = 'none';
      return;
    }
    
    // Filter available types (exclude already selected)
    const matches = availableLocationTypes.filter(type => 
      type.toLowerCase().includes(query) && !selectedSet.has(type)
    );
    
    if (matches.length === 0) {
      suggestionsDiv.style.display = 'none';
      return;
    }
    
    // Show suggestions
    suggestionsDiv.innerHTML = matches.map(type => `
      <div class="suggestion-item p-2 border-bottom" style="cursor: pointer;">
        ${type}
      </div>
    `).join('');
    suggestionsDiv.style.display = 'block';
    
    // Attach click handlers to suggestions
    suggestionsDiv.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.textContent.trim();
        selectedSet.add(type);
        input.value = '';
        suggestionsDiv.style.display = 'none';
        renderTemplateTagSelector(Array.from(selectedSet));
      });
    });
  });
  
  // Add on Enter key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = e.target.value.trim().toLowerCase();
      if (!query) return;
      
      const matching = availableLocationTypes.find(type => type.toLowerCase() === query);
      if (matching && !selectedSet.has(matching)) {
        selectedSet.add(matching);
        input.value = '';
        suggestionsDiv.style.display = 'none';
        renderTemplateTagSelector(Array.from(selectedSet));
      }
    }
  });
  
  // Close suggestions on blur
  input.addEventListener('blur', () => {
    setTimeout(() => suggestionsDiv.style.display = 'none', 150);
  });
}

function getSelectedTemplateLocationTypes() {
  const tagsContainer = document.getElementById('templateDraftTagsContainer');
  if (!tagsContainer) return [];
  
  const tags = tagsContainer.querySelectorAll('.template-type-tag');
  return Array.from(tags).map(tag => tag.dataset.type).filter(Boolean);
}

function updateHouseHandoverDateField() {
  if (!wizardHouseHandoverDate) return;

  const autoDate = deriveHouseHandoverDate(wizardCompletionDate?.value);
  if (!autoDate) {
    wizardHouseHandoverDate.value = '';
    lastAutoHandoverDate = null;
    return;
  }

  const currentValue = normalizeInputDate(wizardHouseHandoverDate.value);
  const shouldAutofill = !currentValue || (lastAutoHandoverDate && currentValue === lastAutoHandoverDate);
  if (shouldAutofill) {
    wizardHouseHandoverDate.value = autoDate;
  }
  lastAutoHandoverDate = autoDate;
}

function updateCalculatedIncomeField() {
  if (!wizardCalculatedIncome) return;

  const sellingPrice = parseNumber(wizardSellingPrice?.value);
  const removeFees = parseNumber(wizardRemoveFeesPercentage?.value);
  const removeVatRate = parseNumber(wizardRemoveVatRate?.value);

  const breakdown = calculateIncomeBreakdown(
    sellingPrice === null || Number.isNaN(sellingPrice) ? 0 : sellingPrice,
    removeVatRate === null || Number.isNaN(removeVatRate) ? 0 : removeVatRate,
    removeFees === null || Number.isNaN(removeFees) ? 0 : removeFees
  );

  wizardCalculatedIncome.value = formatCurrency(breakdown.calculatedIncome);
}

function rowTemplate(location) {
  const estimatedCost = location.estimated_construction_cost ?? '';
  const timescale = location.spend_timescale_months ?? '';
  const sellingPrice = location.selling_price ?? '';
  const startOnSiteDate = location.start_on_site_date || '';
  const completionDate = location.completion_date || '';
  const houseHandoverDate = location.house_handover_date || '';
  const removeFeesPercentage = location.remove_fees_percentage ?? 0;
  const removeVatRate = location.remove_vat_rate ?? 0;
  const calculatedIncome = location.calculated_income ?? calculateIncomeBreakdown(sellingPrice, removeVatRate, removeFeesPercentage).calculatedIncome;
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
          <div class="configured-location-grid">
            <div class="configured-stat">
              <span class="configured-label">Site</span>
              <span class="configured-value">${location.site_name || '-'}</span>
            </div>
            <div class="configured-stat">
              <span class="configured-label">Spend Timescale (Weeks)</span>
              <span class="configured-value">${timescale === null || timescale === '' ? '-' : timescale}</span>
            </div>
            <div class="configured-stat">
              <span class="configured-label">Location Selling Price</span>
              <span class="configured-value">${formatCurrency(sellingPrice)}</span>
            </div>
            <div class="configured-stat">
              <span class="configured-label">Start on Site Date</span>
              <span class="configured-value">${startOnSiteDate || '-'}</span>
            </div>
            <div class="configured-stat">
              <span class="configured-label">Completion Date</span>
              <span class="configured-value">${completionDate || '-'}</span>
            </div>
            <div class="configured-stat">
              <span class="configured-label">House Handover Date</span>
              <span class="configured-value">${houseHandoverDate || '-'}</span>
            </div>
            <div class="configured-stat">
              <span class="configured-label">Prof. Fees (%)</span>
              <span class="configured-value">${removeFeesPercentage === null || removeFeesPercentage === '' ? '-' : removeFeesPercentage}</span>
            </div>
            <div class="configured-stat">
              <span class="configured-label">VAT (%)</span>
              <span class="configured-value">${removeVatRate === null || removeVatRate === '' ? '-' : removeVatRate}</span>
            </div>
            <div class="configured-stat">
              <span class="configured-label">Calculated Income</span>
              <span class="configured-value">${formatCurrency(calculatedIncome)}</span>
            </div>
          </div>
          <div class="configured-location-actions">
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
        <td colspan="4" class="text-center text-muted py-4">No configured locations yet. Use Add Location above.</td>
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

function sortedCapitalCosts() {
  return [...capitalCosts].sort((a, b) => {
    const dateSort = String(a.date_applied || '').localeCompare(String(b.date_applied || ''));
    if (dateSort !== 0) return dateSort;
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

function updateCapitalCostsSummary() {
  if (!capitalCostsSummary) return;
  const totalIncVat = roundMoney(capitalCosts.reduce((sum, row) => sum + (Number(row.total_inc_vat) || 0), 0));
  capitalCostsSummary.textContent = `Total (inc VAT): ${formatCurrency(totalIncVat)}`;
}

function resetCapitalCostForm() {
  editingCapitalCostId = null;
  if (capitalCostTitleInput) capitalCostTitleInput.value = '';
  if (capitalCostDescriptionInput) capitalCostDescriptionInput.value = '';
  if (capitalCostCostExVatInput) capitalCostCostExVatInput.value = '';
  if (capitalCostUseProjectStartInput) capitalCostUseProjectStartInput.checked = true;
  renderCapitalVatRateOptions();
  syncCapitalCostDateWithProjectStart();
  updateCapitalCostTotalField();

  if (capitalCostModalTitle) {
    capitalCostModalTitle.textContent = 'Add Capital Cost';
  }
  if (capitalCostSaveBtn) {
    capitalCostSaveBtn.textContent = 'Add Capital Cost';
  }
}

function openCapitalCostModal() {
  if (capitalCostModal) {
    capitalCostModal.style.display = 'flex';
  }
}

function closeCapitalCostModal() {
  if (capitalCostModal) {
    capitalCostModal.style.display = 'none';
  }
  resetCapitalCostForm();
}

function toggleCapitalCost(costId) {
  const id = Number(costId);
  if (!Number.isInteger(id) || id <= 0) return;

  if (expandedCapitalCostIds.has(id)) {
    expandedCapitalCostIds.delete(id);
  } else {
    expandedCapitalCostIds.add(id);
  }

  renderCapitalCosts();
}

function renderCapitalCosts() {
  if (!capitalCostsBody) return;

  const rows = sortedCapitalCosts();
  updateCapitalCostsSummary();

  if (!rows.length) {
    expandedCapitalCostIds.clear();
    capitalCostsBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted py-3">No capital costs added.</td>
      </tr>
    `;
    return;
  }

  capitalCostsBody.innerHTML = rows.map((cost) => {
    const costId = Number(cost.id);
    const isExpanded = expandedCapitalCostIds.has(costId);

    return `
      <tr>
        <td>
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleCapitalCost(${costId})">${isExpanded ? '−' : '+'}</button>
        </td>
        <td>${escapeHtml(cost.title)}</td>
        <td class="text-end">${formatCurrency(cost.total_inc_vat)}</td>
        <td>${escapeHtml(cost.date_applied || '-')}</td>
      </tr>
      <tr class="capital-cost-details" style="display:${isExpanded ? 'table-row' : 'none'};">
        <td colspan="4">
          <div class="capital-cost-panel">
            <div class="capital-cost-grid">
              <div class="configured-stat">
                <span class="configured-label">Description</span>
                <span class="configured-value">${escapeHtml(cost.description || '-')}</span>
              </div>
              <div class="configured-stat">
                <span class="configured-label">Cost ex VAT</span>
                <span class="configured-value">${formatCurrency(cost.cost_ex_vat)}</span>
              </div>
              <div class="configured-stat">
                <span class="configured-label">VAT Rate</span>
                <span class="configured-value">${Number(cost.vat_rate || 0)}%</span>
              </div>
              <div class="configured-stat">
                <span class="configured-label">Total inc VAT</span>
                <span class="configured-value">${formatCurrency(cost.total_inc_vat)}</span>
              </div>
              <div class="configured-stat">
                <span class="configured-label">Date Applied</span>
                <span class="configured-value">${escapeHtml(cost.date_applied || '-')}</span>
              </div>
            </div>
            <div class="configured-location-actions">
              <button type="button" class="btn btn-sm btn-outline-primary" onclick="startCapitalCostEdit(${costId})">Edit</button>
              <button type="button" class="btn btn-sm btn-danger" onclick="openCapitalCostDeleteModal(${costId})">Delete</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function buildCapitalCostPayload() {
  const useProjectStartDate = !!capitalCostUseProjectStartInput?.checked;
  const normalizedProjectStartDate = normalizeInputDate(projectStartDate);
  const selectedDate = normalizeInputDate(capitalCostDateAppliedInput?.value);

  return {
    title: String(capitalCostTitleInput?.value || '').trim(),
    description: String(capitalCostDescriptionInput?.value || '').trim(),
    cost_ex_vat: parseNumber(capitalCostCostExVatInput?.value),
    vat_rate: parseNumber(capitalCostVatRateSelect?.value),
    date_applied: useProjectStartDate
      ? (normalizedProjectStartDate || selectedDate)
      : selectedDate
  };
}

function validateCapitalCostPayload(payload) {
  if (!payload.title) return 'Title is required';
  if (payload.cost_ex_vat === null || Number.isNaN(payload.cost_ex_vat)) return 'Cost ex VAT must be a valid number';
  if (payload.cost_ex_vat < 0) return 'Cost ex VAT cannot be negative';
  if (payload.vat_rate === null || Number.isNaN(payload.vat_rate)) return 'VAT rate is required';
  if (payload.vat_rate < 0 || payload.vat_rate > 100) return 'VAT rate must be between 0 and 100';

  const availableVatRateKeys = new Set(
    availableVatRates
      .map((rate) => toRateKey(rate))
      .filter((rate) => rate !== null)
  );
  const vatRateKey = toRateKey(payload.vat_rate);
  if (vatRateKey === null || !availableVatRateKeys.has(vatRateKey)) {
    return 'VAT rate must match one of the configured VAT rates';
  }

  if (!payload.date_applied) return 'Date applied is required';
  return null;
}

async function saveCapitalCost() {
  const payload = buildCapitalCostPayload();
  const validationError = validateCapitalCostPayload(payload);
  if (validationError) {
    setCapitalCostsStatus(validationError, true);
    return;
  }

  try {
    const wasEditing = !!editingCapitalCostId;
    setCapitalCostsStatus('Saving...');
    const endpoint = editingCapitalCostId
      ? `/cashflow/capital-costs/${editingCapitalCostId}`
      : '/cashflow/capital-costs';
    const method = editingCapitalCostId ? 'PUT' : 'POST';
    const response = await api(endpoint, method, payload);
    const capitalCost = response?.capital_cost;

    if (!capitalCost) {
      throw new Error('Failed to save capital cost');
    }

    const costId = Number(capitalCost.id);

    const existingIndex = capitalCosts.findIndex((row) => Number(row.id) === Number(capitalCost.id));
    if (existingIndex >= 0) {
      capitalCosts[existingIndex] = capitalCost;
    } else {
      capitalCosts.push(capitalCost);
    }

    if (costId > 0) {
      expandedCapitalCostIds.add(costId);
    }

    renderCapitalCosts();
    closeCapitalCostModal();
    setCapitalCostsStatus(wasEditing ? 'Capital cost updated.' : 'Capital cost added.');
  } catch (error) {
    setCapitalCostsStatus(error.message || 'Failed to save capital cost', true);
  }
}

function startCapitalCostEdit(capitalCostId) {
  const selected = capitalCosts.find((row) => Number(row.id) === Number(capitalCostId));
  if (!selected) {
    setCapitalCostsStatus('Capital cost not found', true);
    return;
  }

  editingCapitalCostId = Number(selected.id);
  if (capitalCostTitleInput) capitalCostTitleInput.value = selected.title || '';
  if (capitalCostDescriptionInput) capitalCostDescriptionInput.value = selected.description || '';
  if (capitalCostCostExVatInput) capitalCostCostExVatInput.value = selected.cost_ex_vat ?? '';
  if (capitalCostDateAppliedInput) capitalCostDateAppliedInput.value = selected.date_applied || '';
  if (capitalCostUseProjectStartInput) capitalCostUseProjectStartInput.checked = false;

  renderCapitalVatRateOptions(selected.vat_rate);
  syncCapitalCostDateWithProjectStart();
  updateCapitalCostTotalField();

  if (capitalCostModalTitle) {
    capitalCostModalTitle.textContent = 'Edit Capital Cost';
  }
  if (capitalCostSaveBtn) {
    capitalCostSaveBtn.textContent = 'Update Capital Cost';
  }

  openCapitalCostModal();
  setCapitalCostsStatus('Editing capital cost.');
}

function closeCapitalCostDeleteModal() {
  deletingCapitalCostId = null;
  if (capitalCostDeleteModal) {
    capitalCostDeleteModal.style.display = 'none';
  }
  if (capitalCostDeleteTitle) {
    capitalCostDeleteTitle.textContent = 'this capital cost';
  }
}

function openCapitalCostDeleteModal(capitalCostId) {
  const selected = capitalCosts.find((row) => Number(row.id) === Number(capitalCostId));
  if (!selected) {
    setCapitalCostsStatus('Capital cost not found', true);
    return;
  }

  deletingCapitalCostId = Number(selected.id);
  if (capitalCostDeleteTitle) {
    capitalCostDeleteTitle.textContent = selected.title || 'this capital cost';
  }
  if (capitalCostDeleteModal) {
    capitalCostDeleteModal.style.display = 'flex';
  }
}

async function confirmCapitalCostDelete() {
  const capitalCostId = Number(deletingCapitalCostId);
  if (!Number.isInteger(capitalCostId) || capitalCostId <= 0) {
    closeCapitalCostDeleteModal();
    return;
  }

  try {
    await api(`/cashflow/capital-costs/${Number(capitalCostId)}`, 'DELETE');
    capitalCosts = capitalCosts.filter((row) => Number(row.id) !== Number(capitalCostId));
    expandedCapitalCostIds.delete(Number(capitalCostId));
    if (editingCapitalCostId && Number(editingCapitalCostId) === Number(capitalCostId)) {
      closeCapitalCostModal();
    }
    closeCapitalCostDeleteModal();
    renderCapitalCosts();
    setCapitalCostsStatus('Capital cost deleted.');
  } catch (error) {
    setCapitalCostsStatus(error.message || 'Failed to delete capital cost', true);
  }
}

window.toggleCapitalCost = toggleCapitalCost;
window.startCapitalCostEdit = startCapitalCostEdit;
window.openCapitalCostDeleteModal = openCapitalCostDeleteModal;

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

async function autoPopulateTemplateFromLocationType(locationId) {
  if (!locationId) return;
  
  try {
    const location = currentLocations.find(l => Number(l.location_id) === Number(locationId));
    if (!location) return;

    // If location has no type, user must manually select template
    if (!location.location_type || location.location_type.trim() === '') {
      if (wizardTemplateSelect) {
        wizardTemplateSelect.value = '';
        wizardTemplateSelect.focus();
        wizardTemplateSelect.classList.add('border-warning');
        setTimeout(() => wizardTemplateSelect.classList.remove('border-warning'), 2000);
      }
      return;
    }

    // Fetch template mapping for this location type
    const response = await fetch(`/cashflow/location-type-template/${encodeURIComponent(location.location_type)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      // No mapping found, user must manually select
      if (wizardTemplateSelect) {
        wizardTemplateSelect.value = '';
        wizardTemplateSelect.focus();
      }
      return;
    }

    const data = await response.json();
    if (data.template_key && wizardTemplateSelect) {
      wizardTemplateSelect.value = data.template_key;
      // Trigger template change logic
      updateCompletionDateField();
      updateWizardReview();
    }
  } catch (error) {
    console.warn('Could not auto-populate template:', error.message);
    if (wizardTemplateSelect) {
      wizardTemplateSelect.value = '';
    }
  }
}

function updateTemplateSelectorVisibility() {
  const selectedLocationId = Number(wizardLocationSelect?.value || 0);
  const templateSelectWrapper = document.getElementById('wizardTemplateSelectWrapper');
  
  if (!templateSelectWrapper) return;
  
  if (!selectedLocationId) {
    // No location selected, hide template selector
    templateSelectWrapper.style.display = 'none';
    return;
  }
  
  // Find the selected location
  const selectedLocation = currentLocations.find(l => Number(l.location_id) === selectedLocationId);
  
  if (!selectedLocation) {
    templateSelectWrapper.style.display = 'none';
    return;
  }
  
  // Show template selector only if location has no type
  const hasNoType = !selectedLocation.type || selectedLocation.type.trim() === '';
  templateSelectWrapper.style.display = hasNoType ? 'block' : 'none';
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
  if (wizardHouseHandoverDate) wizardHouseHandoverDate.value = '';
  if (wizardRemoveFeesPercentage) wizardRemoveFeesPercentage.value = '0';
  renderRemoveVatOptions();
  lastAutoHandoverDate = null;
  updateCalculatedIncomeField();
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
  renderRemoveVatOptions(config.remove_vat_rate);
  if (wizardRemoveFeesPercentage) {
    wizardRemoveFeesPercentage.value = config.remove_fees_percentage ?? 0;
  }
  if (wizardHouseHandoverDate) {
    wizardHouseHandoverDate.value = config.house_handover_date || deriveHouseHandoverDate(wizardCompletionDate.value) || '';
  }
  lastAutoHandoverDate = deriveHouseHandoverDate(wizardCompletionDate.value);
  updateCalculatedIncomeField();
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
  updateHouseHandoverDateField();
  updateCalculatedIncomeField();
}

function openWizardModal(isEdit = false, locationId = null) {
  if (isEdit) {
    renderSiteOptions();
    loadWizardFromConfigured(locationId);
    wizardSiteSelect.disabled = true;
    wizardLocationSelect.disabled = true;
  } else {
    editingLocationId = null;
    renderSiteOptions();
    renderLocationOptions();
    renderRemoveVatOptions();
    resetWizardForm();
    wizardSiteSelect.disabled = false;
    wizardLocationSelect.disabled = false;
  }

  wizardCurrentStep = 1;
  updateWizardStepUI();
  updateTemplateSelectorVisibility();

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
  wizardSiteSelect.disabled = false;
  wizardLocationSelect.disabled = false;
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
  if (!locationData.house_handover_date) {
    return 'House handover date is required';
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
  if (locationData.house_handover_date < locationData.completion_date) {
    return 'House handover date cannot be before completion date';
  }
  if (locationData.remove_fees_percentage !== null && (locationData.remove_fees_percentage < 0 || locationData.remove_fees_percentage > 100)) {
    return 'Prof. fees % must be between 0 and 100';
  }
  if (locationData.remove_vat_rate === null || Number.isNaN(locationData.remove_vat_rate)) {
    return 'VAT rate is required';
  }
  if (locationData.remove_vat_rate < 0 || locationData.remove_vat_rate > 100) {
    return 'VAT rate must be between 0 and 100';
  }

  return null;
}

function validateStep(step) {
  if (step !== 1) return null;

  if (!wizardSiteSelect.value) return 'Please select a site';
  if (!wizardLocationSelect.value) return 'Please select a location';
  if (!wizardTemplateSelect.value) return 'Please select a template';

  const estimatedCost = parseNumber(wizardEstimatedCost.value);
  if (estimatedCost === null || Number.isNaN(estimatedCost)) return 'Estimated construction cost is required';
  if (estimatedCost < 0) return 'Estimated construction cost cannot be negative';

  const sellingPrice = parseNumber(wizardSellingPrice.value);
  if (sellingPrice === null || Number.isNaN(sellingPrice)) return 'Location selling price is required';
  if (sellingPrice < 0) return 'Location selling price cannot be negative';

  const startOnSite = normalizeInputDate(wizardStartOnSiteDate.value);
  if (!startOnSite) return 'Start on site date is required';

  const completionDate = deriveCompletionDate(startOnSite, wizardTemplateSelect.value);
  if (!completionDate) return 'Completion date could not be calculated. Check template and start date';

  const handoverDate = normalizeInputDate(wizardHouseHandoverDate?.value) || deriveHouseHandoverDate(completionDate);
  if (!handoverDate) return 'House handover date is required';
  if (handoverDate < completionDate) return 'House handover date cannot be before completion date';

  const fees = parseNumber(wizardRemoveFeesPercentage?.value);
  if (fees !== null && Number.isNaN(fees)) return 'Prof. fees % must be a valid number';
  if (fees !== null && (fees < 0 || fees > 100)) return 'Prof. fees % must be between 0 and 100';

  const removeVat = parseNumber(wizardRemoveVatRate?.value);
  if (removeVat === null || Number.isNaN(removeVat)) return 'VAT rate is required';
  if (removeVat < 0 || removeVat > 100) return 'VAT rate must be between 0 and 100';

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

async function openTemplateDraftModal() {
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

async function startTemplateEdit(templateKey) {
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
  
  // Load assigned location types for this template
  try {
    const response = await api(`/cashflow/templates/${encodeURIComponent(templateKey)}/location-types`);
    const assignedTypes = response.location_types || [];
    renderTemplateTagSelector(assignedTypes);
  } catch (error) {
    // No mappings exist yet, render empty selector
    renderTemplateTagSelector([]);
  }
  
  await openTemplateDraftModal();
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
      const savedTemplateKey = response.template.key;
      const idx = cashflowTemplates.findIndex((entry) => entry.key === savedTemplateKey);
      if (idx >= 0) {
        cashflowTemplates[idx] = response.template;
      } else {
        cashflowTemplates.push(response.template);
      }
      cashflowTemplates.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true }));

      // Save location type assignments
      const selectedTypes = getSelectedTemplateLocationTypes();
      const locationTypesResponse = await api(`/cashflow/templates/${encodeURIComponent(savedTemplateKey)}/location-types`, 'PUT', {
        location_types: selectedTypes
      });

      renderTemplateOptions();
      renderTemplateAccordion();
      resetTemplateDraftForm();
      if (templateDraftModal) templateDraftModal.style.display = 'none';
      
      // Show feedback about updates
      const locationsUpdated = locationTypesResponse?.locations_updated || 0;
      if (isEdit && locationsUpdated > 0) {
        setStatus(`Template updated. ${locationsUpdated} location(s) in cashflow updated to use "${templateName}".`);
        // Reload settings to refresh configured locations table
        await loadSettings();
      } else {
        setStatus(isEdit ? 'Template updated successfully.' : 'Template created successfully.');
      }
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
  const sellingPriceValue = parseNumber(wizardSellingPrice.value);
  const removeFeesValue = parseNumber(wizardRemoveFeesPercentage?.value);
  const removeVatValue = parseNumber(wizardRemoveVatRate?.value);
  const normalizedSellingPrice = sellingPriceValue === null || Number.isNaN(sellingPriceValue) ? 0 : sellingPriceValue;
  const normalizedRemoveFees = removeFeesValue === null || Number.isNaN(removeFeesValue) ? 0 : removeFeesValue;
  const normalizedRemoveVat = removeVatValue === null || Number.isNaN(removeVatValue) ? 0 : removeVatValue;
  const incomeBreakdown = calculateIncomeBreakdown(normalizedSellingPrice, normalizedRemoveVat, normalizedRemoveFees);

  wizardReview.innerHTML = `
    <div><strong>Location:</strong> ${sourceLocation ? `${sourceLocation.site_name} — ${sourceLocation.location_name}` : '-'}</div>
    <div><strong>Template:</strong> ${templateNameByKey(wizardTemplateSelect.value) || '-'}</div>
    <div><strong>Est. Construction Cost:</strong> ${formatCurrency(parseNumber(wizardEstimatedCost.value) || 0)}</div>
    <div><strong>Location Selling Price:</strong> ${formatCurrency(normalizedSellingPrice)}</div>
    <div><strong>Start on Site Date:</strong> ${normalizeInputDate(wizardStartOnSiteDate.value) || '-'}</div>
    <div><strong>Completion Date:</strong> ${deriveCompletionDate(wizardStartOnSiteDate.value, wizardTemplateSelect.value) || '-'}</div>
    <div><strong>House Handover Date:</strong> ${(normalizeInputDate(wizardHouseHandoverDate?.value) || deriveHouseHandoverDate(deriveCompletionDate(wizardStartOnSiteDate.value, wizardTemplateSelect.value))) || '-'}</div>
    <div><strong>Prof. Fees %:</strong> ${normalizedRemoveFees}</div>
    <div><strong>VAT %:</strong> ${normalizedRemoveVat}</div>
    <div><strong>Calculated Income:</strong> ${formatCurrency(incomeBreakdown.calculatedIncome)}</div>
    <div><strong>Spend Timescale (Weeks):</strong> ${getDerivedTimescaleWeeks() ?? '-'}</div>
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

  if (wizardBackBtn) {
    wizardBackBtn.disabled = wizardCurrentStep === 1;
    wizardBackBtn.style.display = wizardTotalSteps > 1 ? 'inline-block' : 'none';
  }
  if (wizardNextBtn) {
    wizardNextBtn.style.display = wizardCurrentStep === wizardTotalSteps ? 'none' : 'inline-block';
  }
  if (wizardSaveLocationBtn) {
    wizardSaveLocationBtn.style.display = wizardCurrentStep === wizardTotalSteps ? 'inline-block' : 'none';
    wizardSaveLocationBtn.textContent = editingLocationId ? 'Update Location' : 'Add Location';
  }

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

  const completionDate = deriveCompletionDate(wizardStartOnSiteDate.value, wizardTemplateSelect.value);
  const houseHandoverDate = normalizeInputDate(wizardHouseHandoverDate?.value) || deriveHouseHandoverDate(completionDate);
  const removeFeesPercentage = parseNumber(wizardRemoveFeesPercentage?.value);
  const removeVatRate = parseNumber(wizardRemoveVatRate?.value);
  const incomeBreakdown = calculateIncomeBreakdown(
    parseNumber(wizardSellingPrice.value),
    removeVatRate === null || Number.isNaN(removeVatRate) ? 0 : removeVatRate,
    removeFeesPercentage === null || Number.isNaN(removeFeesPercentage) ? 0 : removeFeesPercentage
  );

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
    predicted_spend_percentage: null,
    spend_timescale_months: getDerivedTimescaleWeeks(),
    start_on_site_date: normalizeInputDate(wizardStartOnSiteDate.value),
    completion_date: completionDate,
    house_handover_date: houseHandoverDate,
    remove_fees_percentage: removeFeesPercentage === null ? 0 : removeFeesPercentage,
    remove_vat_rate: removeVatRate,
    selling_price: parseNumber(wizardSellingPrice.value),
    vat_amount: incomeBreakdown.vatAmount,
    fees_amount: incomeBreakdown.feesAmount,
    calculated_income: incomeBreakdown.calculatedIncome
  };
}

async function addOrUpdateWizardLocation() {
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
  const locationId = Number(locationData.location_id);
  const previousValue = configuredLocations.get(locationId);

  configuredLocations.set(locationId, locationData);
  renderConfiguredRows();

  try {
    await persistSettings(wasEditing ? 'Location updated in cashflow plan.' : 'Location added to cashflow plan.');
    closeWizardModal();
  } catch (_) {
    if (previousValue) {
      configuredLocations.set(locationId, previousValue);
    } else {
      configuredLocations.delete(locationId);
    }
    renderConfiguredRows();
  }
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
      const derivedHandoverDate = normalizeInputDate(configured.house_handover_date) || deriveHouseHandoverDate(derivedCompletionDate) || null;
      const removeFeesPercentage = configured.remove_fees_percentage === null || configured.remove_fees_percentage === undefined
        ? 0
        : Number(configured.remove_fees_percentage);
      const fallbackVatRate = Number(availableVatRates[0] ?? 0);
      const removeVatRateRaw = configured.remove_vat_rate === null || configured.remove_vat_rate === undefined || configured.remove_vat_rate === ''
        ? fallbackVatRate
        : Number(configured.remove_vat_rate);
      const removeVatRate = Number.isFinite(removeVatRateRaw) ? removeVatRateRaw : fallbackVatRate;

      return {
        location_id: location.location_id,
        include_in_cashflow: true,
        template_key: configured.template_key,
        weekly_spread: derivedSpread,
        estimated_construction_cost: configured.estimated_construction_cost,
        predicted_spend_percentage: null,
        spend_timescale_months: derivedTimescale,
        start_on_site_date: configured.start_on_site_date || null,
        completion_date: derivedCompletionDate,
        house_handover_date: derivedHandoverDate,
        remove_fees_percentage: removeFeesPercentage,
        remove_vat_rate: removeVatRate,
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
      house_handover_date: null,
      remove_fees_percentage: null,
      remove_vat_rate: null,
      selling_price: null
    };
  });

  return {
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

  const availableVatRateKeys = new Set(
    availableVatRates
      .map((rate) => toRateKey(rate))
      .filter((rate) => rate !== null)
  );

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
    if (Number.isNaN(location.remove_fees_percentage)) {
      return 'Prof. fees % must be a valid number';
    }
    if (location.remove_vat_rate === null || Number.isNaN(location.remove_vat_rate)) {
      return 'VAT rate is required for each included location';
    }
    if (!location.start_on_site_date) {
      return 'Start on site date is required for each included location';
    }
    if (!location.completion_date) {
      return 'Completion date is required for each included location';
    }
    if (!location.house_handover_date) {
      return 'House handover date is required for each included location';
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

    if (
      location.remove_fees_percentage !== null &&
      (location.remove_fees_percentage < 0 || location.remove_fees_percentage > 100)
    ) {
      return 'Prof. fees % must be between 0 and 100';
    }

    if (location.remove_vat_rate < 0 || location.remove_vat_rate > 100) {
      return 'VAT rate must be between 0 and 100';
    }

    const removeVatRateKey = toRateKey(location.remove_vat_rate);
    if (removeVatRateKey === null || !availableVatRateKeys.has(removeVatRateKey)) {
      return 'VAT rate must match one of the configured VAT rates';
    }

    if (location.completion_date < location.start_on_site_date) {
      return 'Completion date cannot be before start on site date';
    }

    if (location.house_handover_date < location.completion_date) {
      return 'House handover date cannot be before completion date';
    }
  }

  return null;
}

function deriveProjectStartDateFromPayloadLocations(locations) {
  if (!Array.isArray(locations)) return null;

  const startDates = locations
    .filter((location) => location?.include_in_cashflow)
    .map((location) => normalizeInputDate(location?.start_on_site_date))
    .filter((value) => !!value)
    .sort((a, b) => String(a).localeCompare(String(b)));

  return startDates[0] || null;
}

async function persistSettings(successMessage = 'Saved successfully.') {
  const payload = collectPayload();
  const validationError = validatePayload(payload);

  if (validationError) {
    setStatus(validationError, true);
    throw new Error(validationError);
  }

  setStatus('Saving...');
  try {
    await api('/cashflow/settings', 'PUT', payload);
    const derivedProjectStartDate = deriveProjectStartDateFromPayloadLocations(payload.locations);
    if (derivedProjectStartDate) {
      projectStartDate = derivedProjectStartDate;
      if (capitalCostUseProjectStartInput?.checked) {
        syncCapitalCostDateWithProjectStart();
      }
    }
    setStatus(successMessage);
  } catch (error) {
    setStatus(error.message || 'Failed to save cashflow settings', true);
    throw error;
  }
}

function queueAutoSaveOverall() {
  if (isLoadingSettings) return;

  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    try {
      await persistSettings('Overall settings saved.');
    } catch (_) {}
  }, 500);
}

async function loadSettings() {
  try {
    isLoadingSettings = true;
    setStatus('Loading...');
    const data = await api('/cashflow/settings');

    const vatRates = Array.isArray(data.vat_rates)
      ? data.vat_rates.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 100)
      : [];
    availableVatRates = vatRates.length ? vatRates : [0, 13.5, 23];
    projectStartDate = normalizeInputDate(data.overall_start_date) || null;
    capitalCosts = Array.isArray(data.capital_costs) ? data.capital_costs : [];
    expandedCapitalCostIds.clear();

    if (typeof window.loadCurrencySettings === 'function') {
      await window.loadCurrencySettings();
    }
    if (typeof window.applyCurrencySymbols === 'function') {
      await window.applyCurrencySymbols();
    }

    currentLocations = Array.isArray(data.locations) ? data.locations : [];
    cashflowTemplates = Array.isArray(data.templates) ? data.templates : [];
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
    renderCapitalCosts();
    resetCapitalCostForm();
    setCapitalCostsStatus('');
    renderSiteOptions();
    renderLocationOptions();
    resetWizardForm();
    await loadAvailableLocationTypes();
    setStatus('Changes save automatically.');
  } catch (error) {
    setStatus(error.message || 'Failed to load cashflow settings', true);
  } finally {
    isLoadingSettings = false;
  }
}

function editConfiguredLocation(locationId) {
  openWizardModal(true, locationId);
}

async function removeConfiguredLocation(locationId) {
  const id = Number(locationId);
  const previousValue = configuredLocations.get(id);

  configuredLocations.delete(id);
  expandedLocationIds.delete(id);
  renderConfiguredRows();
  if (editingLocationId && Number(editingLocationId) === id) {
    resetWizardForm();
  } else {
    renderLocationOptions();
  }

  try {
    await persistSettings('Location removed from cashflow plan.');
  } catch (_) {
    if (previousValue) {
      configuredLocations.set(id, previousValue);
      renderConfiguredRows();
      renderLocationOptions();
    }
  }
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
openTemplateDraftModalBtn?.addEventListener('click', async () => {
  resetTemplateDraftForm();
  
  // Ensure location types are loaded before rendering selector
  if (availableLocationTypes.length === 0) {
    await loadAvailableLocationTypes();
  }
  
  // Now render tag selector with the loaded types
  renderTemplateTagSelector([]);
  await openTemplateDraftModal();
});
closeTemplateDraftModalBtn?.addEventListener('click', closeTemplateDraftModal);
closeTemplateDraftCancelBtn?.addEventListener('click', closeTemplateDraftModal);
templateDraftAddRowBtn?.addEventListener('click', addTemplateDraftRow);
templateDraftSaveBtn?.addEventListener('click', saveTemplateDraft);
templateDraftCancelEditBtn?.addEventListener('click', () => {
  resetTemplateDraftForm();
  setStatus('Template edit cancelled.');
});
openCapitalCostModalBtn?.addEventListener('click', () => {
  resetCapitalCostForm();
  openCapitalCostModal();
});
closeCapitalCostModalBtn?.addEventListener('click', closeCapitalCostModal);
capitalCostModalCancelBtn?.addEventListener('click', closeCapitalCostModal);
capitalCostCostExVatInput?.addEventListener('input', updateCapitalCostTotalField);
capitalCostVatRateSelect?.addEventListener('change', updateCapitalCostTotalField);
capitalCostUseProjectStartInput?.addEventListener('change', syncCapitalCostDateWithProjectStart);
capitalCostSaveBtn?.addEventListener('click', saveCapitalCost);
closeCapitalCostDeleteModalBtn?.addEventListener('click', closeCapitalCostDeleteModal);
capitalCostDeleteCancelBtn?.addEventListener('click', closeCapitalCostDeleteModal);
capitalCostDeleteConfirmBtn?.addEventListener('click', confirmCapitalCostDelete);
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
wizardSellingPrice?.addEventListener('input', () => {
  updateCalculatedIncomeField();
  if (wizardCurrentStep === wizardTotalSteps) {
    updateWizardReview();
  }
});
wizardRemoveFeesPercentage?.addEventListener('input', () => {
  updateCalculatedIncomeField();
  if (wizardCurrentStep === wizardTotalSteps) {
    updateWizardReview();
  }
});
wizardRemoveVatRate?.addEventListener('change', () => {
  updateCalculatedIncomeField();
  if (wizardCurrentStep === wizardTotalSteps) {
    updateWizardReview();
  }
});
wizardHouseHandoverDate?.addEventListener('change', () => {
  if (wizardCurrentStep === wizardTotalSteps) {
    updateWizardReview();
  }
});
wizardSiteSelect?.addEventListener('change', () => {
  wizardLocationSelect.value = '';
  renderLocationOptions();
});

wizardLocationSelect?.addEventListener('change', () => {
  autoPopulateTemplateFromLocationType(wizardLocationSelect.value);
  updateTemplateSelectorVisibility();
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

capitalCostModal?.addEventListener('click', (event) => {
  if (event.target === capitalCostModal) {
    closeCapitalCostModal();
  }
});

capitalCostDeleteModal?.addEventListener('click', (event) => {
  if (event.target === capitalCostDeleteModal) {
    closeCapitalCostDeleteModal();
  }
});

setupForm?.addEventListener('submit', (event) => event.preventDefault());
overallStartValueInput?.addEventListener('input', queueAutoSaveOverall);
overallStartValueInput?.addEventListener('change', queueAutoSaveOverall);
loadSettings();
