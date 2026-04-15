document.addEventListener('DOMContentLoaded', () => {

const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');

if (!token || !['super_admin', 'admin'].includes(role)) {
  window.location.href = 'dashboard.html';
}

/* =========================
   Elements
   ========================= */
const templateTable = document.getElementById('templateTable');
const filterInput = document.getElementById('filterInput');
const addTemplateBtn = document.getElementById('addTemplateBtn');
const templateModal = document.getElementById('templateModal');
const templateForm = document.getElementById('templateForm');
const templateId = document.getElementById('templateId');
const templateName = document.getElementById('templateName');
const templateStage = document.getElementById('templateStage');
const templateModalTitle = document.getElementById('templateModalTitle');
const templateLineItemsBody = document.getElementById('templateLineItemsBody');
const addTemplateLineItem = document.getElementById('addTemplateLineItem');
const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');
const templateDeliveryNotes = document.getElementById('templateDeliveryNotes');
const templateLineItemSuggestions = document.getElementById('templateLineItemSuggestions');

const costItemLookup = window.createCostItemLookup
  ? window.createCostItemLookup({
      suggestionsElement: templateLineItemSuggestions,
      headers: { Authorization: 'Bearer ' + token }
    })
  : null;

let allTemplates = [];
let lineItemSearchTimeout = null;

/* =========================
   Helpers
   ========================= */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
  return res.json();
}

/* =========================
   Load stages for dropdown
   ========================= */
async function loadStages() {
  try {
    const stages = await api('/stages');
    templateStage.innerHTML = '<option value="">No stage</option>';
    stages.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      templateStage.appendChild(opt);
    });
  } catch (_) {
    // stages optional
  }
}

/* =========================
   Load & render templates
   ========================= */
async function loadTemplates() {
  try {
    allTemplates = await api('/po-templates');
    renderTemplates(allTemplates);
  } catch (err) {
    showToast('Error loading templates: ' + err.message, 'error');
  }
}

