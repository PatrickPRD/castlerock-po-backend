const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

// Auth guard
if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

let currentRestoreFilename = null;
let uploadModal, restoreModal, resetModal, backupLimitModal;
let allBackups = []; // Store all backups for pagination
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
const MAX_BACKUPS = 20;

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

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Request failed');
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

// Open restore confirmation
function openRestoreConfirmation(filename) {
  currentRestoreFilename = filename;
  document.getElementById('restoreFilename').textContent = filename;
  restoreModal.show();
}

// Confirm restore
async function confirmRestore() {
  if (!currentRestoreFilename) return;
  
  try {
    showToast('Loading backup file...', 'info');
    
    // Download the backup content
    const response = await fetch(`/backups/download/${encodeURIComponent(currentRestoreFilename)}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (!response.ok) {
      throw new Error('Failed to load backup file');
    }
    
    const sqlContent = await response.text();
    
    showToast('Restoring database...', 'info');
    
    // Restore the backup
    const result = await api('/backups/restore', 'POST', { sql: sqlContent });
    
    restoreModal.hide();
    showToast('✅ Backup restored successfully. Page will reload...', 'success');
    
    setTimeout(() => {
      location.reload();
    }, 2000);
  } catch (err) {
    console.error('Restore error:', err);
    showToast('❌ Failed to restore backup: ' + err.message, 'error');
  }
}

// Delete backup
async function deleteBackupConfirm(filename) {
  if (!confirm(`Delete backup "${filename}"?\n\nThis cannot be undone.`)) {
    return;
  }
  
  try {
    await fetch(`/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });
    
    showToast('✅ Backup deleted', 'success');
    loadBackups();
  } catch (err) {
    console.error('Delete error:', err);
    showToast('❌ Failed to delete backup', 'error');
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
