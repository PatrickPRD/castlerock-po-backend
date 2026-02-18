// Ensure user is authenticated before loading page
ensureAuthenticated();

const token = localStorage.getItem("token");
const role = localStorage.getItem("role");

/* ============================
   AUTH GUARD
   ============================ */
if (role !== "super_admin") {
  location.href = "dashboard.html";
}

/* ============================
   STATE
   ============================ */
let currentPage = 1;
let currentFilters = {
  table: '',
  action: ''
};

/* ============================
   DOM ELEMENTS
   ============================ */
const auditTableBody = document.getElementById("auditTableBody");
const filterTable = document.getElementById("filterTable");
const filterAction = document.getElementById("filterAction");
const refreshBtn = document.getElementById("refreshBtn");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const pageIndicator = document.getElementById("pageIndicator");
const paginationInfo = document.getElementById("paginationInfo");
const changesModal = document.getElementById("changesModal");
const changesModalBody = document.getElementById("changesModalBody");

/* ============================
   API HELPER
   ============================ */
async function api(url, method = "GET", body) {
  const options = { method };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }

  const res = await authenticatedFetch(url, options);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

/* ============================
   MODAL HELPERS
   ============================ */
function openModal(modal) {
  modal.style.display = "flex";
}

function closeModal(modal) {
  modal.style.display = "none";
}

function bindModalClosers() {
  document.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const modalId = e.target.getAttribute("data-modal-close");
      const modal = document.getElementById(modalId);
      if (modal) closeModal(modal);
    });
  });
  
  // Close modal when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      closeModal(e.target);
    }
  });
}

bindModalClosers();

/* ============================
   LOAD AUDIT LOGS
   ============================ */
async function loadAuditLogs() {
  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: 50
    });
    
    if (currentFilters.table) {
      params.append('table', currentFilters.table);
    }
    
    if (currentFilters.action) {
      params.append('action', currentFilters.action);
    }

    console.log('📋 Fetching audit logs from:', `/audit?${params.toString()}`);
    const response = await api(`/audit?${params.toString()}`);
    console.log('📋 API Response:', response);
    
    const { data, pagination } = response;
    console.log('📋 Data from response:', data);
    console.log('📋 Pagination:', pagination);
    
    renderAuditTable(data);
    updatePagination(pagination);
  } catch (err) {
    console.error('❌ Failed to load audit logs:', err);
    console.error('❌ Error message:', err.message);
    auditTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>
          Failed to load audit logs: ${err.message}
        </td>
      </tr>
    `;
  }
}

/* ============================
   RENDER AUDIT TABLE
   ============================ */
function renderAuditTable(logs) {
  if (logs.length === 0) {
    auditTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-5 text-muted">
          <i class="bi bi-inbox fs-1 d-block mb-2"></i>
          No audit logs found
        </td>
      </tr>
    `;
    return;
  }
  
  auditTableBody.innerHTML = logs.map(log => {
    const timestamp = formatTimestamp(log.created_at);
    const userName = log.performed_by_name?.trim() || log.performed_by;
    const actionBadge = getActionBadge(log.action);
    const tableName = formatTableName(log.table_name);
    const hasChanges = log.old_values || log.new_values;
    
    return `
      <tr>
        <td>${timestamp}</td>
        <td>${userName}</td>
        <td>${actionBadge}</td>
        <td>${tableName}</td>
        <td class="text-center record-id-cell">${log.record_id || '—'}</td>
        <td class="text-center">
          ${hasChanges 
            ? `<button class="btn btn-sm btn-outline-primary" onclick="viewChanges(${log.id})">
                <i class="bi bi-eye"></i> View
              </button>`
            : '<span class="text-muted">—</span>'
          }
        </td>
      </tr>
    `;
  }).join('');
}

/* ============================
   VIEW CHANGES DETAIL
   ============================ */
window.viewChanges = async function(auditId) {
  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: 50,
      ...currentFilters
    });
    
    const response = await api(`/audit?${params.toString()}`);
    const log = response.data.find(l => l.id === auditId);
    
    if (!log) {
      alert('Audit log not found');
      return;
    }
    
    // Values are already parsed objects from the API
    const oldValues = log.old_values;
    const newValues = log.new_values;
    
    let changesHtml = '<div class="changes-detail">';
    
    // Add metadata section
    changesHtml += '<div class="audit-metadata mb-3">';
    changesHtml += `<div class="row g-2 small">`
    changesHtml += `<div class="col-md-6"><strong>User:</strong> ${log.performed_by_name?.trim() || log.performed_by}</div>`;
    changesHtml += `<div class="col-md-6"><strong>Date:</strong> ${new Date(log.created_at).toLocaleString('en-IE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })}</div>`;
    
    if (log.ip_address) {
      changesHtml += `<div class="col-md-6"><strong>IP Address:</strong> ${log.ip_address}</div>`;
    }
    
    if (log.user_agent) {
      const shortAgent = log.user_agent.split(' ').slice(0, 3).join(' ');
      changesHtml += `<div class="col-md-6"><strong>Browser:</strong> <span title="${log.user_agent}">${shortAgent}...</span></div>`;
    }
    
    changesHtml += '</div></div><hr>';
    
    if (log.action === 'CREATE') {
      changesHtml += '<h4>Created Values:</h4>';
      changesHtml += renderJsonTable(newValues);
    } else if (log.action === 'UPDATE') {
      changesHtml += '<h4>Changes:</h4>';
      changesHtml += renderChangesComparison(oldValues, newValues);
    } else if (log.action === 'DELETE' || log.action === 'CANCEL') {
      changesHtml += '<h4>Previous Values:</h4>';
      changesHtml += renderJsonTable(oldValues);
    } else if (log.action === 'MERGE') {
      changesHtml += '<h4>Merged Record:</h4>';
      changesHtml += renderJsonTable(oldValues);
      changesHtml += '<h4>Merged Into:</h4>';
      changesHtml += renderJsonTable(newValues);
    } else if (log.action === 'LOGIN') {
      changesHtml += '<h4>Login Details:</h4>';
      changesHtml += renderJsonTable(newValues);
    } else {
      changesHtml += '<h4>Details:</h4>';
      changesHtml += renderJsonTable(newValues || oldValues);
    }
    
    changesHtml += '</div>';
    
    changesModalBody.innerHTML = changesHtml;
    openModal(changesModal);
  } catch (err) {
    console.error('Failed to load change details:', err);
    alert('Failed to load changes: ' + err.message);
  }
};

