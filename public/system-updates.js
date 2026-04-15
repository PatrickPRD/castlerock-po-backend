/* global getToken, getUserRole */

const token = getToken();
const role = getUserRole();

// Redirect non-super_admin users
if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

// State
let selectedFile = null;
let analysisData = null;

// ────────────────────────────────────────────────
// Init — detect environment and show correct section
// ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/updates/environment', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load environment');
    const env = await res.json();

    const banner = document.getElementById('envBanner');
    const label = document.getElementById('envLabel');
    const version = document.getElementById('envVersion');

    banner.classList.remove('d-none');

    if (env.isDev) {
      banner.classList.add('env-dev');
      label.textContent = 'Development Environment';
      document.getElementById('devSection').classList.remove('d-none');
    } else {
      banner.classList.add('env-prod');
      label.textContent = 'Production Environment';
      document.getElementById('prodSection').classList.remove('d-none');
    }

    version.textContent = `v${env.currentVersion}`;
  } catch (err) {
    console.error('Init failed:', err);
    showToast('Failed to detect environment', 'danger');
  }
});

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showToast(message, type = 'info') {
  // Use existing toast system if available, otherwise fallback to alert-style
  const container = document.querySelector('.toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
  toast.style.cssText = 'top: 80px; right: 20px; z-index: 9999; min-width: 300px;';
  toast.innerHTML = `${escHtml(message)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function createToastContainer() {
  const c = document.createElement('div');
  c.className = 'toast-container position-fixed top-0 end-0 p-3';
  c.style.zIndex = '9999';
  document.body.appendChild(c);
  return c;
}

// ────────────────────────────────────────────────
// DEV: Create Update Package
// ────────────────────────────────────────────────
async function createUpdatePackage() {
  const btn = document.getElementById('btnCreatePackage');
  const progress = document.getElementById('createProgress');
  const result = document.getElementById('createResult');

  btn.disabled = true;
  progress.classList.remove('d-none');
  result.classList.add('d-none');

  try {
    const res = await fetch('/updates/create-package', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create package');
    }

    const contentType = res.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      // No changes response
      const data = await res.json();
      result.classList.remove('d-none');
      result.innerHTML = `<div class="alert alert-info mb-0"><i class="bi bi-info-circle me-2"></i>${escHtml(data.message)}</div>`;
    } else {
      // Download the file
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `costtracker-update.ctupdate`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      result.classList.remove('d-none');
      result.innerHTML = `<div class="alert alert-success mb-0"><i class="bi bi-check-circle me-2"></i>Update package created and downloaded: <strong>${escHtml(filename)}</strong></div>`;
    }
  } catch (err) {
    result.classList.remove('d-none');
    result.innerHTML = `<div class="alert alert-danger mb-0"><i class="bi bi-exclamation-triangle me-2"></i>${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    progress.classList.add('d-none');
  }
}

// ────────────────────────────────────────────────
// PROD: File Selection
// ────────────────────────────────────────────────
function onFileSelected() {
  const input = document.getElementById('updateFileInput');
  const btn = document.getElementById('btnAnalyze');
  selectedFile = input.files[0] || null;
  btn.disabled = !selectedFile;

  // Reset analysis
  document.getElementById('analysisCard').classList.add('d-none');
  document.getElementById('applyResult').classList.add('d-none');
  analysisData = null;
}

// ────────────────────────────────────────────────
// PROD: Analyze Update
// ────────────────────────────────────────────────
async function analyzeUpdate() {
  if (!selectedFile) return;

  const btn = document.getElementById('btnAnalyze');
  const progress = document.getElementById('analyzeProgress');
  const card = document.getElementById('analysisCard');

  btn.disabled = true;
  progress.classList.remove('d-none');
  card.classList.add('d-none');

  try {
    const formData = new FormData();
    formData.append('updateFile', selectedFile);

    const res = await fetch('/updates/analyze', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Analysis failed');
    }

    analysisData = await res.json();
    renderAnalysis(analysisData);
    card.classList.remove('d-none');
  } catch (err) {
    showToast(err.message, 'danger');
  } finally {
    btn.disabled = false;
    progress.classList.add('d-none');
  }
}

// ────────────────────────────────────────────────
// PROD: Render Analysis
// ────────────────────────────────────────────────
function renderAnalysis(data) {
  const container = document.getElementById('analysisContent');

  const addedCount = data.changes.added.length;
  const modifiedCount = data.changes.modified.length;
  const removedCount = data.changes.removed.length;
  const unchangedCount = data.changes.unchanged.length;
  const depChanges = (data.dependencyChanges.added.length + data.dependencyChanges.updated.length + data.dependencyChanges.removed.length);

  let html = `
    <div class="mb-3">
      <small class="text-muted">Update version: <strong>${escHtml(data.version)}</strong></small>
      <span class="mx-2">|</span>
      <small class="text-muted">Previous version: <strong>${escHtml(data.previousVersion)}</strong></small>
      <span class="mx-2">|</span>
      <small class="text-muted">Created: <strong>${new Date(data.createdAt).toLocaleString()}</strong></small>
    </div>

    <div class="analysis-summary">
      <div class="analysis-stat stat-added">
        <div class="stat-value">${addedCount}</div>
        <div class="stat-label">Files Added</div>
      </div>
      <div class="analysis-stat stat-modified">
        <div class="stat-value">${modifiedCount}</div>
        <div class="stat-label">Files Modified</div>
      </div>
      <div class="analysis-stat stat-removed">
        <div class="stat-value">${removedCount}</div>
        <div class="stat-label">Files Removed</div>
      </div>
      <div class="analysis-stat stat-unchanged">
        <div class="stat-value">${unchangedCount}</div>
        <div class="stat-label">Unchanged</div>
      </div>
      <div class="analysis-stat stat-deps">
        <div class="stat-value">${depChanges}</div>
        <div class="stat-label">Dep Changes</div>
      </div>
    </div>
  `;

  // File details
  if (data.fileDetails && data.fileDetails.length > 0) {
    html += `<h5 class="mb-2">File Changes</h5>`;
    html += `<div class="file-change-list mb-3">`;
    for (const file of data.fileDetails) {
      let badgeClass = 'badge-update';
      let actionLabel = file.action;
      if (file.action === 'add') badgeClass = 'badge-add';
      else if (file.action === 'delete') badgeClass = 'badge-delete';
      else if (file.action.includes('unchanged')) badgeClass = 'badge-unchanged';
      else if (file.action.includes('overwrite')) badgeClass = 'badge-overwrite';

      html += `
        <div class="file-change-item">
          <span>${escHtml(file.path)}</span>
          <div class="d-flex align-items-center gap-2">
            <span class="text-muted">${formatBytes(file.size)}</span>
            <span class="badge-action ${badgeClass}">${escHtml(actionLabel)}</span>
          </div>
        </div>`;
    }
    html += `</div>`;
  }

  // Dependency changes
  if (depChanges > 0) {
    html += `<h5 class="mb-2">Dependency Changes</h5>`;
    if (data.needsNpmInstall) {
      html += `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>This update requires <strong>npm install</strong>. Use the "NPM Install &amp; Restart" button after applying.</div>`;
    }
    html += `<ul class="dep-change-list border rounded">`;
    for (const dep of data.dependencyChanges.added) {
      html += `<li><span class="badge bg-success me-2">NEW</span> ${escHtml(dep.name)} <code>${escHtml(dep.version)}</code></li>`;
    }
    for (const dep of data.dependencyChanges.updated) {
      html += `<li><span class="badge bg-primary me-2">UPD</span> ${escHtml(dep.name)} <code>${escHtml(dep.from)}</code> → <code>${escHtml(dep.to)}</code></li>`;
    }
    for (const dep of data.dependencyChanges.removed) {
      html += `<li><span class="badge bg-danger me-2">DEL</span> ${escHtml(dep.name)}</li>`;
    }
    html += `</ul>`;
  }

  container.innerHTML = html;
}

// ────────────────────────────────────────────────
// PROD: Apply Update
// ────────────────────────────────────────────────
async function applyUpdate() {
  if (!selectedFile) return;

  const btn = document.getElementById('btnApply');
  const progress = document.getElementById('applyProgress');
  const result = document.getElementById('applyResult');

  btn.disabled = true;
  progress.classList.remove('d-none');
  result.classList.add('d-none');

  try {
    const formData = new FormData();
    formData.append('updateFile', selectedFile);

    const res = await fetch('/updates/apply', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to apply update');
    }

    const data = await res.json();

    result.classList.remove('d-none');

    if (data.success) {
      let msg = `<div class="alert alert-success">
        <i class="bi bi-check-circle me-2"></i>
        <strong>Update applied successfully!</strong><br>
        Version: ${escHtml(data.version)}<br>
        Files applied: ${data.applied.length}<br>
        Files removed: ${data.removed.length}`;

      if (data.packageJsonUpdated) {
        msg += `<br><span class="text-warning fw-bold"><i class="bi bi-exclamation-triangle me-1"></i>package.json was updated — use "NPM Install &amp; Restart" below.</span>`;
      } else {
        msg += `<br>Use "Restart Server" below to load the changes.`;
      }
      msg += `</div>`;
      result.innerHTML = msg;
    } else {
      result.innerHTML = `<div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle me-2"></i>
        Update applied with ${data.errors.length} error(s):<br>
        <ul class="mb-0 mt-2">${data.errors.map(e => `<li><code>${escHtml(e.file)}</code>: ${escHtml(e.error)}</li>`).join('')}</ul>
      </div>`;
    }
  } catch (err) {
    result.classList.remove('d-none');
    result.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle me-2"></i>${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    progress.classList.add('d-none');
  }
}

// ────────────────────────────────────────────────
// PROD: Cancel
// ────────────────────────────────────────────────
function cancelUpdate() {
  document.getElementById('analysisCard').classList.add('d-none');
  document.getElementById('updateFileInput').value = '';
  document.getElementById('btnAnalyze').disabled = true;
  selectedFile = null;
  analysisData = null;
}

// ────────────────────────────────────────────────
// PROD: Restart Server
// ────────────────────────────────────────────────
async function restartServer() {
  if (!confirm('Are you sure you want to restart the server? All active connections will be dropped.')) return;

  const progress = document.getElementById('serverProgress');
  const progressText = document.getElementById('serverProgressText');
  const btn = document.getElementById('btnRestart');

  btn.disabled = true;
  progress.classList.remove('d-none');
  progressText.textContent = 'Restarting server...';

  try {
    await fetch('/updates/restart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    progressText.textContent = 'Server is restarting. This page will reload in 10 seconds...';
    setTimeout(() => {
      location.reload();
    }, 10000);
  } catch (err) {
    showToast('Restart request sent. Server may already be restarting.', 'warning');
    setTimeout(() => {
      location.reload();
    }, 10000);
  }
}

// ────────────────────────────────────────────────
// PROD: NPM Install & Restart
// ────────────────────────────────────────────────
async function npmInstallAndRestart() {
  if (!confirm('This will run npm install and then restart the server. This may take a minute. Continue?')) return;

  const progress = document.getElementById('serverProgress');
  const progressText = document.getElementById('serverProgressText');
  const btn = document.getElementById('btnNpmRestart');

  btn.disabled = true;
  progress.classList.remove('d-none');
  progressText.textContent = 'Running npm install... server will restart when complete.';

  try {
    await fetch('/updates/npm-install-restart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    progressText.textContent = 'npm install running. Server will restart automatically. This page will reload in 30 seconds...';
    setTimeout(() => {
      location.reload();
    }, 30000);
  } catch (err) {
    showToast('Request sent. Server may already be processing.', 'warning');
    setTimeout(() => {
      location.reload();
    }, 30000);
  }
}
