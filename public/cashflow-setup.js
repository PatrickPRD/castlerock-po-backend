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
const templateDraftAddRowBtn = document.getElementById('templateDraftAddRowBtn');
const templateDraftRowsBody = document.getElementById('templateDraftRowsBody');
const templateDraftTotals = document.getElementById('templateDraftTotals');
const templateDraftRowsData = document.getElementById('templateDraftRowsData');
const templateDraftChart = document.getElementById('templateDraftChart');
const templateDraftStatus = document.getElementById('templateDraftStatus');
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
let editingTemplateKey = null;
const expandedTemplateKeys = new Set();
let templateDraftDragState = null;
let templateDraftReorderDragIndex = -1;
let isLoadingSettings = false;
let autoSaveTimer = null;
let availableVatRates = [0, 13.5, 23];
let lastAutoHandoverDate = null;
let capitalCosts = [];
let editingCapitalCostId = null;
let deletingCapitalCostId = null;
let deletingLocationId = null;
let projectStartDate = null;
const expandedCapitalCostIds = new Set();
let availableLocationTypes = [];
const deleteLocationModal = document.getElementById('deleteLocationModal');
const closeDeleteLocationModalBtn = document.getElementById('closeDeleteLocationModalBtn');
const deleteLocationCancelBtn = document.getElementById('deleteLocationCancelBtn');
const deleteLocationConfirmBtn = document.getElementById('deleteLocationConfirmBtn');
const deleteLocationName = document.getElementById('deleteLocationName');
const openBulkUploadModalBtn = document.getElementById('openBulkUploadModalBtn');
const bulkUploadModal = document.getElementById('bulkUploadModal');
const closeBulkUploadModalBtn = document.getElementById('closeBulkUploadModalBtn');

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
    const rawTypes = Array.isArray(locationTypesData)
      ? locationTypesData
      : Array.isArray(locationTypesData?.location_types)
        ? locationTypesData.location_types
        : [];

    availableLocationTypes = [...new Set(
      rawTypes
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0)
    )].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true }));
  } catch (error) {
    console.error('Error loading available location types:', error);
    availableLocationTypes = [];
  }
}

