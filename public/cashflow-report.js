ensureAuthenticated();

const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const reportBody = document.getElementById('cashflowReportBody');
const reportMeta = document.getElementById('cashflowReportMeta');
const siteFilter = document.getElementById('cashflowReportSiteFilter');
const locationFilter = document.getElementById('cashflowReportLocationFilter');
const actualSpendToggle = document.getElementById('cashflowReportActualSpendToggle');
const actualSpendHeader = document.getElementById('cashflowReportActualSpendHeader');
const expandedMonths = new Set();
let monthCalendarRows = [];
let reportData = null;
let reportTemplates = [];
let includedLocationsCache = [];
let actualSpendByLocationCache = new Map();
let showActualSpendColumn = true;

function formatCurrency(value) {
  if (typeof window.formatMoney === 'function') {
    return window.formatMoney(value);
  }
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function getMainColumnCount() {
  return showActualSpendColumn ? 7 : 6;
}

function getWeekColumnCount() {
  return showActualSpendColumn ? 6 : 5;
}

function applyActualSpendVisibility() {
  if (actualSpendHeader) {
    actualSpendHeader.style.display = showActualSpendColumn ? '' : 'none';
  }
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + Number(days || 0));
  return copy;
}

function toMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function weekLabel(startDate) {
  const endDate = addDays(startDate, 6);
  const startText = startDate.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  const endText = endDate.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  return `${startText} - ${endText}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, toNumber(value, 0)));
}

function calculateIncomeFromRow(row) {
  const sellingPrice = toNumber(row?.selling_price, 0);
  const vatRate = clampPercent(row?.remove_vat_rate);
  const feesPercentage = clampPercent(row?.remove_fees_percentage);

  const vatAmount = vatRate > 0
    ? round2(sellingPrice * (vatRate / (100 + vatRate)))
    : 0;
  const sellingPriceBeforeVat = round2(sellingPrice - vatAmount);
  const feesAmount = round2(sellingPriceBeforeVat * (feesPercentage / 100));
  return round2(sellingPrice - vatAmount - feesAmount);
}

function normalizeSpread(values, fallbackWeeks) {
  if (Array.isArray(values) && values.length > 0) {
    const numeric = values.map((entry) => toNumber(entry, 0)).map((entry) => (entry < 0 ? 0 : entry));
    const total = numeric.reduce((sum, entry) => sum + entry, 0);

    if (total <= 0) {
      const even = round2(100 / numeric.length);
      const evenSpread = Array(numeric.length).fill(even);
      const diff = round2(100 - evenSpread.reduce((sum, entry) => sum + entry, 0));
      evenSpread[evenSpread.length - 1] = round2(evenSpread[evenSpread.length - 1] + diff);
      return evenSpread;
    }

    const normalized = numeric.map((entry) => round2((entry / total) * 100));
    const diff = round2(100 - normalized.reduce((sum, entry) => sum + entry, 0));
    normalized[normalized.length - 1] = round2(normalized[normalized.length - 1] + diff);
    return normalized;
  }

  const weeks = Number.isInteger(fallbackWeeks) && fallbackWeeks > 0 ? fallbackWeeks : 0;
  if (!weeks) return [];

  const even = round2(100 / weeks);
  const spread = Array(weeks).fill(even);
  const diff = round2(100 - spread.reduce((sum, entry) => sum + entry, 0));
  spread[spread.length - 1] = round2(spread[spread.length - 1] + diff);
  return spread;
}

function resolveWeeks(row, templateMap) {
  const spreadWeeks = Array.isArray(row.weekly_spread) ? row.weekly_spread.length : 0;
  if (spreadWeeks > 0) return spreadWeeks;

  const timescaleWeeks = Math.round(toNumber(row.spend_timescale_months, 0));
  if (timescaleWeeks > 0) return timescaleWeeks;

  const template = templateMap.get(String(row.template_key || ''));
  const templateWeeks = Math.round(toNumber(template?.week_count, 0));
  if (templateWeeks > 0) return templateWeeks;

  const startDate = parseDate(row.start_on_site_date);
  const completionDate = parseDate(row.completion_date);
  if (startDate && completionDate && completionDate >= startDate) {
    const diffDays = Math.ceil((completionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const derivedWeeks = Math.ceil(diffDays / 7);
    return Math.max(1, derivedWeeks);
  }

  return 0;
}

function createMonthBucket(date, key) {
  return {
    key,
    date,
    income: 0,
    spend: 0,
    actualSpend: 0,
    weeks: new Map()
  };
}

function createWeekBucket(date, key) {
  return {
    key,
    date,
    income: 0,
    spend: 0,
    actualSpend: 0,
    notes: new Set()
  };
}

function addEventToBuckets(monthMap, event) {
  const monthKey = toMonthKey(event.date);
  const monthStart = new Date(event.date.getFullYear(), event.date.getMonth(), 1);
  if (!monthMap.has(monthKey)) {
    monthMap.set(monthKey, createMonthBucket(monthStart, monthKey));
  }

  const monthBucket = monthMap.get(monthKey);
  const weekKey = formatIsoDate(event.date);
  if (!monthBucket.weeks.has(weekKey)) {
    monthBucket.weeks.set(weekKey, createWeekBucket(new Date(event.date), weekKey));
  }

  const weekBucket = monthBucket.weeks.get(weekKey);
  if (event.type === 'income') {
    monthBucket.income = round2(monthBucket.income + event.amount);
    weekBucket.income = round2(weekBucket.income + event.amount);
  } else if (event.type === 'actual_spend') {
    monthBucket.actualSpend = round2(monthBucket.actualSpend + event.amount);
    weekBucket.actualSpend = round2(weekBucket.actualSpend + event.amount);
  } else {
    monthBucket.spend = round2(monthBucket.spend + event.amount);
    weekBucket.spend = round2(weekBucket.spend + event.amount);
  }

  if (event.note && event.type !== 'actual_spend') {
    weekBucket.notes.add(event.note);
  }
}

function buildCalendarRows(data, includedLocations, templateMap, actualSpendByLocation = new Map()) {
  const overallStartDate = parseDate(data.overall_start_date);
  if (!overallStartDate) {
    return {
      error: 'Overall cashflow start date is required. Set it in Cashflow Setup first.',
      rows: []
    };
  }

  const events = [];
  const overallStartValue = data.overall_start_value === null || data.overall_start_value === undefined
    ? null
    : toNumber(data.overall_start_value, 0);

  if (overallStartValue !== null && overallStartValue !== 0) {
    events.push({
      date: overallStartDate,
      type: 'income',
      amount: round2(overallStartValue),
      note: 'Overall start point'
    });
  }

  includedLocations.forEach((row) => {
    const startDate = parseDate(row.start_on_site_date);
    if (!startDate) return;

    const estimatedCost = toNumber(row.estimated_construction_cost, 0);
    const plannedSpend = round2(estimatedCost * (clampPercent(
      row.predicted_spend_percentage === null || row.predicted_spend_percentage === undefined
        ? 100
        : row.predicted_spend_percentage
    ) / 100));

    const weeks = resolveWeeks(row, templateMap);
    const spread = normalizeSpread(row.weekly_spread, weeks);
    const locationId = Number(row.location_id);
    const actualLocationSpend = Number.isInteger(locationId)
      ? toNumber(actualSpendByLocation.get(locationId), 0)
      : 0;

    if (plannedSpend > 0 && spread.length > 0) {
      const amounts = spread.map((percent) => round2(plannedSpend * (toNumber(percent, 0) / 100)));
      const spendDiff = round2(plannedSpend - amounts.reduce((sum, amount) => sum + amount, 0));
      amounts[amounts.length - 1] = round2(amounts[amounts.length - 1] + spendDiff);

      amounts.forEach((amount, index) => {
        if (amount <= 0) return;
        const date = addDays(startDate, index * 7);
        if (date < overallStartDate) return;
        events.push({
          date,
          type: 'spend',
          amount,
          note: `${row.location_name} spend`
        });
      });
    }

    if (actualLocationSpend > 0) {
      if (spread.length > 0) {
        const actualAmounts = spread.map((percent) => round2(actualLocationSpend * (toNumber(percent, 0) / 100)));
        const actualDiff = round2(actualLocationSpend - actualAmounts.reduce((sum, amount) => sum + amount, 0));
        actualAmounts[actualAmounts.length - 1] = round2(actualAmounts[actualAmounts.length - 1] + actualDiff);

        actualAmounts.forEach((amount, index) => {
          if (amount <= 0) return;
          const date = addDays(startDate, index * 7);
          if (date < overallStartDate) return;
          events.push({
            date,
            type: 'actual_spend',
            amount,
            note: `${row.location_name} actual spend`
          });
        });
      } else {
        const fallbackDate = parseDate(row.completion_date) || startDate;
        if (fallbackDate && fallbackDate >= overallStartDate) {
          events.push({
            date: fallbackDate,
            type: 'actual_spend',
            amount: round2(actualLocationSpend),
            note: `${row.location_name} actual spend`
          });
        }
      }
    }

    const hasCalculatedIncome = row.calculated_income !== null && row.calculated_income !== undefined && row.calculated_income !== '';
    const incomeAmount = hasCalculatedIncome
      ? toNumber(row.calculated_income, 0)
      : calculateIncomeFromRow(row);

    if (incomeAmount > 0) {
      let completionDate = parseDate(row.completion_date);
      if (!completionDate && spread.length > 0) {
        completionDate = addDays(startDate, spread.length * 7);
      }
      if (completionDate && completionDate >= overallStartDate) {
        events.push({
          date: completionDate,
          type: 'income',
          amount: round2(incomeAmount),
          note: `${row.location_name} calculated income`
        });
      }
    }
  });

  const monthMap = new Map();
  events
    .filter((event) => event.date >= overallStartDate)
    .forEach((event) => addEventToBuckets(monthMap, event));

  const rows = [...monthMap.values()]
    .filter((month) => month.income > 0 || month.spend > 0 || month.actualSpend > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((month) => {
      const weekRows = [...month.weeks.values()]
        .filter((week) => week.income > 0 || week.spend > 0 || week.actualSpend > 0)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((week) => ({
          key: week.key,
          date: week.date,
          label: weekLabel(week.date),
          income: round2(week.income),
          spend: round2(week.spend),
          actual_spend: round2(week.actualSpend),
          net: round2(week.income - week.spend),
          notes: [...week.notes]
        }));

      return {
        key: month.key,
        label: monthLabel(month.date),
        income: round2(month.income),
        spend: round2(month.spend),
        actual_spend: round2(month.actualSpend),
        net: round2(month.income - month.spend),
        weeks: weekRows
      };
    });

  return { rows, error: null };
}

async function api(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
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

async function loadActualSpendByLocation() {
  try {
    const rows = await api('/reports/po-totals-by-location-breakdown?showSpread=0');
    const map = new Map();

    if (!Array.isArray(rows)) {
      return map;
    }

    rows.forEach((row) => {
      const locationId = Number(row?.location_id);
      if (!Number.isInteger(locationId) || locationId <= 0) return;

      const actualSpend = toNumber(row?.totals?.net, 0);
      map.set(locationId, round2(actualSpend));
    });

    return map;
  } catch (_) {
    return new Map();
  }
}

function locationSort(a, b) {
  const siteSort = String(a.site_name || '').localeCompare(String(b.site_name || ''), undefined, { sensitivity: 'base', numeric: true });
  if (siteSort !== 0) return siteSort;
  return String(a.location_name || '').localeCompare(String(b.location_name || ''), undefined, { sensitivity: 'base', numeric: true });
}

function renderSiteFilterOptions(locations) {
  if (!siteFilter) return;

  const previousValue = siteFilter.value;
  const sitesMap = new Map();
  locations.forEach((row) => {
    const siteId = Number(row.site_id);
    if (!Number.isInteger(siteId) || siteId <= 0) return;
    if (!sitesMap.has(siteId)) {
      sitesMap.set(siteId, String(row.site_name || ''));
    }
  });

  const sites = [...sitesMap.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), undefined, { sensitivity: 'base', numeric: true }));
  siteFilter.innerHTML = '<option value="">All Sites</option>';
  sites.forEach(([siteId, siteName]) => {
    const option = document.createElement('option');
    option.value = String(siteId);
    option.textContent = siteName;
    siteFilter.appendChild(option);
  });

  if (previousValue && [...siteFilter.options].some((option) => option.value === previousValue)) {
    siteFilter.value = previousValue;
  }
}

function renderLocationFilterOptions(locations) {
  if (!locationFilter) return;

  const previousValue = locationFilter.value;
  const selectedSiteId = Number(siteFilter?.value || 0);
  const options = locations
    .filter((row) => {
      if (!selectedSiteId) return true;
      return Number(row.site_id) === selectedSiteId;
    })
    .sort(locationSort);

  locationFilter.innerHTML = '<option value="">All Locations</option>';
  options.forEach((row) => {
    const locationId = Number(row.location_id);
    if (!Number.isInteger(locationId) || locationId <= 0) return;

    const option = document.createElement('option');
    option.value = String(locationId);
    option.textContent = selectedSiteId
      ? String(row.location_name || '')
      : `${row.site_name} — ${row.location_name}`;
    locationFilter.appendChild(option);
  });

  if (previousValue && [...locationFilter.options].some((option) => option.value === previousValue)) {
    locationFilter.value = previousValue;
  } else {
    locationFilter.value = '';
  }
}

function getFilteredLocations(locations) {
  const selectedSiteId = Number(siteFilter?.value || 0);
  const selectedLocationId = Number(locationFilter?.value || 0);

  return locations.filter((row) => {
    if (selectedSiteId && Number(row.site_id) !== selectedSiteId) {
      return false;
    }
    if (selectedLocationId && Number(row.location_id) !== selectedLocationId) {
      return false;
    }
    return true;
  });
}

function renderCalendarFromFilters() {
  if (!reportBody || !reportData) return;

  const filteredLocations = getFilteredLocations(includedLocationsCache);
  if (filteredLocations.length === 0) {
    reportBody.innerHTML = `
      <tr>
        <td colspan="${getMainColumnCount()}" class="text-center text-muted py-4">No included locations match the selected filters.</td>
      </tr>
    `;
    monthCalendarRows = [];
    expandedMonths.clear();
    return;
  }

  const templateMap = new Map(reportTemplates.map((template) => [String(template.key), template]));
  const calendar = buildCalendarRows(reportData, filteredLocations, templateMap, actualSpendByLocationCache);
  if (calendar.error) {
    reportBody.innerHTML = `
      <tr>
        <td colspan="${getMainColumnCount()}" class="text-center text-danger py-4">${escapeHtml(calendar.error)}</td>
      </tr>
    `;
    monthCalendarRows = [];
    expandedMonths.clear();
    return;
  }

  monthCalendarRows = calendar.rows;
  if (monthCalendarRows.length === 0) {
    reportBody.innerHTML = `
      <tr>
        <td colspan="${getMainColumnCount()}" class="text-center text-muted py-4">No spending, actual spend, or income found from the overall start date.</td>
      </tr>
    `;
    expandedMonths.clear();
    return;
  }

  expandedMonths.clear();
  renderRows(monthCalendarRows);
}

function renderRows(rows) {
  let closingBalance = 0;

  const monthRowsHtml = rows.map((month) => {
    closingBalance = round2(closingBalance + month.net);
    const isExpanded = expandedMonths.has(month.key);

    const weekRowsHtml = month.weeks.length
      ? month.weeks.map((week) => `
          <tr>
            <td>${escapeHtml(week.label)}</td>
            <td class="text-end">${formatCurrency(week.income)}</td>
            <td class="text-end">${formatCurrency(week.spend)}</td>
            ${showActualSpendColumn ? `<td class="text-end">${formatCurrency(week.actual_spend)}</td>` : ''}
            <td class="text-end">${formatCurrency(week.net)}</td>
            <td>${escapeHtml(week.notes.join(' • ') || '-')}</td>
          </tr>
        `).join('')
      : `
        <tr>
          <td colspan="${getWeekColumnCount()}" class="text-center text-muted py-3">No weekly activity in this month.</td>
        </tr>
      `;

    return `
      <tr class="calendar-month-row">
        <td>
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleCashflowMonth('${month.key}')">${isExpanded ? '−' : '+'}</button>
        </td>
        <td class="calendar-month-label">${escapeHtml(month.label)}</td>
        <td class="text-end">${formatCurrency(month.income)}</td>
        <td class="text-end">${formatCurrency(month.spend)}</td>
        ${showActualSpendColumn ? `<td class="text-end">${formatCurrency(month.actual_spend)}</td>` : ''}
        <td class="text-end">${formatCurrency(month.net)}</td>
        <td class="text-end">${formatCurrency(closingBalance)}</td>
      </tr>
      <tr class="calendar-month-details" style="display:${isExpanded ? 'table-row' : 'none'};">
        <td colspan="${getMainColumnCount()}">
          <div class="calendar-week-panel">
            <table class="table table-sm mb-0">
              <thead>
                <tr>
                  <th>Week</th>
                  <th class="text-end">Income (<span data-currency-symbol>€</span>)</th>
                  <th class="text-end">Target Spend (<span data-currency-symbol>€</span>)</th>
                  ${showActualSpendColumn ? '<th class="text-end">Actual Spend (<span data-currency-symbol>€</span>)</th>' : ''}
                  <th class="text-end">Net (<span data-currency-symbol>€</span>)</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${weekRowsHtml}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const totals = rows.reduce((accumulator, month) => ({
    income: round2(accumulator.income + toNumber(month.income, 0)),
    spend: round2(accumulator.spend + toNumber(month.spend, 0)),
    actual_spend: round2(accumulator.actual_spend + toNumber(month.actual_spend, 0)),
    net: round2(accumulator.net + toNumber(month.net, 0))
  }), {
    income: 0,
    spend: 0,
    actual_spend: 0,
    net: 0
  });

  const totalsRowHtml = `
    <tr class="table-secondary fw-semibold calendar-total-row">
      <td></td>
      <td>Total</td>
      <td class="text-end">${formatCurrency(totals.income)}</td>
      <td class="text-end">${formatCurrency(totals.spend)}</td>
      ${showActualSpendColumn ? `<td class="text-end">${formatCurrency(totals.actual_spend)}</td>` : ''}
      <td class="text-end">${formatCurrency(totals.net)}</td>
      <td class="text-end">${formatCurrency(closingBalance)}</td>
    </tr>
  `;

  reportBody.innerHTML = `${monthRowsHtml}${totalsRowHtml}`;
}

