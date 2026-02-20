(() => {
if (window.__applicationSettingsPageInitialized) return;
window.__applicationSettingsPageInitialized = true;

const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const brandingForm = document.getElementById('brandingForm');
const headerColorInput = document.getElementById('headerColor');
const headerColorHexInput = document.getElementById('headerColorHex');
const logoModeSelect = document.getElementById('logoMode');
const logoFileInput = document.getElementById('logoFile');
const faviconFileInput = document.getElementById('faviconFile');
const favicon16FileInput = document.getElementById('favicon16File');
const appleTouchIconFileInput = document.getElementById('appleTouchIconFile');
const androidChrome192FileInput = document.getElementById('androidChrome192File');
const androidChrome512FileInput = document.getElementById('androidChrome512File');
const logoTextInput = document.getElementById('logoText');
const logoImageSection = document.getElementById('logoImageSection');
const logoTextSection = document.getElementById('logoTextSection');
const resetBtn = document.getElementById('resetBtn');

const companyDetailsForm = document.getElementById('companyDetailsForm');
const companyNameInput = document.getElementById('companyName');
const companyTradingNameInput = document.getElementById('companyTradingName');
const companyEmailInput = document.getElementById('companyEmail');
const companyPhoneInput = document.getElementById('companyPhone');
const companyAddressInput = document.getElementById('companyAddress');
const companyVatNumberInput = document.getElementById('companyVatNumber');
const companyCroNumberInput = document.getElementById('companyCroNumber');
const currentCompanyName = document.getElementById('currentCompanyName');
const currentCompanyTradingName = document.getElementById('currentCompanyTradingName');
const currentCompanyEmail = document.getElementById('currentCompanyEmail');
const currentCompanyPhone = document.getElementById('currentCompanyPhone');
const currentCompanyAddress = document.getElementById('currentCompanyAddress');
const currentCompanyVatNumber = document.getElementById('currentCompanyVatNumber');
const currentCompanyCroNumber = document.getElementById('currentCompanyCroNumber');
const companyResetBtn = document.getElementById('companyResetBtn');
const financialForm = document.getElementById('financialForm');
const currencyCodeSelect = document.getElementById('currencyCode');
const sickDaysPerYearInput = document.getElementById('sickDaysPerYear');
const annualLeaveDaysPerYearInput = document.getElementById('annualLeaveDaysPerYear');
const bankHolidaysPerYearInput = document.getElementById('bankHolidaysPerYear');
const leaveYearStartDateInput = document.getElementById('leaveYearStartDate');
const vatInput = document.getElementById('vatInput');
const vatAddBtn = document.getElementById('vatAddBtn');
const vatList = document.getElementById('vatList');
const financialResetBtn = document.getElementById('financialResetBtn');
const systemSettingsForm = document.getElementById('systemSettingsForm');
const auditLogRetentionInput = document.getElementById('auditLogRetention');
const systemResetBtn = document.getElementById('systemResetBtn');

const brandPreviewBar = document.getElementById('brandPreviewBar');
const brandPreviewImage = document.getElementById('brandPreviewImage');
const brandPreviewText = document.getElementById('brandPreviewText');

let currentLogoPath = '/assets/Logo.png';
let selectedFileDataUrl = null;
let selectedFaviconDataUrl = null;
let selectedFavicon16DataUrl = null;
let selectedAppleTouchIconDataUrl = null;
let selectedAndroidChrome192DataUrl = null;
let selectedAndroidChrome512DataUrl = null;
let financialVatRates = [];
let vatUsage = {};
const BRANDING_EVENT_KEY = 'headerBrandingVersion';
const BRANDING_CHANNEL_NAME = 'application-settings-updates';

function applyLiveHeaderBranding({ headerColor, logoMode, logoText, logoPath }) {
  const nav = document.getElementById('mainHeaderNav');
  const liveLogoImage = document.getElementById('headerBrandImage');
  const liveLogoText = document.getElementById('headerBrandText');

  if (nav && isHexColor(headerColor || '')) {
    nav.classList.remove('bg-dark');
    nav.style.backgroundColor = headerColor;
  }

  if (!liveLogoImage || !liveLogoText) return;

  if (logoMode === 'text') {
    liveLogoImage.style.display = 'none';
    liveLogoText.style.display = 'inline';
    liveLogoText.textContent = logoText || 'Castlerock Homes';
  } else {
    liveLogoText.style.display = 'none';
    liveLogoImage.style.display = 'inline-block';
    liveLogoImage.src = logoPath || '/assets/Logo.png';
  }
}

function notifyBrandingUpdated() {
  const payload = { ts: Date.now() };
  localStorage.setItem(BRANDING_EVENT_KEY, String(payload.ts));

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(BRANDING_CHANNEL_NAME);
    channel.postMessage(payload);
    channel.close();
  }
}

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
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

function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function toggleLogoSections() {
  const isTextMode = logoModeSelect.value === 'text';
  logoImageSection.style.display = isTextMode ? 'none' : 'block';
  logoTextSection.style.display = isTextMode ? 'block' : 'none';
}

function applyPreview() {
  const color = isHexColor(headerColorHexInput.value) ? headerColorHexInput.value : '#212529';
  const mode = logoModeSelect.value;
  const logoText = (logoTextInput.value || 'Castlerock Homes').trim() || 'Castlerock Homes';

  brandPreviewBar.style.backgroundColor = color;

  if (mode === 'text') {
    brandPreviewImage.style.display = 'none';
    brandPreviewText.style.display = 'inline';
    brandPreviewText.textContent = logoText;
  } else {
    brandPreviewText.style.display = 'none';
    brandPreviewImage.style.display = 'inline-block';
    brandPreviewImage.src = selectedFileDataUrl || currentLogoPath || '/assets/Logo.png';
  }
}

function syncColorInputs(fromHexInput = false) {
  const source = fromHexInput ? headerColorHexInput : headerColorInput;
  const target = fromHexInput ? headerColorInput : headerColorHexInput;

  if (isHexColor(source.value)) {
    target.value = source.value.toUpperCase();
  }
  applyPreview();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function formatLeaveYearStart(value) {
  const parts = String(value || '').split('-');
  if (parts.length !== 2) return '';
  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  const year = new Date().getFullYear();
  return `${year}-${month}-${day}`;
}

function parseLeaveYearStart(value) {
  if (!value) return null;
  const parts = String(value).split('-');
  if (parts.length !== 3) return null;
  return `${parts[1]}-${parts[2]}`;
}

async function loadBrandingSettings() {
  const settings = await api('/settings/branding');

  headerColorInput.value = settings.header_color || '#212529';
  headerColorHexInput.value = (settings.header_color || '#212529').toUpperCase();
  logoModeSelect.value = settings.header_logo_mode || 'image';
  logoTextInput.value = settings.header_logo_text || 'Castlerock Homes';

  currentLogoPath = settings.logo_path || '/assets/Logo.png';
  selectedFileDataUrl = null;
  logoFileInput.value = '';

  toggleLogoSections();
  applyPreview();
  applyLiveHeaderBranding({
    headerColor: settings.header_color || '#212529',
    logoMode: settings.header_logo_mode || 'image',
    logoText: settings.header_logo_text || 'Castlerock Homes',
    logoPath: currentLogoPath
  });
}

async function loadCompanyDetails() {
  const settings = await api('/settings');

  if (companyNameInput) companyNameInput.value = settings.company_name || '';
  if (companyTradingNameInput) companyTradingNameInput.value = settings.company_trading_name || '';
  if (companyEmailInput) companyEmailInput.value = settings.company_email || '';
  if (companyPhoneInput) companyPhoneInput.value = settings.company_phone || '';
  if (companyAddressInput) companyAddressInput.value = settings.company_address || '';
  if (companyVatNumberInput) companyVatNumberInput.value = settings.company_vat_number || '';
  if (companyCroNumberInput) companyCroNumberInput.value = settings.company_cro_number || '';

  if (currentCompanyName) currentCompanyName.textContent = settings.company_name || '-';
  if (currentCompanyTradingName) currentCompanyTradingName.textContent = settings.company_trading_name || '-';
  if (currentCompanyEmail) currentCompanyEmail.textContent = settings.company_email || '-';
  if (currentCompanyPhone) currentCompanyPhone.textContent = settings.company_phone || '-';
  if (currentCompanyAddress) currentCompanyAddress.textContent = settings.company_address || '-';
  if (currentCompanyVatNumber) currentCompanyVatNumber.textContent = settings.company_vat_number || '-';
  if (currentCompanyCroNumber) currentCompanyCroNumber.textContent = settings.company_cro_number || '-';
}

async function loadFinancialSettings() {
  const settings = await api('/settings/financial');
  financialVatRates = Array.isArray(settings.vat_rates) ? settings.vat_rates.map(Number) : [];
  vatUsage = settings.usage || {};
  if (currencyCodeSelect) {
    currencyCodeSelect.value = (settings.currency_code || 'EUR').toUpperCase();
  }
  if (sickDaysPerYearInput) {
    sickDaysPerYearInput.value = Number.isFinite(Number(settings.sick_days_per_year))
      ? Number(settings.sick_days_per_year)
      : 0;
  }
  if (annualLeaveDaysPerYearInput) {
    annualLeaveDaysPerYearInput.value = Number.isFinite(Number(settings.annual_leave_days_per_year))
      ? Number(settings.annual_leave_days_per_year)
      : 0;
  }
  if (bankHolidaysPerYearInput) {
    bankHolidaysPerYearInput.value = Number.isFinite(Number(settings.bank_holidays_per_year))
      ? Number(settings.bank_holidays_per_year)
      : 0;
  }
  if (leaveYearStartDateInput) {
    leaveYearStartDateInput.value = formatLeaveYearStart(settings.leave_year_start || '01-01');
  }
  renderVatList();
}

async function loadSystemSettings() {
  const settings = await api('/settings/system');
  if (auditLogRetentionInput) {
    auditLogRetentionInput.value = Number.isFinite(Number(settings.audit_log_retention))
      ? Number(settings.audit_log_retention)
      : 300;
  }
}

function renderVatList() {
  if (!vatList) return;
  vatList.innerHTML = '';
  const rates = [...financialVatRates].sort((a, b) => a - b);

  rates.forEach(rate => {
    const percent = Number(rate);
    const usageCount = vatUsage && vatUsage[String(Number(percent.toFixed(3)))] || 0;
    const disabled = usageCount > 0;

    const row = document.createElement('div');
    row.className = 'd-flex align-items-center justify-content-between border rounded px-3 py-2';
    row.innerHTML = `
      <div>
        <strong>${percent}%</strong>
        ${usageCount ? `<span class="badge bg-secondary ms-2">${usageCount} in use</span>` : ''}
      </div>
      <button type="button" class="btn btn-outline-danger btn-sm" ${disabled ? 'disabled' : ''} data-rate="${percent}">Delete</button>
    `;

    const btn = row.querySelector('button');
    btn.addEventListener('click', () => handleDeleteVat(percent));

    vatList.appendChild(row);
  });
}

function handleAddVat() {
  const value = Number(vatInput?.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    showToast('Enter a VAT rate between 0 and 100', 'warning');
    return;
  }
  const rounded = Number(value.toFixed(3));
  if (financialVatRates.some(r => Number(r.toFixed(3)) === rounded)) {
    showToast('VAT rate already exists', 'info');
    return;
  }
  financialVatRates.push(rounded);
  vatInput.value = '';
  renderVatList();
}

async function saveFinancialSettings() {
  const payload = {
    currencyCode: currencyCodeSelect?.value || 'EUR',
    vatRates: financialVatRates,
    sickDaysPerYear: Number(sickDaysPerYearInput?.value || 0),
    annualLeaveDaysPerYear: Number(annualLeaveDaysPerYearInput?.value || 0),
    bankHolidaysPerYear: Number(bankHolidaysPerYearInput?.value || 0),
    leaveYearStart: parseLeaveYearStart(leaveYearStartDateInput?.value) || '01-01'
  };
  const res = await api('/settings/financial', 'PUT', payload);
  financialVatRates = res.vat_rates || financialVatRates;
  showToast('Financial settings updated', 'success');
  await loadFinancialSettings();
  if (window.clearCurrencyCache) {
    window.clearCurrencyCache();
  }
  if (window.applyCurrencySymbols) {
    await window.applyCurrencySymbols();
  }
}

async function saveSystemSettings() {
  const payload = {
    auditLogRetention: Number(auditLogRetentionInput?.value || 300)
  };
  await api('/settings/system', 'PUT', payload);
  showToast('System settings updated', 'success');
  await loadSystemSettings();
}

async function handleDeleteVat(rate) {
  financialVatRates = financialVatRates.filter(r => Number(r.toFixed(3)) !== Number(rate.toFixed(3)));
  try {
    await saveFinancialSettings();
  } catch (err) {
    if (!financialVatRates.some(r => Number(r.toFixed(3)) === Number(rate.toFixed(3)))) {
      financialVatRates.push(rate);
      financialVatRates.sort((a, b) => a - b);
    }
    showToast(err.message || 'Cannot delete VAT rate in use', 'error');
    await loadFinancialSettings();
  }
}

brandingForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const headerColor = headerColorHexInput.value.toUpperCase();
  const logoMode = logoModeSelect.value;
  const logoText = logoTextInput.value.trim();

  if (!isHexColor(headerColor)) {
    return showToast('Please enter a valid color in #RRGGBB format', 'warning');
  }

  if (logoMode === 'text' && !logoText) {
    return showToast('Header text is required when using Text mode', 'warning');
  }

  try {
    await api('/settings/branding', 'PUT', {
      headerColor,
      logoMode,
      logoText
    });

    if (logoMode === 'image' && selectedFileDataUrl) {
      const upload = await api('/settings/branding/logo', 'POST', {
        dataUrl: selectedFileDataUrl,
        fileName: logoFileInput.files[0]?.name || 'header-logo'
      });
      currentLogoPath = upload.logo_path || currentLogoPath;
      selectedFileDataUrl = null;
      logoFileInput.value = '';
    }

    if (selectedFaviconDataUrl) {
      await api('/settings/branding/favicon', 'POST', {
        dataUrl: selectedFaviconDataUrl,
        fileName: faviconFileInput.files[0]?.name || 'favicon'
      });
      selectedFaviconDataUrl = null;
      faviconFileInput.value = '';
    }

    if (selectedFavicon16DataUrl) {
      await api('/settings/branding/icon', 'POST', {
        dataUrl: selectedFavicon16DataUrl,
        iconType: 'favicon-16'
      });
      selectedFavicon16DataUrl = null;
      favicon16FileInput.value = '';
    }

    if (selectedAppleTouchIconDataUrl) {
      await api('/settings/branding/icon', 'POST', {
        dataUrl: selectedAppleTouchIconDataUrl,
        iconType: 'apple-touch-icon'
      });
      selectedAppleTouchIconDataUrl = null;
      appleTouchIconFileInput.value = '';
    }

    if (selectedAndroidChrome192DataUrl) {
      await api('/settings/branding/icon', 'POST', {
        dataUrl: selectedAndroidChrome192DataUrl,
        iconType: 'android-chrome-192'
      });
      selectedAndroidChrome192DataUrl = null;
      androidChrome192FileInput.value = '';
    }

    if (selectedAndroidChrome512DataUrl) {
      await api('/settings/branding/icon', 'POST', {
        dataUrl: selectedAndroidChrome512DataUrl,
        iconType: 'android-chrome-512'
      });
      selectedAndroidChrome512DataUrl = null;
      androidChrome512FileInput.value = '';
    }

    applyPreview();
    applyLiveHeaderBranding({
      headerColor,
      logoMode,
      logoText: logoText || 'Castlerock Homes',
      logoPath: currentLogoPath
    });
    notifyBrandingUpdated();
    showToast('Header branding updated successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to update branding', 'error');
  }
});