function renderTemplateTagSelector(selectedTypes = []) {
  const tagsContainer = document.getElementById('templateDraftTagsContainer');
  if (!tagsContainer) return;

  const input = document.getElementById('templateDraftTypeInput');
  const normalizedSelectedTypes = [...new Set(
    (Array.isArray(selectedTypes) ? selectedTypes : [])
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0)
  )];
  const selectedSet = new Set(normalizedSelectedTypes);

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
      ${escapeHtml(type)}
      <button type="button" class="btn-close btn-close-white" style="width: 1rem; height: 1rem;" aria-label="Remove ${escapeHtml(type)}"></button>
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

  input.oninput = (e) => {
    const query = e.target.value.trim().toLowerCase();
    
    if (!query) {
      suggestionsDiv.style.display = 'none';
      return;
    }
    
    // Filter available types (exclude already selected)
    const selectedLowerSet = new Set(Array.from(selectedSet).map((entry) => entry.toLowerCase()));
    const matches = availableLocationTypes.filter(type => 
      type.toLowerCase().includes(query) && !selectedLowerSet.has(type.toLowerCase())
    );
    
    if (matches.length === 0) {
      suggestionsDiv.style.display = 'none';
      return;
    }
    
    // Show suggestions
    suggestionsDiv.innerHTML = matches.map(type => `
      <div class="suggestion-item p-2 border-bottom" style="cursor: pointer;">
        ${escapeHtml(type)}
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
  };
  
  // Add on Enter key
  input.onkeydown = (e) => {
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
  };
  
  // Close suggestions on blur
  input.onblur = () => {
    setTimeout(() => suggestionsDiv.style.display = 'none', 150);
  };
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
  const hasNoType = !selectedLocation.location_type || selectedLocation.location_type.trim() === '';
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

function setTemplateDraftStatus(message, isError = false) {
  if (!templateDraftStatus) {
    setStatus(message, isError);
    return;
  }

  templateDraftStatus.textContent = message || '';
  templateDraftStatus.classList.toggle('text-danger', !!isError);
  templateDraftStatus.classList.toggle('text-muted', !isError);
}

function normalizeTemplateDraftRows(rows) {
  if (!Array.isArray(rows)) return [];

  const normalized = [];
  let nextSequentialWeek = 0;

  rows.forEach((row, index) => {
    const stage = String(row?.stage ?? row?.stageName ?? row?.stage_name ?? '').trim();
    const percent = parseNumber(row?.percent);
    const durationRaw = row?.durationWeeks ?? row?.duration_weeks ?? row?.weeks;
    const durationWeeks = parseNumber(durationRaw);
    const explicitWeekStart = row?.weekStart ?? row?.week_start;
    const parsedWeekStart = explicitWeekStart === '' || explicitWeekStart === null || explicitWeekStart === undefined
      ? nextSequentialWeek
      : parseNumber(explicitWeekStart);
    const parsedSortOrder = parseNumber(row?.sortOrder ?? row?.sort_order ?? index);

    if (!stage) return;
    if (percent === null || Number.isNaN(percent) || percent < 0 || percent > 100) return;
    if (parsedWeekStart === null || Number.isNaN(parsedWeekStart) || !Number.isInteger(parsedWeekStart) || parsedWeekStart < 0) return;
    if (durationWeeks === null || Number.isNaN(durationWeeks) || !Number.isInteger(durationWeeks) || durationWeeks <= 0) return;

    normalized.push({
      stage,
      percent: Number(percent.toFixed(2)),
      weekStart: parsedWeekStart,
      durationWeeks,
      sortOrder: parsedSortOrder === null || Number.isNaN(parsedSortOrder) ? index : parsedSortOrder
    });

    nextSequentialWeek = Math.max(nextSequentialWeek, parsedWeekStart + durationWeeks);
  });

  normalized.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    if (left.weekStart !== right.weekStart) return left.weekStart - right.weekStart;
    return String(left.stage).localeCompare(String(right.stage), undefined, { sensitivity: 'base', numeric: true });
  });

  return normalized.map((row, index) => ({
    ...row,
    sortOrder: index
  }));
}

function getTemplateDraftRows() {
  return [...document.querySelectorAll('#templateDraftRowsBody .programme-stage-row')];
}

function getTemplateDraftDurationWeeks(rows) {
  return rows.reduce((maxWeeks, row) => Math.max(maxWeeks, Number(row.weekStart) + Number(row.durationWeeks)), 0);
}

function getTemplateDraftPercentTotal(rows) {
  return Number(rows.reduce((sum, row) => sum + Number(row.percent || 0), 0).toFixed(2));
}

function getTemplateDraftSummaryLabel(rows) {
  if (!rows.length) return 'No programme set';
  const totalPercent = getTemplateDraftPercentTotal(rows);
  const totalWeeks = getTemplateDraftDurationWeeks(rows);
  return `${rows.length} stage${rows.length === 1 ? '' : 's'} / ${totalWeeks} week${totalWeeks === 1 ? '' : 's'} / ${totalPercent}%`;
}

function clearTemplateDraftDropIndicators() {
  document.querySelectorAll('.programme-stage-row, .programme-chart-stage-label').forEach((element) => {
    element.classList.remove('is-drop-before', 'is-drop-after');
    delete element.dataset.dropPosition;
  });
}

function setTemplateDraftDropIndicator(element, dropPosition) {
  if (!element) return;
  element.classList.remove('is-drop-before', 'is-drop-after');
  element.classList.add(dropPosition === 'after' ? 'is-drop-after' : 'is-drop-before');
  element.dataset.dropPosition = dropPosition;
}

function updateTemplateDraftRowFinish(row) {
  if (!row) return;
  const weekStartInput = row.querySelector('.js-template-week-start');
  const durationInput = row.querySelector('.js-template-duration');
  const finishLabel = row.querySelector('.js-template-finish');
  if (!weekStartInput || !durationInput || !finishLabel) return;

  const weekStart = parseNumber(weekStartInput.value);
  const durationWeeks = parseNumber(durationInput.value);
  if (
    weekStart === null ||
    Number.isNaN(weekStart) ||
    !Number.isInteger(weekStart) ||
    weekStart < 0 ||
    durationWeeks === null ||
    Number.isNaN(durationWeeks) ||
    !Number.isInteger(durationWeeks) ||
    durationWeeks <= 0
  ) {
    finishLabel.textContent = '—';
    return;
  }

  finishLabel.textContent = `W${weekStart} to W${weekStart + durationWeeks - 1}`;
}

function readTemplateDraftRows(strict = false) {
  const rows = getTemplateDraftRows();
  const parsedRows = [];
  const seenStageNames = new Set();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const stageInput = row.querySelector('.js-template-stage-name');
    const percentInput = row.querySelector('.js-template-percent');
    const weekStartInput = row.querySelector('.js-template-week-start');
    const durationInput = row.querySelector('.js-template-duration');

    const stage = String(stageInput?.value || '').trim();
    const percentRaw = String(percentInput?.value || '').trim();
    const weekStartRaw = String(weekStartInput?.value || '').trim();
    const durationRaw = String(durationInput?.value || '').trim();
    const isBlank = !stage && !percentRaw && !weekStartRaw && !durationRaw;

    if (isBlank) continue;

    const percent = parseNumber(percentRaw);
    const weekStart = parseNumber(weekStartRaw);
    const durationWeeks = parseNumber(durationRaw);

    const fail = (message, input) => {
      if (strict) {
        setTemplateDraftStatus(message, true);
        input?.focus();
        input?.select?.();
        return null;
      }
      return undefined;
    };

    if (!stage) {
      if (strict) return fail('Each stage needs a name.', stageInput);
      continue;
    }
    if (percent === null || Number.isNaN(percent) || percent < 0 || percent > 100) {
      if (strict) return fail(`Percent for "${stage}" must be between 0 and 100.`, percentInput);
      continue;
    }
    if (weekStart === null || Number.isNaN(weekStart) || !Number.isInteger(weekStart) || weekStart < 0) {
      if (strict) return fail(`Start week for "${stage}" must be a whole number from 0.`, weekStartInput);
      continue;
    }
    if (durationWeeks === null || Number.isNaN(durationWeeks) || !Number.isInteger(durationWeeks) || durationWeeks <= 0) {
      if (strict) return fail(`Duration for "${stage}" must be a positive whole number.`, durationInput);
      continue;
    }

    const duplicateKey = stage.toLowerCase();
    if (seenStageNames.has(duplicateKey)) {
      if (strict) return fail(`Stage names must be unique. Duplicate found: "${stage}".`, stageInput);
      continue;
    }
    seenStageNames.add(duplicateKey);

    parsedRows.push({
      stage,
      percent: Number(percent.toFixed(2)),
      weekStart,
      durationWeeks,
      sortOrder: parsedRows.length
    });
  }

  if (strict && !parsedRows.length) {
    setTemplateDraftStatus('Add at least one stage to the template.', true);
    return null;
  }

  return parsedRows;
}

function createTemplateDraftRow(stage = {}) {
  const row = document.createElement('tr');
  row.className = 'programme-stage-row';
  row.draggable = true;
  row.innerHTML = `
    <td class="programme-drag-cell text-center">
      <button type="button" class="btn btn-sm btn-light border js-template-row-drag-handle" aria-label="Reorder stage">⋮⋮</button>
    </td>
    <td>
      <input type="text" class="form-control form-control-sm js-template-stage-name" maxlength="120" placeholder="e.g. Sub-Structure" value="${escapeHtml(stage.stage || '')}" />
    </td>
    <td>
      <input type="number" class="form-control form-control-sm js-template-percent" min="0" max="100" step="0.01" value="${stage.percent ?? 0}" />
    </td>
    <td>
      <input type="number" class="form-control form-control-sm js-template-week-start" min="0" step="1" value="${stage.weekStart ?? 0}" />
    </td>
    <td>
      <input type="number" class="form-control form-control-sm js-template-duration" min="1" max="104" step="1" value="${stage.durationWeeks ?? 1}" />
    </td>
    <td>
      <span class="badge text-bg-light border js-template-finish">—</span>
    </td>
    <td>
      <button type="button" class="btn btn-sm btn-outline-danger js-remove-template-row">Remove</button>
    </td>
  `;

  row.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      updateTemplateDraftRowFinish(row);
      setTemplateDraftStatus('');
      renderTemplateDraftPreview();
    });
  });

  row.querySelector('.js-remove-template-row')?.addEventListener('click', () => {
    row.remove();
    if (!getTemplateDraftRows().length) {
      renderTemplateDraftRows([]);
      return;
    }
    renderTemplateDraftPreview();
  });

  row.addEventListener('dragstart', (event) => {
    templateDraftReorderDragIndex = getTemplateDraftRows().indexOf(row);
    row.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(templateDraftReorderDragIndex));
    }
  });

  row.addEventListener('dragover', (event) => {
    event.preventDefault();
    const rect = row.getBoundingClientRect();
    const dropPosition = event.clientY >= rect.top + (rect.height / 2) ? 'after' : 'before';
    setTemplateDraftDropIndicator(row, dropPosition);
  });

  row.addEventListener('dragleave', () => {
    row.classList.remove('is-drop-before', 'is-drop-after');
    delete row.dataset.dropPosition;
  });

  row.addEventListener('drop', (event) => {
    event.preventDefault();
    const targetIndex = getTemplateDraftRows().indexOf(row);
    reorderTemplateDraftRows(templateDraftReorderDragIndex, targetIndex, row.dataset.dropPosition || 'before');
  });

  row.addEventListener('dragend', () => {
    templateDraftReorderDragIndex = -1;
    clearTemplateDraftDropIndicators();
    row.classList.remove('is-dragging');
  });

  updateTemplateDraftRowFinish(row);
  return row;
}

function renderTemplateDraftRows(stages) {
  if (!templateDraftRowsBody) return;

  const normalizedStages = normalizeTemplateDraftRows(stages);
  templateDraftRowsBody.innerHTML = '';

  if (!normalizedStages.length) {
    templateDraftRowsBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-muted text-center py-3">Add a stage to start building this template.</td>
      </tr>
    `;
    renderTemplateDraftPreview();
    return;
  }

  normalizedStages.forEach((stage) => {
    templateDraftRowsBody.appendChild(createTemplateDraftRow(stage));
  });

  renderTemplateDraftPreview();
}

