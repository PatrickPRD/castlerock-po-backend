const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

/* ============================
   AUTH GUARD - SUPER ADMIN ONLY
   ============================ */
if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

/* ============================
   BACKUP DATA STORAGE
   ============================ */
let backupData = null;
let backupMode = null; // 'json' | 'sql'

/* ============================
   API HELPER
   ============================ */
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

  return await res.json();
}

/* ============================
   CREATE BACKUP
   ============================ */
async function createBackup() {
  try {
    showToast('Creating backup...', 'info');

    const response = await api('/backups/create', 'POST');

    if (!response.data) {
      throw new Error('No backup data returned');
    }

    // Create a blob and download
    const blob = new Blob([JSON.stringify(response.data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('✅ Backup created and downloaded successfully', 'success');
  } catch (err) {
    console.error('Backup error:', err);
    showToast('❌ Failed to create backup: ' + err.message, 'error');
  }
}

/* ============================
   RESTORE MODAL
   ============================ */
function openRestoreModal() {
  document.getElementById('restoreModal').classList.add('active');
  resetRestoreForm();
}

function closeRestoreModal() {
  document.getElementById('restoreModal').classList.remove('active');
  resetRestoreForm();
}

function resetRestoreForm() {
  const fileInput = document.getElementById('backupFile');
  const preview = document.getElementById('backupPreview');
  const errorDiv = document.getElementById('parseError');
  const restoreBtn = document.getElementById('restoreBtn');
  
  if (fileInput) fileInput.value = '';
  if (preview) preview.style.display = 'none';
  if (errorDiv) errorDiv.style.display = 'none';
  if (restoreBtn) restoreBtn.disabled = true;
  
  backupData = null;
  backupMode = null;
}

/* ============================
   VALIDATE BACKUP FILE
   ============================ */
async function validateBackupFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const isSqlFile = file.name.toLowerCase().endsWith('.sql');

    if (isSqlFile) {
      backupMode = 'sql';
      backupData = text;

      const lineCount = text.split('\n').length;
      const sizeKb = (file.size / 1024).toFixed(1);
      const details = `
        <strong>Type:</strong> SQL script<br>
        <strong>File:</strong> ${file.name}<br>
        <strong>Size:</strong> ${sizeKb} KB<br>
        <strong>Lines:</strong> ${lineCount}
      `;
      const detailsEl = document.getElementById('backupDetails');
      const previewEl = document.getElementById('backupPreview');
      const errorEl = document.getElementById('parseError');
      const restoreBtn = document.getElementById('restoreBtn');
      
      if (detailsEl) detailsEl.innerHTML = details;
      if (previewEl) previewEl.style.display = 'block';
      if (errorEl) errorEl.style.display = 'none';
      if (restoreBtn) restoreBtn.disabled = false;
      return;
    }

    backupMode = 'json';
    backupData = JSON.parse(text);

    // Validate structure
    if (!backupData.metadata || !backupData.tables) {
      throw new Error('Invalid backup format: missing metadata or tables');
    }

    const { metadata, tables } = backupData;

    // Show backup info
    const details = `
      <strong>Created:</strong> ${new Date(metadata.createdAt).toLocaleString()}<br>
      <strong>Tables:</strong> ${Object.keys(tables).join(', ')}<br>
      <strong>Records:</strong> ${Object.entries(tables)
        .map(
          ([table, records]) =>
            `${table}: ${Array.isArray(records) ? records.length : 0}`
        )
        .join(', ')}
    `;
    const detailsEl = document.getElementById('backupDetails');
    const previewEl = document.getElementById('backupPreview');
    const errorEl = document.getElementById('parseError');
    const restoreBtn = document.getElementById('restoreBtn');
    
    if (detailsEl) detailsEl.innerHTML = details;
    if (previewEl) previewEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';
    if (restoreBtn) restoreBtn.disabled = false;
  } catch (err) {
    console.error('Backup validation error:', err);
    const errorMsgEl = document.getElementById('parseErrorMsg');
    const errorEl = document.getElementById('parseError');
    const previewEl = document.getElementById('backupPreview');
    const restoreBtn = document.getElementById('restoreBtn');
    
    if (errorMsgEl) errorMsgEl.textContent = err.message;
    if (errorEl) errorEl.style.display = 'block';
    if (previewEl) previewEl.style.display = 'none';
    if (restoreBtn) restoreBtn.disabled = true;
    backupData = null;
  }
}

/* ============================
   RESTORE BACKUP
   ============================ */
async function restoreBackup() {
  if (!backupData) {
    showToast('❌ No backup data loaded', 'error');
    return;
  }

  const confirmed = await confirm(
    '⚠️ WARNING: This will replace all POs, invoices, sites, locations, and suppliers with the backup data. User accounts will NOT be affected.\n\nThis action CANNOT be undone.\n\nContinue?'
  );

  if (!confirmed) return;

  try {
    showToast('Restoring backup...', 'info');

    const payload =
      backupMode === 'sql'
        ? { sql: backupData }
        : { backup: backupData };

    const response = await api('/backups/restore', 'POST', payload);

    closeRestoreModal();
    showToast(
      '✅ Backup restored successfully. Page will reload...',
      'success'
    );

    setTimeout(() => {
      location.reload();
    }, 2000);
  } catch (err) {
    console.error('Restore error:', err);
    showToast('❌ Failed to restore backup: ' + err.message, 'error');
  }
}

/* ============================
   NAVIGATION
   ============================ */
function back() {
  location.href = 'dashboard.html';
}

/* ============================
   SETUP WIZARD
   ============================ */
function startSetupWizard() {
  document.getElementById('setupWizardModal').style.display = 'flex';
  document.getElementById('wizardStep1').style.display = 'block';
  document.getElementById('wizardStep2').style.display = 'none';
}

function closeSetupWizard() {
  document.getElementById('setupWizardModal').style.display = 'none';
  document.getElementById('wizardStep1').style.display = 'block';
  document.getElementById('wizardStep2').style.display = 'none';
}

async function executeAutoPopulate() {
  if (!confirm('This will auto-populate sites and locations from your Purchase Orders. Continue?')) return;

  try {
    showToast('Auto-populating sites and locations...', 'info');
    await api('/admin/auto-populate-sites', 'POST', {});
    showToast('Sites and locations auto-populated successfully!', 'success');
    
    // Move to step 2
    document.getElementById('wizardStep1').style.display = 'none';
    document.getElementById('wizardStep2').style.display = 'block';
    
    // Load sites for mappings
    loadSitesForWizard();
    loadSiteLetterMappingsWizard();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function wizardPreviousStep() {
  document.getElementById('wizardStep1').style.display = 'block';
  document.getElementById('wizardStep2').style.display = 'none';
}

async function loadSitesForWizard() {
  try {
    const sites = await api('/admin/sites');
    const select = document.getElementById('mappingSiteSelect');
    select.innerHTML = '<option value="">Select site</option>';
    sites.forEach(s => {
      select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
  } catch (err) {
    showToast('Error loading sites: ' + err.message, 'error');
  }
}

async function loadSiteLetterMappingsWizard() {
  try {
    const mappings = await api('/admin/site-letters');
    const table = document.getElementById('siteLetterTable');
    table.innerHTML = '';
    mappings.forEach(m => {
      table.innerHTML += `
        <tr>
          <td><strong>${m.letter}</strong></td>
          <td>${m.site_name}</td>
          <td>
            <button class="btn btn-outline-primary" onclick="deleteSiteLetterMappingWizard(${m.id})">Delete</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    showToast('Error loading mappings: ' + err.message, 'error');
  }
}

async function addSiteLetterMappingWizard() {
  const letter = document.getElementById('mappingLetter').value.trim().toUpperCase();
  const siteId = document.getElementById('mappingSiteSelect').value;

  if (!letter || !siteId) {
    showToast('Letter and site are required', 'warning');
    return;
  }

  if (letter.length !== 1) {
    showToast('Letter must be a single character', 'warning');
    return;
  }

  try {
    await api('/admin/site-letters', 'POST', { letter, site_id: parseInt(siteId) });
    document.getElementById('mappingLetter').value = '';
    document.getElementById('mappingSiteSelect').value = '';
    loadSiteLetterMappingsWizard();
    showToast('Site letter mapping added successfully', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteSiteLetterMappingWizard(id) {
  if (!confirm('Delete this site letter mapping?')) return;

  try {
    await api(`/admin/site-letters/${id}`, 'DELETE');
    loadSiteLetterMappingsWizard();
    showToast('Site letter mapping deleted successfully', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Close modal when clicking outside
document.addEventListener('click', function (event) {
  const restoreModal = document.getElementById('restoreModal');
  const wizardModal = document.getElementById('setupWizardModal');
  
  if (event.target === restoreModal) {
    closeRestoreModal();
  }
  if (event.target === wizardModal) {
    closeSetupWizard();
  }
});

// Add file input listener for backup file validation
const backupFileInput = document.getElementById('backupFile');
if (backupFileInput) {
  backupFileInput.addEventListener('change', validateBackupFile);
}