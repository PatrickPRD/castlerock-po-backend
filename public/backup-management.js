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
  document.getElementById('backupFile').value = '';
  document.getElementById('backupInfo').style.display = 'none';
  document.getElementById('parseError').style.display = 'none';
  document.getElementById('restoreBtn').disabled = true;
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
      document.getElementById('backupDetails').innerHTML = details;
      document.getElementById('backupInfo').style.display = 'block';
      document.getElementById('parseError').style.display = 'none';
      document.getElementById('restoreBtn').disabled = false;
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
    document.getElementById('backupDetails').innerHTML = details;
    document.getElementById('backupInfo').style.display = 'block';
    document.getElementById('parseError').style.display = 'none';
    document.getElementById('restoreBtn').disabled = false;
  } catch (err) {
    console.error('Backup validation error:', err);
    document.getElementById('parseErrorMsg').textContent = err.message;
    document.getElementById('parseError').style.display = 'block';
    document.getElementById('backupInfo').style.display = 'none';
    document.getElementById('restoreBtn').disabled = true;
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

// Close modal when clicking outside
document.addEventListener('click', function (event) {
  const modal = document.getElementById('restoreModal');
  if (event.target === modal) {
    closeRestoreModal();
  }
});