if (companyDetailsForm) {
  companyDetailsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      await api('/settings/bulk', 'POST', {
        company_name: (companyNameInput?.value || '').trim(),
        company_trading_name: (companyTradingNameInput?.value || '').trim(),
        company_email: (companyEmailInput?.value || '').trim(),
        company_phone: (companyPhoneInput?.value || '').trim(),
        company_address: (companyAddressInput?.value || '').trim(),
        company_vat_number: (companyVatNumberInput?.value || '').trim(),
        company_cro_number: (companyCroNumberInput?.value || '').trim()
      });
      await loadCompanyDetails();
      showToast('Company details updated successfully', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update company details', 'error');
    }
  });
}

if (companyResetBtn) {
  companyResetBtn.addEventListener('click', () => {
    loadCompanyDetails().catch((err) => {
      showToast(err.message || 'Failed to load company details', 'error');
    });
  });
}

if (vatAddBtn) {
  vatAddBtn.addEventListener('click', handleAddVat);
}

if (financialForm) {
  financialForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await saveFinancialSettings();
    } catch (err) {
      showToast(err.message || 'Failed to update financial settings', 'error');
    }
  });
}

if (financialResetBtn) {
  financialResetBtn.addEventListener('click', () => {
    loadFinancialSettings().catch((err) => {
      showToast(err.message || 'Failed to load financial settings', 'error');
    });
  });
}

