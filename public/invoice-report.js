const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

// Auth guard - super admin only
if (!token || role !== 'super_admin') {
  location.href = 'dashboard.html';
}

const table = document.getElementById('invoiceTable');
const siteFilter = document.getElementById('siteFilter');
const locationFilter = document.getElementById('locationFilter');
const searchInput = document.getElementById('searchInput');
const supplierFilter = document.getElementById('supplierFilter');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const invoiceCountEl = document.getElementById('invoiceCount');
const totalNetEl = document.getElementById('totalNet');
const totalGrossEl = document.getElementById('totalGross');

let allData = [];
let openDetailsRow = null;
let sortColumn = 'invoice_date';
let sortAscending = false; // Most recent first by default

/* =========================
   Helpers
   ========================= */
const num = v => isNaN(Number(v)) ? 0 : Number(v);
const euro = v => `€${num(v).toFixed(2)}`;

function formatVat(rate) {
  const n = Number(rate);
  if (n === 0) return '0%';
  if (n === 13.5) return '13.5%';
  if (n === 23) return '23%';
  if (n < 1) {
    const percentage = Math.round(n * 1000) / 10;
    return `${percentage}%`;
  }
  return `${n}%`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IE', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* =========================
   Load Sites
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
   Load Locations
   ========================= */
async function loadLocations(siteId) {
  if (!siteId) {
    locationFilter.innerHTML = `<option value="">All Locations</option>`;
    locationFilter.disabled = true;
    return;
  }

  try {
    const res = await fetch(`/locations?siteId=${siteId}`, {
      headers: { Authorization: 'Bearer ' + token }
    });

    const locations = await res.json();
    locationFilter.innerHTML = `<option value="">All Locations</option>`;

    locations.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      locationFilter.appendChild(opt);
    });

    locationFilter.disabled = false;
  } catch (err) {
    console.error('Failed to load locations:', err);
    locationFilter.innerHTML = `<option value="">All Locations</option>`;
    locationFilter.disabled = true;
  }
}

/* =========================
   Load Invoices
   ========================= */
