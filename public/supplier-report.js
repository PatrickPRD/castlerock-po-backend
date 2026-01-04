const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');

if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const table = document.getElementById('reportTable');
const siteFilter = document.getElementById('siteFilter');

/* =========================
   Helpers
   ========================= */
const num = v => isNaN(Number(v)) ? 0 : Number(v);
const euro = v => `€${num(v).toFixed(2)}`;

/* =========================
   Load Sites into Dropdown
   ========================= */
async function loadSites() {
  const res = await fetch('/sites', {
    headers: { Authorization: 'Bearer ' + token }
  });

  const sites = await res.json();

  siteFilter.innerHTML = `<option value="">All Sites</option>`;

  sites.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    siteFilter.appendChild(opt);
  });
}

/* =========================
   Load Report
   ========================= */
async function loadReport() {
  const siteId = siteFilter.value;

  const url = siteId
    ? `/reports/po-totals-by-supplier?siteId=${siteId}`
    : `/reports/po-totals-by-supplier`;

  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    alert('Failed to load supplier report');
    return;
  }

  const data = await res.json();
  table.innerHTML = '';

  if (data.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="6">No suppliers found</td>
      </tr>
    `;
    return;
  }

  data.forEach(r => {
    table.innerHTML += `
      <tr>
        <td>${r.supplier}</td>
        <td>${euro(r.total_po_net)}</td>
        <td>${euro(r.total_po_vat)}</td>
        <td>${euro(r.total_po_gross)}</td>
        <td>${euro(r.total_invoiced_net)}</td>
        <td>
          <span class="${
            r.uninvoiced_net < 0 ? 'over' :
            r.uninvoiced_net === 0 ? 'ok' : 'warn'
          }">
            ${euro(r.uninvoiced_net)}
          </span>
        </td>
      </tr>
    `;
  });
}

/* =========================
   Events
   ========================= */
siteFilter.addEventListener('change', loadReport);

/* =========================
   Export
   ========================= */
function exportExcel() {
  const siteId = siteFilter.value;
  const token = localStorage.getItem('token');

  let url = `/reports/supplier-totals.xlsx?token=${encodeURIComponent(token)}`;

  if (siteId) {
    url += `&siteId=${siteId}`;
  }

  window.location.href = url;
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
loadSites().then(loadReport);
