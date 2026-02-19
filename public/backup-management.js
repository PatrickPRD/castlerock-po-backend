const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

// Auth guard
if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

let currentRestoreFilename = null;
let currentRestoreSqlContent = null;
let uploadModal, restoreModal, restorePreviewModal, resetModal, backupLimitModal;
let allBackups = []; // Store all backups for pagination
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
const MAX_BACKUPS = 20;
let restoreProgressInterval = null;
let restoreStartedAt = null;

// API helper
async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (!res.ok) {
    if (isJson) {
      const err = await res.json();
      throw new Error(err.error || 'Request failed');
    }

    const text = await res.text();
    const firstLine = (text || '').split('\n').find(line => line.trim()) || '';
    throw new Error(firstLine.slice(0, 200) || `Request failed (${res.status})`);
  }

  if (!isJson) {
    return { success: true };
  }

  return await res.json();
}

// Load backups list
async function loadBackups() {
  const spinner = document.getElementById('loadingSpinner');
  const tableBody = document.getElementById('backupsTableBody');
  
  try {
    spinner.style.display = 'block';
    const response = await api('/backups/list');
    allBackups = response.backups || [];
    
    if (allBackups.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted py-4">
            No backups found. Create your first backup above.
          </td>
        </tr>
      `;
      document.getElementById('paginationControls').style.display = 'none';
    } else {
      renderPage(currentPage);
      renderPagination();
      document.getElementById('paginationControls').style.display = 'flex';
    }
  } catch (err) {
    console.error('Load backups error:', err);
    showToast('Failed to load backups: ' + err.message, 'error');
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-danger py-4">
          Error loading backups. Please refresh the page.
        </td>
      </tr>
    `;
  } finally {
    spinner.style.display = 'none';
  }
}

// Render a specific page of backups
function renderPage(page) {
  const tableBody = document.getElementById('backupsTableBody');
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const pageBackups = allBackups.slice(startIndex, endIndex);
  
  tableBody.innerHTML = pageBackups.map(backup => `
    <tr>
      <td><i class="bi bi-file-earmark-arrow-down me-2"></i><span class="font-monospace">${backup.filename}</span></td>
      <td>${formatDate(backup.created)}</td>
      <td>${formatFileSize(backup.size)}</td>
      <td>
        <div class="btn-group btn-group-sm" role="group">
          <button class="btn btn-outline-primary" onclick="downloadBackup('${backup.filename}')" title="Download">
            <i class="bi bi-download"></i>
          </button>
          <button class="btn btn-outline-success" onclick="openRestoreConfirmation('${backup.filename}')" title="Restore">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
          <button class="btn btn-outline-danger" onclick="deleteBackupConfirm('${backup.filename}')" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
  
  // Update pagination info
  document.getElementById('paginationStart').textContent = allBackups.length > 0 ? startIndex + 1 : 0;
  document.getElementById('paginationEnd').textContent = Math.min(endIndex, allBackups.length);
  document.getElementById('paginationTotal').textContent = allBackups.length;
}

// Render pagination controls
function renderPagination() {
  const totalPages = Math.ceil(allBackups.length / ITEMS_PER_PAGE);
  const paginationButtons = document.getElementById('paginationButtons');
  
  if (totalPages <= 1) {
    paginationButtons.innerHTML = '';
    return;
  }
  
  let buttonsHtml = '';
  
  // Previous button
  buttonsHtml += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="goToPage(${currentPage - 1}); return false;">Previous</a>
    </li>
  `;
  
  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 || 
      i === totalPages || 
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      buttonsHtml += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link" href="#" onclick="goToPage(${i}); return false;">${i}</a>
        </li>
      `;
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      buttonsHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
  }
  
  // Next button
  buttonsHtml += `
    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="goToPage(${currentPage + 1}); return false;">Next</a>
    </li>
  `;
  
  paginationButtons.innerHTML = buttonsHtml;
}

// Navigate to a specific page
function goToPage(page) {
  const totalPages = Math.ceil(allBackups.length / ITEMS_PER_PAGE);
  if (page < 1 || page > totalPages) return;
  
  currentPage = page;
  renderPage(currentPage);
  renderPagination();
}

// Create backup
async function createBackup() {
  // Check if at limit
  if (allBackups.length >= MAX_BACKUPS) {
    const oldestBackup = allBackups[allBackups.length - 1];
    document.getElementById('oldestBackupName').textContent = oldestBackup.filename;
    backupLimitModal.show();
    return;
  }
  
  await proceedWithBackup();
}

// Proceed with backup creation (after warning if needed)
async function proceedWithBackup() {
  try {
    if (backupLimitModal) {
      backupLimitModal.hide();
    }
    
    showToast('Creating backup...', 'info');
    const response = await api('/backups/create', 'POST');
    
    if (response.deletedOldest) {
      showToast(`✅ Backup created: ${response.filename}\n🗑️ Deleted oldest: ${response.deletedOldest}`, 'success');
    } else {
      showToast('✅ Backup created: ' + response.filename, 'success');
    }
    
    loadBackups();
  } catch (err) {
    console.error('Create backup error:', err);
    showToast('❌ Failed to create backup: ' + err.message, 'error');
  }
}

// Download backup
async function downloadBackup(filename) {
  try {
    const link = document.createElement('a');
    link.href = `/backups/download/${encodeURIComponent(filename)}`;
    link.download = filename;
    link.style.display = 'none';
    
    // Add auth header via fetch, then trigger download
    const response = await fetch(link.href, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (!response.ok) {
      throw new Error('Download failed');
    }
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    link.href = url;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showToast('✅ Backup downloaded', 'success');
  } catch (err) {
    console.error('Download error:', err);
    showToast('❌ Failed to download backup', 'error');
  }
}

// Open restore with validation preview
async function openRestoreConfirmation(filename) {
  currentRestoreFilename = filename;
  currentRestoreSqlContent = null;
  resetRestoreProgressUi();
  
  try {
    // Show spinner
    document.getElementById('validationSpinner').style.display = 'block';
    document.getElementById('validationContent').style.display = 'none';
    restorePreviewModal.show();
    
    showToast('Loading backup file...', 'info');
    
    // Download the backup content
    const response = await fetch(`/backups/download/${encodeURIComponent(filename)}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load backup file');
    }
    
    const sqlContent = await response.text();
    currentRestoreSqlContent = sqlContent;
    
    // Try to validate the backup
    showToast('Analyzing backup...', 'info');
    await validateAndPreviewBackup(sqlContent);
    
    // Show content and hide spinner
    document.getElementById('validationSpinner').style.display = 'none';
    document.getElementById('validationContent').style.display = 'block';
    document.getElementById('previewFilename').textContent = filename;
    
  } catch (err) {
    console.error('Load backup for preview error:', err);
    document.getElementById('validationSpinner').style.display = 'none';
    document.getElementById('validationContent').style.display = 'block';
    document.getElementById('previewFilename').textContent = currentRestoreFilename;
    
    // Show SQL file info and hide detailed info
    document.getElementById('sqlFileInfo').style.display = 'block';
    document.getElementById('tablesSummary').style.display = 'none';
    document.getElementById('validationWarnings').style.display = 'none';
    document.getElementById('validationErrors').style.display = 'none';
    
    showToast('Note: Backup analyzed as SQL dump', 'info');
  }
}