async function loadInvoices() {
  const siteId = siteFilter.value;
  let url = '/reports/invoices';
  
  if (siteId) {
    url += `?siteId=${siteId}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });

  allData = await res.json();
  
  // Load locations for selected site
  await loadLocations(siteId);
  
  applyFilters();
}

/* =========================
   Sort Table
   ========================= */
function sortTable(column) {
  if (sortColumn === column) {
    sortAscending = !sortAscending;
  } else {
    sortColumn = column;
    sortAscending = true;
  }

  allData.sort((a, b) => {
    let aVal = a[column];
    let bVal = b[column];

    // Convert to numbers for numeric columns
    if (['id', 'net_amount', 'total_amount', 'vat_amount', 'po_net_amount', 'po_total_amount'].includes(column)) {
      aVal = num(aVal);
      bVal = num(bVal);
    } else if (column === 'invoice_date') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    } else {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }

    if (sortAscending) {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  updateSortIndicators();
  applyFilters();
}

function updateSortIndicators() {
  const headers = document.querySelectorAll('th.sortable');
  const columnMap = ['id', 'invoice_date', 'invoice_number', 'po_number', 'supplier', 'net_amount', 'total_amount'];

  headers.forEach((header, index) => {
    const indicator = header.querySelector('.sort-indicator');
    if (columnMap[index] === sortColumn) {
      indicator.textContent = sortAscending ? ' ↑' : ' ↓';
      indicator.style.color = '#2563eb';
    } else {
      indicator.textContent = '';
      indicator.style.color = '#9ca3af';
    }
  });
}

/* =========================
   Apply Filters
   ========================= */
function applyFilters() {
  table.innerHTML = '';
  
  const searchTerm = searchInput.value.toLowerCase();
  const supplierTerm = supplierFilter.value.toLowerCase();
  const locationId = locationFilter.value;
  const fromDate = dateFrom.value;
  const toDate = dateTo.value;

  let totalNet = 0;
  let totalGross = 0;
  let count = 0;

  const filtered = allData.filter(inv => {
    // Search filter
    if (searchTerm) {
      const searchMatch = 
        inv.invoice_number.toLowerCase().includes(searchTerm) ||
        inv.po_number.toLowerCase().includes(searchTerm) ||
        inv.supplier.toLowerCase().includes(searchTerm) ||
        inv.location.toLowerCase().includes(searchTerm);
      if (!searchMatch) return false;
    }

    // Supplier filter
    if (supplierTerm && !inv.supplier.toLowerCase().includes(supplierTerm)) {
      return false;
    }

    // Location filter
    if (locationId && String(inv.location_id) !== locationId) {
      return false;
    }

    // Date filters
    if (fromDate && inv.invoice_date < fromDate) return false;
    if (toDate && inv.invoice_date > toDate) return false;

    return true;
  });

  filtered.forEach(inv => {
    totalNet += num(inv.net_amount);
    totalGross += num(inv.total_amount);
    count++;
    renderInvoice(inv);
  });

  invoiceCountEl.textContent = count;
  totalNetEl.textContent = euro(totalNet);
  totalGrossEl.textContent = euro(totalGross);
}

/* =========================
   Render Invoice (Main Row + Details Row)
   ========================= */
function renderInvoice(inv) {
  // Main row
  const mainRow = document.createElement('tr');
  mainRow.classList.add('po-row');
  
  mainRow.innerHTML = `
    <td data-label="ID">${inv.id}</td>
    <td data-label="Date">${formatDate(inv.invoice_date)}</td>
    <td data-label="Supplier Ref">${inv.invoice_number}</td>
    <td data-label="PO #">${inv.po_number}</td>
    <td data-label="Supplier">${inv.supplier}</td>
    <td data-label="Net (€)">${euro(inv.net_amount)}</td>
    <td data-label="Total (€)">${euro(inv.total_amount)}</td>
  `;

  // Details row
  const detailsRow = document.createElement('tr');
  detailsRow.className = 'details-row';
  detailsRow.style.display = 'none';

  detailsRow.innerHTML = `
    <td colspan="7">
      <div class="details-wrapper">
        <div class="po-details-section">
          <div class="details-group">
            <h3>Supplier & Location</h3>
            <div class="details-grid">
              <div><strong>Supplier:</strong> ${inv.supplier}</div>
              <div><strong>Site:</strong> ${inv.site}</div>
              <div><strong>Location:</strong> ${inv.location}</div>
              <div><strong>Stage:</strong> ${inv.stage}</div>
            </div>
          </div>
          
          <div class="details-group">
            <h3>Invoice Financial Breakdown</h3>
            <div class="details-grid">
              <div><strong>Net Amount (ex VAT):</strong> ${euro(inv.net_amount)}</div>
              <div><strong>VAT Rate:</strong> <span class="vat-rate">${formatVat(inv.vat_rate)}</span></div>
              <div><strong>VAT Amount:</strong> ${euro(inv.vat_amount)}</div>
              <div><strong>Total Amount (inc VAT):</strong> <span class="total-amount">${euro(inv.total_amount)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </td>
  `;

  mainRow.onclick = () => {
    const isOpen = detailsRow.classList.contains('open');

    if (openDetailsRow && openDetailsRow !== detailsRow) {
      openDetailsRow.classList.remove('open');
      openDetailsRow.style.display = 'none';
      openDetailsRow.previousSibling?.classList.remove('open', 'active');
    }

    if (isOpen) {
      detailsRow.classList.remove('open');
      detailsRow.style.display = 'none';
      mainRow.classList.remove('open', 'active');
      openDetailsRow = null;
    } else {
      detailsRow.style.display = 'table-row';
      detailsRow.classList.add('open');
      mainRow.classList.add('open', 'active');
      openDetailsRow = detailsRow;

      requestAnimationFrame(() => {
        scrollExpandedRowIntoView(detailsRow);
      });
    }
  };

  table.appendChild(mainRow);
  table.appendChild(detailsRow);
}

/* =========================
   Scroll Expanded Row Into View
   ========================= */
function scrollExpandedRowIntoView(detailsRow) {
  const rect = detailsRow.getBoundingClientRect();

  const stickyBar = document.getElementById("totalsBar");
  const stickyHeight = stickyBar ? stickyBar.offsetHeight : 0;

  const viewportHeight = window.innerHeight;

  // If bottom of details row is hidden by sticky bar
  if (rect.bottom > viewportHeight - stickyHeight) {
    const scrollByAmount = rect.bottom - (viewportHeight - stickyHeight) + 16;

    window.scrollBy({
      top: scrollByAmount,
      behavior: "smooth",
    });
  }
}

/* =========================
   Toggle Filters
   ========================= */
function toggleFilters() {
  const panel = document.getElementById('filterPanel');
  if (panel) {
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
  }
}

/* =========================
   Clear Filters
   ========================= */
function clearFilters() {
  siteFilter.value = '';
  locationFilter.value = '';
  locationFilter.disabled = true;
  searchInput.value = '';
  supplierFilter.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  loadInvoices();
}

/* =========================
   Export to Excel
   ========================= */
async function exportExcel() {
  // Get filtered data
  const searchTerm = searchInput.value.toLowerCase();
  const supplierTerm = supplierFilter.value.toLowerCase();
  const locationId = locationFilter.value;
  const fromDate = dateFrom.value;
  const toDate = dateTo.value;

  const filtered = allData.filter(inv => {
    if (searchTerm) {
      const searchMatch = 
        inv.invoice_number.toLowerCase().includes(searchTerm) ||
        inv.po_number.toLowerCase().includes(searchTerm) ||
        inv.supplier.toLowerCase().includes(searchTerm) ||
        inv.location.toLowerCase().includes(searchTerm);
      if (!searchMatch) return false;
    }

    if (supplierTerm && !inv.supplier.toLowerCase().includes(supplierTerm)) {
      return false;
    }

    if (locationId && String(inv.location_id) !== locationId) {
      return false;
    }

    if (fromDate && inv.invoice_date < fromDate) return false;
    if (toDate && inv.invoice_date > toDate) return false;

    return true;
  });

  // Group by month-year
  const byMonth = {};
  filtered.forEach(inv => {
    const monthKey = `${inv.year_num}-${String(inv.month_num).padStart(2, '0')}`;
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = { 
        month_name: inv.month_name, 
        year_num: inv.year_num,
        invoices: [] 
      };
    }
    byMonth[monthKey].invoices.push(inv);
  });

  // Load ExcelJS library
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
  script.onload = () => {
    const ExcelJS = window.ExcelJS;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Castlerock Homes';

    // Calculate totals by month and supplier for summary
    const monthlyTotals = {};
    const supplierTotals = {};
    let grandTotalNet = 0;
    let grandTotalVat = 0;
    let grandTotalGross = 0;

    Object.entries(byMonth)
      .sort()
      .forEach(([monthKey, data]) => {
        let monthNet = 0;
        let monthVat = 0;
        let monthGross = 0;

        data.invoices.forEach(inv => {
          const net = num(inv.net_amount);
          const vat = num(inv.vat_amount);
          const total = num(inv.total_amount);

          monthNet += net;
          monthVat += vat;
          monthGross += total;
          grandTotalNet += net;
          grandTotalVat += vat;
          grandTotalGross += total;

          // Supplier totals
          if (!supplierTotals[inv.supplier]) {
            supplierTotals[inv.supplier] = { net: 0, vat: 0, total: 0, count: 0 };
          }
          supplierTotals[inv.supplier].net += net;
          supplierTotals[inv.supplier].vat += vat;
          supplierTotals[inv.supplier].total += total;
          supplierTotals[inv.supplier].count += 1;
        });

        monthlyTotals[monthKey] = {
          month_name: data.month_name,
          year_num: data.year_num,
          net: monthNet,
          vat: monthVat,
          total: monthGross,
          count: data.invoices.length
        };
      });

    // Create Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary', { properties: { tabColor: 'FF0000' } });
    summarySheet.pageSetup = { paperSize: 9, orientation: 'landscape' };

    // Title
    summarySheet.mergeCells('A1:D1');
    summarySheet.getCell('A1').value = 'Invoice Report Summary';
    summarySheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF2563eb' } };
    summarySheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'center' };

    // Report date
    const reportDate = new Date().toLocaleDateString('en-IE');
    summarySheet.mergeCells('A2:D2');
    summarySheet.getCell('A2').value = `Generated: ${reportDate}`;
    summarySheet.getCell('A2').font = { size: 11, italic: true, color: { argb: 'FF666666' } };

    summarySheet.addRow([]);

    // Monthly Summary Section
    summarySheet.getCell('A4').value = 'MONTHLY SUMMARY';
    summarySheet.getCell('A4').font = { size: 12, bold: true, color: { argb: 'FF2563eb' } };

    summarySheet.columns = [
      { header: 'Month', key: 'month', width: 15 },
      { header: 'Invoices', key: 'count', width: 12 },
      { header: 'Net (€)', key: 'net', width: 15 },
      { header: 'VAT (€)', key: 'vat', width: 15 },
      { header: 'Total (€)', key: 'total', width: 15 }
    ];

    summarySheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summarySheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563eb' } };

    let rowNum = 5;
    Object.entries(monthlyTotals)
      .sort()
      .forEach(([monthKey, data]) => {
        rowNum++;
        summarySheet.addRow({
          month: `${data.month_name} ${data.year_num}`,
          count: data.count,
          net: data.net,
          vat: data.vat,
          total: data.total
        });
      });

    // Grand total row
    rowNum++;
    const grandTotalRow = summarySheet.addRow({
      month: 'GRAND TOTAL',
      count: filtered.length,
      net: grandTotalNet,
      vat: grandTotalVat,
      total: grandTotalGross
    });
    grandTotalRow.font = { bold: true };
    grandTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

    // Format currency columns
    ['C', 'D', 'E'].forEach(col => {
      summarySheet.getColumn(col).numFmt = '€#,##0.00';
    });

    summarySheet.addRow([]);

    // Supplier Summary Section
    const suppRowStart = rowNum + 3;
    summarySheet.getCell(`A${suppRowStart}`).value = 'SUPPLIER SUMMARY';
    summarySheet.getCell(`A${suppRowStart}`).font = { size: 12, bold: true, color: { argb: 'FF2563eb' } };

    summarySheet.getCell(`A${suppRowStart + 1}`).value = 'Supplier';
    summarySheet.getCell(`B${suppRowStart + 1}`).value = 'Invoices';
    summarySheet.getCell(`C${suppRowStart + 1}`).value = 'Net (€)';
    summarySheet.getCell(`D${suppRowStart + 1}`).value = 'VAT (€)';
    summarySheet.getCell(`E${suppRowStart + 1}`).value = 'Total (€)';

    for (let i = 1; i <= 5; i++) {
      summarySheet.getCell(`${String.fromCharCode(64 + i)}${suppRowStart + 1}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      summarySheet.getCell(`${String.fromCharCode(64 + i)}${suppRowStart + 1}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563eb' } };
    }

    let suppRowNum = suppRowStart + 1;
    Object.entries(supplierTotals)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([supplier, totals]) => {
        suppRowNum++;
        summarySheet.addRow({
          month: supplier,
          count: totals.count,
          net: totals.net,
          vat: totals.vat,
          total: totals.total
        });
      });

    // Supplier grand total
    suppRowNum++;
    const supplierGrandTotal = summarySheet.addRow({
      month: 'TOTAL',
      count: filtered.length,
      net: grandTotalNet,
      vat: grandTotalVat,
      total: grandTotalGross
    });
    supplierGrandTotal.font = { bold: true };
    supplierGrandTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

    Object.entries(byMonth)
      .sort()
      .forEach(([monthKey, data]) => {
        const sheetName = `${data.month_name} ${data.year_num}`.substring(0, 31);
        const sheet = workbook.addWorksheet(sheetName);

        const invoiceCount = data.invoices.length;

        // Create table with all invoice data
        sheet.addTable({
          name: `Invoices${data.year_num}${String(data.invoices[0]?.month_num || 1).padStart(2, '0')}`.substring(0, 31),
          ref: `A1:L${invoiceCount + 1}`,
          headerRow: true,
          columns: [
            { name: 'Invoice ID' },
            { name: 'Invoice Date' },
            { name: 'Supplier Ref' },
            { name: 'PO #' },
            { name: 'Supplier' },
            { name: 'Site' },
            { name: 'Location' },
            { name: 'Stage' },
            { name: 'Net (€)' },
            { name: 'VAT %' },
            { name: 'VAT (€)' },
            { name: 'Total (€)' }
          ],
          rows: data.invoices.map(inv => [
            inv.id,
            formatDate(inv.invoice_date),
            inv.invoice_number,
            inv.po_number,
            inv.supplier,
            inv.site,
            inv.location,
            inv.stage,
            num(inv.net_amount),
            formatVat(inv.vat_rate),
            num(inv.vat_amount),
            num(inv.total_amount)
          ])
        });

        // Set column widths
        sheet.getColumn(1).width = 12;  // Invoice ID
        sheet.getColumn(2).width = 15;  // Invoice Date
        sheet.getColumn(3).width = 15;  // Supplier Ref
        sheet.getColumn(4).width = 12;  // PO #
        sheet.getColumn(5).width = 25;  // Supplier
        sheet.getColumn(6).width = 20;  // Site
        sheet.getColumn(7).width = 20;  // Location
        sheet.getColumn(8).width = 15;  // Stage
        sheet.getColumn(9).width = 12;  // Net
        sheet.getColumn(10).width = 10; // VAT %
        sheet.getColumn(11).width = 12; // VAT
        sheet.getColumn(12).width = 12; // Total

        // Total row with formulas (below the table)
        const lastDataRow = invoiceCount + 1;
        const totalRowNum = lastDataRow + 1;
        sheet.getCell(`A${totalRowNum}`).value = '';
        sheet.getCell(`B${totalRowNum}`).value = 'TOTAL';
        sheet.getCell(`B${totalRowNum}`).font = { bold: true };
        sheet.getCell(`I${totalRowNum}`).value = { formula: `SUM(I2:I${lastDataRow})` };
        sheet.getCell(`I${totalRowNum}`).font = { bold: true };
        sheet.getCell(`K${totalRowNum}`).value = { formula: `SUM(K2:K${lastDataRow})` };
        sheet.getCell(`K${totalRowNum}`).font = { bold: true };
        sheet.getCell(`L${totalRowNum}`).value = { formula: `SUM(L2:L${lastDataRow})` };
        sheet.getCell(`L${totalRowNum}`).font = { bold: true };

        // Format currency columns
        ['I', 'K', 'L'].forEach(col => {
          sheet.getColumn(col).numFmt = '€#,##0.00';
        });

        sheet.views = [{ state: 'frozen', ySplit: 1 }];
      });

    // Download
    workbook.xlsx.writeBuffer().then(buffer => {
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  };
  document.head.appendChild(script);
}

/* =========================
   Event Listeners
   ========================= */
siteFilter.addEventListener('change', loadInvoices);
locationFilter.addEventListener('change', applyFilters);
searchInput.addEventListener('input', applyFilters);
supplierFilter.addEventListener('input', applyFilters);
dateFrom.addEventListener('change', applyFilters);
dateTo.addEventListener('change', applyFilters);

/* =========================
   Initialize
   ========================= */
document.addEventListener('DOMContentLoaded', async () => {
  // Set default date filter to last month
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  
  dateTo.value = today.toISOString().slice(0, 10);
  dateFrom.value = lastMonth.toISOString().slice(0, 10);

  await loadSites();
  await loadInvoices();
});