function toggleCashflowMonth(monthKey) {
  if (expandedMonths.has(monthKey)) {
    expandedMonths.delete(monthKey);
  } else {
    expandedMonths.add(monthKey);
  }
  renderRows(monthCalendarRows);
}

window.toggleCashflowMonth = toggleCashflowMonth;

async function loadReport() {
  if (!reportBody) return;

  try {
    if (typeof window.loadCurrencySettings === 'function') {
      await window.loadCurrencySettings();
    }
    if (typeof window.applyCurrencySymbols === 'function') {
      await window.applyCurrencySymbols();
    }

    const [data, actualSpendByLocation] = await Promise.all([
      api('/cashflow/settings'),
      loadActualSpendByLocation()
    ]);
    const includedLocations = (data.locations || []).filter((row) => row.include_in_cashflow);
    const templates = Array.isArray(data.templates) ? data.templates : [];

    reportData = data;
    reportTemplates = templates;
    includedLocationsCache = includedLocations;
    actualSpendByLocationCache = actualSpendByLocation;

    if (reportMeta) {
      const startDateText = data.overall_start_date
        ? `Overall start date: ${data.overall_start_date}`
        : 'Overall start date not set';
      const startValueText = data.overall_start_value !== null && data.overall_start_value !== undefined
        ? `Overall start point: ${formatCurrency(data.overall_start_value)}`
        : 'Overall start point not set';

      reportMeta.textContent = `${startDateText} | ${startValueText}.`;
    }

    if (includedLocations.length === 0) {
      reportBody.innerHTML = `
        <tr>
          <td colspan="${getMainColumnCount()}" class="text-center text-muted py-4">No included locations. Configure Cashflow Setup first.</td>
        </tr>
      `;
      return;
    }

    renderSiteFilterOptions(includedLocationsCache);
    renderLocationFilterOptions(includedLocationsCache);
    renderCalendarFromFilters();
  } catch (error) {
    reportBody.innerHTML = `
      <tr>
        <td colspan="${getMainColumnCount()}" class="text-center text-danger py-4">${error.message || 'Failed to load cashflow report'}</td>
      </tr>
    `;
  }
}

siteFilter?.addEventListener('change', () => {
  renderLocationFilterOptions(includedLocationsCache);
  renderCalendarFromFilters();
});

locationFilter?.addEventListener('change', () => {
  renderCalendarFromFilters();
});

actualSpendToggle?.addEventListener('change', () => {
  showActualSpendColumn = !!actualSpendToggle.checked;
  applyActualSpendVisibility();
  renderCalendarFromFilters();
});

showActualSpendColumn = actualSpendToggle ? !!actualSpendToggle.checked : true;
applyActualSpendVisibility();

loadReport();