function resetTemplateDraftRows(stages) {
  renderTemplateDraftRows(stages || []);
}

function getDefaultTemplateDraftStage() {
  const stages = readTemplateDraftRows(false) || [];
  const totalWeeks = getTemplateDraftDurationWeeks(stages);
  return {
    stage: `Stage ${stages.length + 1}`,
    percent: 0,
    weekStart: totalWeeks,
    durationWeeks: 1,
    sortOrder: stages.length
  };
}

function reorderTemplateDraftRows(fromIndex, toIndex, dropPosition = 'before') {
  const rows = getTemplateDraftRows();
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= rows.length ||
    toIndex >= rows.length
  ) {
    clearTemplateDraftDropIndicators();
    return;
  }

  const movingRow = rows[fromIndex];
  const targetRow = rows[toIndex];
  if (!movingRow || !targetRow || movingRow === targetRow) {
    clearTemplateDraftDropIndicators();
    return;
  }

  const insertAfter = dropPosition === 'after';
  const referenceNode = insertAfter ? targetRow.nextSibling : targetRow;
  templateDraftRowsBody.insertBefore(movingRow, referenceNode);
  clearTemplateDraftDropIndicators();
  renderTemplateDraftPreview();
}

function enableTemplateDraftInlineRename(stageIndex) {
  const rows = getTemplateDraftRows();
  const row = rows[stageIndex];
  const stageInput = row?.querySelector('.js-template-stage-name');
  if (!stageInput) return;
  stageInput.focus();
  stageInput.select();
}

