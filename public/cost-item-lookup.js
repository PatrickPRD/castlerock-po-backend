(function() {
  // Module-level delegated handler for unlink badge button — works regardless of which
  // page/modal the badge lives in, before any lookup instance is created.
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-badge-unlink]');
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    const badge = btn.closest('[data-field="costItemBadge"]');
    if (!badge) return;
    // Walk up to find the row container that holds the hidden cost item fields.
    let container = badge.parentElement;
    while (container && !container.querySelector('[data-field="costItemId"]')) {
      container = container.parentElement;
    }
    if (!container) return;
    const idField = container.querySelector('[data-field="costItemId"]');
    const codeField = container.querySelector('[data-field="costItemCode"]');
    const typeField = container.querySelector('[data-field="costItemType"]');
    const descField = container.querySelector('[data-field="description"]');
    if (idField) idField.value = '';
    if (codeField) codeField.value = '';
    if (typeField) typeField.value = '';
    if (descField) delete descField.dataset.selectedCostItemCode;
    badge.hidden = true;
  }, true);

  function createCostItemLookup(options) {
    const suggestionsElement = options?.suggestionsElement;
    const authFetch = options?.authFetch || window.fetch.bind(window);
    const requestHeaders = options?.headers || {};
    const minQueryLength = Number(options?.minQueryLength) || 2;
    const suggestionMap = new Map();

    function clearSuggestions() {
      if (suggestionsElement) {
        suggestionsElement.innerHTML = '';
      }
      suggestionMap.clear();
    }

    async function fetchSuggestions(query) {
      const search = String(query || '').trim();
      if (!search || search.length < minQueryLength) {
        clearSuggestions();
        return [];
      }

      const response = await authFetch(`/cost-items/search?q=${encodeURIComponent(search)}`, {
        headers: requestHeaders
      });

      if (!response.ok) {
        throw new Error('Failed to fetch cost item suggestions');
      }

      const items = await response.json();
      clearSuggestions();

      if (suggestionsElement) {
        items.forEach((item) => {
          const option = document.createElement('option');
          option.value = item.label;
          suggestionsElement.appendChild(option);
        });
      }

      items.forEach((item) => {
        suggestionMap.set(String(item.label || '').trim(), item);
        suggestionMap.set(String(item.code || '').trim().toUpperCase(), item);
        suggestionMap.set(String(item.description || '').trim(), item);
      });

      return items;
    }

    function clearSelectionForRow(row) {
      if (!row) {
        return;
      }

      const idField = row.querySelector('[data-field="costItemId"]');
      const codeField = row.querySelector('[data-field="costItemCode"]');
      const typeField = row.querySelector('[data-field="costItemType"]');
      const descriptionField = row.querySelector('[data-field="description"]');

      if (idField) idField.value = '';
      if (codeField) codeField.value = '';
      if (typeField) typeField.value = '';
      if (descriptionField) {
        delete descriptionField.dataset.selectedCostItemCode;
      }
      const badge = row.querySelector('[data-field="costItemBadge"]');
      if (badge) badge.hidden = true;
    }

    function applyItemToRow(row, item) {
      if (!row || !item) {
        return false;
      }

      const descriptionField = row.querySelector('[data-field="description"]');
      const unitField = row.querySelector('[data-field="unit"]');
      const unitPriceField = row.querySelector('[data-field="unitPrice"]');
      const idField = row.querySelector('[data-field="costItemId"]');
      const codeField = row.querySelector('[data-field="costItemCode"]');
      const typeField = row.querySelector('[data-field="costItemType"]');

      if (descriptionField) {
        descriptionField.value = item.description || '';
        descriptionField.dataset.selectedCostItemCode = item.code || '';
      }
      if (unitField) {
        unitField.value = item.unit || '';
      }
      if (unitPriceField) {
        unitPriceField.value = Number(item.cost_per || 0).toFixed(2);
      }
      if (idField) {
        idField.value = item.id || '';
      }
      if (codeField) {
        codeField.value = item.code || '';
      }
      if (typeField) {
        typeField.value = item.type || '';
      }

      const badge = row.querySelector('[data-field="costItemBadge"]');
      if (badge) {
        const codeSpan = badge.querySelector('[data-badge-code]');
        if (codeSpan) codeSpan.textContent = item.code || '';
        badge.hidden = false;
      }

      return true;
    }

    function resolveSelection(value) {
      const key = String(value || '').trim();
      if (!key) {
        return null;
      }

      return suggestionMap.get(key) || suggestionMap.get(key.toUpperCase()) || null;
    }

    function applySelectionFromInput(row) {
      const descriptionField = row?.querySelector('[data-field="description"]');
      if (!descriptionField) {
        return false;
      }

      const item = resolveSelection(descriptionField.value);
      if (!item) {
        clearSelectionForRow(row);
        return false;
      }

      return applyItemToRow(row, item);
    }

    function getRequestHeaders() {
      return requestHeaders;
    }

    return {
      applyItemToRow,
      applySelectionFromInput,
      clearSelectionForRow,
      clearSuggestions,
      fetchSuggestions,
      getRequestHeaders
    };
  }

  window.createCostItemLookup = createCostItemLookup;
})();