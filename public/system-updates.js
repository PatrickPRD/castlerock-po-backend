/* ============================================================
   system-updates.js — Super Admin Update Management
   ============================================================ */

let _parsedPackageJson = null;
let _uploadModal = null;
let _detailModal = null;

document.addEventListener('DOMContentLoaded', () => {
  _uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
  _detailModal = new bootstrap.Modal(document.getElementById('detailModal'));

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
    const actionBadge = f.action === 'delete'
      ? '<span class="badge bg-danger">Delete</span>'
      : f.isNew
        ? '<span class="badge bg-success">New</span>'
        : '<span class="badge bg-primary">Update</span>';
    const statusBadge = f.alreadyCurrent
      ? '<span class="badge bg-secondary">Already current</span>'
      : '<span class="badge bg-warning text-dark">Will change</span>';
    return `<tr>
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
  return localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
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