// Validate and preview backup
async function validateAndPreviewBackup(sqlContent) {
  try {
    // For backward compatibility, try to validate as JSON backup format
    try {
      const backupData = JSON.parse(sqlContent);
      
      if (backupData.metadata && backupData.tables) {
        // This is a JSON backup with structured data
        const report = await api('/backups/validate', 'POST', { backup: backupData });
        
        if (report && report.report) {
          displayValidationReport(report.report);
          return;
        }
      }
    } catch (parseErr) {
      // Not JSON, treat as SQL dump
    }
    
    // It's a SQL dump - validate using SQL validation endpoint
    try {
      const report = await api('/backups/validate-sql', 'POST', { sql: sqlContent });
      
      if (report && report.report) {
        displaySqlValidationReport(report.report);
        return;
      }
    } catch (sqlValidationErr) {
      console.warn('SQL validation error:', sqlValidationErr);
      displaySqlBackupPreview();
    }
    
  } catch (err) {
    console.error('Validation error:', err);
    displaySqlBackupPreview();
  }
}

// Display validation report for JSON backups
function displayValidationReport(report) {
  // Hide SQL info
  document.getElementById('sqlFileInfo').style.display = 'none';
  document.getElementById('tablesSummary').style.display = 'block';
  
  // Clear ALL data completely
  document.getElementById('tablesBody').innerHTML = '';
  document.getElementById('warningsList').innerHTML = '';
  document.getElementById('errorsList').innerHTML = '';
  document.getElementById('validationWarnings').style.display = 'none';
  document.getElementById('validationErrors').style.display = 'none';
  
  // Show warnings if any
  const warningsDiv = document.getElementById('validationWarnings');
  if (report.warnings && report.warnings.length > 0) {
    warningsDiv.style.display = 'block';
    document.getElementById('warningsList').innerHTML = report.warnings
      .map(w => `<li>${escapeHtml(w)}</li>`)
      .join('');
  }
  
  // Show errors if any
  const errorsDiv = document.getElementById('validationErrors');
  if (report.errors && report.errors.length > 0) {
    errorsDiv.style.display = 'block';
    document.getElementById('errorsList').innerHTML = report.errors
      .map(e => `<li>${escapeHtml(e)}</li>`)
      .join('');
  }
  
  // Display tables
  if (report.tables && Object.keys(report.tables).length > 0) {
    const tablesHtml = Object.entries(report.tables)
      .map(([tableName, tableInfo]) => {
        const rowCount = tableInfo.rowCount || 0;
        let statusBadge = 'bg-success';
        let statusText = 'Ready';
        
        if (tableInfo.status === 'EMPTY') {
          statusBadge = 'bg-secondary';
          statusText = 'Empty';
        }
        
        return `
          <tr>
            <td><code>${escapeHtml(tableName)}</code></td>
            <td class="text-end"><strong>${rowCount.toLocaleString()}</strong></td>
            <td><span class="badge ${statusBadge}">${statusText}</span></td>
          </tr>
        `;
      })
      .join('');
    
    document.getElementById('tablesBody').innerHTML = tablesHtml;
  }
}

