ensureAuthenticated();

const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const templateBuilderHeading = document.getElementById('templateBuilderHeading');
const pageStatusEl = document.getElementById('templateBuilderPageStatus');
const templateDraftName = document.getElementById('templateDraftName');
const templateDraftAddRowBtn = document.getElementById('templateDraftAddRowBtn');
const templateDraftRowsBody = document.getElementById('templateDraftRowsBody');
const templateDraftTotals = document.getElementById('templateDraftTotals');
const templateDraftRowsData = document.getElementById('templateDraftRowsData');
const templateDraftChart = document.getElementById('templateDraftChart');
const templateDraftStatus = document.getElementById('templateDraftStatus');
const templateDraftSaveBtn = document.getElementById('templateDraftSaveBtn');
const templateDraftCancelEditBtn = document.getElementById('templateDraftCancelEditBtn');

let cashflowTemplates = [];
let editingTemplateKey = null;
let templateDraftDragState = null;
let templateDraftReorderDragIndex = -1;
let availableLocationTypes = [];

function setPageStatus(message, isError = false) {
  if (!pageStatusEl) return;
  pageStatusEl.textContent = message || '';
  pageStatusEl.classList.toggle('text-danger', !!isError);
  pageStatusEl.classList.toggle('text-muted', !isError);
}

function setTemplateDraftStatus(message, isError = false) {
  if (!templateDraftStatus) {
    setPageStatus(message, isError);
    return;
  }

  templateDraftStatus.textContent = message || '';
  templateDraftStatus.classList.toggle('text-danger', !!isError);
  templateDraftStatus.classList.toggle('text-muted', !isError);
}

async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let payload = {};
  try {
    payload = await res.json();
  } catch (_) {}

  if (!res.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function parseNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updateTemplatePageMeta(mode = 'create') {
  const isEdit = mode === 'edit';
  if (templateBuilderHeading) {
    templateBuilderHeading.textContent = isEdit ? 'Edit Template' : 'Create Template';
  }
  if (templateDraftSaveBtn) {
    templateDraftSaveBtn.textContent = isEdit ? 'Update Template' : 'Create Template';
  }
  if (templateDraftCancelEditBtn) {
    templateDraftCancelEditBtn.style.display = isEdit ? 'inline-block' : 'none';
  }
  document.title = isEdit ? 'Edit Cashflow Template' : 'Create Cashflow Template';
}

function normalizeTemplateDraftRows(rows) {
  if (!Array.isArray(rows)) return [];

  const normalized = [];
  let nextSequentialWeek = 0;

  rows.forEach((row, index) => {
    const stage = String(row?.stage ?? row?.stageName ?? row?.stage_name ?? '').trim();
    const percent = parseNumber(row?.percent);
    const durationRaw = row?.durationWeeks ?? row?.duration_weeks ?? row?.weeks;
    const durationWeeks = parseNumber(durationRaw);
    const explicitWeekStart = row?.weekStart ?? row?.week_start;
    const parsedWeekStart = explicitWeekStart === '' || explicitWeekStart === null || explicitWeekStart === undefined
      ? nextSequentialWeek
      : parseNumber(explicitWeekStart);
    const parsedSortOrder = parseNumber(row?.sortOrder ?? row?.sort_order ?? index);

    if (!stage) return;
    if (percent === null || Number.isNaN(percent) || percent < 0 || percent > 100) return;
    if (parsedWeekStart === null || Number.isNaN(parsedWeekStart) || !Number.isInteger(parsedWeekStart) || parsedWeekStart < 0) return;
    if (durationWeeks === null || Number.isNaN(durationWeeks) || !Number.isInteger(durationWeeks) || durationWeeks <= 0) return;

    normalized.push({
      stage,
      percent: Number(percent.toFixed(2)),
      weekStart: parsedWeekStart,
      durationWeeks,
      sortOrder: parsedSortOrder === null || Number.isNaN(parsedSortOrder) ? index : parsedSortOrder
    });

    nextSequentialWeek = Math.max(nextSequentialWeek, parsedWeekStart + durationWeeks);
  });

  normalized.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    if (left.weekStart !== right.weekStart) return left.weekStart - right.weekStart;
    return String(left.stage).localeCompare(String(right.stage), undefined, { sensitivity: 'base', numeric: true });
  });

  return normalized.map((row, index) => ({ ...row, sortOrder: index }));
}

function getTemplateDraftRows() {
  return [...document.querySelectorAll('#templateDraftRowsBody .programme-stage-row')];
}

function getTemplateDraftDurationWeeks(rows) {
  return rows.reduce((maxWeeks, row) => Math.max(maxWeeks, Number(row.weekStart) + Number(row.durationWeeks)), 0);
}

