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
  const res = await fetch('/reports/po-totals-by-location', {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    alert('Failed to load report');
    return;
  }

  const data = await res.json();
  table.innerHTML = '';

  data.forEach(r => {
    table.innerHTML += `
      <tr>
        <td>${r.site}</td>
        <td>${r.location}</td>
        <td>${euro(r.total_net)}</td>
        <td>${euro(r.total_vat)}</td>
        <td>${euro(r.total_gross)}</td>
        <td>
          <span class="${
            num(r.uninvoiced_total) < 0 ? 'over' :
            num(r.uninvoiced_total) === 0 ? 'ok' : 'warn'
          }">
            ${euro(r.uninvoiced_total)}
          </span>
        </td>
      </tr>
    `;
  });
}

/* =========================
   Export
   ========================= */
async function exportExcel() {
  const res = await fetch('/reports/po-totals-by-location.xlsx', {
    headers: {
      Authorization: 'Bearer ' + token
    }
  });

  if (!res.ok) {
    alert('Failed to export report');
    return;
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'po-totals-by-location.xlsx';
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