function renderTemplates(templates) {
  templateTable.innerHTML = '';

  if (!templates.length) {
    templateTable.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999; padding:2rem;">No templates found</td></tr>';
    return;
  }

  templates.forEach(t => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(t.name)}</td>
      <td>${t.stage_name ? escapeHtml(t.stage_name) : '<span style="color:#999;">—</span>'}</td>
      <td>${t.line_item_count} item(s)</td>
      <td>
        <button class="btn btn-sm btn-primary" data-edit="${t.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-delete="${t.id}">Delete</button>
      </td>
    `;

    row.querySelector('[data-edit]').addEventListener('click', () => openEditTemplate(t.id));
    row.querySelector('[data-delete]').addEventListener('click', () => deleteTemplate(t.id, t.name));

    templateTable.appendChild(row);
  });
}

/* =========================
   Filter
   ========================= */
filterInput.addEventListener('input', () => {
  const q = filterInput.value.trim().toLowerCase();
  if (!q) {
    renderTemplates(allTemplates);
    return;
  }
  renderTemplates(allTemplates.filter(t =>
    t.name.toLowerCase().includes(q) ||
    (t.stage_name && t.stage_name.toLowerCase().includes(q))
  ));
});

/* =========================
   Line item row management
   ========================= */
function fetchSuggestions(query) {
  if (!costItemLookup || !query) {
    templateLineItemSuggestions.innerHTML = '';
    return;
  }
  costItemLookup.fetchSuggestions(query).catch(() => {
    templateLineItemSuggestions.innerHTML = '';
  });
}

function addLineItemRow(item = {}) {
  const row = document.createElement('tr');

  row.innerHTML = `
    <td>
      <input class="line-item-input line-item-desc" data-field="description" type="text" list="templateLineItemSuggestions" value="${escapeHtml(item.description || '')}" placeholder="Description">
      <input data-field="costItemId" type="hidden" value="${item.cost_item_id || item.costItemId || ''}">
      <input data-field="costItemCode" type="hidden" value="${item.cost_item_code || item.costItemCode || ''}">
      <input data-field="costItemType" type="hidden" value="${item.cost_item_type || item.costItemType || ''}">
      <span data-field="costItemBadge"${(item.cost_item_id || item.costItemId || item.cost_item_code || item.costItemCode) ? '' : ' hidden'} class="cost-item-linked-badge">
        <span class="cost-item-badge-text">Cost DB: <span data-badge-code>${escapeHtml(item.cost_item_code || item.costItemCode || '')}</span></span>
        <button type="button" data-badge-unlink class="cost-item-badge-unlink" aria-label="Unlink cost item" title="Remove link to cost database">&times;</button>
      </span>
    </td>
    <td><input class="line-item-input line-item-qty" data-field="quantity" type="number" step="0.01" min="0" value="${item.quantity || 1}" placeholder="0"></td>
    <td><input class="line-item-input line-item-unit" data-field="unit" type="text" value="${escapeHtml(item.unit || '')}" placeholder="Unit"></td>
    <td><input class="line-item-input line-item-cost" data-field="unitPrice" type="number" step="0.01" min="0" value="${item.unit_price || item.unitPrice || ''}" placeholder="0.00"></td>
    <td><button type="button" class="btn btn-outline-danger btn-sm line-items-remove" aria-label="Remove line item" title="Remove" data-field="remove">&times;</button></td>
  `;

  const descriptionInput = row.querySelector('[data-field="description"]');
  const removeBtn = row.querySelector('[data-field="remove"]');

  descriptionInput.addEventListener('input', () => {
    if (costItemLookup) costItemLookup.clearSelectionForRow(row);
    clearTimeout(lineItemSearchTimeout);
    const query = descriptionInput.value.trim();
    lineItemSearchTimeout = setTimeout(() => {
      if (query.length >= 2) fetchSuggestions(query);
      else templateLineItemSuggestions.innerHTML = '';
    }, 200);
  });

  descriptionInput.addEventListener('change', () => {
    if (costItemLookup) costItemLookup.applySelectionFromInput(row);
  });

  descriptionInput.addEventListener('blur', () => {
    if (costItemLookup) costItemLookup.applySelectionFromInput(row);
  });

  removeBtn.addEventListener('click', () => row.remove());

  templateLineItemsBody.appendChild(row);
}

function collectLineItems() {
  const rows = Array.from(templateLineItemsBody.querySelectorAll('tr'));
  const items = [];
  let hasIncomplete = false;

  rows.forEach(row => {
    const desc = row.querySelector('[data-field="description"]').value.trim();
    const qty = row.querySelector('[data-field="quantity"]').value;
    const unit = row.querySelector('[data-field="unit"]').value.trim();
    const unitPrice = row.querySelector('[data-field="unitPrice"]').value;
    const hasAny = desc || qty || unit || unitPrice;

    if (!hasAny) return;

    if (!desc) {
      hasIncomplete = true;
      return;
    }

    items.push({
      description: desc,
      quantity: Number(qty) || 1,
      unit: unit || null,
      unitPrice: Number(unitPrice) || 0,
      costItemId: Number(row.querySelector('[data-field="costItemId"]').value) || null,
      costItemCode: row.querySelector('[data-field="costItemCode"]').value || null,
      costItemType: row.querySelector('[data-field="costItemType"]').value || null
    });
  });

  return { items, hasIncomplete };
}

/* =========================
   Modal open/close
   ========================= */
function openModal() {
  templateModal.style.display = 'flex';
}

function closeModal() {
  templateModal.style.display = 'none';
  templateForm.reset();
  templateId.value = '';
  templateLineItemsBody.innerHTML = '';
}

addTemplateBtn.addEventListener('click', () => {
  templateModalTitle.textContent = 'New Template';
  templateId.value = '';
  templateName.value = '';
  templateStage.value = '';
  templateDeliveryNotes.value = '';
  templateLineItemsBody.innerHTML = '';
  addLineItemRow();
  openModal();
});

cancelTemplateBtn.addEventListener('click', closeModal);

async function openEditTemplate(id) {
  try {
    const t = await api('/po-templates/' + id);
    templateModalTitle.textContent = 'Edit Template';
    templateId.value = t.id;
    templateName.value = t.name;
    templateStage.value = t.stage_id || '';
    templateDeliveryNotes.value = t.delivery_notes || '';
    templateLineItemsBody.innerHTML = '';

    if (t.line_items && t.line_items.length) {
      t.line_items.forEach(item => addLineItemRow(item));
    } else {
      addLineItemRow();
    }

    openModal();
  } catch (err) {
    showToast('Error loading template: ' + err.message, 'error');
  }
}

/* =========================
   Save template
   ========================= */
templateForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = templateName.value.trim();
  if (!name) {
    showToast('Template name is required', 'error');
    return;
  }

  const { items, hasIncomplete } = collectLineItems();
  if (hasIncomplete) {
    showToast('Please complete all line item descriptions', 'error');
    return;
  }
  if (items.length === 0) {
    showToast('Add at least one line item', 'error');
    return;
  }

  const payload = {
    name,
    stageId: templateStage.value || null,
    deliveryNotes: templateDeliveryNotes.value || '',
    lineItems: items
  };

  const editId = templateId.value;
  try {
    if (editId) {
      await api('/po-templates/' + editId, 'PUT', payload);
      showToast('Template updated', 'success');
    } else {
      await api('/po-templates', 'POST', payload);
      showToast('Template created', 'success');
    }
    closeModal();
    loadTemplates();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

/* =========================
   Delete template
   ========================= */
async function deleteTemplate(id, name) {
  const confirmed = await confirmDialog(
    'Delete template "' + name + '"?',
    { okText: 'Delete', okClass: 'btn btn-danger' }
  );
  if (!confirmed) return;

  try {
    await api('/po-templates/' + id, 'DELETE');
    showToast('Template deleted', 'success');
    loadTemplates();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* =========================
   Add line item button
   ========================= */
addTemplateLineItem.addEventListener('click', () => addLineItemRow());

/* =========================
   Init
   ========================= */
loadStages();
loadTemplates();

});
