ensureAuthenticated();

(() => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token || !['super_admin', 'admin'].includes(role)) {
    location.href = 'dashboard.html';
    return;
  }

  const headers = { Authorization: 'Bearer ' + token };

  const typeFilter = document.getElementById('typeFilter');
  const statusFilter = document.getElementById('statusFilter');
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');
  const searchInput = document.getElementById('searchInput');
  const applyFiltersBtn = document.getElementById('applyFiltersBtn');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');

  const summaryGrid = document.getElementById('summaryGrid');
  const trendChartWrap = document.getElementById('trendChartWrap');
  const trendLineTooltip = document.getElementById('trendLineTooltip');
  const chartMeta = document.getElementById('chartMeta');
  const showOverallTrend = document.getElementById('showOverallTrend');
  const showGridLines = document.getElementById('showGridLines');
  const downloadCurrentCostsPdfBtn = document.getElementById('downloadCurrentCostsPdfBtn');
  const openChartOnlyBtn = document.getElementById('openChartOnlyBtn');
  const exitChartOnlyBtn = document.getElementById('exitChartOnlyBtn');
  const topMoversTable = document.getElementById('topMoversTable');

  let reportPayload = null;
  const collapsedTypes = new Set();
  let pendingTypeFromQuery = '';

  function numberValue(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function money(value) {
    return window.formatMoney ? window.formatMoney(value) : `EUR ${numberValue(value).toFixed(2)}`;
  }

  function axisMoney(value) {
    const numeric = numberValue(value);
    const abs = Math.abs(numeric);

    if (abs < 1000) {
      return money(numeric);
    }

    const sample = money(1);
    const prefixMatch = String(sample).match(/^[^0-9\-]*/);
    const prefix = prefixMatch ? prefixMatch[0].trim() : '';

    let scaled = abs;
    let suffix = '';
    if (abs >= 1000000) {
      scaled = abs / 1000000;
      suffix = 'M';
    } else {
      scaled = abs / 1000;
      suffix = 'k';
    }

    const decimals = scaled >= 10 ? 0 : 1;
    const sign = numeric < 0 ? '-' : '';
    const valueText = `${sign}${scaled.toFixed(decimals).replace(/\.0$/, '')}${suffix}`;
    return `${prefix}${valueText}`;
  }

  function statusPill(status) {
    const normalized = String(status || 'green').toLowerCase();
    return `<span class="status-pill ${normalized}">${normalized}</span>`;
  }

  function escHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }

  function buildQuery() {
    const params = new URLSearchParams();
    const effectiveType = typeFilter.value || pendingTypeFromQuery;
    if (effectiveType) params.set('type', effectiveType);
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (dateFrom.value) params.set('dateFrom', dateFrom.value);
    if (dateTo.value) params.set('dateTo', dateTo.value);
    if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
    return params.toString();
  }

  function applyQueryState() {
    const params = new URLSearchParams(window.location.search);
    pendingTypeFromQuery = params.get('type') || '';
    if (params.get('status')) {
      statusFilter.value = params.get('status');
    }
    if (params.get('dateFrom')) {
      dateFrom.value = params.get('dateFrom');
    }
    if (params.get('dateTo')) {
      dateTo.value = params.get('dateTo');
    }
    if (params.get('search')) {
      searchInput.value = params.get('search');
    }
    if (showOverallTrend && params.has('showOverallTrend')) {
      showOverallTrend.checked = params.get('showOverallTrend') === '1';
    }
    if (showGridLines && params.has('showGridLines')) {
      showGridLines.checked = params.get('showGridLines') === '1';
    }
    if (params.get('chartOnly') === '1') {
      document.body.classList.add('chart-only-mode');
    }
  }

  function buildChartOnlyUrl() {
    const params = new URLSearchParams();
    if (typeFilter.value) params.set('type', typeFilter.value);
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (dateFrom.value) params.set('dateFrom', dateFrom.value);
    if (dateTo.value) params.set('dateTo', dateTo.value);
    if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
    params.set('showOverallTrend', showOverallTrend?.checked ? '1' : '0');
    params.set('showGridLines', showGridLines?.checked ? '1' : '0');
    params.set('chartOnly', '1');
    return `current-costs-report.html?${params.toString()}`;
  }

  function buildNormalUrl() {
    const params = new URLSearchParams();
    if (typeFilter.value) params.set('type', typeFilter.value);
    if (statusFilter.value) params.set('status', statusFilter.value);
    if (dateFrom.value) params.set('dateFrom', dateFrom.value);
    if (dateTo.value) params.set('dateTo', dateTo.value);
    if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
    params.set('showOverallTrend', showOverallTrend?.checked ? '1' : '0');
    params.set('showGridLines', showGridLines?.checked ? '1' : '0');
    const qs = params.toString();
    return `current-costs-report.html${qs ? `?${qs}` : ''}`;
  }

  async function fetchReport() {
    const qs = buildQuery();
    const url = `/cost-items/reports/current-costs${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, { headers });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to load current costs report');
    }
    reportPayload = payload;
  }

  async function fetchBrandingSettings() {
    const res = await fetch('/pdf-data/gdpr', { headers });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || 'Failed to load PDF branding settings');
    }
    return payload.settings || {};
  }

  function setButtonLoading(button, loading, loadingText) {
    if (!button) return;
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    if (loading) {
      button.disabled = true;
      button.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${loadingText}`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalHtml;
    }
  }

  function currentFiltersForPdf() {
    return {
      type: typeFilter.value || '',
      status: statusFilter.value || '',
      dateFrom: dateFrom.value || '',
      dateTo: dateTo.value || '',
      search: searchInput.value.trim()
    };
  }

  function getChartSvgMarkup() {
    const svg = trendChartWrap.querySelector('svg');
    if (!svg) return '';
    const copy = svg.cloneNode(true);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Inline chart styles so SVG->PNG export does not depend on page CSS.
    copy.querySelectorAll('.overlay-line').forEach((el) => {
      if (!el.getAttribute('stroke')) {
        el.setAttribute('stroke', '#334155');
      }
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke-width', '2');
      el.setAttribute('stroke-linecap', 'round');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('opacity', '0.9');
    });

    copy.querySelectorAll('.average-line').forEach((el) => {
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', '#0f172a');
      el.setAttribute('stroke-width', '2.4');
      el.setAttribute('stroke-dasharray', '8 5');
      el.setAttribute('stroke-linecap', 'round');
    });

    copy.querySelectorAll('.axis-line').forEach((el) => {
      el.setAttribute('stroke', '#cbd5e1');
      el.setAttribute('stroke-width', '1');
      el.setAttribute('fill', 'none');
    });

    copy.querySelectorAll('.grid-line').forEach((el) => {
      el.setAttribute('stroke', '#e5e7eb');
      el.setAttribute('stroke-width', '1');
      el.setAttribute('fill', 'none');
    });

    copy.querySelectorAll('.axis-label').forEach((el) => {
      el.setAttribute('fill', '#475569');
      el.setAttribute('font-size', '14');
      el.setAttribute('font-weight', '600');
      el.setAttribute('font-family', 'Arial, sans-serif');
    });

    copy.querySelectorAll('path').forEach((el) => {
      if (!el.getAttribute('fill')) {
        el.setAttribute('fill', 'none');
      }
    });

    const viewBox = (copy.getAttribute('viewBox') || '').trim();
    const viewBoxParts = viewBox.split(/\s+/).map(Number);
    if (viewBoxParts.length === 4 && viewBoxParts.every(Number.isFinite)) {
      copy.setAttribute('width', String(viewBoxParts[2]));
      copy.setAttribute('height', String(viewBoxParts[3]));
    }
    return new XMLSerializer().serializeToString(copy);
  }

  function buildChartLegendItems() {
    const items = Array.isArray(reportPayload?.items) ? reportPayload.items : [];
    const legend = items
      .filter((item) => Array.isArray(item.trend_points) && item.trend_points.length >= 2)
      .map((item) => ({
        color: colorFromSeed(Number(item.id) * 37),
        label: `${item.code || 'N/A'} | ${item.type || 'Unknown'}`
      }));

    if (showOverallTrend?.checked) {
      legend.unshift({
        color: '#0f172a',
        label: 'Overall Trend'
      });
    }

    return legend;
  }

  function renderSummary() {
    const summary = reportPayload?.summary || {};
    const cards = [
      { label: 'Tracked Items', value: `${numberValue(summary.tracked_items)}/${numberValue(summary.total_items)}` },
      { label: 'Average Delta', value: `${numberValue(summary.avg_delta_percent).toFixed(2)}%` },
      { label: 'Rising / Falling', value: `${numberValue(summary.rising_count)} / ${numberValue(summary.falling_count)}` },
      { label: 'Red Alerts', value: String(numberValue(summary.red_count)) },
      { label: 'Yellow Alerts', value: String(numberValue(summary.yellow_count)) },
      { label: 'Green Items', value: String(numberValue(summary.green_count)) },
      { label: 'Stable', value: String(numberValue(summary.stable_count)) },
      { label: 'Overlay Points', value: String((reportPayload?.overlay_points || []).length) }
    ];

    summaryGrid.innerHTML = cards.map((card) => `
      <div class="summary-card">
        <div class="summary-label">${card.label}</div>
        <div class="summary-value">${card.value}</div>
      </div>
    `).join('');
  }

  function renderTopMovers() {
    const rows = reportPayload?.items || [];
    if (!rows.length) {
      topMoversTable.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No matching cost items for selected filters.</td></tr>';
      return;
    }

    const grouped = rows.reduce((acc, item) => {
      const key = item.type || 'Uncategorised';
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});

    const chunks = [];

    Object.keys(grouped).sort((a, b) => a.localeCompare(b)).forEach((type) => {
      const groupItems = grouped[type].slice().sort((a, b) => String(a.description || '').localeCompare(String(b.description || '')));
      const isCollapsed = !collapsedTypes.has(type);

      chunks.push(`
        <tr class="group-row">
          <td colspan="8">
            <button class="group-toggle" type="button" data-group-toggle="${escHtml(type)}">
              ${isCollapsed ? '+' : '-'} ${escHtml(type)} (${groupItems.length})
            </button>
          </td>
        </tr>
      `);

      if (isCollapsed) {
        return;
      }

      groupItems.forEach((item) => {
        const delta = numberValue(item.comparison?.delta_percent, 0);
        const deltaClass = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : '';
        const lineColor = colorFromSeed(Number(item.id) * 37);

        chunks.push(`
          <tr>
            <td>
              <span class="line-key">
                <span class="line-swatch" style="border-top-color: ${lineColor};"></span>
                <span>${escHtml(item.code)}</span>
              </span>
            </td>
            <td>${escHtml(item.description)}</td>
            <td>${escHtml(item.type)}</td>
            <td class="text-end">${money(item.cost_per)}</td>
            <td class="text-end">${item.comparison?.average_cost === null ? '-' : money(item.comparison.average_cost)}</td>
            <td class="text-end ${deltaClass}">${delta.toFixed(2)}%</td>
            <td>${statusPill(item.comparison?.status)}</td>
            <td class="text-end">${numberValue(item.comparison?.sample_count)}</td>
          </tr>
        `);
      });
    });

    topMoversTable.innerHTML = chunks.join('');
  }

  function colorFromSeed(seed) {
    const value = seed % 360;
    return `hsl(${value} 70% 45%)`;
  }

  function buildPath(points, xFor, yFor) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point)} ${yFor(point)}`).join(' ');
  }

  function formatTickDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-IE', {
      day: '2-digit',
      month: 'short'
    });
  }

  function buildLinearTicks(minValue, maxValue, count = 8) {
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return [];
    }
    if (Math.abs(maxValue - minValue) < 1e-9) {
      return [minValue];
    }
    const ticks = [];
    const step = (maxValue - minValue) / (count - 1);
    for (let i = 0; i < count; i += 1) {
      ticks.push(minValue + step * i);
    }
    return ticks;
  }

  function buildLogTicks(minValue, maxValue, targetCount = 10) {
    const ticks = [];
    const safeMin = Math.max(minValue, 0.01);
    const safeMax = Math.max(maxValue, safeMin * 1.01);
    const startPower = Math.floor(Math.log10(safeMin));
    const endPower = Math.ceil(Math.log10(safeMax));
    const multipliers = [1, 2, 5];

    for (let p = startPower; p <= endPower; p += 1) {
      const base = Math.pow(10, p);
      multipliers.forEach((multiplier) => {
        const value = base * multiplier;
        if (value >= safeMin && value <= safeMax) {
          ticks.push(value);
        }
      });
    }

    const unique = [...new Set(ticks.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
    if (unique.length <= targetCount) {
      return unique;
    }

    const step = Math.ceil(unique.length / targetCount);
    return unique.filter((_, index) => index % step === 0 || index === unique.length - 1);
  }

  function measureTextWidth(text, font = '600 14px Arial') {
    const canvas = measureTextWidth._canvas || (measureTextWidth._canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    if (!context) {
      return String(text || '').length * 8;
    }
    context.font = font;
    return context.measureText(String(text || '')).width;
  }

  function renderChart() {
    const items = reportPayload?.items || [];
    const overlay = reportPayload?.overlay_points || [];
    const showOverall = !!showOverallTrend?.checked;
    const showGrid = !!showGridLines?.checked;

    const allPoints = [];
    items.forEach((item) => {
      (item.trend_points || []).forEach((point) => {
        const date = new Date(point.at);
        if (!Number.isNaN(date.getTime())) {
          allPoints.push({
            date,
            cost: numberValue(point.cost_per),
            itemId: item.id
          });
        }
      });
    });

    if (showOverall) {
      overlay.forEach((point) => {
        const date = new Date(point.at);
        if (!Number.isNaN(date.getTime())) {
          allPoints.push({ date, cost: numberValue(point.average_cost), itemId: -1 });
        }
      });
    }

    if (allPoints.length === 0) {
      trendChartWrap.innerHTML = '<div class="trend-empty">No trend points found for selected filters and date range.</div>';
      chartMeta.textContent = '0 data points';
      if (trendLineTooltip) {
        trendLineTooltip.style.display = 'none';
      }
      return;
    }

    const isChartOnly = document.body.classList.contains('chart-only-mode');
    const width = 1200;
    const height = isChartOnly ? Math.round(425 * 1.35) : 425;
    const right = 20;
    const top = 20;
    const bottom = 40;

    const minTime = Math.min(...allPoints.map((point) => point.date.getTime()));
    const maxTime = Math.max(...allPoints.map((point) => point.date.getTime()));
    const minCostRaw = Math.min(...allPoints.map((point) => point.cost));
    const maxCostRaw = Math.max(...allPoints.map((point) => point.cost));

    const padding = Math.max((maxCostRaw - minCostRaw) * 0.08, maxCostRaw * 0.03, 0.05);
    const minCost = Math.max(0.01, minCostRaw - padding);
    const maxCost = Math.max(minCost + 0.01, maxCostRaw + padding);

    const useLogScale = (maxCost / Math.max(minCost, 0.01)) >= 8;
    const valueRangeLinear = Math.max(1e-6, maxCost - minCost);
    const minLog = Math.log10(Math.max(minCost, 0.01));
    const maxLog = Math.log10(Math.max(maxCost, minCost + 0.01));
    const valueRangeLog = Math.max(1e-6, maxLog - minLog);

    const xTickCount = isChartOnly ? 12 : 9;
    const yTickTarget = isChartOnly ? 10 : 8;
    const axisFontSize = isChartOnly ? 12 : 14;

    const yTickValues = useLogScale
      ? buildLogTicks(minCost, maxCost, yTickTarget)
      : buildLinearTicks(minCost, maxCost, yTickTarget);
    const yTickLabels = yTickValues.map((tickValue) => axisMoney(tickValue));
    const widestLabel = yTickLabels.reduce((maxWidth, label) => Math.max(maxWidth, measureTextWidth(label)), 0);
    const left = Math.max(54, Math.ceil(widestLabel + 14));

    const usableWidth = width - left - right;
    const usableHeight = height - top - bottom;
    const timeRange = Math.max(1, maxTime - minTime);

    const xFor = (point) => {
      const date = new Date(point.at);
      return (left + ((date.getTime() - minTime) / timeRange) * usableWidth).toFixed(2);
    };

    const valueToY = (value) => {
      const safeValue = Math.max(0.01, numberValue(value));
      if (useLogScale) {
        const normalized = (Math.log10(safeValue) - minLog) / valueRangeLog;
        return (top + (1 - normalized) * usableHeight).toFixed(2);
      }
      const normalized = (safeValue - minCost) / valueRangeLinear;
      return (top + (1 - normalized) * usableHeight).toFixed(2);
    };

    const yFor = (point) => valueToY(point.cost_per ?? point.average_cost);

    const itemSeriesCount = items.filter((item) => Array.isArray(item.trend_points) && item.trend_points.length >= 2).length;
    const itemLines = items
      .filter((item) => Array.isArray(item.trend_points) && item.trend_points.length >= 2)
      .map((item) => {
        const path = buildPath(item.trend_points, xFor, yFor);
        return `<path d="${path}" class="overlay-line" stroke="${colorFromSeed(Number(item.id) * 37)}" data-item-id="${item.id}" data-item-code="${escHtml(item.code)}" data-item-type="${escHtml(item.type)}" data-item-description="${escHtml(item.description)}"></path>`;
      })
      .join('');

    const avgLine = (showOverall && overlay.length >= 2)
      ? `<path d="${buildPath(overlay, xFor, yFor)}" class="average-line"></path>`
      : '';

    const firstDate = new Date(minTime).toLocaleDateString('en-IE');
    const lastDate = new Date(maxTime).toLocaleDateString('en-IE');
    const trendMeta = `${itemSeriesCount} item trends | overall ${showOverall ? 'on' : 'off'}`;
    chartMeta.textContent = `${allPoints.length} points | ${trendMeta} | ${useLogScale ? 'log scale' : 'linear scale'} | ${firstDate} to ${lastDate}`;

    const xTicks = [];
    for (let i = 0; i < xTickCount; i += 1) {
      const ratio = i / (xTickCount - 1);
      xTicks.push(minTime + ratio * timeRange);
    }

    const xGridMarkup = showGrid
      ? xTicks.map((tickTime) => {
        const x = (left + ((tickTime - minTime) / timeRange) * usableWidth).toFixed(2);
        return `<line x1="${x}" y1="${top}" x2="${x}" y2="${height - bottom}" class="grid-line"></line>`;
      }).join('')
      : '';

    const yGridMarkup = showGrid
      ? yTickValues.map((tickValue) => {
        const y = valueToY(tickValue);
        return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="grid-line"></line>`;
      }).join('')
      : '';

    const xTickLabelsMarkup = xTicks.map((tickTime) => {
      const x = (left + ((tickTime - minTime) / timeRange) * usableWidth).toFixed(2);
      return `<text x="${x}" y="${height - 10}" text-anchor="middle" class="axis-label" style="font-size:${axisFontSize}px;">${formatTickDate(tickTime)}</text>`;
    }).join('');

    const yTickLabelsMarkup = yTickValues.map((tickValue, index) => {
      const y = valueToY(tickValue);
      return `<text x="${left - 8}" y="${Number(y) + Math.round(axisFontSize * 0.28)}" text-anchor="end" class="axis-label" style="font-size:${axisFontSize}px;">${yTickLabels[index]}</text>`;
    }).join('');

    trendChartWrap.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" class="trend-chart" role="img" aria-label="Current cost overlay trends">
        ${xGridMarkup}
        ${yGridMarkup}
        <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" class="axis-line"></line>
        <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" class="axis-line"></line>
        ${xTickLabelsMarkup}
        ${yTickLabelsMarkup}
        ${itemLines}
        ${avgLine}
      </svg>
    `;

    if (!trendLineTooltip) {
      return;
    }

    const chartElement = trendChartWrap.querySelector('svg');
    if (!chartElement) {
      trendLineTooltip.style.display = 'none';
      return;
    }

    const lineElements = chartElement.querySelectorAll('.overlay-line[data-item-id]');
    lineElements.forEach((line) => {
      line.addEventListener('mouseenter', () => {
        line.classList.add('is-hovered');
        const code = line.getAttribute('data-item-code') || 'Unknown';
        const description = line.getAttribute('data-item-description') || '';
        trendLineTooltip.textContent = description ? `${code} | ${description}` : code;
        trendLineTooltip.style.display = 'block';
      });

      line.addEventListener('mousemove', (event) => {
        const wrapRect = trendChartWrap.getBoundingClientRect();
        const offsetX = event.clientX - wrapRect.left + 14;
        const offsetY = event.clientY - wrapRect.top - 12;
        trendLineTooltip.style.left = `${Math.max(8, offsetX)}px`;
        trendLineTooltip.style.top = `${Math.max(8, offsetY)}px`;
      });

      line.addEventListener('mouseleave', () => {
        line.classList.remove('is-hovered');
        trendLineTooltip.style.display = 'none';
      });
    });
  }

  function populateTypeOptions() {
    const selected = typeFilter.value || pendingTypeFromQuery;
    const options = reportPayload?.type_options || [];
    typeFilter.innerHTML = '<option value="">All Types</option>';
    options.forEach((type) => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeFilter.appendChild(option);
    });
    typeFilter.value = options.includes(selected) ? selected : '';
    pendingTypeFromQuery = '';
  }

  function applyReturnedFilters() {
    const filters = reportPayload?.filters || {};
    if (!dateFrom.value) {
      dateFrom.value = filters.date_from || '';
    }
    if (!dateTo.value) {
      dateTo.value = filters.date_to || '';
    }
  }

  async function loadAndRender() {
    try {
      await fetchReport();
      collapsedTypes.clear();
      populateTypeOptions();
      applyReturnedFilters();
      renderSummary();
      renderChart();
      renderTopMovers();
    } catch (error) {
      showToast(error.message || 'Failed to load current costs report', 'error');
    }
  }

  function resetFilters() {
    typeFilter.value = '';
    statusFilter.value = '';
    searchInput.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    loadAndRender();
  }

  if (openChartOnlyBtn) {
    openChartOnlyBtn.addEventListener('click', () => {
      window.location.href = buildChartOnlyUrl();
    });
  }

  if (exitChartOnlyBtn) {
    exitChartOnlyBtn.addEventListener('click', () => {
      window.location.href = buildNormalUrl();
    });
  }

  if (downloadCurrentCostsPdfBtn) {
    downloadCurrentCostsPdfBtn.addEventListener('click', async () => {
      try {
        if (typeof generateCurrentCostsReportPDF !== 'function') {
          throw new Error('PDF generator is not available on this page');
        }

        setButtonLoading(downloadCurrentCostsPdfBtn, true, 'Generating PDF...');

        // Refresh report payload using current control values so selected filters are preserved.
        await fetchReport();
        renderSummary();
        renderChart();
        renderTopMovers();

        const settings = await fetchBrandingSettings();
        await generateCurrentCostsReportPDF(reportPayload, settings, {
          filters: currentFiltersForPdf(),
          chartSvg: getChartSvgMarkup(),
          legendItems: buildChartLegendItems()
        }, 'download');

        showToast('PDF downloaded successfully', 'success');
      } catch (error) {
        console.error('Error generating Current Costs PDF:', error);
        showToast(error.message || 'Failed to generate PDF', 'error');
      } finally {
        setButtonLoading(downloadCurrentCostsPdfBtn, false, 'Generating PDF...');
      }
    });
  }

  applyFiltersBtn.addEventListener('click', loadAndRender);
  resetFiltersBtn.addEventListener('click', resetFilters);
  topMoversTable.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-group-toggle]');
    if (!toggle) {
      return;
    }

    const type = toggle.getAttribute('data-group-toggle');
    if (collapsedTypes.has(type)) {
      collapsedTypes.delete(type);
    } else {
      collapsedTypes.add(type);
    }

    renderTopMovers();
  });
  if (showOverallTrend) {
    showOverallTrend.addEventListener('change', renderChart);
  }
  if (showGridLines) {
    showGridLines.addEventListener('change', renderChart);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    applyQueryState();
    if (window.loadCurrencySettings) {
      try {
        await window.loadCurrencySettings();
      } catch (_) {}
    }
    await loadAndRender();
  });
})();
