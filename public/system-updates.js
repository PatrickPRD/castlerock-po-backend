/* ============================================================
   system-updates.js — Super Admin Update Management
   ============================================================ */

let _parsedPackageJson = null;
let _uploadModal = null;
let _detailModal = null;
let _installedVersion = '';

/* -------------------------------------------------------
   Dev tool: generate update package
------------------------------------------------------- */
async function generateUpdatePackage() {
  const version = (document.getElementById('generateVersion')?.value || '').trim();
  const description = (document.getElementById('generateDescription')?.value || '').trim();
  const full = Boolean(document.getElementById('generateFull')?.checked);
  const btn = document.getElementById('generateUpdateBtn');
  const result = document.getElementById('generateResult');

  if (!version) {
    result.innerHTML = '<div class="alert alert-danger mb-0">Version is required.</div>';
    return;
  }

  const prevHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Generating';
  result.innerHTML = '';

  try {
    const res = await fetch('/updates/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ version, description, full })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to generate update package');
    }

    const outputSnippet = data.output
      ? `<details class="mt-2"><summary class="small text-muted">Generator output</summary><pre class="small mb-0 mt-2">${escHtml(data.output)}</pre></details>`
      : '';

    result.innerHTML = `
      <div class="alert alert-success mb-0">
        <div><strong>${escHtml(data.message)}</strong></div>
        <div class="small text-muted mt-1">This is a one-time temporary download. The package is deleted from the server after transfer.</div>
        <div class="mt-2">
          <a class="btn btn-sm btn-outline-success" href="#" onclick="return downloadGeneratedUpdate('${escHtml(data.downloadUrl)}', '${escHtml(data.fileName)}')">
            <i class="bi bi-download me-1"></i>Download Once: ${escHtml(data.fileName)}
          </a>
        </div>
        ${outputSnippet}
      </div>`;
  } catch (err) {
    result.innerHTML = `<div class="alert alert-danger mb-0">${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = prevHtml;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  _uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
  _detailModal = new bootstrap.Modal(document.getElementById('detailModal'));

  const bumpLevelSelect = document.getElementById('generateBumpLevel');
  if (bumpLevelSelect) {
    bumpLevelSelect.addEventListener('change', applySuggestedNextVersion);
  }

  document.getElementById('uploadModal').addEventListener('hidden.bs.modal', resetUploadModal);

  loadUpdates();
});

/* -------------------------------------------------------
   Load update history
------------------------------------------------------- */
async function loadUpdates() {
  const spinner = document.getElementById('loadingSpinner');
  const table = document.getElementById('updatesTable');
  spinner.style.display = '';
  table.style.display = 'none';

  try {
    const res = await fetch('/updates', {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });
    if (!res.ok) throw new Error(await res.text());
    const { updates, currentVersion } = await res.json();

    document.getElementById('currentVersion').textContent = currentVersion || '—';
    _installedVersion = (currentVersion || '').trim();
    applySuggestedNextVersion();
    renderUpdatesTable(updates);
  } catch (err) {
    showToast('Failed to load update history: ' + err.message, 'danger');
  } finally {
    spinner.style.display = 'none';
    table.style.display = '';
  }
}

function renderUpdatesTable(updates) {
  const tbody = document.getElementById('updatesTableBody');
  if (!updates || updates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No updates have been installed yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = updates.map(u => {
    const statusBadge = statusBadgeHtml(u.status);
    const appliedAt = u.applied_at ? new Date(u.applied_at).toLocaleString() : '—';
    const desc = escHtml(u.description || '—');
    return `
      <tr>
        <td><strong>${escHtml(u.version)}</strong><br><small class="text-muted">${escHtml(u.filename)}</small></td>
        <td>${desc}</td>
        <td><span class="badge bg-secondary">${u.file_count} file(s)</span></td>
        <td>${statusBadge}</td>
        <td><small>${appliedAt}</small></td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="viewUpdateDetail(${u.id})">
            <i class="bi bi-eye"></i>
          </button>
        </td>
      </tr>`;
  }).join('');
}

function applySuggestedNextVersion() {
  const versionInput = document.getElementById('generateVersion');
  const bumpLevelSelect = document.getElementById('generateBumpLevel');

  if (!versionInput || !bumpLevelSelect) return;

  const bumpLevel = bumpLevelSelect.value;
  if (bumpLevel === 'custom') {
    versionInput.readOnly = false;
    versionInput.placeholder = 'e.g. 1.2.3';
    return;
  }

  const nextVersion = getBumpedVersion(_installedVersion, bumpLevel);
  versionInput.value = nextVersion;
  versionInput.readOnly = true;
}

function getBumpedVersion(version, bumpLevel) {
  const parsed = parseSemver(version);
  if (!parsed) {
    return bumpLevel === 'major' ? '1.0.0' : bumpLevel === 'minor' ? '0.1.0' : '0.0.1';
  }

  if (bumpLevel === 'major') {
    return `${parsed.major + 1}.0.0`;
  }
  if (bumpLevel === 'minor') {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function parseSemver(version) {
  if (!version) return null;
  const cleaned = String(version).trim().replace(/^v/i, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function statusBadgeHtml(status) {
  const map = {
    applied: 'bg-success',
    failed: 'bg-danger',
    pending: 'bg-warning text-dark',
    previewed: 'bg-info text-dark'
  };
  const cls = map[status] || 'bg-secondary';
  return `<span class="badge ${cls}">${escHtml(status)}</span>`;
}

/* -------------------------------------------------------
   Upload modal
------------------------------------------------------- */
function openUploadModal() {
  resetUploadModal();
  _uploadModal.show();
}

function resetUploadModal() {
  _parsedPackageJson = null;
  document.getElementById('stepUpload').style.display = '';
  document.getElementById('stepPreview').style.display = 'none';
  document.getElementById('stepProcessing').style.display = 'none';
  document.getElementById('stepResult').style.display = 'none';
  document.getElementById('uploadError').classList.add('d-none');
  document.getElementById('previewBtn').style.display = '';
  document.getElementById('applyBtn').style.display = 'none';
  document.getElementById('doneBtn').style.display = 'none';
  document.getElementById('cancelBtn').style.display = '';
  const fileInput = document.getElementById('updateFileInput');
  if (fileInput) fileInput.value = '';
}

/* -------------------------------------------------------
   Step 1 → 2: Preview
------------------------------------------------------- */
async function runPreview() {
  const fileInput = document.getElementById('updateFileInput');
  const errorDiv = document.getElementById('uploadError');
  errorDiv.classList.add('d-none');

  if (!fileInput.files || fileInput.files.length === 0) {
    errorDiv.textContent = 'Please select a .CTUpdate file first.';
    errorDiv.classList.remove('d-none');
    return;
  }

  setModalStep('processing');
  document.getElementById('processingMessage').textContent = 'Validating package…';

  const formData = new FormData();
  formData.append('updateFile', fileInput.files[0]);

  try {
    const res = await fetch('/updates/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Preview failed');

    _parsedPackageJson = data.packageJson;
    renderPreview(data.preview);
    setModalStep('preview');
  } catch (err) {
    setModalStep('upload');
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('d-none');
  }
}

function renderPreview(preview) {
  document.getElementById('previewVersion').textContent = preview.version;
  document.getElementById('previewDescription').textContent = preview.description || '';
  document.getElementById('previewFileCount').textContent = `${preview.files.length} file(s)`;

  const summary = {
    outdated: preview.files.filter(f => f.action === 'update' && !f.alreadyCurrent && !f.isNew).length,
    alreadyCurrent: preview.files.filter(f => f.alreadyCurrent).length,
    missingNew: preview.files.filter(f => f.action === 'update' && f.isNew).length,
    deleteCandidates: preview.files.filter(f => f.action === 'delete').length
  };

  const summaryEl = document.getElementById('previewSummary');
  if (summaryEl) {
    summaryEl.innerHTML = [
      `<span class="badge bg-warning text-dark">Outdated: ${summary.outdated}</span>`,
      `<span class="badge bg-secondary">Already current: ${summary.alreadyCurrent}</span>`,
      `<span class="badge bg-success">Missing/New: ${summary.missingNew}</span>`,
      `<span class="badge bg-danger">Delete candidates: ${summary.deleteCandidates}</span>`
    ].join('');
  }

  const alreadyCurrent = preview.files.filter(f => f.alreadyCurrent).length;
  const warn = document.getElementById('previewWarning');
  if (alreadyCurrent > 0) {
    document.getElementById('previewWarningText').textContent =
      `${alreadyCurrent} file(s) are already at the target version and will be skipped.`;
    warn.classList.remove('d-none');
  } else {
    warn.classList.add('d-none');
  }

  const tbody = document.getElementById('previewFileList');
  tbody.innerHTML = preview.files.map(f => {
    const rowClass = f.action === 'delete'
      ? 'table-danger'
      : f.alreadyCurrent
        ? 'table-secondary'
        : f.isNew
          ? 'table-success'
          : 'table-warning';

    const actionBadge = f.action === 'delete'
      ? '<span class="badge bg-danger">Delete</span>'
      : f.isNew
        ? '<span class="badge bg-success">New</span>'
        : '<span class="badge bg-primary">Update</span>';
    const statusBadge = f.action === 'delete'
      ? '<span class="badge bg-danger"><i class="bi bi-trash me-1"></i>Will delete</span>'
      : f.alreadyCurrent
        ? '<span class="badge bg-secondary"><i class="bi bi-check2-circle me-1"></i>Already current</span>'
        : f.isNew
          ? '<span class="badge bg-success"><i class="bi bi-plus-circle me-1"></i>Will add</span>'
          : '<span class="badge bg-warning text-dark"><i class="bi bi-arrow-repeat me-1"></i>Will change</span>';
    return `<tr class="${rowClass}">
      <td><code>${escHtml(f.path)}</code></td>
      <td>${actionBadge}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');
}