if (systemSettingsForm) {
  systemSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await saveSystemSettings();
    } catch (err) {
      showToast(err.message || 'Failed to update system settings', 'error');
    }
  });
}

if (systemResetBtn) {
  systemResetBtn.addEventListener('click', () => {
    loadSystemSettings().catch((err) => {
      showToast(err.message || 'Failed to load system settings', 'error');
    });
  });
}

logoModeSelect.addEventListener('change', () => {
  toggleLogoSections();
  applyPreview();
});

logoTextInput.addEventListener('input', applyPreview);

headerColorInput.addEventListener('input', () => syncColorInputs(false));
headerColorHexInput.addEventListener('input', () => syncColorInputs(true));
headerColorHexInput.addEventListener('blur', () => {
  if (!isHexColor(headerColorHexInput.value)) {
    headerColorHexInput.value = '#212529';
    headerColorInput.value = '#212529';
  }
  applyPreview();
});

logoFileInput.addEventListener('change', async () => {
  const file = logoFileInput.files[0];
  if (!file) {
    selectedFileDataUrl = null;
    applyPreview();
    return;
  }

  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    logoFileInput.value = '';
    selectedFileDataUrl = null;
    showToast('Invalid file type. Use PNG, JPG, WEBP, or SVG', 'warning');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    logoFileInput.value = '';
    selectedFileDataUrl = null;
    showToast('Image too large. Max size is 2 MB', 'warning');
    return;
  }

  try {
    selectedFileDataUrl = await readFileAsDataUrl(file);
    applyPreview();
  } catch (err) {
    selectedFileDataUrl = null;
    showToast(err.message || 'Failed to read image', 'error');
  }
});