/* ============================
   RENDER HELPERS
   ============================ */
function renderJsonTable(obj) {
  if (!obj || typeof obj !== 'object') {
    return '<p class="text-muted">No data</p>';
  }
  
  return `
    <table class="changes-table">
      ${Object.entries(obj).map(([key, value]) => `
        <tr>
          <td class="change-key">${formatFieldName(key)}</td>
          <td class="change-value">${formatValue(value, key)}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

function renderChangesComparison(oldValues, newValues) {
  if (!oldValues || !newValues) {
    return renderJsonTable(newValues || oldValues);
  }
  
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  
  return `
    <table class="changes-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Old Value</th>
          <th>New Value</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from(allKeys).map(key => {
          const oldVal = oldValues[key];
          const newVal = newValues[key];
          const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
          
          return `
            <tr class="${changed ? 'changed-row' : ''}">
              <td class="change-key">${formatFieldName(key)}</td>
              <td class="change-old-value">${formatValue(oldVal, key)}</td>
              <td class="change-new-value">${formatValue(newVal, key)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function formatFieldName(field) {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatCurrency(value) {
  if (typeof value !== 'number') {
    value = parseFloat(value);
  }
  return '€' + value.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatValue(value, fieldName = '') {
  if (value === null || value === undefined) {
    return '<span class="text-muted">null</span>';
  }
  
  if (typeof value === 'boolean') {
    return value ? '<span class="badge bg-success">true</span>' : '<span class="badge bg-secondary">false</span>';
  }
  
  if (typeof value === 'object') {
    return `<code>${JSON.stringify(value, null, 2)}</code>`;
  }
  
  // Format VAT rates as percentages
  if (typeof value === 'number' && fieldName.toLowerCase().includes('vat_rate')) {
    const percentage = (value * 100).toFixed(2);
    return `${percentage}%`;
  }
  
  // Format currency values
  if (typeof value === 'number' && (String(value).includes('.') || value > 1000)) {
    return formatCurrency(value);
  }
  
  // Format dates
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  
  return String(value);
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  
  return date.toLocaleString('en-IE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getActionBadge(action) {
  const badges = {
    'CREATE': '<span class="badge bg-success">CREATE</span>',
    'UPDATE': '<span class="badge bg-primary">UPDATE</span>',
    'DELETE': '<span class="badge bg-danger">DELETE</span>',
    'MERGE': '<span class="badge bg-warning text-dark">MERGE</span>',
    'CANCEL': '<span class="badge bg-warning">CANCEL</span>',
    'LOGIN': '<span class="badge bg-info">LOGIN</span>'
  };
  
  return badges[action] || `<span class="badge bg-secondary">${action}</span>`;
}

function formatTableName(table) {
  return table
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* ============================
   PAGINATION
   ============================ */
function updatePagination(pagination) {
  const { page, total, totalPages } = pagination;
  
  pageIndicator.textContent = `Page ${page} of ${totalPages}`;
  paginationInfo.textContent = `Total: ${total} records`;
  
  prevPageBtn.disabled = page <= 1;
  nextPageBtn.disabled = page >= totalPages;
}

/* ============================
   EVENT LISTENERS
   ============================ */
filterTable.addEventListener('change', () => {
  currentFilters.table = filterTable.value;
  currentPage = 1;
  loadAuditLogs();
});

filterAction.addEventListener('change', () => {
  currentFilters.action = filterAction.value;
  currentPage = 1;
  loadAuditLogs();
});

refreshBtn.addEventListener('click', () => {
  loadAuditLogs();
});

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    loadAuditLogs();
  }
});

nextPageBtn.addEventListener('click', () => {
  currentPage++;
  loadAuditLogs();
});

/* ============================
   TOAST NOTIFICATIONS
   ============================ */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `alert alert-${type === 'error' ? 'danger' : 'success'} alert-dismissible fade show`;
  toast.setAttribute('role', 'alert');
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 10000;
    min-width: 300px;
    box-shadow: 0 0.5rem 1rem rgba(0,0,0,0.15);
  `;
  
  toast.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 5000);
}

/* ============================
   INITIALIZE
   ============================ */
loadAuditLogs();