function getTemplateDraftPercentTotal(rows) {
  return Number(rows.reduce((sum, row) => sum + Number(row.percent || 0), 0).toFixed(2));
}

function getTemplateDraftSummaryLabel(rows) {
  if (!rows.length) return 'No programme set';
  const totalPercent = getTemplateDraftPercentTotal(rows);
  const totalWeeks = getTemplateDraftDurationWeeks(rows);
  return `${rows.length} stage${rows.length === 1 ? '' : 's'} / ${totalWeeks} week${totalWeeks === 1 ? '' : 's'} / ${totalPercent}%`;
}

function clearTemplateDraftDropIndicators() {
  document.querySelectorAll('.programme-stage-row, .programme-chart-stage-label').forEach((element) => {
    element.classList.remove('is-drop-before', 'is-drop-after');
    delete element.dataset.dropPosition;
  });
}

function setTemplateDraftDropIndicator(element, dropPosition) {
  if (!element) return;
  element.classList.remove('is-drop-before', 'is-drop-after');
  element.classList.add(dropPosition === 'after' ? 'is-drop-after' : 'is-drop-before');
  element.dataset.dropPosition = dropPosition;
}

function updateTemplateDraftRowFinish(row) {
  if (!row) return;
  const weekStartInput = row.querySelector('.js-template-week-start');
  const durationInput = row.querySelector('.js-template-duration');
  const finishLabel = row.querySelector('.js-template-finish');
  if (!weekStartInput || !durationInput || !finishLabel) return;

  const weekStart = parseNumber(weekStartInput.value);
  const durationWeeks = parseNumber(durationInput.value);
  if (
    weekStart === null ||
    Number.isNaN(weekStart) ||
    !Number.isInteger(weekStart) ||
    weekStart < 0 ||
    durationWeeks === null ||
    Number.isNaN(durationWeeks) ||
    !Number.isInteger(durationWeeks) ||
    durationWeeks <= 0
  ) {
    finishLabel.textContent = '—';
    return;
  }

  finishLabel.textContent = `W${weekStart} to W${weekStart + durationWeeks - 1}`;
}

function readTemplateDraftRows(strict = false) {
  const rows = getTemplateDraftRows();
  const parsedRows = [];
  const seenStageNames = new Set();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const stageInput = row.querySelector('.js-template-stage-name');
    const percentInput = row.querySelector('.js-template-percent');
    const weekStartInput = row.querySelector('.js-template-week-start');
    const durationInput = row.querySelector('.js-template-duration');

    const stage = String(stageInput?.value || '').trim();
    const percentRaw = String(percentInput?.value || '').trim();
    const weekStartRaw = String(weekStartInput?.value || '').trim();
    const durationRaw = String(durationInput?.value || '').trim();
    const isBlank = !stage && !percentRaw && !weekStartRaw && !durationRaw;

    if (isBlank) continue;

    const percent = parseNumber(percentRaw);
    const weekStart = parseNumber(weekStartRaw);
    const durationWeeks = parseNumber(durationRaw);

    const fail = (message, input) => {
      if (strict) {
        setTemplateDraftStatus(message, true);
        input?.focus();
        input?.select?.();
        return null;
      }
      return undefined;
    };

    if (!stage) {
      if (strict) return fail('Each stage needs a name.', stageInput);
      continue;
    }
    if (percent === null || Number.isNaN(percent) || percent < 0 || percent > 100) {
      if (strict) return fail(`Percent for "${stage}" must be between 0 and 100.`, percentInput);
      continue;
    }
    if (weekStart === null || Number.isNaN(weekStart) || !Number.isInteger(weekStart) || weekStart < 0) {
      if (strict) return fail(`Start week for "${stage}" must be a whole number from 0.`, weekStartInput);
      continue;
    }
    if (durationWeeks === null || Number.isNaN(durationWeeks) || !Number.isInteger(durationWeeks) || durationWeeks <= 0) {
      if (strict) return fail(`Duration for "${stage}" must be a positive whole number.`, durationInput);
      continue;
    }

    const duplicateKey = stage.toLowerCase();
    if (seenStageNames.has(duplicateKey)) {
      if (strict) return fail(`Stage names must be unique. Duplicate found: "${stage}".`, stageInput);
      continue;
    }
    seenStageNames.add(duplicateKey);

    parsedRows.push({
      stage,
      percent: Number(percent.toFixed(2)),
      weekStart,
      durationWeeks,
      sortOrder: parsedRows.length
    });
  }

  if (strict && !parsedRows.length) {
    setTemplateDraftStatus('Add at least one stage to the template.', true);
    return null;
  }

  return parsedRows;
}

