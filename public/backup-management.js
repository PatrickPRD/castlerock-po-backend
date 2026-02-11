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

  try {
    showToast('Validating backup...', 'info');

    // For SQL backups, skip validation and go straight to confirmation
    if (backupMode === 'sql') {
      const confirmed = await confirm(
        '⚠️ WARNING: SQL Backup\n\nThis will replace all application data with the backup data. User accounts will NOT be affected.\n\nThis action CANNOT be undone.\n\nContinue?'
      );
      if (!confirmed) return;
      
      return await executeRestore(false);
    }

    // For JSON backups, validate first
    const validationResponse = await api('/backups/validate', 'POST', { 
      backup: backupData 
    });

    const report = validationResponse.report;

    // Show validation report
    showValidationReport(report, async () => {
      // User confirmed, proceed with restore
      return await executeRestore(false);
    });

  } catch (err) {
    console.error('Validation/Restore error:', err);
    
    // If validation failed, ask if user wants to force restore
    if (err.message.includes('Validation') || err.message.includes('validation')) {
      const forceRestore = await confirm(
        '⚠️ Validation error: ' + err.message + '\n\nDo you want to force restore anyway? This may result in data inconsistencies.\n\nContinue?'
      );
      
      if (forceRestore) {
        return await executeRestore(true);
      }
    } else {
      showToast('❌ Error: ' + err.message, 'error');
    }
  }
}

/* ============================
   SHOW VALIDATION REPORT
   ============================ */
function showValidationReport(report, onConfirm) {
  let html = '<div style="max-height: 400px; overflow-y: auto; margin-bottom: 20px;">';
  
  html += '<h4>📊 Backup Validation Report</h4>';
  html += `<p><strong>Backup Date:</strong> ${new Date(report.metadata.createdAt).toLocaleString()}</p>`;
  html += `<p><strong>Total Records:</strong> ${report.totalRecords}</p>`;
  
  // Table breakdown
  html += '<h5>Tables to be restored:</h5>';
  html += '<ul>';
  for (const [table, info] of Object.entries(report.tables)) {
    const statusIcon = 
      info.status === 'OK' ? '✅' : 
      info.status === 'WARNING' ? '⚠️' : 
      '❌';
    html += `<li>${statusIcon} <strong>${table}:</strong> ${info.rowCount} records`;
    
    if (info.skippedColumns && info.skippedColumns.length > 0) {
      html += ` <em>(skipping columns: ${info.skippedColumns.join(', ')})</em>`;
    }
    html += '</li>';
  }
  html += '</ul>';
  
  // Warnings
  if (report.warnings && report.warnings.length > 0) {
    html += '<h5>⚠️ Warnings:</h5>';
    html += '<ul>';
    report.warnings.forEach(w => html += `<li>${w}</li>`);
    html += '</ul>';
  }
  
  // Errors
  if (report.errors && report.errors.length > 0) {
    html += '<h5>❌ Errors:</h5>';
    html += '<ul>';
    report.errors.forEach(e => html += `<li>${e}</li>`);
    html += '</ul>';
    html += '<p style="color: #d32f2f;"><strong>⚠️ Note:</strong> Some data may not be restored due to schema mismatches.</p>';
  }
  
  html += '</div>';
  html += '<p style="margin-bottom: 20px;"><strong>This will replace all application data with the backup data. User accounts will NOT be affected.</strong></p>';
  html += '<p style="margin-bottom: 20px; color: #d32f2f;"><strong>This action CANNOT be undone.</strong></p>';

  // Create a custom confirmation modal
  const modalHtml = `
    <div id="validationReportModal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    ">
      <div style="
        background: white;
        padding: 30px;
        border-radius: 8px;
        max-width: 600px;
        width: 90%;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      ">
        ${html}
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button onclick="closeValidationReport()" style="
            padding: 10px 20px;
            border: 1px solid #ccc;
            background: #f5f5f5;
            border-radius: 4px;
            cursor: pointer;
          ">Cancel</button>
          <button onclick="confirmAndRestore()" style="
            padding: 10px 20px;
            background: #d32f2f;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">Continue & Restore</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Store the confirmation callback
  window.restoreConfirmCallback = onConfirm;
}

function closeValidationReport() {
  const modal = document.getElementById('validationReportModal');
  if (modal) modal.remove();
}

async function confirmAndRestore() {
  closeValidationReport();
  if (window.restoreConfirmCallback) {
    await window.restoreConfirmCallback();
  }
}

/* ============================
   EXECUTE RESTORE
   ============================ */
async function executeRestore(force = false) {
  try {
    showToast('Restoring backup...', 'info');

    const payload =
      backupMode === 'sql'
        ? { sql: backupData }
        : { backup: backupData, force };

    const response = await api('/backups/restore', 'POST', payload);

    // Check if validation is required
    if (response.requiresConfirmation && !force) {
      showValidationReport(response.report, async () => {
        return await executeRestore(true);
      });
      return;
    }

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

// Close modal when clicking outside
document.addEventListener('click', function (event) {
  const restoreModal = document.getElementById('restoreModal');
  
  if (event.target === restoreModal) {
    closeRestoreModal();
  }
});

// Add file input listener for backup file validation
const backupFileInput = document.getElementById('backupFile');
if (backupFileInput) {
  backupFileInput.addEventListener('change', validateBackupFile);
}