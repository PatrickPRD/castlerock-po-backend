(() => {
if (window.__headerBrandingPageInitialized) return;
window.__headerBrandingPageInitialized = true;

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
const logoTextInput = document.getElementById('logoText');
const logoImageSection = document.getElementById('logoImageSection');
const logoTextSection = document.getElementById('logoTextSection');
const resetBtn = document.getElementById('resetBtn');

const brandPreviewBar = document.getElementById('brandPreviewBar');
const brandPreviewImage = document.getElementById('brandPreviewImage');
const brandPreviewText = document.getElementById('brandPreviewText');

let currentLogoPath = '/assets/Logo.png';
let selectedFileDataUrl = null;
const BRANDING_EVENT_KEY = 'headerBrandingVersion';
const BRANDING_CHANNEL_NAME = 'header-branding-updates';

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

resetBtn.addEventListener('click', loadBrandingSettings);

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadBrandingSettings();
  } catch (err) {
    showToast(err.message || 'Failed to load branding settings', 'error');
  }
});
})();