function createTemplateDraftRow(stage = {}) {
  const row = document.createElement('tr');
  row.className = 'programme-stage-row';
  row.draggable = true;
  row.innerHTML = `
    <td class="programme-drag-cell text-center">
      <button type="button" class="btn btn-sm btn-light border js-template-row-drag-handle" aria-label="Reorder stage">⋮⋮</button>
    </td>
    <td>
      <input type="text" class="form-control form-control-sm js-template-stage-name" maxlength="120" placeholder="e.g. Sub-Structure" value="${escapeHtml(stage.stage || '')}" />
    </td>
    <td>
      <input type="number" class="form-control form-control-sm js-template-percent" min="0" max="100" step="0.01" value="${stage.percent ?? 0}" />
    </td>
    <td>
      <input type="number" class="form-control form-control-sm js-template-week-start" min="0" step="1" value="${stage.weekStart ?? 0}" />
    </td>
    <td>
      <input type="number" class="form-control form-control-sm js-template-duration" min="1" max="104" step="1" value="${stage.durationWeeks ?? 1}" />
    </td>
    <td>
      <span class="badge text-bg-light border js-template-finish">—</span>
    </td>
    <td>
      <button type="button" class="btn btn-sm btn-outline-danger js-remove-template-row">Remove</button>
    </td>
  `;

  row.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      updateTemplateDraftRowFinish(row);
      setTemplateDraftStatus('');
      renderTemplateDraftPreview();
    });
  });

  row.querySelector('.js-remove-template-row')?.addEventListener('click', () => {
    row.remove();
    if (!getTemplateDraftRows().length) {
      renderTemplateDraftRows([]);
      return;
    }
    renderTemplateDraftPreview();
  });

  row.addEventListener('dragstart', (event) => {
    templateDraftReorderDragIndex = getTemplateDraftRows().indexOf(row);
    row.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(templateDraftReorderDragIndex));
    }
  });

  row.addEventListener('dragover', (event) => {
    event.preventDefault();
    const rect = row.getBoundingClientRect();
    const dropPosition = event.clientY >= rect.top + (rect.height / 2) ? 'after' : 'before';
    setTemplateDraftDropIndicator(row, dropPosition);
  });

  row.addEventListener('dragleave', () => {
    row.classList.remove('is-drop-before', 'is-drop-after');
    delete row.dataset.dropPosition;
  });

  row.addEventListener('drop', (event) => {
    event.preventDefault();
    const targetIndex = getTemplateDraftRows().indexOf(row);
    reorderTemplateDraftRows(templateDraftReorderDragIndex, targetIndex, row.dataset.dropPosition || 'before');
  });

  row.addEventListener('dragend', () => {
    templateDraftReorderDragIndex = -1;
    clearTemplateDraftDropIndicators();
    row.classList.remove('is-dragging');
  });

  updateTemplateDraftRowFinish(row);
  return row;
}

