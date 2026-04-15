ensureAuthenticated();

(() => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token || !['super_admin', 'admin'].includes(role)) {
    location.href = 'dashboard.html';
    return;
  }

  const isSuperAdmin = role === 'super_admin';
  const headers = { Authorization: 'Bearer ' + token };

  const tableBody = document.getElementById('costItemsTable');
  const filterPanel = document.getElementById('filterPanel');
  const searchInput = document.getElementById('costItemSearch');
  const searchClearBtn = document.getElementById('costItemSearchClear');
  const typeFilter = document.getElementById('typeFilter');
  const statusFilter = document.getElementById('statusFilter');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  const closeFiltersBtn = document.getElementById('closeFiltersBtn');
  const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
  const addCostItemBtn = document.getElementById('addCostItemBtn');
  const toggleDeletedBtn = document.getElementById('toggleDeletedBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const openThresholdsBtn = document.getElementById('openThresholdsBtn');
  const mergeTypesBtn = document.getElementById('mergeTypesBtn');
  const yellowThresholdInput = document.getElementById('yellowThresholdInput');
  const redThresholdInput = document.getElementById('redThresholdInput');
  const saveThresholdsBtn = document.getElementById('saveThresholdsBtn');

  const costItemForm = document.getElementById('costItemForm');
  const costItemIdInput = document.getElementById('costItemId');
  const costItemCodeInput = document.getElementById('costItemCode');
  const costItemTypeInput = document.getElementById('costItemType');
  const costItemUnitInput = document.getElementById('costItemUnit');
  const costItemDescriptionInput = document.getElementById('costItemDescription');
  const costItemCostPerInput = document.getElementById('costItemCostPer');
  const costItemModalTitle = document.getElementById('costItemModalTitle');
  const costItemSubmitBtn = document.getElementById('costItemSubmitBtn');
  const costUpdateHint = document.getElementById('costUpdateHint');
  const costItemTypeOptions = document.getElementById('costItemTypeOptions');
  const costItemUnitOptions = document.getElementById('costItemUnitOptions');

  const mergeTypesForm = document.getElementById('mergeTypesForm');
  const mergeSourceTypeInput = document.getElementById('mergeSourceType');
  const mergeTargetTypeInput = document.getElementById('mergeTargetType');
  const mergeSourceTypeOptions = document.getElementById('mergeSourceTypeOptions');
  const mergeTargetTypeOptions = document.getElementById('mergeTargetTypeOptions');

  const importForm = document.getElementById('importForm');
  const importFileInput = document.getElementById('importFile');
  const importValidationResult = document.getElementById('importValidationResult');
  const importSubmitBtn = document.getElementById('importSubmitBtn');

  const permanentDeleteForm = document.getElementById('permanentDeleteForm');
  const permanentDeleteIdInput = document.getElementById('permanentDeleteId');
  const permanentDeleteCodeInput = document.getElementById('permanentDeleteCode');
  const permanentDeleteCodeHint = document.getElementById('permanentDeleteCodeHint');

  const costItemModal = new bootstrap.Modal(document.getElementById('costItemModal'));
  const thresholdsModal = new bootstrap.Modal(document.getElementById('thresholdsModal'));
  const mergeTypesModal = new bootstrap.Modal(document.getElementById('mergeTypesModal'));
  const importModal = new bootstrap.Modal(document.getElementById('importModal'));
  const permanentDeleteModal = new bootstrap.Modal(document.getElementById('permanentDeleteModal'));
  const historyEditModal = new bootstrap.Modal(document.getElementById('historyEditModal'));
  const historyEditModalTitle = document.getElementById('historyEditModalTitle');
  const historyEditModalBody = document.getElementById('historyEditModalBody');

  let historyEditItemId = null;
  let historyEditRows = [];

  let items = [];
  let thresholdState = { yellow_threshold: null, red_threshold: null };
  let typeOptions = [];
  let unitOptions = [];
  let showDeleted = false;
  const collapsedGroups = new Set();
  const expandedItems = new Set();
  const historyCache = new Map();
  const historyLoading = new Set();
  let importValidationReady = false;
  let importValidationFileKey = '';

  function setCostItemMode(isUpdateMode) {
    const metadataFields = document.querySelectorAll('.cost-metadata-field');
    metadataFields.forEach((field) => {
      field.style.display = isUpdateMode ? 'none' : '';
    });

    costItemTypeInput.disabled = isUpdateMode;
    costItemUnitInput.disabled = isUpdateMode;
    costItemDescriptionInput.disabled = isUpdateMode;

    costItemTypeInput.required = !isUpdateMode;
    costItemUnitInput.required = !isUpdateMode;
    costItemDescriptionInput.required = !isUpdateMode;

    if (costUpdateHint) {
      costUpdateHint.classList.toggle('d-none', !isUpdateMode);
    }

    if (costItemSubmitBtn) {
      costItemSubmitBtn.textContent = isUpdateMode ? 'Update Cost' : 'Save Cost Item';
    }
  }

  if (isSuperAdmin) {
    document.querySelectorAll('.super-admin-only').forEach((element) => {
      element.style.display = '';
    });
  }

  function isAuthError(status, payload) {
    if (status === 401 || status === 403) {
      return true;
    }

    const message = String(payload?.error || payload?.message || '').toLowerCase();
    return message.includes('invalid token')
      || message.includes('jwt')
      || message.includes('token expired')
      || message.includes('expired token');
  }

  function forceLoginRedirect() {
    if (typeof redirectToLogin === 'function') {
      redirectToLogin();
      return;
    }

    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    window.location.href = 'login.html';
  }

  async function api(url, method = 'GET', body, extraHeaders = {}) {
    const res = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...extraHeaders
      },
      body
    });

    let payload = {};
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await res.json();
    }

    if (isAuthError(res.status, payload)) {
      forceLoginRedirect();
      throw new Error('Authentication required');
    }

    if (!res.ok) {
      throw new Error(payload.error || 'Request failed');
    }

    return payload;
  }

  function apiJson(url, method = 'GET', body) {
    return api(url, method, body ? JSON.stringify(body) : undefined, {
      'Content-Type': 'application/json'
    });
  }

  function numberValue(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function money(value) {
    return window.formatMoney ? window.formatMoney(value) : `€${numberValue(value).toFixed(2)}`;
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('en-IE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildImportFileKey(file) {
    if (!file) {
      return '';
    }

    return [file.name, file.size, file.lastModified].join('|');
  }

  function resetImportValidationUI() {
    importValidationReady = false;
    importValidationFileKey = '';

    if (importValidationResult) {
      importValidationResult.classList.add('d-none');
      importValidationResult.innerHTML = '';
    }

    if (importSubmitBtn) {
      importSubmitBtn.textContent = 'Validate';
      importSubmitBtn.classList.remove('btn-success');
      importSubmitBtn.classList.add('btn-primary');
    }
  }

  function renderImportValidationResult(result) {
    if (!importValidationResult) {
      return;
    }

    const summary = result.summary || {};
    const errors = Array.isArray(result.errors) ? result.errors : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];
    const details = Array.isArray(result.details) ? result.details : [];

    const summaryHtml = `
      <div class="alert ${result.valid ? 'alert-success' : 'alert-warning'} mb-2">
        <div><strong>Validation ${result.valid ? 'passed' : 'requires attention'}.</strong></div>
        <div class="small mt-1">
          Rows scanned: ${numberValue(summary.rows_scanned)} | 
          Valid rows: ${numberValue(summary.valid_rows)} | 
          To insert: ${numberValue(summary.to_insert)} | 
          To update: ${numberValue(summary.to_update)} | 
          Unchanged: ${numberValue(summary.unchanged)}
        </div>
      </div>
    `;

    const errorHtml = errors.length
      ? `<div class="small text-danger mb-2"><strong>Errors:</strong><ul class="mb-0 mt-1">${errors.slice(0, 20).map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></div>`
      : '';

    const warningHtml = warnings.length
      ? `<div class="small text-warning-emphasis"><strong>Warnings:</strong><ul class="mb-0 mt-1">${warnings.slice(0, 20).map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></div>`
      : '';

    const previewRows = details.slice(0, 25).map((detail) => {
      const actionRaw = String(detail.action || '').toLowerCase();
      const actionLabel = actionRaw || '-';
      const badgeClass = actionRaw === 'insert'
        ? 'bg-success-subtle text-success-emphasis'
        : actionRaw === 'update'
          ? 'bg-primary-subtle text-primary-emphasis'
          : actionRaw === 'unchanged'
            ? 'bg-secondary-subtle text-secondary-emphasis'
            : 'bg-danger-subtle text-danger-emphasis';

      return `
        <tr>
          <td class="text-end">${numberValue(detail.row)}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(actionLabel)}</span></td>
          <td>${escapeHtml(detail.code || '')}</td>
          <td>${escapeHtml(detail.description || detail.message || '')}</td>
        </tr>
      `;
    }).join('');

    const detailPreviewHtml = details.length
      ? `
        <div class="mt-3">
          <div class="small fw-semibold mb-1">Row Preview (first ${Math.min(25, details.length)} of ${details.length})</div>
          <div class="table-responsive" style="max-height: 240px;">
            <table class="table table-sm table-bordered align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th style="width: 64px;">Row</th>
                  <th style="width: 110px;">Action</th>
                  <th style="width: 110px;">Code</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${previewRows}
              </tbody>
            </table>
          </div>
        </div>
      `
      : '';

    importValidationResult.innerHTML = `${summaryHtml}${errorHtml}${warningHtml}${detailPreviewHtml}`;
    importValidationResult.classList.remove('d-none');
  }

  function populateDataList(element, values) {
    element.innerHTML = values
      .filter(Boolean)
      .map(value => `<option value="${escapeHtml(value)}"></option>`)
      .join('');
  }

  function applyThresholdInputs() {
    yellowThresholdInput.value = thresholdState.yellow_threshold ?? '';
    redThresholdInput.value = thresholdState.red_threshold ?? '';
  }

  function toggleFilters() {
    if (!filterPanel) {
      return;
    }
    filterPanel.style.display = filterPanel.style.display === 'none' ? 'block' : 'none';
  }

  function populateTypeFilter() {
    const selectedValue = typeFilter.value;
    typeFilter.innerHTML = '<option value="">All Types</option>';
    typeOptions.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeFilter.appendChild(option);
    });
    typeFilter.value = typeOptions.includes(selectedValue) ? selectedValue : '';
  }

  function renderTable() {
    const query = String(searchInput.value || '').trim().toLowerCase();
    const selectedType = typeFilter.value;
    const selectedStatus = statusFilter.value;

    const filteredItems = items.filter((item) => {
      const matchesDeleted = showDeleted || !item.is_deleted;
      const matchesQuery = !query || [item.code, item.type, item.description].some((value) => String(value || '').toLowerCase().includes(query));
      const matchesType = !selectedType || item.type === selectedType;
      const matchesStatus = !selectedStatus || item.comparison?.status === selectedStatus;
      return matchesDeleted && matchesQuery && matchesType && matchesStatus;
    });

    if (!filteredItems.length) {
      tableBody.innerHTML = '<tr><td colspan="4" class="empty-state">No cost items found for the current filters.</td></tr>';
      return;
    }

    const grouped = filteredItems.reduce((acc, item) => {
      const key = item.type || 'Uncategorised';
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});

    const rows = [];
    Object.keys(grouped).sort((a, b) => a.localeCompare(b)).forEach((type) => {
      const groupItems = grouped[type];
      const isCollapsed = !collapsedGroups.has(type);
      rows.push(`
        <tr class="group-row">
          <td colspan="4">
            <button class="group-toggle" type="button" data-group-toggle="${escapeHtml(type)}">
              ${isCollapsed ? '+' : '-'} ${escapeHtml(type)} (${groupItems.length})
            </button>
          </td>
        </tr>
      `);

      if (isCollapsed) {
        return;
      }

      groupItems.forEach((item) => {
        const comparison = item.comparison || {};
        const status = comparison.status || 'green';
        const delta = Number(comparison.delta_percent);
        const deltaClass = Number.isFinite(delta) ? (delta > 0 ? 'delta-positive' : delta < 0 ? 'delta-negative' : '') : '';
        const isExpanded = expandedItems.has(Number(item.id));
        const safeId = Number(item.id);
        const history = historyCache.get(safeId);
        const detailCards = [
          { label: 'Type', value: escapeHtml(item.type || '-') },
          { label: '3M Avg', value: comparison.average_cost === null ? '-' : money(comparison.average_cost) },
          { label: 'Orders', value: String(numberValue(comparison.sample_count)) },
          { label: 'Delta', value: Number.isFinite(delta) ? `${delta.toFixed(2)}%` : '-', className: deltaClass },
          { label: 'Last Updated', value: formatDate(item.last_updated || item.updated_at) },
          { label: 'Min', value: comparison.min_cost === null ? '-' : money(comparison.min_cost) },
          { label: 'Max', value: comparison.max_cost === null ? '-' : money(comparison.max_cost) }
        ].map((entry) => `
          <div class="detail-card">
            <span class="detail-label">${entry.label}</span>
            <span class="detail-value ${entry.className || ''}">${entry.value}</span>
          </div>
        `).join('');

        rows.push(`
          <tr class="cost-item-row status-row-${status} ${item.is_deleted ? 'is-deleted' : ''}">
            <td class="code-cell">
              <button class="expand-toggle" type="button" data-expand-toggle="${safeId}" data-expand-group="${escapeHtml(type)}" aria-expanded="${isExpanded ? 'true' : 'false'}">
                ${isExpanded ? '-' : '+'}
              </button>
              <span>${escapeHtml(item.code)}</span>
            </td>
            <td>${escapeHtml(item.description)}</td>
            <td class="text-end">${money(item.cost_per)}</td>
            <td>${escapeHtml(item.unit)}</td>
          </tr>
          <tr class="expanded-row ${isExpanded ? 'is-open' : ''}" data-expanded-row="${safeId}">
            <td colspan="4">
              <div class="expanded-panel">
                <div class="detail-grid">${detailCards}</div>
                ${renderHistoryCard(safeId, history)}
                <div class="expanded-actions actions-cell">
                  ${item.is_deleted
                    ? (isSuperAdmin
                      ? `<button class="btn btn-sm btn-outline-success" type="button" data-action="restore" data-id="${item.id}">Restore</button>
                         <button class="btn btn-sm btn-outline-danger" type="button" data-action="permanent-delete" data-id="${item.id}" data-code="${escapeHtml(item.code)}">Delete Permanently</button>`
                      : '')
                    : `${isSuperAdmin ? `<button class="btn btn-sm btn-outline-primary" type="button" data-action="edit" data-id="${item.id}">Update</button>` : ''}
                       ${isSuperAdmin ? `<button class="btn btn-sm btn-outline-secondary" type="button" data-action="edit-history" data-id="${item.id}"><i class="bi bi-clock-history me-1"></i>History</button>` : ''}
                       <button class="btn btn-sm btn-outline-danger" type="button" data-action="soft-delete" data-id="${item.id}">Delete</button>`}
                </div>
              </div>
            </td>
          </tr>
        `);
      });
    });

    tableBody.innerHTML = rows.join('');
    ensureExpandedHistoryLoaded();
  }

  function buildSparkline(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return '';
    }

    const width = 520;
    const height = 120;
    const left = 28;
    const right = 16;
    const top = 14;
    const bottom = 24;

    const normalized = points.map((point, index) => {
      const date = new Date(point.at);
      return {
        x: index,
        y: numberValue(point.cost_per, 0),
        at: Number.isNaN(date.getTime()) ? null : date
      };
    });

    const values = normalized.map((point) => point.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const usableWidth = width - left - right;
    const usableHeight = height - top - bottom;

    const toX = (index) => left + ((normalized.length === 1 ? 0 : index / (normalized.length - 1)) * usableWidth);
    const toY = (value) => top + ((max - value) / range) * usableHeight;

    const polyline = normalized
      .map((point, index) => `${toX(index).toFixed(2)},${toY(point.y).toFixed(2)}`)
      .join(' ');

    const circles = normalized
      .map((point, index) => `
        <circle cx="${toX(index).toFixed(2)}" cy="${toY(point.y).toFixed(2)}" r="3.2" class="history-point"></circle>
      `)
      .join('');

    return `
      <svg viewBox="0 0 ${width} ${height}" class="history-chart" role="img" aria-label="Cost change trend">
        <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" class="history-axis"></line>
        <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" class="history-axis"></line>
        <polyline points="${polyline}" class="history-line"></polyline>
        ${circles}
      </svg>
    `;
  }

  function renderHistoryCard(itemId, history) {
    if (historyLoading.has(itemId)) {
      return '<div class="history-card"><div class="history-note">Loading change graph...</div></div>';
    }

    if (!history) {
      return '<div class="history-card"><div class="history-note">Expand to load change graph.</div></div>';
    }

    if (history.error) {
      return `<div class="history-card"><div class="history-note">${escapeHtml(history.error)}</div></div>`;
    }

    const points = Array.isArray(history.points) ? history.points : [];
    const chart = buildSparkline(points);
    if (!chart) {
      return '<div class="history-card"><div class="history-note">No changes recorded yet.</div></div>';
    }

    const first = points[0];
    const last = points[points.length - 1];
    return `
      <div class="history-card">
        <div class="history-head">
          <span class="history-title">Cost Change Trend</span>
          <span class="history-meta">${money(first.cost_per)} to ${money(last.cost_per)} (${points.length - 1} updates)</span>
        </div>
        ${chart}
      </div>
    `;
  }

  async function loadHistoryForItem(itemId) {
    if (historyCache.has(itemId) || historyLoading.has(itemId)) {
      return;
    }

    historyLoading.add(itemId);
    renderTable();

    try {
      const history = await apiJson(`/cost-items/${itemId}/history?limit=24`);
      historyCache.set(itemId, history);
    } catch (error) {
      historyCache.set(itemId, { error: error.message || 'Failed to load graph data', points: [] });
    } finally {
      historyLoading.delete(itemId);
      renderTable();
    }
  }

  function ensureExpandedHistoryLoaded() {
    expandedItems.forEach((itemId) => {
      loadHistoryForItem(itemId);
    });
  }

  async function loadMetaOptions() {
    const [types, units] = await Promise.all([
      apiJson('/cost-items/meta/types'),
      apiJson('/cost-items/meta/units')
    ]);

    typeOptions = Array.isArray(types) ? types : [];
    unitOptions = Array.isArray(units) ? units : [];

    populateDataList(costItemTypeOptions, typeOptions);
    populateDataList(costItemUnitOptions, unitOptions);
    populateDataList(mergeSourceTypeOptions, typeOptions);
    populateDataList(mergeTargetTypeOptions, typeOptions);
    populateTypeFilter();
  }

  async function loadThresholds() {
    thresholdState = await apiJson('/cost-items/settings/thresholds');
    applyThresholdInputs();
  }

  async function loadItems() {
    const query = showDeleted && isSuperAdmin ? '?includeDeleted=true' : '';
    items = await apiJson(`/cost-items${query}`);
    historyCache.clear();
    historyLoading.clear();
    renderTable();
  }

  async function reloadAll() {
    await Promise.all([loadMetaOptions(), loadThresholds(), loadItems()]);
  }

  function resetCostItemForm() {
    costItemForm.reset();
    costItemIdInput.value = '';
    costItemCodeInput.value = 'Generated on save';
    setCostItemMode(false);
    costItemTypeInput.readOnly = false;
    costItemUnitInput.readOnly = false;
    costItemDescriptionInput.readOnly = false;
    costItemModalTitle.textContent = 'Add Cost Item';
  }

  function openCreateModal() {
    resetCostItemForm();
    costItemModal.show();
  }

  function openEditModal(itemId) {
    const item = items.find(entry => Number(entry.id) === Number(itemId));
    if (!item) {
      showToast('Cost item not found', 'error');
      return;
    }

    costItemIdInput.value = item.id;
    costItemCodeInput.value = item.code;
    costItemTypeInput.value = item.type || '';
    costItemUnitInput.value = item.unit || '';
    costItemDescriptionInput.value = item.description || '';
    costItemCostPerInput.value = numberValue(item.cost_per).toFixed(2);
    setCostItemMode(true);
    costItemTypeInput.readOnly = true;
    costItemUnitInput.readOnly = true;
    costItemDescriptionInput.readOnly = true;
    costItemModalTitle.textContent = 'Update Cost';
    costItemModal.show();
  }

  async function saveCostItem(event) {
    event.preventDefault();

    const id = costItemIdInput.value;
    const costPer = numberValue(costItemCostPerInput.value, NaN);
    if (!Number.isFinite(costPer) || costPer < 0) {
      showToast('Cost is required and must be a valid non-negative number', 'warning');
      return;
    }

    try {
      if (id) {
        await apiJson(`/cost-items/${id}`, 'PUT', { costPer });
        showToast('Cost item updated', 'success');
      } else {
        const payload = {
          type: costItemTypeInput.value.trim(),
          unit: costItemUnitInput.value.trim(),
          description: costItemDescriptionInput.value.trim(),
          costPer
        };

        if (!payload.type || !payload.unit || !payload.description) {
          showToast('Type, unit, description, and cost are required', 'warning');
          return;
        }

        await apiJson('/cost-items', 'POST', payload);
        showToast('Cost item created', 'success');
      }

      costItemModal.hide();
      await reloadAll();
    } catch (error) {
      showToast(error.message || 'Failed to save cost item', 'error');
    }
  }

  async function softDeleteItem(itemId) {
    if (!(await confirmDialog('Delete this cost item?'))) {
      return;
    }

    try {
      await apiJson(`/cost-items/${itemId}`, 'DELETE', {});
      showToast('Cost item deleted', 'success');
      await loadItems();
    } catch (error) {
      showToast(error.message || 'Failed to delete cost item', 'error');
    }
  }

  async function restoreItem(itemId) {
    try {
      await apiJson(`/cost-items/${itemId}/restore`, 'POST', {});
      showToast('Cost item restored', 'success');
      await reloadAll();
    } catch (error) {
      showToast(error.message || 'Failed to restore cost item', 'error');
    }
  }

  function openPermanentDelete(itemId, code) {
    permanentDeleteIdInput.value = itemId;
    permanentDeleteCodeInput.value = '';
    permanentDeleteCodeHint.textContent = `Enter ${code} to confirm.`;
    permanentDeleteModal.show();
  }

  async function openHistoryEditModal(itemId) {
    const item = items.find((entry) => Number(entry.id) === Number(itemId));
    historyEditItemId = Number(itemId);
    historyEditRows = [];
    historyEditModalTitle.textContent = item
      ? `Cost History – ${item.code} · ${item.description}`
      : 'Cost History';
    historyEditModalBody.innerHTML = '<div class="p-3 text-muted small">Loading...</div>';
    historyEditModal.show();

    try {
      const rows = await apiJson(`/cost-items/${historyEditItemId}/history/admin`);
      historyEditRows = Array.isArray(rows) ? rows : [];
      renderHistoryEditTable();
    } catch (error) {
      historyEditModalBody.innerHTML = `<div class="p-3 text-danger small">${escapeHtml(error.message || 'Failed to load history')}</div>`;
    }
  }

  function renderHistoryEditTable(editingId = null) {
    if (!historyEditRows.length) {
      historyEditModalBody.innerHTML = '<div class="p-3 text-muted small">No history entries found.</div>';
      return;
    }

    const rowsHtml = historyEditRows.map((row) => {
      const isEditing = editingId === row.id;
      const dateStr = row.changed_at
        ? new Date(row.changed_at).toLocaleString('en-IE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '-';
      const datetimeLocal = row.changed_at
        ? new Date(row.changed_at).toISOString().slice(0, 16)
        : '';

      if (isEditing) {
        return `
          <tr data-history-id="${row.id}">
            <td><input type="datetime-local" class="form-control form-control-sm" id="hedit-date-${row.id}" value="${escapeHtml(datetimeLocal)}" style="min-width:180px;"></td>
            <td>${escapeHtml(row.change_source || '-')}</td>
            <td><input type="number" step="0.01" min="0" class="form-control form-control-sm text-end" id="hedit-new-${row.id}" value="${Number(row.new_cost_per).toFixed(2)}" style="width:100px;"></td>
            <td>
              <div class="d-flex gap-1">
                <button class="btn btn-sm btn-success" type="button" data-h-action="save" data-history-id="${row.id}">Save</button>
                <button class="btn btn-sm btn-outline-secondary" type="button" data-h-action="cancel">Cancel</button>
              </div>
            </td>
          </tr>
        `;
      }

      return `
        <tr data-history-id="${row.id}">
          <td class="text-nowrap">${escapeHtml(dateStr)}</td>
          <td>${escapeHtml(row.change_source || '-')}</td>
          <td class="text-end text-nowrap">${money(row.new_cost_per)}</td>
          <td>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-primary" type="button" data-h-action="edit" data-history-id="${row.id}">Edit</button>
              <button class="btn btn-sm btn-outline-danger" type="button" data-h-action="delete" data-history-id="${row.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    historyEditModalBody.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-bordered align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Date</th>
              <th>Source</th>
              <th class="text-end">Cost</th>
              <th style="width:150px;">Actions</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  async function saveThresholds() {
    try {
      thresholdState = await apiJson('/cost-items/settings/thresholds', 'PUT', {
        yellowThreshold: numberValue(yellowThresholdInput.value, 0),
        redThreshold: numberValue(redThresholdInput.value, 0)
      });
      applyThresholdInputs();
      await loadItems();
      showToast('Thresholds updated', 'success');
      thresholdsModal.hide();
    } catch (error) {
      showToast(error.message || 'Failed to update thresholds', 'error');
    }
  }

  async function handleImport(event) {
    event.preventDefault();
    const file = importFileInput.files[0];
    if (!file) {
      showToast('Choose an Excel file first', 'warning');
      return;
    }

    const fileKey = buildImportFileKey(file);

    const formData = new FormData();
    formData.append('file', file);

    try {
      if (!importValidationReady || importValidationFileKey !== fileKey) {
        const validation = await api('/cost-items/import?dryRun=1', 'POST', formData);
        renderImportValidationResult(validation);

        if (!validation.valid) {
          importValidationReady = false;
          importValidationFileKey = '';
          showToast('Validation found issues. Fix the file and validate again.', 'warning');
          return;
        }

        importValidationReady = true;
        importValidationFileKey = fileKey;
        if (importSubmitBtn) {
          importSubmitBtn.textContent = 'Apply Import';
          importSubmitBtn.classList.remove('btn-primary');
          importSubmitBtn.classList.add('btn-success');
        }
        showToast('Validation passed. Click Apply Import to continue.', 'success');
        return;
      }

      const result = await api('/cost-items/import', 'POST', formData);
      showToast(`Import complete: ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged`, 'success');
      importModal.hide();
      importForm.reset();
      resetImportValidationUI();
      await reloadAll();
    } catch (error) {
      showToast(error.message || 'Failed to import cost items', 'error');
    }
  }

  async function handleExport() {
    try {
      const res = await fetch('/cost-items/export.xlsx', { headers });
      if (!res.ok) {
        throw new Error('Failed to export cost items');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cost-items.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showToast(error.message || 'Failed to export cost items', 'error');
    }
  }

  async function handleMergeTypes(event) {
    event.preventDefault();

    const keepType = mergeTargetTypeInput.value.trim();
    const mergeType = mergeSourceTypeInput.value.trim();

    if (!keepType || !mergeType) {
      showToast('Both type fields are required', 'warning');
      return;
    }

    try {
      const result = await apiJson('/cost-items/types/merge', 'POST', { keepType, mergeType });
      showToast(`Merged ${result.affected} cost items`, 'success');
      mergeTypesModal.hide();
      mergeTypesForm.reset();
      await reloadAll();
    } catch (error) {
      showToast(error.message || 'Failed to merge types', 'error');
    }
  }

  async function handlePermanentDelete(event) {
    event.preventDefault();
    const itemId = permanentDeleteIdInput.value;
    try {
      await apiJson(`/cost-items/${itemId}/permanent`, 'DELETE', {
        confirmationCode: permanentDeleteCodeInput.value.trim()
      });
      showToast('Cost item permanently deleted', 'success');
      permanentDeleteModal.hide();
      await reloadAll();
    } catch (error) {
      showToast(error.message || 'Failed to permanently delete cost item', 'error');
    }
  }

  function escapeSelectorValue(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(String(value));
    }

    return String(value).replace(/"/g, '\\"');
  }

  function scrollToTableRow(selector) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const row = tableBody.querySelector(selector);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
  }

  tableBody.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-group-toggle]');
    if (toggle) {
      const group = toggle.getAttribute('data-group-toggle');
      let openedGroup = null;
      if (collapsedGroups.has(group)) {
        // Close current open group.
        collapsedGroups.delete(group);
        expandedItems.clear();
        openedGroup = group;
      } else {
        // Open only one group at a time.
        collapsedGroups.clear();
        collapsedGroups.add(group);
        expandedItems.clear();
      }
      renderTable();
      if (openedGroup) {
        scrollToTableRow(`[data-group-toggle="${escapeSelectorValue(openedGroup)}"]`);
      }
      return;
    }

    const expandToggle = event.target.closest('[data-expand-toggle]');
    if (expandToggle) {
      const itemId = Number(expandToggle.getAttribute('data-expand-toggle'));
      const group = expandToggle.getAttribute('data-expand-group');
      let openedItemId = null;
      if (expandedItems.has(itemId)) {
        expandedItems.delete(itemId);
      } else {
        // Keep only one group open and one item expanded at a time.
        if (group) {
          collapsedGroups.clear();
          collapsedGroups.add(group);
        }
        expandedItems.clear();
        expandedItems.add(itemId);
        openedItemId = itemId;
      }
      renderTable();
      if (openedItemId) {
        scrollToTableRow(`[data-expanded-row="${openedItemId}"]`);
      }
      return;
    }

    // Clicking anywhere on a type or item row toggles it, excluding interactive controls.
    const clickedInteractive = event.target.closest('button, a, input, select, textarea, label');
    if (!clickedInteractive) {
      const groupRow = event.target.closest('tr.group-row');
      if (groupRow) {
        const groupToggle = groupRow.querySelector('[data-group-toggle]');
        if (groupToggle) {
          groupToggle.click();
          return;
        }
      }

      const itemRow = event.target.closest('tr.cost-item-row');
      if (itemRow) {
        const itemToggle = itemRow.querySelector('[data-expand-toggle]');
        if (itemToggle) {
          itemToggle.click();
          return;
        }
      }
    }

    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
      return;
    }

    const action = actionButton.getAttribute('data-action');
    const itemId = actionButton.getAttribute('data-id');
    if (action === 'edit') {
      openEditModal(itemId);
    } else if (action === 'soft-delete') {
      softDeleteItem(itemId);
    } else if (action === 'restore') {
      restoreItem(itemId);
    } else if (action === 'permanent-delete') {
      openPermanentDelete(itemId, actionButton.getAttribute('data-code'));
    } else if (action === 'edit-history') {
      openHistoryEditModal(itemId);
    }
  });

  if (historyEditModalBody) {
    historyEditModalBody.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-h-action]');
      if (!btn) return;

      const hAction = btn.getAttribute('data-h-action');
      const historyId = Number(btn.getAttribute('data-history-id'));

      if (hAction === 'edit') {
        renderHistoryEditTable(historyId);
      } else if (hAction === 'cancel') {
        renderHistoryEditTable();
      } else if (hAction === 'save') {
        const newCostInput = document.getElementById(`hedit-new-${historyId}`);
        const dateInput = document.getElementById(`hedit-date-${historyId}`);

        const payload = {};
        if (newCostInput) payload.new_cost_per = Number(newCostInput.value);
        if (dateInput && dateInput.value) payload.changed_at = new Date(dateInput.value).toISOString();

        try {
          await apiJson(`/cost-items/history/${historyId}`, 'PUT', payload);
          const idx = historyEditRows.findIndex((row) => row.id === historyId);
          if (idx !== -1) {
            if (payload.new_cost_per !== undefined) historyEditRows[idx].new_cost_per = payload.new_cost_per;
            if (payload.old_cost_per !== undefined) historyEditRows[idx].old_cost_per = payload.old_cost_per;
            if (payload.changed_at !== undefined) historyEditRows[idx].changed_at = payload.changed_at;
          }
          showToast('History entry updated', 'success');
          renderHistoryEditTable();
          historyCache.delete(historyEditItemId);
          loadHistoryForItem(historyEditItemId);
        } catch (error) {
          showToast(error.message || 'Failed to update entry', 'error');
        }
      } else if (hAction === 'delete') {
        if (!(await confirmDialog('Delete this history entry? This cannot be undone.'))) return;
        try {
          await apiJson(`/cost-items/history/${historyId}`, 'DELETE', {});
          historyEditRows = historyEditRows.filter((row) => row.id !== historyId);
          showToast('History entry deleted', 'success');
          renderHistoryEditTable();
          historyCache.delete(historyEditItemId);
          loadHistoryForItem(historyEditItemId);
        } catch (error) {
          showToast(error.message || 'Failed to delete entry', 'error');
        }
      }
    });
  }

  searchInput.addEventListener('input', renderTable);
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      renderTable();
    });
  }
  typeFilter.addEventListener('change', renderTable);
  statusFilter.addEventListener('change', renderTable);
  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    typeFilter.value = '';
    statusFilter.value = '';
    renderTable();
  });
  if (closeFiltersBtn) {
    closeFiltersBtn.addEventListener('click', toggleFilters);
  }
  if (toggleFiltersBtn) {
    toggleFiltersBtn.addEventListener('click', toggleFilters);
  }

  addCostItemBtn.addEventListener('click', openCreateModal);
  exportBtn.addEventListener('click', handleExport);
  importBtn.addEventListener('click', () => importModal.show());
  costItemForm.addEventListener('submit', saveCostItem);
  importForm.addEventListener('submit', handleImport);
    importFileInput.addEventListener('change', () => {
      resetImportValidationUI();
    });

    const importModalElement = document.getElementById('importModal');
    if (importModalElement) {
      importModalElement.addEventListener('hidden.bs.modal', () => {
        resetImportValidationUI();
        importForm.reset();
      });
    }

  permanentDeleteForm.addEventListener('submit', handlePermanentDelete);

  if (isSuperAdmin) {
    if (openThresholdsBtn) {
      openThresholdsBtn.addEventListener('click', () => {
        applyThresholdInputs();
        thresholdsModal.show();
      });
    }

    toggleDeletedBtn.addEventListener('click', async () => {
      showDeleted = !showDeleted;
      toggleDeletedBtn.textContent = showDeleted ? 'Hide Deleted' : 'Show Deleted';
      await loadItems();
    });

    mergeTypesBtn.addEventListener('click', () => mergeTypesModal.show());
    mergeTypesForm.addEventListener('submit', handleMergeTypes);
    saveThresholdsBtn.addEventListener('click', saveThresholds);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.loadCurrencySettings) {
      try {
        await window.loadCurrencySettings();
      } catch (_) {}
    }

    try {
      await reloadAll();
    } catch (error) {
      showToast(error.message || 'Failed to load construction cost comparison data', 'error');
    }
  });
})();