// Display validation report for SQL backups
function displaySqlValidationReport(report) {
  // Hide generic SQL info and show detailed info
  document.getElementById('sqlFileInfo').style.display = 'none';
  document.getElementById('tablesSummary').style.display = 'block';
  
  // Clear ALL previous data completely
  document.getElementById('tablesBody').innerHTML = '';
  document.getElementById('warningsList').innerHTML = '';
  document.getElementById('errorsList').innerHTML = '';
  document.getElementById('validationWarnings').style.display = 'none';
  document.getElementById('validationErrors').style.display = 'none';
  
  // Show warnings if any
  const warningsDiv = document.getElementById('validationWarnings');
  if (report.warnings && report.warnings.length > 0) {
    warningsDiv.style.display = 'block';
    document.getElementById('warningsList').innerHTML = report.warnings
      .map(w => `<li>${escapeHtml(w)}</li>`)
      .join('');
  }
  
  // Show errors if any
  const errorsDiv = document.getElementById('validationErrors');
  if (report.errors && report.errors.length > 0) {
    errorsDiv.style.display = 'block';
    document.getElementById('errorsList').innerHTML = report.errors
      .map(e => `<li>${escapeHtml(e)}</li>`)
      .join('');
  }
  
  // Display tables found in SQL backup
  if (report.tables && Object.keys(report.tables).length > 0) {
    const tablesHtml = Object.entries(report.tables)
      .map(([tableName, tableInfo]) => {
        const rowCount = tableInfo.rowCount || 0;
        
        return `
          <tr>
            <td><code>${escapeHtml(tableName)}</code></td>
            <td class="text-end"><strong>${rowCount.toLocaleString()}</strong></td>
            <td><span class="badge bg-success">Ready to Restore</span></td>
          </tr>
        `;
      })
      .join('');
    
    document.getElementById('tablesBody').innerHTML = tablesHtml;
  }
}

// Display preview for SQL backups
function displaySqlBackupPreview() {
  document.getElementById('sqlFileInfo').style.display = 'block';
  document.getElementById('tablesSummary').style.display = 'none';
  document.getElementById('validationWarnings').style.display = 'none';
  document.getElementById('validationErrors').style.display = 'none';
}

// HTML escape utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatElapsedTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function setRestoreUiRunningState(isRunning) {
  const confirmBtn = document.getElementById('confirmPreviewBtn');
  const cancelBtn = document.getElementById('cancelRestorePreviewBtn');
  const closeBtn = document.getElementById('closeRestorePreviewBtn');

  if (confirmBtn) confirmBtn.disabled = isRunning;
  if (cancelBtn) cancelBtn.disabled = isRunning;
  if (closeBtn) closeBtn.disabled = isRunning;
}