/* -------------------------------------------------------
   Step 2 → 3: Apply
------------------------------------------------------- */
async function confirmApply() {
  if (!_parsedPackageJson) return;

  setModalStep('processing');
  document.getElementById('processingMessage').textContent = 'Applying update — please wait…';

  try {
    const res = await fetch('/updates/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ packageJson: _parsedPackageJson })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Apply failed');

    showResult(true, data);
  } catch (err) {
    showResult(false, { error: err.message });
  }
}

function showResult(success, data) {
  const alertDiv = document.getElementById('resultAlert');
  const detailsDiv = document.getElementById('resultDetails');

  if (success) {
    alertDiv.innerHTML = `<div class="alert alert-success"><i class="bi bi-check-circle me-2"></i>${escHtml(data.message)}</div>`;
    const lines = [
      ...(data.applied || []).map(f => `<li class="text-success"><i class="bi bi-check me-1"></i>${escHtml(f.path)} — ${escHtml(f.action)}</li>`),
      ...(data.skipped || []).map(f => `<li class="text-muted"><i class="bi bi-skip-forward me-1"></i>${escHtml(f.path)} — ${escHtml(f.reason)}</li>`)
    ];
    detailsDiv.innerHTML = lines.length
      ? `<ul class="list-unstyled small mt-2">${lines.join('')}</ul>`
      : '';
  } else {
    alertDiv.innerHTML = `<div class="alert alert-danger"><i class="bi bi-x-circle me-2"></i><strong>Update failed:</strong> ${escHtml(data.error || 'Unknown error')}</div>`;
    detailsDiv.innerHTML = '';
  }

  setModalStep('result');
}

