const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');
if (!token) location.href = 'login.html';

const poId = new URLSearchParams(location.search).get('poId');
if (!poId) location.href = 'dashboard.html';

const el = id => document.getElementById(id);

const poHeader         = el('poHeader');
const invoiceList      = el('invoiceList');
const invoiceForm      = el('invoiceForm');
const invoiceFormTitle = el('invoiceFormTitle');

const invoiceIdInput   = el('invoiceId');
const invoiceNumber    = el('invoiceNumber');
const invoiceDate      = el('invoiceDate');
const netAmountInput   = el('netAmount');
const vatRateSelect    = el('vatRate');
const vatAmountSpan   = el('vatAmount');
const totalAmountSpan = el('totalAmount');

let po = null;

/* ================= Utilities ================= */
const num  = v => isNaN(Number(v)) ? 0 : Number(v);
const euro = v => `€${num(v).toFixed(2)}`;

/* ================= Load PO ================= */
async function loadPO() {
  const res = await fetch(`/purchase-orders/${poId}`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  po = await res.json();
  renderHeader();
  renderInvoices();
}

/* ================= Render PO Header ================= */
function renderHeader() {
  poHeader.innerHTML = `
    <h2>PO: ${po.po_number}</h2>

    <div class="details-grid">
      <div><strong>Supplier:</strong> ${po.supplier}</div>
      <div><strong>Site:</strong> ${po.site}</div>
      <div><strong>Location:</strong> ${po.location}</div>

      <div><strong>Net (ex VAT):</strong> ${euro(po.net_amount)}</div>
      <div><strong>VAT Rate:</strong> ${po.vat_rate}%</div>
      <div><strong>Total (inc VAT):</strong> ${euro(po.total_amount)}</div>

      <div>
        <strong>Uninvoiced (ex VAT):</strong>
        <span class="${
          po.uninvoiced_net < 0 ? 'over' :
          po.uninvoiced_net === 0 ? 'ok' : 'warn'
        }">
          ${euro(po.uninvoiced_net)}
        </span>
      </div>
    </div>
  `;
}

/* ================= Render Invoices ================= */
function renderInvoices() {
  invoiceList.innerHTML = '';

  if (!po.invoices || po.invoices.length === 0) {
    invoiceList.innerHTML = `<tr><td colspan="6">No invoices yet</td></tr>`;
    return;
  }

  po.invoices.forEach(inv => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${inv.invoice_number}</td>
      <td>${inv.invoice_date}</td>
      <td>${euro(inv.net_amount)}</td>
      <td>${inv.vat_rate}%</td>
      <td>${euro(inv.total_amount)}</td>
      <td>
        <button class="btn-outline" onclick="editInvoice(${inv.id})">Edit</button>
        ${role === 'admin'
          ? `<button class="btn-danger" onclick="deleteInvoice(${inv.id})">Delete</button>`
          : ''}
      </td>
    `;
    invoiceList.appendChild(tr);
  });
}

/* ================= VAT Calculation ================= */
function updateTotals() {
  const net = num(netAmountInput.value);
  const rate = num(vatRateSelect.value);
  vatAmountSpan.textContent = euro(net * rate / 100);
  totalAmountSpan.textContent = euro(net + (net * rate / 100));
}

netAmountInput.addEventListener('input', updateTotals);
vatRateSelect.addEventListener('change', updateTotals);

/* ================= Save Invoice ================= */
invoiceForm.addEventListener('submit', async e => {
  e.preventDefault();

  const payload = {
    purchaseOrderId: poId,
    invoiceNumber: invoiceNumber.value,
    invoiceDate: invoiceDate.value,
    netAmount: num(netAmountInput.value),
    vatRate: num(vatRateSelect.value)
  };

  const id = invoiceIdInput.value;
  const url = id ? `/invoices/${id}` : '/invoices';
  const method = id ? 'PUT' : 'POST';

  await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  });

  resetForm();
  loadPO();
});

/* ================= Actions ================= */
function editInvoice(id) {
  const inv = po.invoices.find(i => i.id === id);
  invoiceIdInput.value = inv.id;
  invoiceNumber.value  = inv.invoice_number;
  invoiceDate.value    = inv.invoice_date;
  netAmountInput.value = inv.net_amount;
  vatRateSelect.value  = inv.vat_rate;
  invoiceFormTitle.textContent = 'Edit Invoice';
  updateTotals();
}

async function deleteInvoice(id) {
  if (!confirm('Delete this invoice?')) return;

  await fetch(`/invoices/${id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token }
  });

  loadPO();
}

function resetForm() {
  invoiceForm.reset();
  invoiceIdInput.value = '';
  invoiceFormTitle.textContent = 'Add Invoice';
  updateTotals();
}

/* ================= Init ================= */
loadPO();
