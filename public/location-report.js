const token = localStorage.getItem('token');
if (!token) location.href = 'login.html';

const table = document.getElementById('reportTable');

/* =========================
   Helpers
   ========================= */
const num = v => isNaN(Number(v)) ? 0 : Number(v);
const euro = v => `€${num(v).toFixed(2)}`;

/* =========================
   Load Report
   ========================= */
async function loadReport() {
  const res = await fetch('/reports/po-totals-by-location-breakdown', {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    alert('Failed to load report');
    return;
  }

  const data = await res.json();
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
    <tr class="details-row" id="${rowId}" style="display:none">
      <td colspan="6">
        <table class="inner-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Net (€)</th>
              <th>VAT (€)</th>
              <th>Gross (€)</th>
              <th>Uninvoiced (€)</th>
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
  const chevron = row.querySelector('.chevron');

  const open = details.style.display === 'table-row';

  // close all
  document.querySelectorAll('.details-row').forEach(r => r.style.display = 'none');
  document.querySelectorAll('.main-row').forEach(r => r.classList.remove('open'));

  if (!open) {
    details.style.display = 'table-row';
    row.classList.add('open');
  }
});





/* =========================
   Export
   ========================= */
async function exportExcel() {
  const res = await fetch(
    '/reports/po-totals-by-location-breakdown.xlsx',
    {
      headers: {
        Authorization: 'Bearer ' + token
      }
    }
  );

  if (!res.ok) {
    alert('Failed to export report');
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
loadReport();