/* -------------------------------------------------------
   Modal step helper
------------------------------------------------------- */
function setModalStep(step) {
  const steps = ['upload', 'preview', 'processing', 'result'];
  steps.forEach(s => {
    const el = document.getElementById(`step${s.charAt(0).toUpperCase() + s.slice(1)}`);
    if (el) el.style.display = s === step ? '' : 'none';
  });

  document.getElementById('previewBtn').style.display = step === 'upload' ? '' : 'none';
  document.getElementById('applyBtn').style.display = step === 'preview' ? '' : 'none';
  document.getElementById('doneBtn').style.display = step === 'result' ? '' : 'none';
  document.getElementById('cancelBtn').style.display = step === 'result' ? 'none' : '';
}

/* -------------------------------------------------------
   View detail modal
------------------------------------------------------- */
async function viewUpdateDetail(id) {
  const body = document.getElementById('detailModalBody');
  body.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary" role="status"></div></div>';
  _detailModal.show();

  try {
    const res = await fetch(`/updates/${id}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });
    if (!res.ok) throw new Error('Failed to load update');
    const u = await res.json();

    let filesSummary = '';
    if (u.files_summary) {
      const summary = typeof u.files_summary === 'string' ? JSON.parse(u.files_summary) : u.files_summary;
      const applied = (summary.applied || []).map(f => `<li class="text-success"><i class="bi bi-check me-1"></i>${escHtml(f.path)}</li>`);
      const skipped = (summary.skipped || []).map(f => `<li class="text-muted"><i class="bi bi-dash me-1"></i>${escHtml(f.path)} — ${escHtml(f.reason)}</li>`);
      if (applied.length || skipped.length) {
        filesSummary = `<ul class="list-unstyled small">${applied.join('')}${skipped.join('')}</ul>`;
      }
    }

    body.innerHTML = `
      <dl class="row mb-0">
        <dt class="col-sm-3">Version</dt>
        <dd class="col-sm-9">${escHtml(u.version)}</dd>
        <dt class="col-sm-3">Filename</dt>
        <dd class="col-sm-9">${escHtml(u.filename)}</dd>
        <dt class="col-sm-3">Description</dt>
        <dd class="col-sm-9">${escHtml(u.description || '—')}</dd>
        <dt class="col-sm-3">Status</dt>
        <dd class="col-sm-9">${statusBadgeHtml(u.status)}</dd>
        <dt class="col-sm-3">Applied</dt>
        <dd class="col-sm-9">${u.applied_at ? new Date(u.applied_at).toLocaleString() : '—'}</dd>
        <dt class="col-sm-3">Files</dt>
        <dd class="col-sm-9">${u.file_count} updated / ${u.migration_count} migration(s)</dd>
        ${u.error_message ? `<dt class="col-sm-3 text-danger">Error</dt><dd class="col-sm-9 text-danger">${escHtml(u.error_message)}</dd>` : ''}
      </dl>
      ${filesSummary ? `<hr><h6>Changed Files</h6>${filesSummary}` : ''}`;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">Failed to load details: ${escHtml(err.message)}</div>`;
  }
}

/* -------------------------------------------------------
   Utilities
------------------------------------------------------- */
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getAuthToken() {
  return (
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    sessionStorage.getItem('authToken') ||
    ''
  );
}

function showToast(message, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  const container = document.getElementById('toast-container') || (() => {
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'position-fixed bottom-0 end-0 p-3';
    el.style.zIndex = 1100;
    document.body.appendChild(el);
    return el;
  })();

  const bg = { success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning text-dark', info: 'bg-info text-dark' }[type] || 'bg-secondary';
  const id = `toast-${Date.now()}`;
  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast text-white ${bg}" role="alert">
      <div class="d-flex">
        <div class="toast-body">${escHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`);
  const toastEl = document.getElementById(id);
  new bootstrap.Toast(toastEl, { delay: 4000 }).show();
}

async function downloadGeneratedUpdate(downloadUrl, fileName) {
  try {
    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });

    if (!res.ok) {
      let errorMessage = 'Failed to download update package';
      try {
        const data = await res.json();
        if (data && data.error) errorMessage = data.error;
      } catch {
        // Keep default error message when response is not JSON.
      }
      throw new Error(errorMessage);
    }

    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName || 'update.CTUpdate';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(objectUrl);
  } catch (err) {
    showToast(err.message || 'Download failed', 'danger');
  }

  return false;
}
