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
  const mergeTypesBtn = document.getElementById('mergeTypesBtn');
  const thresholdCard = document.getElementById('thresholdCard');
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
  const costItemTypeOptions = document.getElementById('costItemTypeOptions');
  const costItemUnitOptions = document.getElementById('costItemUnitOptions');

  const mergeTypesForm = document.getElementById('mergeTypesForm');
  const mergeSourceTypeInput = document.getElementById('mergeSourceType');
  const mergeTargetTypeInput = document.getElementById('mergeTargetType');
  const mergeSourceTypeOptions = document.getElementById('mergeSourceTypeOptions');
  const mergeTargetTypeOptions = document.getElementById('mergeTargetTypeOptions');

  const importForm = document.getElementById('importForm');
  const importFileInput = document.getElementById('importFile');

  const permanentDeleteForm = document.getElementById('permanentDeleteForm');
  const permanentDeleteIdInput = document.getElementById('permanentDeleteId');
  const permanentDeleteCodeInput = document.getElementById('permanentDeleteCode');
  const permanentDeleteCodeHint = document.getElementById('permanentDeleteCodeHint');

  const costItemModal = new bootstrap.Modal(document.getElementById('costItemModal'));
  const mergeTypesModal = new bootstrap.Modal(document.getElementById('mergeTypesModal'));
  const importModal = new bootstrap.Modal(document.getElementById('importModal'));
  const permanentDeleteModal = new bootstrap.Modal(document.getElementById('permanentDeleteModal'));

  let items = [];
  let thresholdState = { yellow_threshold: null, red_threshold: null };
  let typeOptions = [];
  let unitOptions = [];
  let showDeleted = false;
  const collapsedGroups = new Set();
  const expandedItems = new Set();

  if (isSuperAdmin) {
    document.querySelectorAll('.super-admin-only').forEach((element) => {
      element.style.display = '';
    });
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
      tableBody.innerHTML = '<tr><td colspan="10" class="empty-state">No cost items found for the current filters.</td></tr>';
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
      const isCollapsed = collapsedGroups.has(type);
      rows.push(`
        <tr class="group-row">
          <td colspan="10">
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
        const detail = [
          `Samples: <strong>${numberValue(comparison.sample_count)}</strong>`,
          `Min: <strong>${comparison.min_cost === null ? '-' : money(comparison.min_cost)}</strong>`,
          `Max: <strong>${comparison.max_cost === null ? '-' : money(comparison.max_cost)}</strong>`
        ].join(' • ');

        rows.push(`
          <tr class="cost-item-row ${item.is_deleted ? 'is-deleted' : ''}">
            <td>
              <button class="expand-toggle" type="button" data-expand-toggle="${safeId}" aria-expanded="${isExpanded ? 'true' : 'false'}">
                ${isExpanded ? '-' : '+'}
              </button>
            </td>
            <td>${escapeHtml(item.code)}</td>
            <td>${escapeHtml(item.type)}</td>
            <td>${escapeHtml(item.description)}</td>
            <td class="text-end">${money(item.cost_per)} / ${escapeHtml(item.unit)}</td>
            <td class="text-end">${comparison.average_cost === null ? '-' : money(comparison.average_cost)}</td>
            <td class="text-end">${comparison.latest_cost === null ? '-' : money(comparison.latest_cost)}</td>
            <td class="text-end ${deltaClass}">${Number.isFinite(delta) ? `${delta.toFixed(2)}%` : '-'}</td>
            <td>${formatDate(item.last_updated || item.updated_at)}</td>
            <td><span class="status-pill status-${status}">${status}</span></td>
          </tr>
          <tr class="expanded-row ${isExpanded ? 'is-open' : ''}" data-expanded-row="${safeId}">
            <td colspan="10">
              <div class="expanded-panel">
                <div class="comparison-detail">${detail}</div>
                <div class="expanded-actions actions-cell">
                  ${item.is_deleted
                    ? (isSuperAdmin
                      ? `<button class="btn btn-sm btn-outline-success" type="button" data-action="restore" data-id="${item.id}">Restore</button>
                         <button class="btn btn-sm btn-outline-danger" type="button" data-action="permanent-delete" data-id="${item.id}" data-code="${escapeHtml(item.code)}">Delete Permanently</button>`
                      : '')
                    : `<button class="btn btn-sm btn-outline-primary" type="button" data-action="edit" data-id="${item.id}">Edit</button>
                       <button class="btn btn-sm btn-outline-danger" type="button" data-action="soft-delete" data-id="${item.id}">Delete</button>`}
                </div>
              </div>
            </td>
          </tr>
        `);
      });
    });

    tableBody.innerHTML = rows.join('');
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
    renderTable();
  }

  async function reloadAll() {
    await Promise.all([loadMetaOptions(), loadThresholds(), loadItems()]);
  }

  function resetCostItemForm() {
    costItemForm.reset();
    costItemIdInput.value = '';
    costItemCodeInput.value = 'Generated on save';
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
    costItemModalTitle.textContent = 'Edit Cost Item';
    costItemModal.show();
  }

  async function saveCostItem(event) {
    event.preventDefault();

    const id = costItemIdInput.value;
    const payload = {
      type: costItemTypeInput.value.trim(),
      unit: costItemUnitInput.value.trim(),
      description: costItemDescriptionInput.value.trim(),
      costPer: numberValue(costItemCostPerInput.value)
    };

    if (!payload.type || !payload.unit || !payload.description) {
      showToast('Type, unit, description, and cost are required', 'warning');
      return;
    }

    try {
      if (id) {
        await apiJson(`/cost-items/${id}`, 'PUT', payload);
        showToast('Cost item updated', 'success');
      } else {
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
    if (!window.confirm('Soft delete this cost item?')) {
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

  async function saveThresholds() {
    try {
      thresholdState = await apiJson('/cost-items/settings/thresholds', 'PUT', {
        yellowThreshold: numberValue(yellowThresholdInput.value, 0),
        redThreshold: numberValue(redThresholdInput.value, 0)
      });
      applyThresholdInputs();
      await loadItems();
      showToast('Thresholds updated', 'success');
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

    const formData = new FormData();
    formData.append('file', file);

    try {
      const result = await api('/cost-items/import', 'POST', formData);
      showToast(`Import complete: ${result.inserted} inserted, ${result.updated} updated, ${result.unchanged} unchanged`, 'success');
      importModal.hide();
      importForm.reset();
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

  tableBody.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-group-toggle]');
    if (toggle) {
      const group = toggle.getAttribute('data-group-toggle');
      if (collapsedGroups.has(group)) {
        collapsedGroups.delete(group);
      } else {
        collapsedGroups.add(group);
      }
      renderTable();
      return;
    }

    const expandToggle = event.target.closest('[data-expand-toggle]');
    if (expandToggle) {
      const itemId = Number(expandToggle.getAttribute('data-expand-toggle'));
      if (expandedItems.has(itemId)) {
        expandedItems.delete(itemId);
      } else {
        expandedItems.add(itemId);
      }
      renderTable();
      return;
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
    }
  });

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
  permanentDeleteForm.addEventListener('submit', handlePermanentDelete);

  if (isSuperAdmin) {
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