function renderTemplateDraftRows(stages) {
  if (!templateDraftRowsBody) return;

  const normalizedStages = normalizeTemplateDraftRows(stages);
  templateDraftRowsBody.innerHTML = '';

  if (!normalizedStages.length) {
    templateDraftRowsBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-muted text-center py-3">Add a stage to start building this template.</td>
      </tr>
    `;
    renderTemplateDraftPreview();
    return;
  }

  normalizedStages.forEach((stage) => {
    templateDraftRowsBody.appendChild(createTemplateDraftRow(stage));
  });

  renderTemplateDraftPreview();
}

function resetTemplateDraftRows(stages) {
  renderTemplateDraftRows(stages || []);
}

function getDefaultTemplateDraftStage() {
  const stages = readTemplateDraftRows(false) || [];
  const totalWeeks = getTemplateDraftDurationWeeks(stages);
  return {
    stage: `Stage ${stages.length + 1}`,
    percent: 0,
    weekStart: totalWeeks,
    durationWeeks: 1,
    sortOrder: stages.length
  };
}

function reorderTemplateDraftRows(fromIndex, toIndex, dropPosition = 'before') {
  const rows = getTemplateDraftRows();
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= rows.length ||
    toIndex >= rows.length
  ) {
    clearTemplateDraftDropIndicators();
    return;
  }

  const movingRow = rows[fromIndex];
  const targetRow = rows[toIndex];
  if (!movingRow || !targetRow || movingRow === targetRow) {
    clearTemplateDraftDropIndicators();
    return;
  }

  const insertAfter = dropPosition === 'after';
  const referenceNode = insertAfter ? targetRow.nextSibling : targetRow;
  templateDraftRowsBody.insertBefore(movingRow, referenceNode);
  clearTemplateDraftDropIndicators();
  renderTemplateDraftPreview();
}

function enableTemplateDraftInlineRename(stageIndex) {
  const rows = getTemplateDraftRows();
  const row = rows[stageIndex];
  const stageInput = row?.querySelector('.js-template-stage-name');
  if (!stageInput) return;
  stageInput.focus();
  stageInput.select();
}

function applyChartStageEdits(stageIndex) {
  const row = getTemplateDraftRows()[stageIndex];
  if (!row) return;

  const stageInput = templateDraftChart?.querySelector(`.js-template-chart-stage-input[data-stage-index="${stageIndex}"]`);
  const percentInput = templateDraftChart?.querySelector(`.js-template-chart-percent-input[data-stage-index="${stageIndex}"]`);

  const rowStageInput = row.querySelector('.js-template-stage-name');
  const rowPercentInput = row.querySelector('.js-template-percent');
  if (!stageInput || !percentInput || !rowStageInput || !rowPercentInput) {
    return;
  }

  const stage = String(stageInput.value || '').trim();
  const percent = parseNumber(percentInput.value);

  if (!stage) {
    setTemplateDraftStatus('Each stage needs a name.', true);
    stageInput.focus();
    return;
  }
  if (percent === null || Number.isNaN(percent) || percent < 0 || percent > 100) {
    setTemplateDraftStatus(`Percent for "${stage}" must be between 0 and 100.`, true);
    percentInput.focus();
    return;
  }

  rowStageInput.value = stage;
  rowPercentInput.value = String(Number(percent.toFixed(2)));
  updateTemplateDraftRowFinish(row);
  setTemplateDraftStatus('');
  renderTemplateDraftPreview();
}

function buildTemplateDraftChartHtml(stages) {
  if (!Array.isArray(stages) || !stages.length) {
    return '<div class="programme-chart-empty-state">Add a stage to build the template timeline.</div>';
  }

  const totalWeeks = Math.max(getTemplateDraftDurationWeeks(stages), 1);
  const weekHeaders = Array.from({ length: totalWeeks }, (_, weekIndex) => `
    <div class="programme-chart-header">W${weekIndex}</div>
  `).join('');

  const stageRows = stages.map((stage, index) => {
    return `
      <div class="programme-chart-stage-label" data-stage-index="${index}">
        <button type="button" class="btn btn-sm btn-light border js-template-chart-reorder" data-stage-index="${index}" draggable="true" aria-label="Reorder stage">⋮⋮</button>
        <input type="text" class="form-control form-control-sm js-template-chart-stage-input" data-stage-index="${index}" value="${escapeHtml(stage.stage)}" maxlength="120" aria-label="Stage name" />
        <input type="text" inputmode="decimal" class="form-control form-control-sm js-template-chart-percent-input" data-stage-index="${index}" value="${stage.percent}" maxlength="6" aria-label="Percent" />
        <button type="button" class="btn btn-sm btn-link text-danger text-decoration-none js-template-chart-delete" data-stage-index="${index}" aria-label="Remove ${escapeHtml(stage.stage)}">✕</button>
      </div>
      <div class="programme-chart-track" data-stage-index="${index}">
        <div class="programme-chart-bar programme-chart-bar-interactive js-template-chart-bar" data-stage-index="${index}" style="grid-column: ${stage.weekStart + 1} / span ${stage.durationWeeks};">
          <span>${stage.durationWeeks}</span>
          <span class="programme-chart-handle programme-chart-handle-start js-template-chart-handle-start" data-stage-index="${index}"></span>
          <span class="programme-chart-handle programme-chart-handle-end js-template-chart-handle-end" data-stage-index="${index}"></span>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="programme-chart-grid" style="--programme-weeks: ${totalWeeks};">
      <div class="programme-chart-spacer"></div>
      ${weekHeaders}
      ${stageRows}
    </div>
  `;
}

function renderTemplateDraftPreview() {
  const stages = readTemplateDraftRows(false) || [];
  const totalPercent = getTemplateDraftPercentTotal(stages);
  const hasPercentError = stages.length > 0 && Math.abs(totalPercent - 100) > 0.05;

  if (templateDraftTotals) {
    templateDraftTotals.textContent = getTemplateDraftSummaryLabel(stages);
    templateDraftTotals.classList.toggle('text-danger', hasPercentError);
    templateDraftTotals.classList.toggle('text-muted', !hasPercentError);
  }

  if (templateDraftRowsData) {
    templateDraftRowsData.value = JSON.stringify(stages);
  }

  if (templateDraftChart) {
    templateDraftChart.innerHTML = buildTemplateDraftChartHtml(stages);
    templateDraftChart.classList.toggle('programme-chart-empty-state', !stages.length);
  }

  templateDraftChart?.querySelectorAll('.js-template-chart-delete').forEach((button) => {
    button.addEventListener('click', () => {
      const stageIndex = Number(button.dataset.stageIndex);
      const row = getTemplateDraftRows()[stageIndex];
      row?.remove();
      if (!getTemplateDraftRows().length) {
        renderTemplateDraftRows([]);
        return;
      }
      renderTemplateDraftPreview();
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-chart-stage-input, .js-template-chart-percent-input').forEach((input) => {
    const stageIndex = Number(input.getAttribute('data-stage-index'));
    input.addEventListener('change', () => {
      applyChartStageEdits(stageIndex);
    });
    input.addEventListener('blur', () => {
      applyChartStageEdits(stageIndex);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyChartStageEdits(stageIndex);
      }
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-chart-bar').forEach((barElement) => {
    barElement.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.programme-chart-handle')) return;
      startTemplateDraftDrag(event, 'move', Number(barElement.dataset.stageIndex), barElement);
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-chart-handle-start').forEach((handleElement) => {
    handleElement.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      startTemplateDraftDrag(event, 'resize-start', Number(handleElement.dataset.stageIndex), handleElement.closest('.js-template-chart-bar'));
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-chart-handle-end').forEach((handleElement) => {
    handleElement.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      startTemplateDraftDrag(event, 'resize-end', Number(handleElement.dataset.stageIndex), handleElement.closest('.js-template-chart-bar'));
    });
  });

  templateDraftChart?.querySelectorAll('.js-template-chart-reorder').forEach((handleElement) => {
    const labelElement = handleElement.closest('.programme-chart-stage-label');
    handleElement.addEventListener('dragstart', (event) => {
      templateDraftReorderDragIndex = Number(handleElement.dataset.stageIndex);
      labelElement?.classList.add('is-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(templateDraftReorderDragIndex));
      }
    });
    handleElement.addEventListener('dragend', () => {
      templateDraftReorderDragIndex = -1;
      clearTemplateDraftDropIndicators();
      labelElement?.classList.remove('is-dragging');
    });
  });

  templateDraftChart?.querySelectorAll('.programme-chart-stage-label').forEach((labelElement) => {
    labelElement.addEventListener('dragover', (event) => {
      event.preventDefault();
      const rect = labelElement.getBoundingClientRect();
      const dropPosition = event.clientY >= rect.top + (rect.height / 2) ? 'after' : 'before';
      setTemplateDraftDropIndicator(labelElement, dropPosition);
    });
    labelElement.addEventListener('dragleave', () => {
      labelElement.classList.remove('is-drop-before', 'is-drop-after');
      delete labelElement.dataset.dropPosition;
    });
    labelElement.addEventListener('drop', (event) => {
      event.preventDefault();
      reorderTemplateDraftRows(templateDraftReorderDragIndex, Number(labelElement.dataset.stageIndex), labelElement.dataset.dropPosition || 'before');
    });
  });

  if (stages.length && hasPercentError) {
    setTemplateDraftStatus('Stage percentages must total 100% before you can save.', true);
  } else if (!templateDraftStatus?.classList.contains('text-danger')) {
    setTemplateDraftStatus('');
  }
}

function startTemplateDraftDrag(event, type, stageIndex, barElement) {
  const stages = readTemplateDraftRows(false) || [];
  const stage = stages[stageIndex];
  const trackElement = barElement?.closest('.programme-chart-track');
  if (!stage || !trackElement) return;

  const totalWeeks = Math.max(getTemplateDraftDurationWeeks(stages), stage.weekStart + stage.durationWeeks + 8, 1);
  const pointerWeek = getTemplateDraftWeekFromPointer(trackElement, event.clientX, totalWeeks);

  templateDraftDragState = {
    type,
    stageIndex,
    totalWeeks,
    trackElement,
    initialWeekStart: stage.weekStart,
    initialDurationWeeks: stage.durationWeeks,
    pointerOffsetWeeks: Math.max(0, pointerWeek - stage.weekStart)
  };

  document.body.classList.add('programme-chart-dragging');
  event.preventDefault();
}

function getTemplateDraftWeekFromPointer(trackElement, clientX, totalWeeks) {
  const rect = trackElement.getBoundingClientRect();
  if (rect.width <= 0 || totalWeeks <= 0) return 0;
  const cellWidth = rect.width / totalWeeks;
  const rawWeek = Math.floor((clientX - rect.left) / cellWidth);
  return Math.max(0, Math.min(totalWeeks - 1, rawWeek));
}

function syncTemplateDraftRowFromDrag(stageIndex, nextWeekStart, nextDurationWeeks) {
  const row = getTemplateDraftRows()[stageIndex];
  if (!row) return;

  const weekStartInput = row.querySelector('.js-template-week-start');
  const durationInput = row.querySelector('.js-template-duration');
  if (!weekStartInput || !durationInput) return;

  weekStartInput.value = String(nextWeekStart);
  durationInput.value = String(nextDurationWeeks);
  updateTemplateDraftRowFinish(row);
  renderTemplateDraftPreview();

  if (templateDraftDragState) {
    templateDraftDragState.trackElement = templateDraftChart?.querySelector(`.programme-chart-track[data-stage-index="${stageIndex}"]`) || null;
  }
}

function handleTemplateDraftPointerMove(event) {
  if (!templateDraftDragState || !templateDraftDragState.trackElement) return;

  const hoveredWeek = getTemplateDraftWeekFromPointer(
    templateDraftDragState.trackElement,
    event.clientX,
    templateDraftDragState.totalWeeks
  );

  const initialEndWeek = templateDraftDragState.initialWeekStart + templateDraftDragState.initialDurationWeeks - 1;
  let nextWeekStart = templateDraftDragState.initialWeekStart;
  let nextDurationWeeks = templateDraftDragState.initialDurationWeeks;

  if (templateDraftDragState.type === 'move') {
    const maxStart = Math.max(0, templateDraftDragState.totalWeeks - templateDraftDragState.initialDurationWeeks);
    nextWeekStart = Math.max(0, Math.min(maxStart, hoveredWeek - templateDraftDragState.pointerOffsetWeeks));
  } else if (templateDraftDragState.type === 'resize-end') {
    nextDurationWeeks = Math.max(1, (hoveredWeek - templateDraftDragState.initialWeekStart) + 1);
  } else if (templateDraftDragState.type === 'resize-start') {
    nextWeekStart = Math.max(0, Math.min(hoveredWeek, initialEndWeek));
    nextDurationWeeks = Math.max(1, (initialEndWeek - nextWeekStart) + 1);
  }

  syncTemplateDraftRowFromDrag(templateDraftDragState.stageIndex, nextWeekStart, nextDurationWeeks);
}

function stopTemplateDraftPointerDrag() {
  if (!templateDraftDragState) return;
  templateDraftDragState = null;
  document.body.classList.remove('programme-chart-dragging');
}

async function loadAvailableLocationTypes() {
  try {
    const locationTypesData = await api('/cashflow/location-types');
    const rawTypes = Array.isArray(locationTypesData)
      ? locationTypesData
      : Array.isArray(locationTypesData?.location_types)
        ? locationTypesData.location_types
        : [];

    availableLocationTypes = [...new Set(
      rawTypes
        .map((entry) => String(entry || '').trim())
        .filter((entry) => entry.length > 0)
    )].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true }));
  } catch (error) {
    console.error('Error loading available location types:', error);
    availableLocationTypes = [];
  }
}

function renderTemplateTagSelector(selectedTypes = []) {
  const tagsContainer = document.getElementById('templateDraftTagsContainer');
  if (!tagsContainer) return;

  const input = document.getElementById('templateDraftTypeInput');
  const normalizedSelectedTypes = [...new Set(
    (Array.isArray(selectedTypes) ? selectedTypes : [])
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0)
  )];
  const selectedSet = new Set(normalizedSelectedTypes);
  const existingTags = tagsContainer.querySelectorAll('.template-type-tag');
  existingTags.forEach((tag) => tag.remove());

  selectedSet.forEach((type) => {
    const tag = document.createElement('div');
    tag.className = 'template-type-tag d-flex align-items-center gap-1 px-2 py-1 rounded-pill';
    tag.style.background = '#0d6efd';
    tag.style.color = 'white';
    tag.style.fontSize = '0.85rem';
    tag.style.whiteSpace = 'nowrap';
    tag.dataset.type = type;
    tag.innerHTML = `
      ${escapeHtml(type)}
      <button type="button" class="btn-close btn-close-white" style="width: 1rem; height: 1rem;" aria-label="Remove ${escapeHtml(type)}"></button>
    `;

    const removeBtn = tag.querySelector('.btn-close');
    removeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      selectedSet.delete(type);
      renderTemplateTagSelector(Array.from(selectedSet));
    });

    tagsContainer.insertBefore(tag, input);
  });

  attachTagInputHandlers(selectedSet);
}

function attachTagInputHandlers(selectedSet = new Set()) {
  const input = document.getElementById('templateDraftTypeInput');
  const suggestionsDiv = document.getElementById('templateDraftTypeSuggestions');

  if (!input || !suggestionsDiv) return;

  input.oninput = (e) => {
    const query = e.target.value.trim().toLowerCase();

    if (!query) {
      suggestionsDiv.style.display = 'none';
      return;
    }

    const selectedLowerSet = new Set(Array.from(selectedSet).map((entry) => entry.toLowerCase()));
    const matches = availableLocationTypes.filter((type) =>
      type.toLowerCase().includes(query) && !selectedLowerSet.has(type.toLowerCase())
    );

    if (matches.length === 0) {
      suggestionsDiv.style.display = 'none';
      return;
    }

    suggestionsDiv.innerHTML = matches.map((type) => `
      <div class="suggestion-item p-2 border-bottom" style="cursor: pointer;">
        ${escapeHtml(type)}
      </div>
    `).join('');
    suggestionsDiv.style.display = 'block';

    suggestionsDiv.querySelectorAll('.suggestion-item').forEach((item) => {
      item.addEventListener('click', () => {
        const type = item.textContent.trim();
        selectedSet.add(type);
        input.value = '';
        suggestionsDiv.style.display = 'none';
        renderTemplateTagSelector(Array.from(selectedSet));
      });
    });
  };

  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = e.target.value.trim().toLowerCase();
      if (!query) return;

      const matching = availableLocationTypes.find((type) => type.toLowerCase() === query);
      if (matching && !selectedSet.has(matching)) {
        selectedSet.add(matching);
        input.value = '';
        suggestionsDiv.style.display = 'none';
        renderTemplateTagSelector(Array.from(selectedSet));
      }
    }
  };

  input.onblur = () => {
    setTimeout(() => {
      suggestionsDiv.style.display = 'none';
    }, 150);
  };
}

function getSelectedTemplateLocationTypes() {
  const tagsContainer = document.getElementById('templateDraftTagsContainer');
  if (!tagsContainer) return [];
  const tags = tagsContainer.querySelectorAll('.template-type-tag');
  return Array.from(tags).map((tag) => tag.dataset.type).filter(Boolean);
}

function resetTemplateDraftForm(mode = 'create') {
  editingTemplateKey = null;
  if (templateDraftName) templateDraftName.value = '';
  updateTemplatePageMeta(mode);
  setPageStatus('');
  setTemplateDraftStatus('');
  resetTemplateDraftRows([]);
  renderTemplateTagSelector([]);
}

async function saveTemplateDraft() {
  const templateName = String(templateDraftName?.value || '').trim();
  if (!templateName) {
    setTemplateDraftStatus('Template name is required.', true);
    templateDraftName?.focus();
    return;
  }

  const templateRows = readTemplateDraftRows(true);
  if (!templateRows) return;
  if (!templateRows.length) {
    setTemplateDraftStatus('Add at least one stage to the template.', true);
    return;
  }

  const totalPercent = getTemplateDraftPercentTotal(templateRows);
  if (Math.abs(totalPercent - 100) > 0.05) {
    setTemplateDraftStatus('Template rows must total 100%.', true);
    return;
  }

  const totalWeeks = getTemplateDraftDurationWeeks(templateRows);
  if (!Number.isInteger(totalWeeks) || totalWeeks <= 0 || totalWeeks > 104) {
    setTemplateDraftStatus('The full template programme must finish between week 1 and week 104.', true);
    return;
  }

  const payload = {
    name: templateName,
    rows: templateRows.map((row) => ({
      stage: row.stage,
      percent: Number(row.percent),
      weeks: Number(row.durationWeeks),
      week_start: Number(row.weekStart),
      duration_weeks: Number(row.durationWeeks),
      sort_order: Number(row.sortOrder)
    }))
  };

  try {
    const isEdit = !!editingTemplateKey;
    const endpoint = editingTemplateKey ? `/cashflow/templates/${editingTemplateKey}` : '/cashflow/templates';
    const method = editingTemplateKey ? 'PUT' : 'POST';
    const response = await api(endpoint, method, payload);

    if (!response?.template) {
      throw new Error('Template save did not return a template payload.');
    }

    const savedTemplateKey = response.template.key;
    await api(`/cashflow/templates/${encodeURIComponent(savedTemplateKey)}/location-types`, 'PUT', {
      location_types: getSelectedTemplateLocationTypes()
    });

    editingTemplateKey = savedTemplateKey;
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('mode', 'edit');
    currentUrl.searchParams.set('template', savedTemplateKey);
    window.history.replaceState({}, '', currentUrl.toString());

    cashflowTemplates = cashflowTemplates.filter((entry) => entry.key !== savedTemplateKey);
    cashflowTemplates.push(response.template);
    cashflowTemplates.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true }));

    updateTemplatePageMeta('edit');
    setTemplateDraftStatus(isEdit ? 'Template updated successfully.' : 'Template created successfully.');
    setPageStatus('Saved. You can continue editing or return to Cashflow Setup.');
  } catch (error) {
    setTemplateDraftStatus(error.message || 'Failed to save template.', true);
  }
}

async function loadTemplates() {
  const response = await api('/cashflow/templates');
  cashflowTemplates = Array.isArray(response?.templates) ? response.templates : [];
}

async function initialiseFromRoute() {
  const params = new URLSearchParams(window.location.search);
  const templateKey = String(params.get('template') || '').trim();
  const mode = templateKey ? String(params.get('mode') || 'edit').toLowerCase() : 'create';

  if (!templateKey) {
    resetTemplateDraftForm('create');
    setPageStatus('Create a new template, then save when the programme totals 100%.');
    templateDraftName?.focus();
    return;
  }

  const template = cashflowTemplates.find((entry) => entry.key === templateKey);
  if (!template) {
    resetTemplateDraftForm('create');
    setTemplateDraftStatus('Template not found. Starting a new template instead.', true);
    setPageStatus('The requested template was not found.');
    return;
  }

  const isDuplicate = mode === 'duplicate';
  editingTemplateKey = isDuplicate ? null : template.key;
  updateTemplatePageMeta(isDuplicate ? 'create' : 'edit');
  if (templateDraftName) {
    templateDraftName.value = isDuplicate ? `Copy of ${template.name || 'Template'}` : (template.name || '');
  }
  resetTemplateDraftRows(normalizeTemplateDraftRows(template.rows || []));

  if (isDuplicate) {
    renderTemplateTagSelector([]);
    setPageStatus('Editing a duplicate. Save to create a new template.');
  } else {
    try {
      const response = await api(`/cashflow/templates/${encodeURIComponent(templateKey)}/location-types`);
      renderTemplateTagSelector(response.location_types || []);
    } catch (_) {
      renderTemplateTagSelector([]);
    }
    setPageStatus('Editing existing template. Save when your changes are ready.');
  }

  setTemplateDraftStatus('');
}

templateDraftAddRowBtn?.addEventListener('click', () => {
  const existingRows = getTemplateDraftRows();
  if (existingRows.length === 1) {
    const stageInput = existingRows[0].querySelector('.js-template-stage-name');
    const percentInput = existingRows[0].querySelector('.js-template-percent');
    const weekStartInput = existingRows[0].querySelector('.js-template-week-start');
    const durationInput = existingRows[0].querySelector('.js-template-duration');
    if (
      stageInput &&
      percentInput &&
      weekStartInput &&
      durationInput &&
      !String(stageInput.value || '').trim() &&
      !String(percentInput.value || '').trim() &&
      !String(weekStartInput.value || '').trim() &&
      !String(durationInput.value || '').trim()
    ) {
      const defaultStage = getDefaultTemplateDraftStage();
      stageInput.value = defaultStage.stage;
      percentInput.value = String(defaultStage.percent);
      weekStartInput.value = String(defaultStage.weekStart);
      durationInput.value = String(defaultStage.durationWeeks);
      updateTemplateDraftRowFinish(existingRows[0]);
      renderTemplateDraftPreview();
      stageInput.focus();
      stageInput.select();
      return;
    }
  }

  if (!templateDraftRowsBody) return;
  if (templateDraftRowsBody.querySelector('td[colspan="7"]')) {
    templateDraftRowsBody.innerHTML = '';
  }

  const row = createTemplateDraftRow(getDefaultTemplateDraftStage());
  templateDraftRowsBody.appendChild(row);
  renderTemplateDraftPreview();
  row.querySelector('.js-template-stage-name')?.focus();
  row.querySelector('.js-template-stage-name')?.select();
});

templateDraftSaveBtn?.addEventListener('click', saveTemplateDraft);
templateDraftCancelEditBtn?.addEventListener('click', async () => {
  await initialiseFromRoute();
});
document.addEventListener('pointermove', handleTemplateDraftPointerMove);
document.addEventListener('pointerup', stopTemplateDraftPointerDrag);
document.addEventListener('pointercancel', stopTemplateDraftPointerDrag);

(async function init() {
  try {
    setPageStatus('Loading template builder...');
    await Promise.all([
      loadTemplates(),
      loadAvailableLocationTypes(),
      typeof window.loadCurrencySettings === 'function' ? window.loadCurrencySettings() : Promise.resolve()
    ]);
    if (typeof window.applyCurrencySymbols === 'function') {
      await window.applyCurrencySymbols();
    }
    await initialiseFromRoute();
  } catch (error) {
    setTemplateDraftStatus(error.message || 'Failed to load template builder.', true);
    setPageStatus('Unable to load template data.', true);
  }
})();