function updateRestoreProgress(percent, statusText, totalSeconds, variant = 'primary') {
  const progressSection = document.getElementById('restoreProgressSection');
  const progressBar = document.getElementById('restoreProgressBar');
  const status = document.getElementById('restoreProgressStatus');
  const elapsed = document.getElementById('restoreElapsedTime');

  if (!progressSection || !progressBar || !status || !elapsed) return;

  progressSection.style.display = 'block';
  status.textContent = statusText;
  elapsed.textContent = formatElapsedTime(totalSeconds);

  progressBar.className = `progress-bar progress-bar-striped progress-bar-animated bg-${variant}`;
  progressBar.style.width = `${percent}%`;
  progressBar.setAttribute('aria-valuenow', String(percent));
  progressBar.textContent = `${percent}%`;
}

function startRestoreProgressUi() {
  restoreStartedAt = Date.now();
  setRestoreUiRunningState(true);

  if (restoreProgressInterval) {
    clearInterval(restoreProgressInterval);
    restoreProgressInterval = null;
  }

  updateRestoreProgress(5, 'Restore in progress...', 0, 'primary');

  restoreProgressInterval = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - restoreStartedAt) / 1000);
    const estimatedPercent = Math.min(95, 5 + Math.floor(elapsedSeconds * 1.5));
    updateRestoreProgress(estimatedPercent, 'Restore in progress...', elapsedSeconds, 'primary');
  }, 1000);
}

function finishRestoreProgressUi({ success, message }) {
  const elapsedSeconds = restoreStartedAt
    ? Math.floor((Date.now() - restoreStartedAt) / 1000)
    : 0;

  if (restoreProgressInterval) {
    clearInterval(restoreProgressInterval);
    restoreProgressInterval = null;
  }

  if (success) {
    updateRestoreProgress(100, message || 'Restore completed successfully', elapsedSeconds, 'success');
  } else {
    updateRestoreProgress(100, message || 'Restore failed', elapsedSeconds, 'danger');
  }

  setRestoreUiRunningState(false);
}

function resetRestoreProgressUi() {
  if (restoreProgressInterval) {
    clearInterval(restoreProgressInterval);
    restoreProgressInterval = null;
  }

  restoreStartedAt = null;
  setRestoreUiRunningState(false);

  const progressSection = document.getElementById('restoreProgressSection');
  const progressBar = document.getElementById('restoreProgressBar');
  const status = document.getElementById('restoreProgressStatus');
  const elapsed = document.getElementById('restoreElapsedTime');

  if (progressSection) progressSection.style.display = 'none';
  if (progressBar) {
    progressBar.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', '0');
    progressBar.textContent = '0%';
    progressBar.className = 'progress-bar progress-bar-striped progress-bar-animated';
  }
  if (status) status.textContent = 'Restore in progress...';
  if (elapsed) elapsed.textContent = '00:00';
}

async function waitForRestoreJob(jobId) {
  const startedAt = Date.now();
  const timeoutMs = 30 * 60 * 1000;
  const pollIntervalMs = 3000;

  while (Date.now() - startedAt < timeoutMs) {
    const statusResponse = await api(`/backups/restore/status/${encodeURIComponent(jobId)}`);
    const job = statusResponse?.job;

    if (!job) {
      throw new Error('Invalid restore status response');
    }

    if (job.status === 'completed') {
      return job;
    }

    if (job.status === 'failed') {
      throw new Error(job.error || 'Restore failed');
    }

    await wait(pollIntervalMs);
  }

  throw new Error('Restore is taking longer than expected. Please check server logs and try again.');
}

// Proceed with restore (after preview)
async function proceedWithRestore() {
  if (!currentRestoreFilename) {
    showToast('❌ No backup file selected', 'error');
    return;
  }
  
  try {
    startRestoreProgressUi();
    showToast('Starting restore job...', 'info');
    
    // Start async restore job
    console.log('📤 Starting restore job...');
    const startResult = await api('/backups/restore/start', 'POST', { filename: currentRestoreFilename, force: true });
    const jobId = startResult?.jobId;

    if (!jobId) {
      throw new Error('Restore job did not return a job ID');
    }

    showToast('Restore in progress... this can take several minutes.', 'info');

    console.log('⏳ Waiting for restore job:', jobId);
    const jobResult = await waitForRestoreJob(jobId);
    console.log('✅ Restore job completed:', jobResult);
    finishRestoreProgressUi({ success: true, message: 'Restore completed successfully' });
    
    showToast('✅ Backup restored successfully! Please refresh the page manually (F5) to see changes.', 'success');
    
    // Don't auto-reload - let user check console and refresh manually
    console.log('✅ RESTORE COMPLETE - Check server console for audit log messages');
    console.log('✅ Refresh the page (F5) when ready');
  } catch (err) {
    console.error('Restore error:', err);
    console.error('Error details:', err.message);
    finishRestoreProgressUi({ success: false, message: 'Restore failed' });
    showToast('❌ Failed to restore backup: ' + err.message, 'error');
  }
}

