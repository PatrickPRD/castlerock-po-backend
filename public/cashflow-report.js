ensureAuthenticated();

const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const reportBody = document.getElementById('cashflowReportBody');
const reportMeta = document.getElementById('cashflowReportMeta');

function formatCurrency(value) {
  if (typeof window.formatMoney === 'function') {
    return window.formatMoney(value);
  }
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  return Number.isFinite(n) ? n.toString() : '-';
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function calculateSpendRates(row, templateMap) {
  const estimatedCost = toNumber(row.estimated_construction_cost, 0);
  const predictedPercent = row.predicted_spend_percentage === null || row.predicted_spend_percentage === undefined
    ? 100
    : toNumber(row.predicted_spend_percentage, 100);

  const clampedPercent = Math.max(0, Math.min(100, predictedPercent));
  const plannedSpend = estimatedCost * (clampedPercent / 100);

  const template = templateMap.get(String(row.template_key || ''));
  const templateWeeks = toNumber(template?.week_count, 0);
  const timescaleMonths = toNumber(row.spend_timescale_months, 0);
  const effectiveWeeks = timescaleMonths > 0
    ? (timescaleMonths * 52) / 12
    : templateWeeks;

  const spendPerWeek = effectiveWeeks > 0 ? plannedSpend / effectiveWeeks : 0;
  const spendPerDay = spendPerWeek / 7;
  const spendPerMonth = timescaleMonths > 0
    ? plannedSpend / timescaleMonths
    : spendPerWeek * (52 / 12);

  return {
    templateName: template?.name || '-',
    plannedSpend,
    spendPerDay,
    spendPerWeek,
    spendPerMonth
  };
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

function renderRows(rows, templateMap) {
  reportBody.innerHTML = rows.map((row) => {
    const rates = calculateSpendRates(row, templateMap);
    return `
      <tr>
        <td>${row.location_name}</td>
        <td>${row.site_name}</td>
        <td>${rates.templateName}</td>
        <td class="text-end">${formatCurrency(row.estimated_construction_cost)}</td>
        <td class="text-end">${formatNumber(row.predicted_spend_percentage)}</td>
        <td class="text-end">${formatNumber(row.spend_timescale_months)}</td>
        <td class="text-end">${formatCurrency(rates.plannedSpend)}</td>
        <td class="text-end">${formatCurrency(rates.spendPerDay)}</td>
        <td class="text-end">${formatCurrency(rates.spendPerWeek)}</td>
        <td class="text-end">${formatCurrency(rates.spendPerMonth)}</td>
        <td class="text-end">${formatCurrency(row.selling_price)}</td>
      </tr>
    `;
  }).join('');
}

async function loadReport() {
  if (!reportBody) return;

  try {
    if (typeof window.loadCurrencySettings === 'function') {
      await window.loadCurrencySettings();
    }
    if (typeof window.applyCurrencySymbols === 'function') {
      await window.applyCurrencySymbols();
    }

    const data = await api('/cashflow/settings');
    const includedLocations = (data.locations || []).filter((row) => row.include_in_cashflow);
    const templates = Array.isArray(data.templates) ? data.templates : [];
    const templateMap = new Map(templates.map((template) => [String(template.key), template]));

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
          <td colspan="11" class="text-center text-muted py-4">No included locations. Configure Cashflow Setup first.</td>
        </tr>
      `;
      return;
    }

    renderRows(includedLocations, templateMap);
  } catch (error) {
    reportBody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center text-danger py-4">${error.message || 'Failed to load cashflow report'}</td>
      </tr>
    `;
  }
}

loadReport();