function buildTemplateDraftChartHtml(stages) {
  if (!Array.isArray(stages) || !stages.length) {
    return '<div class="programme-chart-empty-state">Add a stage to build the template timeline.</div>';
  }

  const totalWeeks = Math.max(getTemplateDraftDurationWeeks(stages), 1);
  const weekHeaders = Array.from({ length: totalWeeks }, (_, weekIndex) => `
    <div class="programme-chart-header">W${weekIndex}</div>
  `).join('');

  const stageRows = stages.map((stage, index) => {
    const finishWeek = stage.weekStart + stage.durationWeeks - 1;
    return `
      <div class="programme-chart-stage-label" data-stage-index="${index}">
        <button type="button" class="btn btn-sm btn-light border js-template-chart-reorder" data-stage-index="${index}" draggable="true" aria-label="Reorder stage">⋮⋮</button>
        <button type="button" class="programme-chart-stage-name js-template-stage-name-display" data-stage-index="${index}">${escapeHtml(stage.stage)}</button>
        <span class="badge rounded-pill text-bg-light border">${stage.percent}%</span>
        <button type="button" class="btn btn-sm btn-link text-danger text-decoration-none js-template-chart-delete" data-stage-index="${index}" aria-label="Remove ${escapeHtml(stage.stage)}">✕</button>
      </div>
      <div class="programme-chart-track" data-stage-index="${index}">
        <div class="programme-chart-bar programme-chart-bar-interactive js-template-chart-bar" data-stage-index="${index}" style="grid-column: ${stage.weekStart + 1} / span ${stage.durationWeeks};">
          <span>${escapeHtml(stage.stage)}</span>
          <small>${stage.percent}% · W${stage.weekStart} to W${finishWeek}</small>
          <span class="programme-chart-handle programme-chart-handle-start js-template-chart-handle-start" data-stage-index="${index}"></span>
          <span class="programme-chart-handle programme-chart-handle-end js-template-chart-handle-end" data-stage-index="${index}"></span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="programme-chart-grid" style="--programme-weeks: ${totalWeeks};">
      <div class="programme-chart-spacer"></div>
      ${weekHeaders}
      ${stageRows}
    </div>
  `;
}

function renderTemplateDraftPreview() {
  const stages = readTemplateDraftRows(false) || [];
  const totalPercent = getTemplateDraftPercentTotal(stages);
  const hasPercentError = stages.length > 0 && Math.abs(totalPercent - 100) > 0.05;

  if (templateDraftTotals) {
    templateDraftTotals.textContent = getTemplateDraftSummaryLabel(stages);
    templateDraftTotals.classList.toggle('text-danger', hasPercentError);
    templateDraftTotals.classList.toggle('text-muted', !hasPercentError);
  }

  if (templateDraftRowsData) {
    templateDraftRowsData.value = JSON.stringify(stages);
  }

  if (templateDraftChart) {
    templateDraftChart.innerHTML = buildTemplateDraftChartHtml(stages);
    templateDraftChart.classList.toggle('programme-chart-empty-state', !stages.length);
  }

  templateDraftChart?.querySelectorAll('.js-template-chart-delete').forEach((button) => {
    button.addEventListener('click', () => {
      const stageIndex = Number(button.dataset.stageIndex);
      const row = getTemplateDraftRows()[stageIndex];
      row?.remove();
      if (!getTemplateDraftRows().length) {
        renderTemplateDraftRows([]);
        return;
      }
      renderTemplateDraftPreview();
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-stage-name-display').forEach((button) => {
    button.addEventListener('click', () => {
      enableTemplateDraftInlineRename(Number(button.dataset.stageIndex));
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-chart-bar').forEach((barElement) => {
    barElement.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.programme-chart-handle')) return;
      startTemplateDraftDrag(event, 'move', Number(barElement.dataset.stageIndex), barElement);
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-chart-handle-start').forEach((handleElement) => {
    handleElement.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      startTemplateDraftDrag(event, 'resize-start', Number(handleElement.dataset.stageIndex), handleElement.closest('.js-template-chart-bar'));
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-chart-handle-end').forEach((handleElement) => {
    handleElement.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      startTemplateDraftDrag(event, 'resize-end', Number(handleElement.dataset.stageIndex), handleElement.closest('.js-template-chart-bar'));
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-chart-reorder').forEach((handleElement) => {
    const labelElement = handleElement.closest('.programme-chart-stage-label');
    handleElement.addEventListener('dragstart', (event) => {
      templateDraftReorderDragIndex = Number(handleElement.dataset.stageIndex);
      labelElement?.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(templateDraftReorderDragIndex));
      }
    });
    handleElement.addEventListener('dragend', () => {
      templateDraftReorderDragIndex = -1;
      clearTemplateDraftDropIndicators();
      labelElement?.classList.remove('is-dragging');
    });
  });

  templateDraftChart?.querySelectorAll('.programme-chart-stage-label').forEach((labelElement) => {
    labelElement.addEventListener('dragover', (event) => {
      event.preventDefault();
      const rect = labelElement.getBoundingClientRect();
      const dropPosition = event.clientY >= rect.top + (rect.height / 2) ? 'after' : 'before';
      setTemplateDraftDropIndicator(labelElement, dropPosition);
    });
    labelElement.addEventListener('dragleave', () => {
      labelElement.classList.remove('is-drop-before', 'is-drop-after');
      delete labelElement.dataset.dropPosition;
    });
    labelElement.addEventListener('drop', (event) => {
      event.preventDefault();
      reorderTemplateDraftRows(templateDraftReorderDragIndex, Number(labelElement.dataset.stageIndex), labelElement.dataset.dropPosition || 'before');
    });
  });

  if (stages.length && hasPercentError) {
    setTemplateDraftStatus('Stage percentages must total 100% before you can save.', true);
  } else if (!templateDraftStatus?.classList.contains('text-danger')) {
    setTemplateDraftStatus('');
  }
}

function startTemplateDraftDrag(event, type, stageIndex, barElement) {
  const stages = readTemplateDraftRows(false) || [];
  const stage = stages[stageIndex];
  const trackElement = barElement?.closest('.programme-chart-track');
  if (!stage || !trackElement) return;

  const totalWeeks = Math.max(getTemplateDraftDurationWeeks(stages), stage.weekStart + stage.durationWeeks + 8, 1);
  const pointerWeek = getTemplateDraftWeekFromPointer(trackElement, event.clientX, totalWeeks);

  templateDraftDragState = {
    type,
    stageIndex,
    totalWeeks,
    trackElement,
    initialWeekStart: stage.weekStart,
    initialDurationWeeks: stage.durationWeeks,
    pointerOffsetWeeks: Math.max(0, pointerWeek - stage.weekStart)
  };

  document.body.classList.add('programme-chart-dragging');
  event.preventDefault();
}

function getTemplateDraftWeekFromPointer(trackElement, clientX, totalWeeks) {
  const rect = trackElement.getBoundingClientRect();
  if (rect.width <= 0 || totalWeeks <= 0) return 0;
  const cellWidth = rect.width / totalWeeks;
  const rawWeek = Math.floor((clientX - rect.left) / cellWidth);
  return Math.max(0, Math.min(totalWeeks - 1, rawWeek));
}

function syncTemplateDraftRowFromDrag(stageIndex, nextWeekStart, nextDurationWeeks) {
  const row = getTemplateDraftRows()[stageIndex];
  if (!row) return;

  const weekStartInput = row.querySelector('.js-template-week-start');
  const durationInput = row.querySelector('.js-template-duration');
  if (!weekStartInput || !durationInput) return;

  weekStartInput.value = String(nextWeekStart);
  durationInput.value = String(nextDurationWeeks);
  updateTemplateDraftRowFinish(row);
  renderTemplateDraftPreview();

  if (templateDraftDragState) {
    templateDraftDragState.trackElement = templateDraftChart?.querySelector(`.programme-chart-track[data-stage-index="${stageIndex}"]`) || null;
  }
}

function handleTemplateDraftPointerMove(event) {
  if (!templateDraftDragState || !templateDraftDragState.trackElement) return;

  const hoveredWeek = getTemplateDraftWeekFromPointer(
    templateDraftDragState.trackElement,
    event.clientX,
    templateDraftDragState.totalWeeks
  );

  const initialEndWeek = templateDraftDragState.initialWeekStart + templateDraftDragState.initialDurationWeeks - 1;
  let nextWeekStart = templateDraftDragState.initialWeekStart;
  let nextDurationWeeks = templateDraftDragState.initialDurationWeeks;

  if (templateDraftDragState.type === 'move') {
    const maxStart = Math.max(0, templateDraftDragState.totalWeeks - templateDraftDragState.initialDurationWeeks);
    nextWeekStart = Math.max(0, Math.min(maxStart, hoveredWeek - templateDraftDragState.pointerOffsetWeeks));
  } else if (templateDraftDragState.type === 'resize-end') {
    nextDurationWeeks = Math.max(1, (hoveredWeek - templateDraftDragState.initialWeekStart) + 1);
  } else if (templateDraftDragState.type === 'resize-start') {
    nextWeekStart = Math.max(0, Math.min(hoveredWeek, initialEndWeek));
    nextDurationWeeks = Math.max(1, (initialEndWeek - nextWeekStart) + 1);
  }

  syncTemplateDraftRowFromDrag(templateDraftDragState.stageIndex, nextWeekStart, nextDurationWeeks);
}

function stopTemplateDraftPointerDrag() {
  if (!templateDraftDragState) return;
  templateDraftDragState = null;
  document.body.classList.remove('programme-chart-dragging');
}

function resetTemplateDraftForm() {
  editingTemplateKey = null;
  if (templateDraftName) templateDraftName.value = '';
  setTemplateDraftMode(false);
  setTemplateDraftStatus('');
  resetTemplateDraftRows([]);
}

async function openTemplateDraftModal() {
  if (templateDraftModal) {
    templateDraftModal.style.display = 'flex';
  }
  templateDraftName?.focus();
}

function closeTemplateDraftModal() {
  if (templateDraftModal) {
    templateDraftModal.style.display = 'none';
  }
  stopTemplateDraftPointerDrag();
  resetTemplateDraftForm();
}

function buildTemplateAccordionGanttHtml(stages) {
  if (!Array.isArray(stages) || !stages.length) {
    return '<div class="programme-chart-empty-state">No stages available for this template.</div>';
  }

  const totalWeeks = Math.max(getTemplateDraftDurationWeeks(stages), 1);
  const weekHeaders = Array.from({ length: totalWeeks }, (_, weekIndex) => `
    <div class="programme-chart-header">W${weekIndex}</div>
  `).join('');

  const rowsHtml = stages.map((stage) => `
    <div class="programme-chart-stage-label">
      <span class="fw-semibold text-truncate">${escapeHtml(stage.stage)}</span>
      <span class="badge rounded-pill text-bg-light border">${stage.percent}%</span>
    </div>
    <div class="programme-chart-track">
      <div class="programme-chart-bar" style="grid-column: ${stage.weekStart + 1} / span ${stage.durationWeeks};">
        <span>${stage.durationWeeks}</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="programme-chart programme-chart-readonly">
      <div class="programme-chart-grid" style="--programme-weeks: ${totalWeeks};">
        <div class="programme-chart-spacer"></div>
        ${weekHeaders}
        ${rowsHtml}
      </div>
    </div>
  `;
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
      const normalizedRows = normalizeTemplateDraftRows(template.rows || []);
      const percentTotal = getTemplateDraftPercentTotal(normalizedRows);
      const isExpanded = expandedTemplateKeys.has(template.key);
      const ganttHtml = buildTemplateAccordionGanttHtml(normalizedRows);

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
              <button type="button" class="btn btn-sm btn-outline-success" onclick="duplicateTemplate('${template.key}')">Duplicate</button>
              <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteTemplate('${template.key}')">Delete</button>
            </div>
          </td>
        </tr>
        <tr style="display:${isExpanded ? 'table-row' : 'none'};">
          <td colspan="5">
            <div class="p-2 border rounded bg-white">
              <div class="fw-semibold mb-2">Template Gantt</div>
              ${ganttHtml}
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function addTemplateDraftRow() {
  const existingRows = getTemplateDraftRows();
  if (existingRows.length === 1) {
    const stageInput = existingRows[0].querySelector('.js-template-stage-name');
    const percentInput = existingRows[0].querySelector('.js-template-percent');
    const weekStartInput = existingRows[0].querySelector('.js-template-week-start');
    const durationInput = existingRows[0].querySelector('.js-template-duration');
    if (
      stageInput &&
      percentInput &&
      weekStartInput &&
      durationInput &&
      !String(stageInput.value || '').trim() &&
      !String(percentInput.value || '').trim() &&
      !String(weekStartInput.value || '').trim() &&
      !String(durationInput.value || '').trim()
    ) {
      const defaultStage = getDefaultTemplateDraftStage();
      stageInput.value = defaultStage.stage;
      percentInput.value = String(defaultStage.percent);
      weekStartInput.value = String(defaultStage.weekStart);
      durationInput.value = String(defaultStage.durationWeeks);
      updateTemplateDraftRowFinish(existingRows[0]);
      renderTemplateDraftPreview();
      stageInput.focus();
      stageInput.select();
      return;
    }
  }

  if (!templateDraftRowsBody) return;
  if (templateDraftRowsBody.querySelector('td[colspan="7"]')) {
    templateDraftRowsBody.innerHTML = '';
  }

  const row = createTemplateDraftRow(getDefaultTemplateDraftStage());
  templateDraftRowsBody.appendChild(row);
  renderTemplateDraftPreview();
  row.querySelector('.js-template-stage-name')?.focus();
  row.querySelector('.js-template-stage-name')?.select();
}

async function startTemplateEdit(templateKey) {
  const targetUrl = `/cashflow-template-builder.html?mode=edit&template=${encodeURIComponent(templateKey)}`;
  window.location.href = targetUrl;
}

async function duplicateTemplate(templateKey) {
  const targetUrl = `/cashflow-template-builder.html?mode=duplicate&template=${encodeURIComponent(templateKey)}`;
  window.location.href = targetUrl;
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
    setTemplateDraftStatus('Template name is required.', true);
    templateDraftName?.focus();
    return;
  }

  const templateRows = readTemplateDraftRows(true);
  if (!templateRows) {
    return;
  }

  if (!templateRows.length) {
    setTemplateDraftStatus('Add at least one stage to the template.', true);
    return;
  }

  const totalPercent = getTemplateDraftPercentTotal(templateRows);
  if (Math.abs(totalPercent - 100) > 0.05) {
    setTemplateDraftStatus('Template rows must total 100%.', true);
    return;
  }

  const totalWeeks = getTemplateDraftDurationWeeks(templateRows);
  if (!Number.isInteger(totalWeeks) || totalWeeks <= 0 || totalWeeks > 104) {
    setTemplateDraftStatus('The full template programme must finish between week 1 and week 104.', true);
    return;
  }

  const payload = {
    name: templateName,
    rows: templateRows.map((row) => ({
      stage: row.stage,
      percent: Number(row.percent),
      weeks: Number(row.durationWeeks),
      week_start: Number(row.weekStart),
      duration_weeks: Number(row.durationWeeks),
      sort_order: Number(row.sortOrder)
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
    setTemplateDraftStatus(error.message || 'Failed to save template.', true);
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

window.startTemplateEdit = startTemplateEdit;
window.duplicateTemplate = duplicateTemplate;
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

function openDeleteLocationModal(locationId) {
  const id = Number(locationId);
  const location = configuredLocations.get(id);
  if (!location) {
    setStatus('Location not found', true);
    return;
  }

  deletingLocationId = id;
  if (deleteLocationName) {
    deleteLocationName.textContent = `${location.site_name} — ${location.location_name}`;
  }
  if (deleteLocationModal) {
    deleteLocationModal.style.display = 'flex';
  }
}

function closeDeleteLocationModal() {
  deletingLocationId = null;
  if (deleteLocationModal) {
    deleteLocationModal.style.display = 'none';
  }
  if (deleteLocationName) {
    deleteLocationName.textContent = 'this location';
  }
}

async function confirmDeleteLocation() {
  const id = Number(deletingLocationId);
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
    closeDeleteLocationModal();
  } catch (_) {
    if (previousValue) {
      configuredLocations.set(id, previousValue);
      renderConfiguredRows();
      renderLocationOptions();
    }
  }
}

async function removeConfiguredLocation(locationId) {
  openDeleteLocationModal(locationId);
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
  window.location.href = '/cashflow-template-builder.html';
});
closeTemplateDraftModalBtn?.addEventListener('click', closeTemplateDraftModal);
closeTemplateDraftCancelBtn?.addEventListener('click', closeTemplateDraftModal);
templateDraftAddRowBtn?.addEventListener('click', addTemplateDraftRow);
templateDraftSaveBtn?.addEventListener('click', saveTemplateDraft);
document.addEventListener('pointermove', handleTemplateDraftPointerMove);
document.addEventListener('pointerup', stopTemplateDraftPointerDrag);
document.addEventListener('pointercancel', stopTemplateDraftPointerDrag);
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
closeDeleteLocationModalBtn?.addEventListener('click', closeDeleteLocationModal);
deleteLocationCancelBtn?.addEventListener('click', closeDeleteLocationModal);
deleteLocationConfirmBtn?.addEventListener('click', confirmDeleteLocation);
openBulkUploadModalBtn?.addEventListener('click', () => {
  if (bulkUploadModal) {
    bulkUploadModal.style.display = 'flex';
  }

  // Default to Locations tab and refresh available options each time modal opens.
  const locationsTabTrigger = document.querySelector('#bulkUploadTabs .nav-link[data-tab="locations"]');
  bulkUploadTabs?.forEach((tab) => tab.classList.remove('active'));
  locationsTabTrigger?.classList.add('active');
  if (locationsTab) locationsTab.style.display = 'block';
  if (templatesTab) templatesTab.style.display = 'none';

  Promise.resolve(refreshLocationTypeTemplateMap()).finally(() => {
    resetBulkLocationSelectionForm();
  });
});
closeBulkUploadModalBtn?.addEventListener('click', () => {
  if (bulkUploadModal) {
    bulkUploadModal.style.display = 'none';
  }
  resetBulkLocationSelectionForm();
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

/* ======================================================
   BULK UPLOAD FUNCTIONALITY
   ====================================================== */

const bulkUploadTabs = document.querySelectorAll('#bulkUploadTabs .nav-link');
const locationsTab = document.getElementById('locationsTab');
const templatesTab = document.getElementById('templatesTab');
const templatesFileInput = document.getElementById('templatesFileInput');
const bulkUploadLocationsBtn = document.getElementById('bulkUploadLocationsBtn');
const bulkUploadTemplatesBtn = document.getElementById('bulkUploadTemplatesBtn');
const templatesPreview = document.getElementById('templatesPreview');
const locationsStatus = document.getElementById('locationsStatus');
const templatesStatus = document.getElementById('templatesStatus');
const downloadTemplateTemplate = document.getElementById('downloadTemplateTemplate');
const bulkUploadLocationsCancel = document.getElementById('bulkUploadLocationsCancel');
const bulkUploadTemplatesCancel = document.getElementById('bulkUploadTemplatesCancel');
const bulkLocationSiteFilter = document.getElementById('bulkLocationSiteFilter');
const bulkLocationStartDate = document.getElementById('bulkLocationStartDate');
const bulkLocationEstimatedCost = document.getElementById('bulkLocationEstimatedCost');
const bulkLocationSellingPrice = document.getElementById('bulkLocationSellingPrice');
const bulkLocationSelectAllBtn = document.getElementById('bulkLocationSelectAllBtn');
const bulkLocationList = document.getElementById('bulkLocationList');

const bulkSelectedLocationIds = new Set();
const locationTypeTemplateMap = new Map();

async function refreshLocationTypeTemplateMap() {
  const response = await api('/cashflow/location-type-templates');
  locationTypeTemplateMap.clear();

  const rows = Array.isArray(response) ? response : [];
  rows.forEach((entry) => {
    const templateKey = String(entry?.template_key || '').trim();
    const locationTypes = Array.isArray(entry?.location_types) ? entry.location_types : [];
    if (!templateKey) return;

    locationTypes.forEach((value) => {
      const typeKey = String(value || '').trim().toLowerCase();
      if (!typeKey) return;
      locationTypeTemplateMap.set(typeKey, templateKey);
    });
  });
}

function getBulkAddAvailableLocations() {
  return currentLocations
    .filter((location) => !configuredLocations.has(Number(location.location_id)))
    .sort((a, b) => {
      const siteSort = String(a.site_name || '').localeCompare(String(b.site_name || ''), undefined, { sensitivity: 'base', numeric: true });
      if (siteSort !== 0) return siteSort;
      return String(a.location_name || '').localeCompare(String(b.location_name || ''), undefined, { sensitivity: 'base', numeric: true });
    });
}

function updateBulkLocationActionState() {
  if (!bulkUploadLocationsBtn) return;
  const hasSelection = bulkSelectedLocationIds.size > 0;
  const hasStartDate = !!normalizeInputDate(bulkLocationStartDate?.value);
  bulkUploadLocationsBtn.disabled = !(hasSelection && hasStartDate);
}

function renderBulkLocationSiteFilterOptions() {
  if (!bulkLocationSiteFilter) return;

  const selectedBefore = bulkLocationSiteFilter.value;
  const available = getBulkAddAvailableLocations();
  const siteMap = new Map();
  available.forEach((location) => {
    const siteId = Number(location.site_id);
    if (!siteMap.has(siteId)) {
      siteMap.set(siteId, String(location.site_name || ''));
    }
  });

  const siteRows = [...siteMap.entries()].sort((a, b) =>
    String(a[1] || '').localeCompare(String(b[1] || ''), undefined, { sensitivity: 'base', numeric: true })
  );

  bulkLocationSiteFilter.innerHTML = '<option value="">All sites</option>';
  siteRows.forEach(([siteId, siteName]) => {
    const option = document.createElement('option');
    option.value = String(siteId);
    option.textContent = siteName || `Site ${siteId}`;
    bulkLocationSiteFilter.appendChild(option);
  });

  if (selectedBefore && [...bulkLocationSiteFilter.options].some((o) => o.value === selectedBefore)) {
    bulkLocationSiteFilter.value = selectedBefore;
  }
}

function renderBulkLocationList() {
  if (!bulkLocationList) return;

  const selectedSiteId = Number(bulkLocationSiteFilter?.value || 0);
  const available = getBulkAddAvailableLocations().filter((location) => {
    if (!selectedSiteId) return true;
    return Number(location.site_id) === selectedSiteId;
  });

  // Remove stale selected ids after filtering/refresh.
  [...bulkSelectedLocationIds].forEach((locationId) => {
    if (!getBulkAddAvailableLocations().some((entry) => Number(entry.location_id) === Number(locationId))) {
      bulkSelectedLocationIds.delete(locationId);
    }
  });

  if (!available.length) {
    bulkLocationList.innerHTML = '<div class="text-muted small">No available locations for this filter.</div>';
    updateBulkLocationActionState();
    return;
  }

  bulkLocationList.innerHTML = available.map((location) => {
    const locationId = Number(location.location_id);
    const checked = bulkSelectedLocationIds.has(locationId) ? 'checked' : '';
    return `
      <label class="d-flex align-items-start gap-2 py-1 px-1 border-bottom bulk-location-row">
        <input type="checkbox" class="form-check-input mt-1 bulk-location-checkbox" data-location-id="${locationId}" ${checked}>
        <span>
          <strong>${escapeHtml(location.location_name)}</strong>
          <span class="text-muted d-block small">${escapeHtml(location.site_name || '')}${location.location_type ? ` | ${escapeHtml(location.location_type)}` : ''}</span>
        </span>
      </label>
    `;
  }).join('');

  bulkLocationList.querySelectorAll('.bulk-location-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const locationId = Number(event.target.getAttribute('data-location-id'));
      if (event.target.checked) {
        bulkSelectedLocationIds.add(locationId);
      } else {
        bulkSelectedLocationIds.delete(locationId);
      }
      if (locationsStatus) {
        locationsStatus.textContent = `${bulkSelectedLocationIds.size} location${bulkSelectedLocationIds.size === 1 ? '' : 's'} selected`;
        locationsStatus.classList.remove('text-danger');
        locationsStatus.classList.add('text-muted');
      }
      updateBulkLocationActionState();
    });
  });

  updateBulkLocationActionState();
}

function resetBulkLocationSelectionForm() {
  bulkSelectedLocationIds.clear();
  if (bulkLocationSiteFilter) bulkLocationSiteFilter.value = '';
  if (bulkLocationEstimatedCost) bulkLocationEstimatedCost.value = '0';
  if (bulkLocationSellingPrice) bulkLocationSellingPrice.value = '0';
  if (bulkLocationStartDate) {
    const fallbackDate = normalizeInputDate(projectStartDate) || new Date().toISOString().slice(0, 10);
    bulkLocationStartDate.value = fallbackDate;
  }
  if (locationsStatus) {
    locationsStatus.textContent = '';
    locationsStatus.classList.remove('text-success', 'text-danger');
    locationsStatus.classList.add('text-muted');
  }

  renderBulkLocationSiteFilterOptions();
  renderBulkLocationList();
}

// Tab switching
bulkUploadTabs?.forEach(tab => {
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    const targetTab = tab.dataset.tab;
    
    // Update active tab
    bulkUploadTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Show/hide tab content
    if (locationsTab && templatesTab) {
      locationsTab.style.display = targetTab === 'locations' ? 'block' : 'none';
      templatesTab.style.display = targetTab === 'templates' ? 'block' : 'none';
    }
  });
});

// Download template template
downloadTemplateTemplate?.addEventListener('click', async () => {
  try {
    const response = await fetch('/cashflow/bulk-import/templates/template', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to download template');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'templates_template.xlsx';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    if (templatesStatus) {
      templatesStatus.textContent = 'Failed to download template';
      templatesStatus.classList.add('text-danger');
    }
  }
});

bulkLocationSiteFilter?.addEventListener('change', () => {
  renderBulkLocationList();
});

bulkLocationStartDate?.addEventListener('change', () => {
  updateBulkLocationActionState();
});

bulkLocationSelectAllBtn?.addEventListener('click', () => {
  const selectedSiteId = Number(bulkLocationSiteFilter?.value || 0);
  const visible = getBulkAddAvailableLocations().filter((location) => {
    if (!selectedSiteId) return true;
    return Number(location.site_id) === selectedSiteId;
  });

  visible.forEach((location) => {
    bulkSelectedLocationIds.add(Number(location.location_id));
  });

  renderBulkLocationList();
  if (locationsStatus) {
    locationsStatus.textContent = `${bulkSelectedLocationIds.size} location${bulkSelectedLocationIds.size === 1 ? '' : 's'} selected`;
    locationsStatus.classList.remove('text-danger');
    locationsStatus.classList.add('text-muted');
  }
});

// Template file input handler
templatesFileInput?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) {
    if (bulkUploadTemplatesBtn) bulkUploadTemplatesBtn.disabled = true;
    if (templatesPreview) templatesPreview.innerHTML = '';
    if (templatesStatus) {
      templatesStatus.textContent = '';
      templatesStatus.classList.remove('text-danger', 'text-success');
    }
    return;
  }
  
  if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
    if (templatesStatus) {
      templatesStatus.textContent = 'Please select an Excel file (.xlsx or .xls)';
      templatesStatus.classList.add('text-danger');
      templatesStatus.classList.remove('text-success');
    }
    if (bulkUploadTemplatesBtn) bulkUploadTemplatesBtn.disabled = true;
    return;
  }
  
  if (bulkUploadTemplatesBtn) bulkUploadTemplatesBtn.disabled = false;
  if (templatesPreview) {
    templatesPreview.innerHTML = `
      <div class="alert alert-info mb-0">
        <div><strong>File selected:</strong> ${escapeHtml(file.name)}</div>
        <small class="d-block mt-1">Expected columns: Template Name, Stage, Percent, Start Week, Duration Weeks. Legacy uploads with Weeks are also accepted.</small>
      </div>
    `;
  }
  if (templatesStatus) {
    templatesStatus.textContent = 'Ready to upload';
    templatesStatus.classList.remove('text-danger');
    templatesStatus.classList.add('text-success');
  }
});

// Upload locations
bulkUploadLocationsBtn?.addEventListener('click', async () => {
  const selectedIds = [...bulkSelectedLocationIds];
  const startOnSiteDate = normalizeInputDate(bulkLocationStartDate?.value);
  const estimatedConstructionCost = parseNumber(bulkLocationEstimatedCost?.value);
  const sellingPrice = parseNumber(bulkLocationSellingPrice?.value);

  if (!selectedIds.length) {
    if (locationsStatus) {
      locationsStatus.textContent = 'Select at least one location.';
      locationsStatus.classList.remove('text-muted', 'text-success');
      locationsStatus.classList.add('text-danger');
    }
    return;
  }

  if (!startOnSiteDate) {
    if (locationsStatus) {
      locationsStatus.textContent = 'Start on site date is required.';
      locationsStatus.classList.remove('text-muted', 'text-success');
      locationsStatus.classList.add('text-danger');
    }
    return;
  }

  const defaultVatRate = Number(availableVatRates?.[0] ?? 0);
  const defaultEstimatedCost = estimatedConstructionCost === null || Number.isNaN(estimatedConstructionCost) ? 0 : estimatedConstructionCost;
  const defaultSellingPrice = sellingPrice === null || Number.isNaN(sellingPrice) ? 0 : sellingPrice;

  if (locationsStatus) {
    locationsStatus.textContent = 'Adding selected locations...';
    locationsStatus.classList.remove('text-danger', 'text-success');
    locationsStatus.classList.add('text-muted');
  }
  if (bulkUploadLocationsBtn) bulkUploadLocationsBtn.disabled = true;

  const previousConfigured = new Map(configuredLocations);
  const previousExpanded = new Set(expandedLocationIds);

  try {
    await refreshLocationTypeTemplateMap();

    const selectedLocations = selectedIds
      .map((locationId) => currentLocations.find((row) => Number(row.location_id) === Number(locationId)))
      .filter(Boolean);

    const missingMappings = selectedLocations
      .filter((location) => {
        const locationTypeKey = String(location.location_type || '').trim().toLowerCase();
        return !locationTypeKey || !locationTypeTemplateMap.has(locationTypeKey);
      })
      .map((location) => `${location.site_name} - ${location.location_name}`);

    if (missingMappings.length) {
      throw new Error(`Missing template mapping for location type on: ${missingMappings.slice(0, 6).join(', ')}${missingMappings.length > 6 ? '...' : ''}`);
    }

    selectedIds.forEach((locationId) => {
      const sourceLocation = currentLocations.find((row) => Number(row.location_id) === Number(locationId));
      if (!sourceLocation) return;

      const locationTypeKey = String(sourceLocation.location_type || '').trim().toLowerCase();
      const templateKey = locationTypeTemplateMap.get(locationTypeKey);
      if (!templateKey) return;

      const completionDate = deriveCompletionDate(startOnSiteDate, templateKey);
      if (!completionDate) return;

      const derivedTimescaleWeeks = getDerivedTimescaleWeeks(templateKey);
      const weeklySpread = getTemplateDefaultSpread(templateKey);
      const handoverDate = deriveHouseHandoverDate(completionDate) || completionDate;

      const income = calculateIncomeBreakdown(defaultSellingPrice, defaultVatRate, 0);
      configuredLocations.set(Number(sourceLocation.location_id), {
        location_id: sourceLocation.location_id,
        location_name: sourceLocation.location_name,
        location_type: sourceLocation.location_type || null,
        site_id: sourceLocation.site_id,
        site_name: sourceLocation.site_name,
        include_in_cashflow: true,
        template_key: templateKey,
        template_name: templateNameByKey(templateKey),
        weekly_spread: weeklySpread,
        estimated_construction_cost: defaultEstimatedCost,
        predicted_spend_percentage: null,
        spend_timescale_months: derivedTimescaleWeeks,
        start_on_site_date: startOnSiteDate,
        completion_date: completionDate,
        house_handover_date: handoverDate,
        remove_fees_percentage: 0,
        remove_vat_rate: defaultVatRate,
        selling_price: defaultSellingPrice,
        vat_amount: income.vatAmount,
        fees_amount: income.feesAmount,
        calculated_income: income.calculatedIncome
      });
      expandedLocationIds.add(Number(sourceLocation.location_id));
    });

    renderConfiguredRows();
    renderLocationOptions();
    await persistSettings(`${selectedIds.length} location${selectedIds.length === 1 ? '' : 's'} added to cashflow plan.`);

    if (locationsStatus) {
      locationsStatus.textContent = `${selectedIds.length} location${selectedIds.length === 1 ? '' : 's'} added successfully.`;
      locationsStatus.classList.remove('text-danger', 'text-muted');
      locationsStatus.classList.add('text-success');
    }

    setTimeout(() => {
      if (bulkUploadModal) bulkUploadModal.style.display = 'none';
      resetBulkLocationSelectionForm();
    }, 1000);
  } catch (error) {
    configuredLocations.clear();
    previousConfigured.forEach((value, key) => configuredLocations.set(key, value));
    expandedLocationIds.clear();
    previousExpanded.forEach((value) => expandedLocationIds.add(value));
    renderConfiguredRows();
    renderLocationOptions();

    if (locationsStatus) {
      locationsStatus.textContent = error.message || 'Failed to add selected locations.';
      locationsStatus.classList.remove('text-success', 'text-muted');
      locationsStatus.classList.add('text-danger');
    }
    updateBulkLocationActionState();
  }
});

// Upload templates
bulkUploadTemplatesBtn?.addEventListener('click', async () => {
  const file = templatesFileInput?.files[0];
  if (!file) return;
  
  const formData = new FormData();
  formData.append('file', file);
  
  if (templatesStatus) {
    templatesStatus.textContent = 'Uploading...';
    templatesStatus.classList.remove('text-danger', 'text-success');
    templatesStatus.classList.add('text-muted');
  }
  if (bulkUploadTemplatesBtn) bulkUploadTemplatesBtn.disabled = true;
  
  try {
    const response = await fetch('/cashflow/bulk-import/templates', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    
    if (templatesStatus) {
      templatesStatus.textContent = data.message || 'Upload successful';
      templatesStatus.classList.remove('text-danger', 'text-muted');
      templatesStatus.classList.add('text-success');
    }
    if (templatesPreview) {
      templatesPreview.innerHTML = `
        <div class="alert alert-success">
          <strong>Success!</strong> ${data.message}<br>
          <small>Inserted: ${data.inserted} | Skipped: ${data.skipped}</small>
        </div>
      `;
    }
    
    // Reset form and reload data
    if (templatesFileInput) templatesFileInput.value = '';
    if (bulkUploadTemplatesBtn) bulkUploadTemplatesBtn.disabled = true;
    await loadSettings();
    renderTemplateOptions();
    renderTemplateAccordion();
    
    // Close modal after a delay
    setTimeout(() => {
      if (bulkUploadModal) bulkUploadModal.style.display = 'none';
      if (templatesPreview) templatesPreview.innerHTML = '';
      if (templatesStatus) {
        templatesStatus.textContent = '';
        templatesStatus.classList.remove('text-success', 'text-danger');
      }
    }, 2000);
  } catch (error) {
    if (templatesStatus) {
      templatesStatus.textContent = error.message || 'Upload failed';
      templatesStatus.classList.remove('text-success', 'text-muted');
      templatesStatus.classList.add('text-danger');
    }
    if (templatesPreview) {
      templatesPreview.innerHTML = `<div class="alert alert-danger">${error.message || 'Upload failed'}</div>`;
    }
    if (bulkUploadTemplatesBtn) bulkUploadTemplatesBtn.disabled = false;
  }
});

// Cancel buttons
bulkUploadLocationsCancel?.addEventListener('click', () => {
  if (bulkUploadModal) bulkUploadModal.style.display = 'none';
  resetBulkLocationSelectionForm();
});

bulkUploadTemplatesCancel?.addEventListener('click', () => {
  if (bulkUploadModal) bulkUploadModal.style.display = 'none';
  if (templatesFileInput) templatesFileInput.value = '';
  if (bulkUploadTemplatesBtn) bulkUploadTemplatesBtn.disabled = true;
  if (templatesPreview) templatesPreview.innerHTML = '';
  if (templatesStatus) {
    templatesStatus.textContent = '';
    templatesStatus.classList.remove('text-success', 'text-danger');
  }
});

// Close bulk upload modal on backdrop click
bulkUploadModal?.addEventListener('click', (event) => {
  if (event.target === bulkUploadModal) {
    bulkUploadModal.style.display = 'none';
  }
});

// Close delete location modal on backdrop click
deleteLocationModal?.addEventListener('click', (event) => {
  if (event.target === deleteLocationModal) {
    closeDeleteLocationModal();
  }
});

loadSettings();
