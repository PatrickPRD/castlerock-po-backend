const token = localStorage.getItem('token');
if (!token) location.href = 'login.html';

const table = document.getElementById('reportTable');
const showSpreadLocations = document.getElementById('showSpreadLocations');
const siteFilter = document.getElementById('siteFilter');
const locationFilter = document.getElementById('locationFilter');
const sortHeaders = document.querySelectorAll('th[data-sort]');
const loadingOverlay = document.getElementById('reportLoading');

let allData = [];
let sortState = { key: 'site', dir: 'asc' };
let saleCostSettings = { vatOnSale: 23, solicitorPct: 1, auctioneerPct: 1 };
const SORT_SPINNER_MIN_MS = 120;

/* =========================
   Helpers
   ========================= */
const num = v => isNaN(Number(v)) ? 0 : Number(v);
const euro = v => (window.formatMoney ? window.formatMoney(v) : `€${num(v).toFixed(2)}`);
const getCurrencySymbol = () => (window.getCurrencySymbol ? window.getCurrencySymbol() : '€');

function getVatRate() {
  return num(saleCostSettings.vatOnSale) / 100;
}

function calcProfitLoss(r) {
  const salePrice = num(r.sale_price);
  const vatRate = getVatRate();
  const salePriceExVat = salePrice / (1 + vatRate);
  const solicitorPct = num(saleCostSettings.solicitorPct) / 100;
  const auctioneerPct = num(saleCostSettings.auctioneerPct) / 100;
  const solicitorCost = salePrice * solicitorPct;
  const auctioneerCost = salePrice * auctioneerPct;
  const capitalCost = num(r.totals.capital_cost || 0);
  const netSpendIncLabour = num(r.totals.net) + num(r.totals.labour || 0);
  return salePriceExVat - netSpendIncLabour - capitalCost - solicitorCost - auctioneerCost;
}

function calcTargetProfit(r) {
  if (r.expected_spent == null) return null;
  const salePrice = num(r.sale_price);
  const vatRate = getVatRate();
  const salePriceExVat = salePrice / (1 + vatRate);
  const solicitorCost = salePrice * (num(saleCostSettings.solicitorPct) / 100);
  const auctioneerCost = salePrice * (num(saleCostSettings.auctioneerPct) / 100);
  const expectedSpent = num(r.expected_spent);
  return salePriceExVat - solicitorCost - auctioneerCost - expectedSpent;
}

/* =========================
   Load Report
   ========================= */