faviconFileInput.addEventListener('change', async () => {
  const file = faviconFileInput.files[0];
  if (!file) {
    selectedFaviconDataUrl = null;
    return;
  }

  const allowedTypes = ['image/x-icon', 'image/png', 'image/svg+xml', 'image/vnd.microsoft.icon'];
  if (!allowedTypes.includes(file.type)) {
    faviconFileInput.value = '';
    selectedFaviconDataUrl = null;
    showToast('Invalid file type. Use ICO, PNG, or SVG', 'warning');
    return;
  }

  if (file.size > 500 * 1024) {
    faviconFileInput.value = '';
    selectedFaviconDataUrl = null;
    showToast('Favicon too large. Max size is 500 KB', 'warning');
    return;
  }

  try {
    selectedFaviconDataUrl = await readFileAsDataUrl(file);
    showToast('Favicon selected. Click Save Branding to apply', 'success');
  } catch (err) {
    selectedFaviconDataUrl = null;
    showToast(err.message || 'Failed to read favicon', 'error');
  }
});

favicon16FileInput.addEventListener('change', async () => {
  const file = favicon16FileInput.files[0];
  if (!file) {
    selectedFavicon16DataUrl = null;
    return;
  }

  if (!['image/png'].includes(file.type)) {
    favicon16FileInput.value = '';
    selectedFavicon16DataUrl = null;
    showToast('Invalid file type. Use PNG', 'warning');
    return;
  }

  if (file.size > 500 * 1024) {
    favicon16FileInput.value = '';
    selectedFavicon16DataUrl = null;
    showToast('Icon too large. Max size is 500 KB', 'warning');
    return;
  }

  try {
    selectedFavicon16DataUrl = await readFileAsDataUrl(file);
    showToast('Favicon 16x16 selected. Click Save Branding to apply', 'success');
  } catch (err) {
    selectedFavicon16DataUrl = null;
    showToast(err.message || 'Failed to read icon', 'error');
  }
});