// Confirm restore (kept for backward compatibility)
async function confirmRestore() {
  // This is now called after preview, but we keep it for compatibility
  // The actual restore is done in proceedWithRestore()
}

// Delete backup
async function deleteBackupConfirm(filename) {
  if (!confirm(`Delete backup "${filename}"?\n\nThis cannot be undone.`)) {
    return;
  }
  
  try {
    const response = await fetch(`/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Delete failed');
    }
    
    showToast('✅ Backup deleted', 'success');
    loadBackups();
  } catch (err) {
    console.error('Delete error:', err);
    showToast('❌ Failed to delete backup: ' + err.message, 'error');
  }
}

// Open upload modal
function openUploadModal() {
  document.getElementById('backupFileInput').value = '';
  uploadModal.show();
}

// Upload backup
async function uploadBackup() {
  const fileInput = document.getElementById('backupFileInput');
  const file = fileInput.files[0];
  
  if (!file) {
    showToast('Please select a file', 'warning');
    return;
  }
  
  if (!file.name.endsWith('.sql')) {
    showToast('Only .sql files are allowed', 'error');
    return;
  }
  
  // Check if at limit - show warning but allow upload
  if (allBackups.length >= MAX_BACKUPS) {
    const oldestBackup = allBackups[allBackups.length - 1];
    const confirmed = confirm(
      `Maximum backups (${MAX_BACKUPS}) reached!\n\n` +
      `Uploading will delete the oldest backup:\n${oldestBackup.filename}\n\n` +
      `Do you want to continue?`
    );
    if (!confirmed) return;
  }
  
  try {
    showToast('Uploading backup...', 'info');
    
    const formData = new FormData();
    formData.append('backup', file);
    
    const response = await fetch('/backups/upload', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      body: formData
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Upload failed');
    }
    
    const result = await response.json();
    
    uploadModal.hide();
    
    if (result.deletedOldest) {
      showToast(`✅ Backup uploaded: ${result.filename}\n🗑️ Deleted oldest: ${result.deletedOldest}`, 'success');
    } else {
      showToast('✅ Backup uploaded: ' + result.filename, 'success');
    }
    
    loadBackups();
  } catch (err) {
    console.error('Upload error:', err);
    showToast('❌ Failed to upload backup: ' + err.message, 'error');
  }
}

// Open reset modal
function openResetModal() {
  document.getElementById('resetConfirmText').value = '';
  document.getElementById('confirmResetBtn').disabled = true;
  resetModal.show();
}

// Confirm reset
async function confirmReset() {
  const confirmText = document.getElementById('resetConfirmText').value;

  if (confirmText !== 'RESET TO WIZARD') {
    showToast('❌ Invalid confirmation text', 'error');
    return;
  }

  try {
    showToast('🔄 Resetting application...', 'info');

    const response = await api('/setup-wizard/reset', 'POST', {
      confirmText: confirmText
    });

    if (!response.success) {
      throw new Error(response.error || 'Reset failed');
    }

    showToast('✅ Reset successful. Redirecting...', 'success');
    
    setTimeout(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      window.location.href = '/setup-wizard.html';
    }, 2000);
  } catch (err) {
    console.error('Reset error:', err);
    showToast('❌ Failed to reset: ' + err.message, 'error');
  }
}

// Format helpers
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Bootstrap modals
  uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
  restoreModal = new bootstrap.Modal(document.getElementById('restoreModal'));
  restorePreviewModal = new bootstrap.Modal(document.getElementById('restorePreviewModal'));
  resetModal = new bootstrap.Modal(document.getElementById('resetModal'));
  backupLimitModal = new bootstrap.Modal(document.getElementById('backupLimitModal'));
  
  // Reset confirmation text validation
  const resetConfirmInput = document.getElementById('resetConfirmText');
  const confirmResetBtn = document.getElementById('confirmResetBtn');
  
  resetConfirmInput.addEventListener('input', (e) => {
    confirmResetBtn.disabled = e.target.value !== 'RESET TO WIZARD';
  });
  
  // Load initial backups
  loadBackups();
});