async function loadReport() {
  const showSpread = showSpreadLocations.checked ? '1' : '0';
  setLoading(true);
  try {
    const res = await fetch(`/reports/po-totals-by-location-breakdown?showSpread=${showSpread}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!res.ok) {
      showToast('Failed to load report', 'error');
      return;
    }

    allData = await res.json();
    updateLocationOptions();
    renderReport();
  } finally {
    setLoading(false);
  }
}

function renderReport() {
  const selectedSite = siteFilter.value;
  const selectedLocation = locationFilter.value;
  let data = selectedSite ? allData.filter(r => r.site === selectedSite) : allData;
  data = selectedLocation ? data.filter(r => r.location === selectedLocation) : data;

  data = sortData(data);
  
  table.innerHTML = '';

  data.forEach((r, index) => {
  const rowId = `loc-${index}`;
  const profitLoss = calcProfitLoss(r);
  const plClass = profitLoss >= 0 ? 'profit-positive' : 'profit-negative';
  const salePriceExVat = num(r.sale_price) / (1 + num(saleCostSettings.vatOnSale) / 100);
  const profitPct = salePriceExVat > 0 ? ((profitLoss / salePriceExVat) * 100).toFixed(1) : '0.0';

  const targetProfit = calcTargetProfit(r);
  const hasTarget = targetProfit != null;
  const tpClass = hasTarget ? (targetProfit >= 0 ? 'profit-positive' : 'profit-negative') : '';
  const targetPct = hasTarget && salePriceExVat > 0 ? ((targetProfit / salePriceExVat) * 100).toFixed(1) : null;

  // MAIN ROW
 table.innerHTML += `
  <tr class="main-row" data-target="${rowId}">
    <td>${r.site}</td>
    <td>
      ${r.location}
    </td>
    <td>${euro(r.totals.net + (r.totals.labour || 0))}</td>
    <td>${euro(r.totals.labour || 0)}</td>
    <td>${euro(r.sale_price || 0)}</td>
    <td>${r.expected_spent != null ? euro(r.expected_spent) : ''}</td>
    <td class="${tpClass}">${hasTarget ? euro(targetProfit) : ''}</td>
    <td class="${tpClass}">${targetPct != null ? targetPct + '%' : ''}</td>
    <td class="${plClass}">${euro(profitLoss)}</td>
    <td class="${plClass}">${profitPct}%</td>
  </tr>
`;


  // DETAILS ROW (STAGES)
  const salePrice = num(r.sale_price);
  const solicitorPct = num(saleCostSettings.solicitorPct) / 100;
  const auctioneerPct = num(saleCostSettings.auctioneerPct) / 100;
  const solicitorCost = salePrice * solicitorPct;
  const auctioneerCost = salePrice * auctioneerPct;
  const capitalCost = num(r.totals.capital_cost || 0);

  table.innerHTML += `
    <tr class="details-row" id="${rowId}">
      <td colspan="10">
        <table class="inner-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Net (${getCurrencySymbol()})</th>
              <th>Gross (${getCurrencySymbol()})</th>
            </tr>
          </thead>
          <tbody>
  ${
    r.stages.map(s => `
      <tr>
        <td>${s.stage}</td>
        <td>${euro(s.net)}</td>
        <td>${euro(s.gross)}</td>
      </tr>
    `).join('')
  }
</tbody>

        </table>
        <div class="detail-summary">
          <div class="detail-summary-item">
            <span class="detail-summary-label">Total Net</span>
            <span class="detail-summary-value">${euro(num(r.totals.net) + num(r.totals.labour || 0))}</span>
          </div>
          <div class="detail-summary-item">
            <span class="detail-summary-label">Capital Cost</span>
            <span class="detail-summary-value">${euro(capitalCost)}</span>
          </div>
          <div class="detail-summary-item">
            <span class="detail-summary-label">Sale Price</span>
            <span class="detail-summary-value">${euro(salePrice)}</span>
          </div>
          <div class="detail-summary-item">
            <span class="detail-summary-label">Solicitor (${(solicitorPct * 100).toFixed(1)}%)</span>
            <span class="detail-summary-value">${euro(solicitorCost)}</span>
          </div>
          <div class="detail-summary-item">
            <span class="detail-summary-label">Auctioneer (${(auctioneerPct * 100).toFixed(1)}%)</span>
            <span class="detail-summary-value">${euro(auctioneerCost)}</span>
          </div>
          ${r.expected_spent != null ? `
          <div class="detail-summary-item">
            <span class="detail-summary-label">Expected Spent</span>
            <span class="detail-summary-value">${euro(r.expected_spent)}</span>
          </div>
          ` : ''}
          <div class="detail-summary-item detail-summary-pl ${plClass}">
            <span class="detail-summary-label">Actual Profit/Loss</span>
            <span class="detail-summary-value">${euro(profitLoss)} (${profitPct}%)</span>
          </div>
          ${hasTarget ? `
          <div class="detail-summary-item detail-summary-pl ${tpClass}">
            <span class="detail-summary-label">Target Profit/Loss</span>
            <span class="detail-summary-value">${euro(targetProfit)} (${targetPct}%)</span>
          </div>
          ` : ''}
        </div>
      </td>
    </tr>
  `;
});

  // Update totals bar
  let sumNet = 0, sumPL = 0, sumSales = 0, sumProfitPct = 0;
  const siteSet = new Set();
  data.forEach(r => {
    sumNet += num(r.totals.net) + num(r.totals.labour || 0);
    sumPL += calcProfitLoss(r);
    sumSales += num(r.sale_price);
    const spExVat = num(r.sale_price) / (1 + getVatRate());
    const pl = calcProfitLoss(r);
    sumProfitPct += spExVat > 0 ? (pl / spExVat) * 100 : 0;
    if (r.site) siteSet.add(r.site);
  });
  const avgProfitPct = data.length > 0 ? (sumProfitPct / data.length).toFixed(1) : '0.0';
  const locCountEl = document.getElementById('locCount');
  const siteCountEl = document.getElementById('siteCount');
  const barNetEl = document.getElementById('barTotalNet');
  const barSalesEl = document.getElementById('barTotalSales');
  const barPLEl = document.getElementById('barProfitLoss');
  const barPctEl = document.getElementById('barProfitPct');
  if (locCountEl) locCountEl.textContent = data.length;
  if (siteCountEl) siteCountEl.textContent = siteSet.size;
  if (barNetEl) barNetEl.textContent = euro(sumNet);
  if (barSalesEl) barSalesEl.textContent = euro(sumSales);
  if (barPLEl) {
    barPLEl.textContent = euro(sumPL);
    barPLEl.className = sumPL >= 0 ? 'profit-positive' : 'profit-negative';
  }
  if (barPctEl) {
    barPctEl.textContent = avgProfitPct + '%';
    barPctEl.className = parseFloat(avgProfitPct) >= 0 ? 'profit-positive' : 'profit-negative';
  }
}

function sortData(data) {
  const dir = sortState.dir === 'asc' ? 1 : -1;
  const sorted = [...data].sort((a, b) => {
    let result = 0;
    switch (sortState.key) {
      case 'location':
        result = String(a.location || '').localeCompare(String(b.location || ''), undefined, { sensitivity: 'base', numeric: true });
        break;
      case 'total': {
        const aTotal = num(a.totals.net) + num(a.totals.labour || 0);
        const bTotal = num(b.totals.net) + num(b.totals.labour || 0);
        result = aTotal - bTotal;
        break;
      }
      case 'labour':
        result = num(a.totals.labour || 0) - num(b.totals.labour || 0);
        break;
      case 'salePrice':
        result = num(a.sale_price || 0) - num(b.sale_price || 0);
        break;
      case 'profitLoss':
        result = calcProfitLoss(a) - calcProfitLoss(b);
        break;
      case 'profitPct': {
        const aSPExVat = num(a.sale_price) / (1 + num(saleCostSettings.vatOnSale) / 100);
        const bSPExVat = num(b.sale_price) / (1 + num(saleCostSettings.vatOnSale) / 100);
        const aPct = aSPExVat > 0 ? (calcProfitLoss(a) / aSPExVat) * 100 : 0;
        const bPct = bSPExVat > 0 ? (calcProfitLoss(b) / bSPExVat) * 100 : 0;
        result = aPct - bPct;
        break;
      }
      case 'expectedSpent':
        result = num(a.expected_spent || 0) - num(b.expected_spent || 0);
        break;
      case 'targetProfit':
        result = num(calcTargetProfit(a) || 0) - num(calcTargetProfit(b) || 0);
        break;
      case 'targetPct': {
        const aTP = calcTargetProfit(a);
        const bTP = calcTargetProfit(b);
        const aSPExVat2 = num(a.sale_price) / (1 + num(saleCostSettings.vatOnSale) / 100);
        const bSPExVat2 = num(b.sale_price) / (1 + num(saleCostSettings.vatOnSale) / 100);
        const aTPct = aTP != null && aSPExVat2 > 0 ? (aTP / aSPExVat2) * 100 : 0;
        const bTPct = bTP != null && bSPExVat2 > 0 ? (bTP / bSPExVat2) * 100 : 0;
        result = aTPct - bTPct;
        break;
      }
      case 'site':
      default:
        result = String(a.site || '').localeCompare(String(b.site || ''), undefined, { sensitivity: 'base' });
        break;
    }

    if (result === 0) {
      result = String(a.location || '').localeCompare(String(b.location || ''), undefined, { sensitivity: 'base', numeric: true });
    }
    return result * dir;
  });

  updateSortIndicators();
  return sorted;
}

function updateSortIndicators() {
  sortHeaders.forEach(th => {
    const indicator = th.querySelector('.sort-indicator');
    if (!indicator) return;
    if (th.dataset.sort === sortState.key) {
      indicator.textContent = sortState.dir === 'asc' ? '^' : 'v';
      th.classList.add('sorted');
    } else {
      indicator.textContent = '';
      th.classList.remove('sorted');
    }
  });
}

function updateLocationOptions() {
  const selectedSite = siteFilter.value;
  const currentLocation = locationFilter.value;
  const options = new Set();

  allData.forEach(r => {
    if (selectedSite && r.site !== selectedSite) return;
    if (r.location) options.add(r.location);
  });

  locationFilter.innerHTML = '<option value="">All Locations</option>';
  Array.from(options).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
    .forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      locationFilter.appendChild(opt);
    });

  if (currentLocation && options.has(currentLocation)) {
    locationFilter.value = currentLocation;
  }
}

function setLoading(isLoading) {
  if (!loadingOverlay) return;
  loadingOverlay.classList.toggle('active', isLoading);
  loadingOverlay.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
}

function runSortWithSpinner() {
  setLoading(true);
  setTimeout(() => {
    renderReport();
    setLoading(false);
  }, SORT_SPINNER_MIN_MS);
}

table.addEventListener('click', e => {
  const row = e.target.closest('.main-row');
  if (!row) return;

  const targetId = row.dataset.target;
  const details = document.getElementById(targetId);

  const isOpen = details.classList.contains('open');

  // close all
  document.querySelectorAll('.details-row').forEach(r => r.classList.remove('open'));
  document.querySelectorAll('.main-row').forEach(r => r.classList.remove('open'));

  // open selected
  if (!isOpen) {
    details.classList.add('open');
    row.classList.add('open');
  }
});






/* =========================
   Export
   ========================= */
async function exportExcel() {
  const showSpread = showSpreadLocations.checked ? '1' : '0';
  setLoading(true);
  try {
    const res = await fetch(
      `/reports/po-totals-by-location-breakdown.xlsx?showSpread=${showSpread}`,
      {
        headers: {
          Authorization: 'Bearer ' + token
        }
      }
    );

    if (!res.ok) {
      showToast('Failed to export report', 'error');
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'location-report.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(url);
  } finally {
    setLoading(false);
  }
}



/* =========================
   Navigation
   ========================= */
function back() {
  location.href = 'dashboard.html';
}

/* =========================
   Init
   ========================= */
showSpreadLocations.addEventListener('change', loadReport);
siteFilter.addEventListener('change', () => {
  updateLocationOptions();
  renderReport();
});
locationFilter.addEventListener('change', renderReport);
sortHeaders.forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (!key) return;
    if (sortState.key === key) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState.key = key;
      sortState.dir = 'asc';
    }
    runSortWithSpinner();
  });
});

async function loadSites() {
  try {
    const res = await fetch('/sites', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const sites = await res.json();
    
    sites.forEach(site => {
      const opt = document.createElement('option');
      opt.value = site.name;
      opt.textContent = site.name;
      siteFilter.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load sites:', err);
  }
}

async function loadVatRates() {
  try {
    const res = await fetch('/settings/financial', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();

    // Store sale cost settings from financial settings
    saleCostSettings.vatOnSale = Number.isFinite(Number(data.vat_on_sale)) ? Number(data.vat_on_sale) : 23;
    saleCostSettings.solicitorPct = Number.isFinite(Number(data.solicitor_pct)) ? Number(data.solicitor_pct) : 1;
    saleCostSettings.auctioneerPct = Number.isFinite(Number(data.auctioneer_pct)) ? Number(data.auctioneer_pct) : 1;
  } catch (err) {
    console.error('Failed to load VAT rates:', err);
  }
}

(async () => {
  if (window.loadCurrencySettings) {
    try {
      await window.loadCurrencySettings();
    } catch (_) {}
  }
  await loadVatRates();
  await loadSites();
  await loadReport();
})();
