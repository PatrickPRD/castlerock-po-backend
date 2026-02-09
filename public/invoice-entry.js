const token = localStorage.getItem('token');
const role  = localStorage.getItem('role');
if (!token) location.href = 'login.html';

const poId = new URLSearchParams(location.search).get('poId');
if (!poId) location.href = 'dashboard.html';

const el = id => document.getElementById(id);

const poHeader         = el('poHeader');
const invoiceList      = el('invoiceList');
const invoiceForm      = el('invoiceForm');
const invoiceModal     = el('invoiceModal');
const modalTitle       = el('modalTitle');

const invoiceIdInput   = el('invoiceId');
const invoiceNumber    = el('invoiceNumber');
const invoiceDate      = el('invoiceDate');
const netAmountInput   = el('netAmount');
const vatRateSelect    = el('vatRate');
const vatAmountSpan   = el('vatAmount');
const totalAmountSpan = el('totalAmount');

let po = null;
let vatRates = [];

/* ================= Modal Functions ================= */
function openAddInvoiceModal() {
  resetForm();
  modalTitle.textContent = 'Add Invoice';
  invoiceModal.style.display = 'flex';
}

function closeInvoiceModal() {
  invoiceModal.style.display = 'none';
  resetForm();
}

function editInvoice(id) {
  const inv = po.invoices.find(i => i.id === id);
  invoiceIdInput.value = inv.id;
  invoiceNumber.value  = inv.invoice_number;
  invoiceDate.value    = inv.invoice_date;
  netAmountInput.value = inv.net_amount;
  
  // Convert decimal VAT rate to percentage for dropdown (0.135 -> 13.5)
  const vatRatePercent = inv.vat_rate < 1 ? inv.vat_rate * 100 : inv.vat_rate;
  vatRateSelect.value = String(vatRatePercent);
  
  modalTitle.textContent = 'Edit Invoice';
  invoiceModal.style.display = 'flex';
  
  // Trigger updateTotals after modal is displayed
  setTimeout(updateTotals, 0);
}

// Close modal when clicking outside
invoiceModal.addEventListener('click', e => {
  if (e.target === invoiceModal) closeInvoiceModal();
});

/* ================= Utilities ================= */
const num  = v => isNaN(Number(v)) ? 0 : Number(v);
const euro = v => (window.formatMoney ? window.formatMoney(v) : `€${num(v).toFixed(2)}`);

function formatVat(rate) {
  const n = Number(rate);

  if (n === 0) return '0%';
  if (n === 13.5) return '13.5%';
  if (n === 23) return '23%';
  
  // Handle decimal format (0.135 -> 13.5%, 0.23 -> 23%)
  if (n < 1) {
    const percentage = Math.round(n * 1000) / 10; // Avoid floating point errors
    return `${percentage}%`;
  }

  // fallback
  return `${n}%`;
}

async function loadVatRates() {
  try {
    const res = await fetch('/settings/financial', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await res.json();
    vatRates = Array.isArray(data.vat_rates) ? data.vat_rates.map(Number) : [];
  } catch (_) {
    vatRates = [];
  }

  vatRateSelect.innerHTML = '';
  if (!vatRates.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No VAT rates configured';
    opt.disabled = true;
    opt.selected = true;
    vatRateSelect.appendChild(opt);
    vatRateSelect.disabled = true;
    return;
  }
  vatRateSelect.disabled = false;
  vatRates
    .sort((a, b) => a - b)
    .forEach(rate => {
      const opt = document.createElement('option');
      opt.value = rate;
      opt.textContent = `${rate}%`;
      vatRateSelect.appendChild(opt);
    });
}


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

  const invoicedTotal = po.invoices
    ? po.invoices.reduce((sum, i) => sum + num(i.total_amount), 0)
    : 0;

  const uninvoicedTotal = num(po.total_amount) - invoicedTotal;

  poHeader.innerHTML = `
    <div class="po-header-wrapper">
      <div class="po-number-section">
        <h2>PO: ${po.po_number}</h2>
      </div>

      <div class="po-details-section">
        <div class="details-group">
          <h3>Order Details</h3>
          <div class="details-grid">
            <div><strong>Supplier:</strong> ${po.supplier}</div>
            <div><strong>Site:</strong> ${po.site}</div>
            <div><strong>Location:</strong> ${po.location}</div>
            <div><strong>Stage:</strong> ${po.stage}</div>
          </div>
        </div>

        <div class="details-group">
          <h3>Financial Summary</h3>
          <div class="details-grid">
            <div><strong>Net (ex VAT):</strong> <span class="amount">${euro(po.net_amount)}</span></div>
            <div><strong>VAT Rate:</strong> <span class="vat-rate">${formatVat(po.vat_rate)}</span></div>
            <div><strong>Total (inc VAT):</strong> <span class="total-amount">${euro(po.total_amount)}</span></div>
          </div>
        </div>

        <div class="details-group">
          <h3>Invoice Status</h3>
          <div class="details-grid">
            <div>
              <strong>Uninvoiced (ex VAT):</strong>
              <span class="invoice-status ${
                po.uninvoiced_net < 0 ? 'over' :
                po.uninvoiced_net === 0 ? 'ok' : 'warn'
              }">
                ${euro(po.uninvoiced_net)}
              </span>
            </div>

            <div>
              <strong>Uninvoiced (inc VAT):</strong>
              <span class="invoice-status ${
                uninvoicedTotal < 0 ? 'over' :
                uninvoicedTotal === 0 ? 'ok' : 'warn'
              }">
                ${euro(uninvoicedTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}


/* ================= Render Invoices ================= */
function renderInvoices() {
  invoiceList.innerHTML = '';

  if (!po.invoices || po.invoices.length === 0) {
    invoiceList.innerHTML = `<tr><td colspan="7">No invoices yet</td></tr>`;
    return;
  }

  po.invoices.forEach(inv => {
    const isCredit = Number(inv.total_amount) < 0;

    const tr = document.createElement('tr');
    if (isCredit) tr.classList.add('credit-invoice');

    tr.innerHTML = `
      <td data-label="ID:">${inv.id}</td>
      <td data-label="Invoice No:">${inv.invoice_number}</td>
      <td data-label="Date:">${inv.invoice_date}</td>
      <td data-label="Net (ex VAT):">${euro(inv.net_amount)}</td>
      <td data-label="VAT %:">${formatVat(inv.vat_rate)}</td>
      <td data-label="Total (inc VAT):">${euro(inv.total_amount)}</td>
      <td data-label="Actions:">
        <button class="btn btn-outline-primary" onclick="editInvoice(${inv.id})">Edit</button>
        ${role === 'admin' || role === 'super_admin'
          ? `<button class="btn btn-danger" onclick="deleteInvoice(${inv.id})">Delete</button>`
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

  closeInvoiceModal();
  loadPO();
});

/* ================= Delete Invoice ================= */
async function deleteInvoice(id) {
  if (!(await confirmDialog('Delete this invoice?'))) return;

  await fetch(`/invoices/${id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token }
  });

  loadPO();
}

function resetForm() {
  invoiceForm.reset();
  invoiceIdInput.value = '';
  updateTotals();
}

/* ================= Init ================= */
// Update navigation link text
const purchaseOrdersTextEl = document.getElementById('purchaseOrdersText');
if (purchaseOrdersTextEl) {
  purchaseOrdersTextEl.textContent = 'Back to Purchase Orders';
}

(async () => {
  if (window.loadCurrencySettings) {
    try {
      await window.loadCurrencySettings();
    } catch (_) {}
  }
  await loadPO();
})();
