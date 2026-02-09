const token = localStorage.getItem('token');
if (!token) location.href = 'login.html';

const table = document.getElementById('reportTable');
const showSpreadLocations = document.getElementById('showSpreadLocations');
const siteFilter = document.getElementById('siteFilter');

let allData = [];

/* =========================
   Helpers
   ========================= */
const num = v => isNaN(Number(v)) ? 0 : Number(v);
const euro = v => (window.formatMoney ? window.formatMoney(v) : `€${num(v).toFixed(2)}`);
const getCurrencySymbol = () => (window.getCurrencySymbol ? window.getCurrencySymbol() : '€');

/* =========================
   Load Report
   ========================= */
async function loadReport() {
  const showSpread = showSpreadLocations.checked ? '1' : '0';
  const res = await fetch(`/reports/po-totals-by-location-breakdown?showSpread=${showSpread}`, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    showToast('Failed to load report', 'error');
    return;
  }

  allData = await res.json();
  renderReport();
}

function renderReport() {
  const selectedSite = siteFilter.value;
  const data = selectedSite ? allData.filter(r => r.site === selectedSite) : allData;
  
  table.innerHTML = '';

  data.forEach((r, index) => {
  const rowId = `loc-${index}`;

  // MAIN ROW
 table.innerHTML += `
  <tr class="main-row" data-target="${rowId}">
    <td>${r.site}</td>
    <td>
      ${r.location}
    </td>
    <td>${euro(r.totals.net)}</td>
    <td>${euro(r.totals.gross)}</td>
    <td>
      <span class="${
        r.totals.uninvoiced < 0 ? 'over' :
        r.totals.uninvoiced === 0 ? 'ok' : 'warn'
      }">
        ${euro(r.totals.uninvoiced)}
      </span>
    </td>
  </tr>
`;


  // DETAILS ROW (STAGES)
  table.innerHTML += `
    <tr class="details-row" id="${rowId}">
      <td colspan="5">
        <table class="inner-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Net (${getCurrencySymbol()})</th>
              <th>Gross (${getCurrencySymbol()})</th>
              <th>Uninvoiced (${getCurrencySymbol()})</th>
            </tr>
          </thead>
          <tbody>
  ${
    r.stages.map(s => `
      <tr>
        <td>${s.stage}</td>
        <td>${euro(s.net)}</td>
        <td>${euro(s.gross)}</td>
        <td>${euro(s.uninvoiced)}</td>
      </tr>
    `).join('')
  }
</tbody>

        </table>
      </td>
    </tr>
  `;
});

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
  a.download = 'po-totals-by-location-breakdown.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
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
siteFilter.addEventListener('change', renderReport);

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

(async () => {
  if (window.loadCurrencySettings) {
    try {
      await window.loadCurrencySettings();
    } catch (_) {}
  }
  await loadSites();
  await loadReport();
})();