appleTouchIconFileInput.addEventListener('change', async () => {
  const file = appleTouchIconFileInput.files[0];
  if (!file) {
    selectedAppleTouchIconDataUrl = null;
    return;
  }

  if (!['image/png'].includes(file.type)) {
    appleTouchIconFileInput.value = '';
    selectedAppleTouchIconDataUrl = null;
    showToast('Invalid file type. Use PNG', 'warning');
    return;
  }

  if (file.size > 500 * 1024) {
    appleTouchIconFileInput.value = '';
    selectedAppleTouchIconDataUrl = null;
    showToast('Icon too large. Max size is 500 KB', 'warning');
    return;
  }

  try {
    selectedAppleTouchIconDataUrl = await readFileAsDataUrl(file);
    showToast('Apple Touch Icon selected. Click Save Branding to apply', 'success');
  } catch (err) {
    selectedAppleTouchIconDataUrl = null;
    showToast(err.message || 'Failed to read icon', 'error');
  }
});

androidChrome192FileInput.addEventListener('change', async () => {
  const file = androidChrome192FileInput.files[0];
  if (!file) {
    selectedAndroidChrome192DataUrl = null;
    return;
  }

  if (!['image/png'].includes(file.type)) {
    androidChrome192FileInput.value = '';
    selectedAndroidChrome192DataUrl = null;
    showToast('Invalid file type. Use PNG', 'warning');
    return;
  }

  if (file.size > 500 * 1024) {
    androidChrome192FileInput.value = '';
    selectedAndroidChrome192DataUrl = null;
    showToast('Icon too large. Max size is 500 KB', 'warning');
    return;
  }

  try {
    selectedAndroidChrome192DataUrl = await readFileAsDataUrl(file);
    showToast('Android Chrome 192 selected. Click Save Branding to apply', 'success');
  } catch (err) {
    selectedAndroidChrome192DataUrl = null;
    showToast(err.message || 'Failed to read icon', 'error');
  }
});

androidChrome512FileInput.addEventListener('change', async () => {
  const file = androidChrome512FileInput.files[0];
  if (!file) {
    selectedAndroidChrome512DataUrl = null;
    return;
  }

  if (!['image/png'].includes(file.type)) {
    androidChrome512FileInput.value = '';
    selectedAndroidChrome512DataUrl = null;
    showToast('Invalid file type. Use PNG', 'warning');
    return;
  }

  if (file.size > 1024 * 1024) {
    androidChrome512FileInput.value = '';
    selectedAndroidChrome512DataUrl = null;
    showToast('Icon too large. Max size is 1 MB', 'warning');
    return;
  }

  try {
    selectedAndroidChrome512DataUrl = await readFileAsDataUrl(file);
    showToast('Android Chrome 512 selected. Click Save Branding to apply', 'success');
  } catch (err) {
    selectedAndroidChrome512DataUrl = null;
    showToast(err.message || 'Failed to read icon', 'error');
  }
});

resetBtn.addEventListener('click', loadBrandingSettings);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadBrandingSettings();
  } catch (err) {
    showToast(err.message || 'Failed to load branding settings', 'error');
  }

  try {
    await loadCompanyDetails();
  } catch (err) {
    showToast(err.message || 'Failed to load company details', 'error');
  }

  try {
    await loadFinancialSettings();
  } catch (err) {
    showToast(err.message || 'Failed to load financial settings', 'error');
  }

  try {
    await loadSystemSettings();
  } catch (err) {
    showToast(err.message || 'Failed to load system settings', 'error');
  }
});

// Toggle advanced icons section
const toggleAdvancedIconsBtn = document.getElementById('toggleAdvancedIcons');
const advancedIconsSection = document.getElementById('advancedIconsSection');
const toggleIconText = document.getElementById('toggleIconText');
const toggleIconArrow = document.getElementById('toggleIconArrow');

if (toggleAdvancedIconsBtn && advancedIconsSection) {
  toggleAdvancedIconsBtn.addEventListener('click', () => {
    const isHidden = advancedIconsSection.style.display === 'none';
    advancedIconsSection.style.display = isHidden ? 'block' : 'none';
    toggleIconText.textContent = isHidden ? 'Hide Advanced Icons' : 'Show Advanced Icons';
    toggleIconArrow.textContent = isHidden ? '▲' : '▼';
  });
}

})();
