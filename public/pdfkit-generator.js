/**
 * jsPDF Browser Generator
 * Client-side PDF generation using jsPDF
 * Reduces server RAM usage by generating PDFs in the browser
 */

// Load jsPDF from CDN
const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AUTOTABLE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';

// Load required libraries
let jsPDF = null;
let librariesLoaded = false;

async function loadPDFKitLibraries() {
  if (librariesLoaded && window.jspdf) {
    jsPDF = window.jspdf.jsPDF;
    return;
  }

  try {
    // Load jsPDF
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = JSPDF_CDN;
      script.onload = () => {
        console.log('jsPDF loaded successfully');
        resolve();
      };
      script.onerror = (err) => {
        console.error('Failed to load jsPDF from CDN');
        reject(new Error('Failed to load jsPDF library'));
      };
      document.head.appendChild(script);
    });

    // Load AutoTable plugin
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = AUTOTABLE_CDN;
      script.onload = () => {
        console.log('jsPDF AutoTable loaded successfully');
        resolve();
      };
      script.onerror = (err) => {
        console.error('Failed to load AutoTable from CDN');
        reject(new Error('Failed to load AutoTable plugin'));
      };
      document.head.appendChild(script);
    });

    // Verify jsPDF is available
    if (window.jspdf && window.jspdf.jsPDF) {
      jsPDF = window.jspdf.jsPDF;
      librariesLoaded = true;
      console.log('PDF libraries loaded and ready');
    } else {
      throw new Error('jsPDF not found after loading');
    }
  } catch (error) {
    console.error('Error loading PDF libraries:', error);
    throw error;
  }
}

/**
 * Format currency value
 */
function formatCurrency(value, symbol = '€') {
  if (value === null || value === undefined) return `${symbol}0.00`;
  return `${symbol}${Number(value).toFixed(2)}`;
}

/**
 * Format date value
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Format a YYYY-MM-DD date string for PDF display (avoids UTC timezone offset issues)
 */
function formatPdfDate(dateStr) {
  if (!dateStr) return 'N/A';
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(dateStr);
  const day = match[3];
  const month = match[2];
  const year = match[1];
  return `${day}/${month}/${year}`;
}

/**
 * Convert hex color to RGB array
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [33, 37, 41]; // Default dark color
}

/**
 * Generate Purchase Order PDF
 */
async function generatePOPDF(poData, invoices = [], settings = {}, action = 'download') {
  await loadPDFKitLibraries();

  console.log('Generating PO PDF with data:', { 
    poNumber: poData.po_number, 
    subtotal: poData.subtotal, 
    vatAmount: poData.vat_amount, 
    total: poData.total,
    invoiceCount: invoices.length,
    lineItemCount: poData.line_items?.length || 0
  });

  const doc = new jsPDF();
  
  // Get branding settings
  const headerColor = settings.header_color || '#212529';
  const logoMode = settings.header_logo_mode || 'text';
  const logoText = settings.header_logo_text || settings.company_name || 'Castlerock Homes';
  const logoPath = settings.logo_path || '';
  const companyName = settings.company_name || 'Castlerock Homes';
  const companyAddress = settings.company_address || '';
  const companyPhone = settings.company_phone || '';
  const companyEmail = settings.company_email || '';
  const currencySymbol = settings.currency_symbol || '€';

  const headerRGB = hexToRgb(headerColor);

  // Header background
  doc.setFillColor(headerRGB[0], headerRGB[1], headerRGB[2]);
  doc.rect(0, 0, 210, 35, 'F');

  // Company logo or text
  doc.setTextColor(255, 255, 255);
  
  if (logoMode === 'image' && logoPath) {
    try {
      // Try to load and add the logo image
      const logoUrl = logoPath.startsWith('http') ? logoPath : `${window.location.origin}${logoPath}`;
      
      // Load image and convert to data URL for jsPDF
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          try {
            // Add image to PDF (doubled size: 80mm x 50mm)
            const imgWidth = 80;
            const imgHeight = (img.height / img.width) * imgWidth;
            const maxHeight = 50;
            
            const finalWidth = imgHeight > maxHeight ? (imgWidth * maxHeight / imgHeight) : imgWidth;
            const finalHeight = Math.min(imgHeight, maxHeight);
            
            doc.addImage(img, 'PNG', 15, 8, finalWidth, finalHeight);
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = reject;
        img.src = logoUrl;
      });
      
      console.log('Logo image loaded successfully');
      
    } catch (err) {
      console.warn('Could not load logo image, using text fallback:', err);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(logoText, 15, 15);
    }
  } else {
    // Use text logo
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(logoText, 15, 15);
  }

  // Document title
  doc.setFontSize(12);
  doc.text('Purchase Order', 195, 15, { align: 'right' });
  doc.setFontSize(10);
  doc.text(`PO #${poData.po_number || 'N/A'}`, 195, 22, { align: 'right' });

  // Reset text color
  doc.setTextColor(0, 0, 0);
  
  let yPos = 45;

  // Company Info (Left)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(companyName, 15, yPos);
  yPos += 5;
  if (companyAddress) {
    const addressLines = doc.splitTextToSize(companyAddress, 80);
    doc.text(addressLines, 15, yPos);
    yPos += addressLines.length * 5;
  }
  if (companyPhone) {
    doc.text(`Phone: ${companyPhone}`, 15, yPos);
    yPos += 5;
  }
  if (companyEmail) {
    doc.text(`Email: ${companyEmail}`, 15, yPos);
    yPos += 5;
  }

  // PO Info (Right)
  let rightYPos = 45;
  doc.setFont('helvetica', 'bold');
  doc.text('PO Details', 110, rightYPos);
  rightYPos += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${formatDate(poData.created_at)}`, 110, rightYPos);
  rightYPos += 5;
  doc.text(`Status: ${poData.status || 'N/A'}`, 110, rightYPos);
  rightYPos += 5;
  if (poData.site_name) {
    doc.text(`Site: ${poData.site_name}`, 110, rightYPos);
    rightYPos += 5;
  }
  if (poData.location_name) {
    doc.text(`Location: ${poData.location_name}`, 110, rightYPos);
    rightYPos += 5;
  }
  if (poData.stage_name) {
    doc.text(`Stage: ${poData.stage_name}`, 110, rightYPos);
    rightYPos += 5;
  }

  yPos = Math.max(yPos, rightYPos) + 10;

  // Supplier Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Supplier', 15, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(poData.supplier_name || 'N/A', 15, yPos);
  yPos += 5;
  if (poData.supplier_address) {
    const supplierAddressLines = doc.splitTextToSize(poData.supplier_address, 80);
    doc.text(supplierAddressLines, 15, yPos);
    yPos += supplierAddressLines.length * 5;
  }
  if (poData.supplier_email) {
    doc.text(`Email: ${poData.supplier_email}`, 15, yPos);
    yPos += 5;
  }
  if (poData.supplier_phone) {
    doc.text(`Phone: ${poData.supplier_phone}`, 15, yPos);
    yPos += 5;
  }

  yPos += 5;

  // Description
  if (poData.description) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Description', 15, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const descLines = doc.splitTextToSize(poData.description, 180);
    doc.text(descLines, 15, yPos);
    yPos += descLines.length * 5 + 5;
  }

  // Delivery Notes
  if (poData.delivery_notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Delivery Notes', 15, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const dnLines = doc.splitTextToSize(poData.delivery_notes, 180);
    doc.text(dnLines, 15, yPos);
    yPos += dnLines.length * 5 + 5;
  }

  // Line Items Table
  if (poData.line_items && poData.line_items.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Line Items', 15, yPos);
    yPos += 6;

    const lineItemsData = poData.line_items.map(item => [
      item.description || '',
      item.quantity || '0',
      item.unit || '',
      formatCurrency(item.unit_price, currencySymbol),
      formatCurrency(item.line_total, currencySymbol)
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['Description', 'Qty', 'Unit', 'Price', 'Total']],
      body: lineItemsData,
      theme: 'grid',
      headStyles: { fillColor: headerRGB, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 20, halign: 'right' },
        2: { cellWidth: 25 },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' }
      },
      margin: { left: 15, right: 15 }
    });

    yPos = doc.lastAutoTable.finalY + 10;
  }

  // Financial Summary - PO Totals (moved before invoices)
  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  console.log('Adding financial summary:', { subtotal: poData.subtotal, vat: poData.vat_amount, total: poData.total });

  // Add section header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Purchase Order Financial Summary', 15, yPos);
  yPos += 8;

  // Draw separator line
  doc.setDrawColor(200, 200, 200);
  doc.line(15, yPos, 195, yPos);
  yPos += 8;

  const summaryX = 130;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  
  doc.text('Subtotal:', summaryX, yPos);
  doc.text(formatCurrency(poData.subtotal, currencySymbol), 195, yPos, { align: 'right' });
  yPos += 6;
  
  doc.text('VAT:', summaryX, yPos);
  doc.text(formatCurrency(poData.vat_amount, currencySymbol), 195, yPos, { align: 'right' });
  yPos += 6;
  
  doc.setFontSize(12);
  doc.text('Total:', summaryX, yPos);
  doc.text(formatCurrency(poData.total, currencySymbol), 195, yPos, { align: 'right' });
  yPos += 2;

  // Draw line under total
  doc.setLineWidth(0.5);
  doc.line(summaryX, yPos, 195, yPos);
  yPos += 10;

  // Invoices Table
  if (invoices && invoices.length > 0) {
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Invoices', 15, yPos);
    yPos += 6;

    const invoicesData = invoices.map(invoice => [
      invoice.invoice_number || 'N/A',
      formatDate(invoice.invoice_date),
      formatCurrency(invoice.total_amount, currencySymbol)
    ]);

    doc.autoTable({
      startY: yPos,
      head: [['Invoice #', 'Date', 'Amount']],
      body: invoicesData,
      theme: 'grid',
      headStyles: { fillColor: headerRGB, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 60 },
        2: { cellWidth: 60, halign: 'right' }
      },
      margin: { left: 15, right: 15 }
    });

    yPos = doc.lastAutoTable.finalY + 6;

    // Calculate total invoiced amount
    const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Total Invoiced:', 130, yPos);
    doc.text(formatCurrency(totalInvoiced, currencySymbol), 195, yPos, { align: 'right' });
    yPos += 10;
  }

  // Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(128, 128, 128);
  doc.text('This is an electronically generated document.', 105, 285, { align: 'center' });

  // Save or view
  const filename = `PO-${poData.po_number}.pdf`;
  if (action === 'download') {
    doc.save(filename);
  } else if (action === 'view') {
    window.open(doc.output('bloburl'), '_blank');
  }
  
  return doc;
}

/**
 * Generate Worker PDF
 */
async function generateWorkerPDF(workerData, leaveSummary = {}, settings = {}, action = 'download', isBlank = false, userRole = null, leaveDates = null) {
  await loadPDFKitLibraries();

  const doc = new jsPDF();

  const headerColor = settings.header_color || '#212529';
  const logoMode = settings.header_logo_mode || 'text';
  const logoText = settings.header_logo_text || settings.company_name || 'Castlerock Homes';
  const logoPath = settings.logo_path || '';
  const companyName = settings.company_name || 'Castlerock Homes';
  const currencySymbol = settings.currency_symbol || '€';
  const headerRGB = hexToRgb(headerColor);

  // Pre-load logo image once so it can be reused on every page synchronously
  let loadedLogoImg = null;
  let logoFinalWidth = 0;
  let logoFinalHeight = 0;

  if (logoMode === 'image' && logoPath) {
    try {
      const logoUrl = logoPath.startsWith('http') ? logoPath : `${window.location.origin}${logoPath}`;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = () => {
          const imgWidth = 80;
          const imgHeight = (img.height / img.width) * imgWidth;
          const maxHeight = 25;
          logoFinalWidth = imgHeight > maxHeight ? (imgWidth * maxHeight / imgHeight) : imgWidth;
          logoFinalHeight = Math.min(imgHeight, maxHeight);
          loadedLogoImg = img;
          resolve();
        };
        img.onerror = reject;
        img.src = logoUrl;
      });
    } catch (err) {
      console.warn('Could not load logo image, using text fallback:', err);
    }
  }

  // Draws the coloured header bar with company logo on the current jsPDF page.
  // Call this at the start of every page (manually or via autoTable didDrawPage).
  function drawWorkerPageHeader(pageTitle, subtitle) {
    doc.setFillColor(headerRGB[0], headerRGB[1], headerRGB[2]);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    if (loadedLogoImg) {
      doc.addImage(loadedLogoImg, 'PNG', 15, 5, logoFinalWidth, logoFinalHeight);
    } else {
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(logoText, 15, 15);
    }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(pageTitle, 195, 12, { align: 'right' });
    if (subtitle) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(subtitle, 195, 25, { align: 'right' });
    }
    doc.setTextColor(0, 0, 0);
  }

  // Page 1 header
  const workerName = `${workerData.first_name || ''} ${workerData.last_name || ''}`.trim();
  drawWorkerPageHeader('Worker Information', (!isBlank && workerName) ? workerName : null);

  if (isBlank || !workerName) {
    // For blank forms, overlay "Name:" label and input box on the header
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Name:', 105, 25, { align: 'left' });
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(255, 255, 255);
    doc.rect(120, 18, 75, 8, 'FD');
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(120, 18, 75, 8, 'S');
    doc.setTextColor(0, 0, 0);
  }

  let yPos = 45;

  // Determine what to show for empty fields
  const emptyValue = isBlank ? '' : 'N/A';

  // Personal Information Table
  const personalData = [
    ['Email', workerData.email || emptyValue],
    ['Mobile Number', workerData.mobile_number || emptyValue],
    ['Address', workerData.address || emptyValue],
    ['PPS Number', workerData.pps_number || emptyValue]
  ];

  // Only admin and super_admin can see bank details
  if (userRole === 'super_admin' || userRole === 'admin') {
    personalData.push(['Bank Details', workerData.bank_details || emptyValue]);
  }

  doc.autoTable({
    startY: yPos,
    head: [['Personal Information', '']],
    body: personalData,
    theme: 'grid',
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold', textColor: [80, 80, 80] },
      1: { cellWidth: 125 }
    },
    margin: { left: 15, right: 15, top: 45 },
    didDrawPage: function(data) {
      if (data.pageNumber > 1) drawWorkerPageHeader('Worker Information', (!isBlank && workerName) ? workerName : null);
    }
  });

  yPos = doc.lastAutoTable.finalY + 5;

  // Employment Information Table
  const employmentData = [
    ['Employee ID', workerData.employee_id || emptyValue],
    ['Start Date', isBlank ? '' : formatDate(workerData.date_of_employment)],
    ['Status', isBlank ? '' : (workerData.active ? 'Active' : 'Inactive')],
    ['Left Date', (isBlank || !workerData.left_at) ? '' : formatDate(workerData.left_at)]
  ];

  // Only super_admin can see weekly financial info
  if (userRole === 'super_admin') {
    employmentData.splice(2, 0,
      ['Weekly Take Home', workerData.weekly_take_home ? formatCurrency(workerData.weekly_take_home, currencySymbol) : emptyValue],
      ['Weekly Cost', workerData.weekly_cost ? formatCurrency(workerData.weekly_cost, currencySymbol) : emptyValue]
    );
  }

  doc.autoTable({
    startY: yPos,
    head: [['Employment Details', '']],
    body: employmentData,
    theme: 'grid',
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold', textColor: [80, 80, 80] },
      1: { cellWidth: 125 }
    },
    margin: { left: 15, right: 15, top: 45 },
    didDrawPage: function(data) {
      if (data.pageNumber > 1) drawWorkerPageHeader('Worker Information', (!isBlank && workerName) ? workerName : null);
    }
  });

  yPos = doc.lastAutoTable.finalY + 5;

  // Safety Information Table
  const safetyData = [
    ['Safe Pass Number', workerData.safe_pass_number || emptyValue],
    ['Safe Pass Expiry', isBlank ? '' : formatDate(workerData.safe_pass_expiry_date)]
  ];

  doc.autoTable({
    startY: yPos,
    head: [['Safety Certifications', '']],
    body: safetyData,
    theme: 'grid',
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold', textColor: [80, 80, 80] },
      1: { cellWidth: 125 }
    },
    margin: { left: 15, right: 15, top: 45 },
    didDrawPage: function(data) {
      if (data.pageNumber > 1) drawWorkerPageHeader('Worker Information', (!isBlank && workerName) ? workerName : null);
    }
  });

  yPos = doc.lastAutoTable.finalY + 5;

  // Leave Summary Table
  if (leaveSummary && leaveSummary.totals) {
    const entitlements = leaveSummary.entitlements || { annual_leave: 20, bank_holiday: 9, sick: 3 };
    
    const annualTaken = leaveSummary.totals.annual_leave || 0;
    const annualRemaining = entitlements.annual_leave - annualTaken;
    
    const bankTaken = leaveSummary.totals.bank_holiday || 0;
    const bankRemaining = entitlements.bank_holiday - bankTaken;
    
    const sickTaken = leaveSummary.totals.paid_sick || 0;
    const sickRemaining = entitlements.sick - sickTaken;
    const unpaidSickTaken = leaveSummary.totals.sick || 0;
    const absentTaken = leaveSummary.totals.absent || 0;

    const daysWorked = leaveSummary.days_worked !== undefined ? leaveSummary.days_worked : '—';
    const currentYear = new Date().getFullYear();

    const leaveData = [
      [`Days Worked (${currentYear})`, `${daysWorked} days`, ''],
      ['Annual Leave', `${annualTaken} days`, annualRemaining >= 0 ? `${annualRemaining} days` : 'Over limit'],
      ['Bank Holidays', `${bankTaken} days`, bankRemaining >= 0 ? `${bankRemaining} days` : 'Over limit'],
      ['Paid Sick Days', `${sickTaken} days`, sickRemaining >= 0 ? `${sickRemaining} days` : 'Over limit'],
      ['Unpaid Sick Days', `${unpaidSickTaken} days`, ''],
      ['Absences', `${absentTaken} days`, '']
    ];

    doc.autoTable({
      startY: yPos,
      head: [['Leave Summary (Current Year)', 'Taken', 'Remaining']],
      body: leaveData,
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold', textColor: [80, 80, 80] },
        1: { cellWidth: 60, halign: 'center' },
        2: { cellWidth: 65, halign: 'center' }
      },
      margin: { left: 15, right: 15, top: 45 },
      didDrawPage: function(data) {
        if (data.pageNumber > 1) drawWorkerPageHeader('Worker Information', (!isBlank && workerName) ? workerName : null);
      }
    });

    yPos = doc.lastAutoTable.finalY + 5;
  }

  // Notes
  if (workerData.notes && workerData.notes.trim()) {
    const notesData = [[workerData.notes.trim()]];
    
    doc.autoTable({
      startY: yPos,
      head: [['Notes']],
      body: notesData,
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', cellWidth: 'wrap' },
      columnStyles: {
        0: { cellWidth: 185 }
      },
      margin: { left: 15, right: 15, top: 45 },
      didDrawPage: function(data) {
        if (data.pageNumber > 1) drawWorkerPageHeader('Worker Information', (!isBlank && workerName) ? workerName : null);
      }
    });
  }

  // Footer - Page 1
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text('This is an electronically generated document.', 105, 285, { align: 'center' });

  // Second page: recorded leave dates (only for real workers, not blank forms)
  if (!isBlank && leaveDates) {
    const leaveTypeConfig = [
      { key: 'paid_sick',    label: 'Paid Sick' },
      { key: 'sick',         label: 'Unpaid Sick' },
      { key: 'annual_leave', label: 'Annual Leave' },
      { key: 'bank_holiday', label: 'Bank Holidays' },
      { key: 'unpaid_leave', label: 'Unpaid Leave' },
      { key: 'absent',       label: 'Absences' }
    ];

    // Only add the page if at least one type has dates
    const hasAnyDates = leaveTypeConfig.some(c => (leaveDates[c.key] || []).length > 0);

    if (hasAnyDates) {
      doc.addPage();

      // Page 2 header
      drawWorkerPageHeader('Leave Dates Record', workerName || null);

      let p2Y = 45;

      leaveTypeConfig.forEach(({ key, label }) => {
        const dates = leaveDates[key] || [];
        const body = dates.length > 0
          ? [[dates.map(d => formatPdfDate(d)).join(',  ')]]
          : [['No recorded dates']];

        doc.autoTable({
          startY: p2Y,
          head: [[label]],
          body,
          theme: 'grid',
          headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 9 },
          styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
          columnStyles: { 0: { cellWidth: 185 } },
          margin: { left: 15, right: 15, top: 45 },
          didDrawPage: function(data) {
            if (data.pageNumber > 1) drawWorkerPageHeader('Leave Dates Record', workerName || null);
          }
        });

        p2Y = doc.lastAutoTable.finalY + 5;
      });

      // Footer - Page 2
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text('This is an electronically generated document.', 105, 285, { align: 'center' });
    }
  }

  // Save or view
  const fileName = `Worker-${workerData.last_name || 'Worker'}-${workerData.first_name || ''}.pdf`.replace(/\s+/g, '-');
  if (action === 'download') {
    doc.save(fileName);
  } else if (action === 'view') {
    window.open(doc.output('bloburl'), '_blank');
  }
  
  return doc;
}

/**
 * Generate GDPR Privacy Notice PDF — complete, all 13 sections, branded header with logo
 */
async function generateGDPRPDF(settings = {}, action = 'download') {
  await loadPDFKitLibraries();

  const doc = new jsPDF();

  const companyName    = settings.company_name        || 'Castlerock Homes';
  const companyAddress = settings.company_address     || '';
  const companyEmail   = settings.company_email       || '';
  const companyPhone   = settings.company_phone       || '';
  const headerColor    = settings.header_color        || '#212529';
  const logoMode       = settings.header_logo_mode    || 'text';
  const logoText       = settings.header_logo_text    || companyName;
  const logoPath       = settings.logo_path           || '';

  const headerRGB  = hexToRgb(headerColor);
  const PAGE_W     = 210;
  const MARGIN_L   = 15;
  const MARGIN_R   = 15;
  const CONTENT_W  = PAGE_W - MARGIN_L - MARGIN_R;
  const FOOTER_Y   = 287;
  const PAGE_BOTTOM = 278;

  let pageNum = 1;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function addFooter() {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`GDPR Privacy Notice — ${companyName}`, MARGIN_L, FOOTER_Y);
    doc.text(
      `Page ${pageNum}  |  Generated ${new Date().toLocaleDateString('en-GB')}`,
      PAGE_W - MARGIN_R, FOOTER_Y, { align: 'right' }
    );
    doc.setTextColor(0, 0, 0);
  }

  function addContinuationHeader() {
    doc.setFillColor(headerRGB[0], headerRGB[1], headerRGB[2]);
    doc.rect(0, 0, PAGE_W, 10, 'F');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('GDPR Privacy Notice', MARGIN_L, 7);
    doc.text(companyName, PAGE_W - MARGIN_R, 7, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  function checkPage(y, needed) {
    needed = needed || 12;
    if (y + needed > PAGE_BOTTOM) {
      addFooter();
      doc.addPage();
      pageNum++;
      addContinuationHeader();
      return 18;
    }
    return y;
  }

  function writeSection(title, y) {
    y = checkPage(y, 16);
    doc.setDrawColor(102, 126, 234);
    doc.setLineWidth(0.5);
    doc.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
    y += 5;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 126, 234);
    doc.text(title, MARGIN_L, y);
    y += 7;
    doc.setTextColor(0, 0, 0);
    return y;
  }

  function writeSubSection(title, y) {
    y = checkPage(y, 10);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(118, 75, 162);
    doc.text(title, MARGIN_L, y);
    y += 5;
    doc.setTextColor(0, 0, 0);
    return y;
  }

  function writeBody(text, y, indent) {
    indent = indent || 0;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    var lines = doc.splitTextToSize(text, CONTENT_W - indent);
    for (var i = 0; i < lines.length; i++) {
      y = checkPage(y, 6);
      doc.text(lines[i], MARGIN_L + indent, y);
      y += 5;
    }
    doc.setTextColor(0, 0, 0);
    return y;
  }

  function writeBullet(text, y, indent) {
    indent = indent || 5;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    var wrapped = doc.splitTextToSize(text, CONTENT_W - indent - 4);
    for (var i = 0; i < wrapped.length; i++) {
      y = checkPage(y, 6);
      if (i === 0) {
        doc.text('\u2022', MARGIN_L + indent, y);
        doc.text(wrapped[i], MARGIN_L + indent + 4, y);
      } else {
        doc.text(wrapped[i], MARGIN_L + indent + 4, y);
      }
      y += 5;
    }
    doc.setTextColor(0, 0, 0);
    return y;
  }

  function writeBoldBullet(boldPart, normalPart, y, indent) {
    indent = indent || 5;
    y = checkPage(y, 6);
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    doc.text('\u2022', MARGIN_L + indent, y);
    doc.setFont('helvetica', 'bold');
    doc.text(boldPart, MARGIN_L + indent + 4, y);
    var boldWidth = doc.getTextWidth(boldPart);
    doc.setFont('helvetica', 'normal');
    var remaining = doc.splitTextToSize(normalPart, CONTENT_W - indent - 4 - boldWidth);
    doc.text(remaining[0], MARGIN_L + indent + 4 + boldWidth, y);
    y += 5;
    for (var i = 1; i < remaining.length; i++) {
      y = checkPage(y, 6);
      doc.text(remaining[i], MARGIN_L + indent + 4 + boldWidth, y);
      y += 5;
    }
    doc.setTextColor(0, 0, 0);
    return y;
  }

  // ── Page 1 branded header ─────────────────────────────────────────────────

  doc.setFillColor(headerRGB[0], headerRGB[1], headerRGB[2]);
  doc.rect(0, 0, PAGE_W, 38, 'F');
  doc.setTextColor(255, 255, 255);

  if (logoMode === 'image' && logoPath) {
    try {
      var logoUrl = logoPath.startsWith('http') ? logoPath : (window.location.origin + logoPath);
      var logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise(function(resolve, reject) {
        logoImg.onload = function() {
          try {
            var iw = 50;
            var ih = (logoImg.height / logoImg.width) * iw;
            var maxH = 28;
            var fw = ih > maxH ? (iw * maxH / ih) : iw;
            var fh = Math.min(ih, maxH);
            doc.addImage(logoImg, 'PNG', MARGIN_L, 5, fw, fh);
            resolve();
          } catch (e) { reject(e); }
        };
        logoImg.onerror = reject;
        logoImg.src = logoUrl;
      });
    } catch (e) {
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(logoText, MARGIN_L, 20);
    }
  } else {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(logoText, MARGIN_L, 20);
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('GDPR Privacy Notice', PAGE_W - MARGIN_R, 16, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Data Protection & Privacy Rights', PAGE_W - MARGIN_R, 24, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  var y = 48;

  // ── 1. Introduction ───────────────────────────────────────────────────────
  y = writeSection('1. Introduction', y);
  y = writeBody(companyName + ' (\u201cwe\u201d, \u201cus\u201d, or \u201cour\u201d) is committed to protecting your personal data and respecting your privacy rights. This Privacy Notice explains how we collect, use, store, and protect your personal information in accordance with the General Data Protection Regulation (GDPR) (EU) 2016/679 and the Data Protection Act 2018 as implemented in Ireland.', y);
  y += 2;
  y = writeBody('This notice applies to all personal data we process about our employees, contractors, suppliers, and other individuals in connection with our construction and property development business operations.', y);
  y += 5;

  // ── 2. Data Controller ────────────────────────────────────────────────────
  y = writeSection('2. Data Controller', y);
  y = writeBody(companyName + ' is the data controller responsible for your personal data. For any queries or concerns about how we handle your data, please contact us using the details provided in Section 11 of this notice.', y);
  y += 5;

  // ── 3. Personal Data We Collect ───────────────────────────────────────────
  y = writeSection('3. Personal Data We Collect', y);
  y = writeBody('We may collect and process the following categories of personal data:', y);
  y += 2;

  y = writeSubSection('3.1 Identity and Contact Information', y);
  ['Full name, date of birth, and gender',
   'Contact details (email address, phone number, postal address)',
   'PPS Number (for employment and payroll purposes)',
   'Emergency contact details'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 2;

  y = writeSubSection('3.2 Employment and Financial Information', y);
  ['Employment records, job title, and work history',
   'Bank account details for payroll processing',
   'Salary, wages, and payment information',
   'Tax and National Insurance details',
   'Time and attendance records (timesheets)',
   'Leave records and entitlements'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 2;

  y = writeSubSection('3.3 Health and Safety Information', y);
  ['Safe Pass certification and expiry dates',
   'Health and safety training records',
   'Accident reports and incident records',
   'Medical information relevant to workplace safety'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 2;

  y = writeSubSection('3.4 Technical and System Data', y);
  ['Login credentials and access logs',
   'IP addresses and device information',
   'System usage and activity logs'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 5;

  // ── 4. How We Use Your Personal Data ─────────────────────────────────────
  y = writeSection('4. How We Use Your Personal Data', y);
  y = writeBody('We use your personal data for the following purposes:', y);
  y += 2;

  y = writeSubSection('4.1 Employment and Payroll Management', y);
  ['Processing payroll and making payments',
   'Managing employment contracts and benefits',
   'Recording attendance and leave',
   'Performance management and development'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 2;

  y = writeSubSection('4.2 Legal and Regulatory Compliance', y);
  ['Complying with employment law and tax obligations',
   'Meeting health and safety regulations',
   'Maintaining Safe Pass and certification records',
   'Responding to legal claims or regulatory investigations'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 2;

  y = writeSubSection('4.3 Business Operations', y);
  ['Managing purchase orders and supplier relationships',
   'Project planning and site management',
   'Financial reporting and cost tracking',
   'Audit and quality assurance'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 2;

  y = writeSubSection('4.4 System Security and Administration', y);
  ['Maintaining system security and preventing fraud',
   'User access management and authentication',
   'System backup and disaster recovery'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 5;

  // ── 5. Legal Basis ────────────────────────────────────────────────────────
  y = writeSection('5. Legal Basis for Processing', y);
  y = writeBody('We process your personal data under the following legal bases:', y);
  y += 2;
  y = writeBoldBullet('Contractual necessity: ', 'Processing is necessary to perform our employment or supplier contracts', y);
  y = writeBoldBullet('Legal obligation: ', 'We must process your data to comply with employment law, tax law, and health and safety regulations', y);
  y = writeBoldBullet('Legitimate interests: ', 'Processing is necessary for our legitimate business interests, such as preventing fraud and maintaining system security', y);
  y = writeBoldBullet('Consent: ', 'Where you have given explicit consent for specific processing activities', y);
  y += 5;

  // ── 6. Data Sharing ───────────────────────────────────────────────────────
  y = writeSection('6. Data Sharing and Disclosure', y);
  y = writeBody('We may share your personal data with the following categories of recipients:', y);
  y += 2;
  y = writeBoldBullet('Revenue Commissioners: ', 'For tax and PAYE/PRSI purposes', y);
  y = writeBoldBullet('Banks and financial institutions: ', 'For payroll processing', y);
  y = writeBoldBullet('Health and Safety Authority (HSA): ', 'For compliance and incident reporting', y);
  y = writeBoldBullet('Pension providers and insurers: ', 'For employee benefits administration', y);
  y = writeBoldBullet('IT service providers: ', 'For system hosting, maintenance, and support', y);
  y = writeBoldBullet('Professional advisors: ', 'Including legal, accounting, and audit services', y);
  y = writeBoldBullet('Regulatory authorities: ', 'When required by law', y);
  y += 2;
  y = writeBody('We do not sell or rent your personal data to third parties for marketing purposes.', y);
  y += 5;

  // ── 7. International Transfers ────────────────────────────────────────────
  y = writeSection('7. International Data Transfers', y);
  y = writeBody('Your personal data is primarily stored and processed within the European Economic Area (EEA). If we transfer your data outside the EEA, we will ensure appropriate safeguards are in place, such as:', y);
  y += 2;
  ['EU-approved Standard Contractual Clauses',
   'Adequacy decisions by the European Commission',
   'Binding Corporate Rules or other approved mechanisms'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 5;

  // ── 8. Data Retention ─────────────────────────────────────────────────────
  y = writeSection('8. Data Retention', y);
  y = writeBody('We retain your personal data only for as long as necessary to fulfil the purposes for which it was collected and to comply with legal obligations:', y);
  y += 2;
  y = writeBoldBullet('Employment records: ', '6 years after employment ends (as required by Irish employment law)', y);
  y = writeBoldBullet('Payroll and tax records: ', '6 years (as required by Revenue Commissioners)', y);
  y = writeBoldBullet('Health and safety records: ', 'Up to 40 years for certain types of injuries or exposure (as required by HSA)', y);
  y = writeBoldBullet('Audit logs: ', '2 years for operational purposes', y);
  y = writeBoldBullet('Purchase order records: ', '6 years from date of last transaction', y);
  y += 2;
  y = writeBody('After the retention period expires, we will securely delete or anonymize your personal data.', y);
  y += 5;

  // ── 9. Your Rights ────────────────────────────────────────────────────────
  y = writeSection('9. Your Rights Under GDPR', y);
  y = writeBody('You have the following rights in relation to your personal data:', y);
  y += 2;

  y = writeSubSection('9.1 Right of Access', y);
  y = writeBody('You can request a copy of the personal data we hold about you.', y);
  y += 2;

  y = writeSubSection('9.2 Right to Rectification', y);
  y = writeBody('You can request that we correct any inaccurate or incomplete personal data.', y);
  y += 2;

  y = writeSubSection('9.3 Right to Erasure (\u201cRight to be Forgotten\u201d)', y);
  y = writeBody('You can request deletion of your personal data in certain circumstances, subject to legal retention requirements.', y);
  y += 2;

  y = writeSubSection('9.4 Right to Restrict Processing', y);
  y = writeBody('You can request that we limit how we use your personal data in certain situations.', y);
  y += 2;

  y = writeSubSection('9.5 Right to Data Portability', y);
  y = writeBody('You can request a copy of your personal data in a structured, machine-readable format.', y);
  y += 2;

  y = writeSubSection('9.6 Right to Object', y);
  y = writeBody('You can object to processing based on legitimate interests or for direct marketing purposes.', y);
  y += 2;

  y = writeSubSection('9.7 Rights Related to Automated Decision-Making', y);
  y = writeBody('You have the right not to be subject to decisions based solely on automated processing that produce legal effects.', y);
  y += 2;

  y = checkPage(y, 14);
  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(102, 126, 234);
  doc.setLineWidth(0.5);
  doc.rect(MARGIN_L, y - 2, CONTENT_W, 12, 'FD');
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('To exercise any of these rights, please contact us using the details in Section 11.', MARGIN_L + 3, y + 5);
  doc.setTextColor(0, 0, 0);
  y += 16;

  // ── 10. Data Security ─────────────────────────────────────────────────────
  y = writeSection('10. Data Security', y);
  y = writeBody('We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction. These measures include:', y);
  y += 2;
  ['Encryption of data in transit and at rest',
   'Role-based access controls and authentication',
   'Regular security audits and vulnerability assessments',
   'Secure backup and disaster recovery procedures',
   'Staff training on data protection and security',
   'Incident response and breach notification procedures'
  ].forEach(function(item) { y = writeBullet(item, y); });
  y += 2;
  y = writeBody('While we strive to protect your personal data, no method of transmission over the internet or electronic storage is 100% secure. We cannot guarantee absolute security but will notify you and the Data Protection Commission in the event of a data breach where required by law.', y);
  y += 5;

  // ── 11. Contact Information ───────────────────────────────────────────────
  y = writeSection('11. Contact Information', y);
  y = writeBody('If you have any questions, concerns, or requests regarding this Privacy Notice or how we handle your personal data, please contact us:', y);
  y += 3;

  var contactLines = 1;
  if (companyEmail)   contactLines++;
  if (companyPhone)   contactLines++;
  if (companyAddress) contactLines += doc.splitTextToSize('Address: ' + companyAddress, CONTENT_W - 12).length;
  var contactBoxH = 8 + (contactLines * 5) + 4;
  y = checkPage(y, contactBoxH + 4);
  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(102, 126, 234);
  doc.setLineWidth(1.2);
  doc.line(MARGIN_L, y, MARGIN_L, y + contactBoxH);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN_L + 2, y, CONTENT_W - 2, contactBoxH, 'F');
  var cy = y + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text(companyName, MARGIN_L + 6, cy);
  cy += 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  if (companyEmail)   { doc.text('Email: ' + companyEmail, MARGIN_L + 6, cy); cy += 5; }
  if (companyPhone)   { doc.text('Phone: ' + companyPhone, MARGIN_L + 6, cy); cy += 5; }
  if (companyAddress) {
    var addrL = doc.splitTextToSize('Address: ' + companyAddress, CONTENT_W - 12);
    doc.text(addrL, MARGIN_L + 6, cy);
  }
  doc.setTextColor(0, 0, 0);
  y += contactBoxH + 6;

  // ── 12. Right to Lodge a Complaint ────────────────────────────────────────
  y = writeSection('12. Right to Lodge a Complaint', y);
  y = writeBody('If you believe we have not handled your personal data in accordance with GDPR, you have the right to lodge a complaint with the Data Protection Commission (DPC), Ireland\u2019s supervisory authority for data protection:', y);
  y += 3;

  var dpcBoxH = 36;
  y = checkPage(y, dpcBoxH + 4);
  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(102, 126, 234);
  doc.setLineWidth(1.2);
  doc.line(MARGIN_L, y, MARGIN_L, y + dpcBoxH);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN_L + 2, y, CONTENT_W - 2, dpcBoxH, 'F');
  var dy = y + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('Data Protection Commission', MARGIN_L + 6, dy); dy += 6;
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text('21 Fitzwilliam Square South, Dublin 2, D02 RD28, Ireland', MARGIN_L + 6, dy); dy += 5;
  doc.text('Email: info@dataprotection.ie', MARGIN_L + 6, dy); dy += 5;
  doc.text('Phone: +353 57 868 4800', MARGIN_L + 6, dy); dy += 5;
  doc.text('Website: www.dataprotection.ie', MARGIN_L + 6, dy);
  doc.setTextColor(0, 0, 0);
  y += dpcBoxH + 6;

  // ── 13. Changes to This Privacy Notice ───────────────────────────────────
  y = writeSection('13. Changes to This Privacy Notice', y);
  y = writeBody('We may update this Privacy Notice from time to time to reflect changes in our practices or legal requirements. We will notify you of any material changes by posting the updated notice on our system and updating the "Last Updated" date below.', y);
  y += 3;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  doc.text('Last Updated: February 11, 2026', MARGIN_L, y);
  doc.setTextColor(0, 0, 0);

  // ── Footer on final page ──────────────────────────────────────────────────
  addFooter();

  // ── Save / view ───────────────────────────────────────────────────────────
  var today = new Date().toISOString().split('T')[0];
  var fileName = 'GDPR-Privacy-Notice-' + companyName.replace(/\s+/g, '-') + '-' + today + '.pdf';
  if (action === 'download') {
    doc.save(fileName);
  } else if (action === 'view') {
    window.open(doc.output('bloburl'), '_blank');
  }

  return doc;
}

async function svgToPngDataUrl(svgMarkup) {
  if (!svgMarkup) return null;

  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const baseWidth = img.naturalWidth || 1200;
    const baseHeight = img.naturalHeight || 340;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(baseWidth * scale));
    canvas.height = Math.max(1, Math.round(baseHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function hslToRgb(hue, saturationPct, lightnessPct) {
  const s = saturationPct / 100;
  const l = lightnessPct / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c; g = x; b = 0;
  } else if (hue < 120) {
    r = x; g = c; b = 0;
  } else if (hue < 180) {
    r = 0; g = c; b = x;
  } else if (hue < 240) {
    r = 0; g = x; b = c;
  } else if (hue < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

function parseColorToRgb(colorValue) {
  const value = String(colorValue || '').trim();
  if (!value) return [15, 23, 42];

  const hexMatch = value.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    return hexToRgb(`#${hexMatch[1]}`);
  }

  const hslMatch = value.match(/^hsl\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\)$/i);
  if (hslMatch) {
    return hslToRgb(Number(hslMatch[1]) % 360, Number(hslMatch[2]), Number(hslMatch[3]));
  }

  return [15, 23, 42];
}

function getSvgDimensions(svgMarkup) {
  const fallback = { width: 1200, height: 340 };
  const markup = String(svgMarkup || '');

  const viewBoxMatch = markup.match(/viewBox\s*=\s*"([^"]+)"/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3]) && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const widthMatch = markup.match(/\swidth\s*=\s*"([0-9.]+)"/i);
  const heightMatch = markup.match(/\sheight\s*=\s*"([0-9.]+)"/i);
  const width = widthMatch ? Number(widthMatch[1]) : NaN;
  const height = heightMatch ? Number(heightMatch[1]) : NaN;
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height };
  }

  return fallback;
}

async function buildLogoAsset(logoPath) {
  const safePath = String(logoPath || '').trim();
  const domLogoSrc = document.getElementById('headerBrandImage')?.getAttribute('src') || '';

  const candidates = [];
  const pushCandidate = (value) => {
    const v = String(value || '').trim();
    if (!v) return;
    if (!candidates.includes(v)) {
      candidates.push(v);
    }
  };

  if (safePath) {
    pushCandidate(safePath);
    pushCandidate(encodeURI(safePath));
    if (!safePath.startsWith('http')) {
      pushCandidate(`${window.location.origin}${safePath}`);
      pushCandidate(`${window.location.origin}${encodeURI(safePath)}`);
    }
  }

  if (domLogoSrc) {
    pushCandidate(domLogoSrc);
  }

  pushCandidate('/assets/Logo.png');
  pushCandidate(`${window.location.origin}/assets/Logo.png`);

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const loadImageFromSrc = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });

      if (!response.ok) {
        continue;
      }

      const blob = await response.blob();
      if (!String(blob.type || '').startsWith('image/')) {
        continue;
      }

      const dataUrl = await blobToDataUrl(blob);
      const img = await loadImageFromSrc(dataUrl);
      const width = img.naturalWidth || img.width || 1;
      const height = img.naturalHeight || img.height || 1;

      return {
        dataUrl,
        format: 'PNG',
        width,
        height
      };
    } catch (_) {
      // Try next candidate URL.
    }
  }

  return null;
}

function drawCurrentCostsPageHeader(doc, pageWidth, settings, headerData) {
  const headerHeight = 15;
  const headerColor = settings.header_color || '#212529';
  const headerRGB = hexToRgb(headerColor);
  const logoText = settings.header_logo_text || settings.company_name || 'Castlerock Homes';

  doc.setFillColor(headerRGB[0], headerRGB[1], headerRGB[2]);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  doc.setTextColor(255, 255, 255);
  if (headerData.logoAsset) {
    const maxLogoHeight = 10;
    const maxLogoWidth = 38;
    const ratio = headerData.logoAsset.width / Math.max(1, headerData.logoAsset.height);
    let drawWidth = maxLogoWidth;
    let drawHeight = drawWidth / Math.max(0.01, ratio);
    if (drawHeight > maxLogoHeight) {
      drawHeight = maxLogoHeight;
      drawWidth = drawHeight * ratio;
    }

    const logoX = 8;
    const logoY = (headerHeight - drawHeight) / 2;
    doc.addImage(headerData.logoAsset.dataUrl, headerData.logoAsset.format, logoX, logoY, drawWidth, drawHeight);
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(logoText, 8, 9.6);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(headerData.title, pageWidth - 8, 6.6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(headerData.generatedAt, pageWidth - 8, 11.6, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  return headerHeight + 8;
}

function drawLegendBlock(doc, legendItems, startX, startY, maxWidth, maxHeight) {
  const lineHeight = 5.2;
  const swatchWidth = 9;
  let y = startY;
  const safeItems = Array.isArray(legendItems) ? legendItems : [];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Legend', startX, y);
  y += 5;

  if (!safeItems.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('No line series available', startX, y);
    return;
  }

  const maxY = startY + maxHeight;
  const maxItems = Math.max(1, Math.floor((maxHeight - 8) / lineHeight));
  const visibleItems = safeItems.slice(0, maxItems);

  visibleItems.forEach((item) => {
    if (y > maxY - lineHeight) {
      return;
    }

    const rgb = parseColorToRgb(item.color);
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(1.4);
    doc.line(startX, y - 1.5, startX + swatchWidth, y - 1.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const label = String(item.label || 'Series');
    const clipped = doc.splitTextToSize(label, Math.max(20, maxWidth - swatchWidth - 3))[0] || label;
    doc.text(clipped, startX + swatchWidth + 2, y);
    y += lineHeight;
  });

  if (safeItems.length > visibleItems.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`+ ${safeItems.length - visibleItems.length} more`, startX, Math.min(maxY, y + 1));
  }
}

function drawLegendColumns(doc, legendItems, startX, startY, areaWidth, maxHeight, columnCount = 4) {
  const items = Array.isArray(legendItems) ? legendItems : [];
  if (!items.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('No line series available', startX, startY + 5);
    return;
  }

  const columns = Math.max(1, Math.min(columnCount, items.length));
  const columnWidth = areaWidth / columns;
  const rowHeight = 5.5;
  const maxRowsPerColumn = Math.max(1, Math.floor(maxHeight / rowHeight));
  const maxItems = columns * maxRowsPerColumn;
  const visibleItems = items.slice(0, maxItems);
  const rows = Math.ceil(visibleItems.length / columns);

  for (let index = 0; index < visibleItems.length; index += 1) {
    const col = Math.floor(index / rows);
    const row = index % rows;
    const item = visibleItems[index];
    const x = startX + col * columnWidth;
    const y = startY + row * rowHeight;

    const rgb = parseColorToRgb(item.color);
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(1.6);
    doc.line(x, y, x + 10, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const label = String(item.label || 'Series');
    const clipped = doc.splitTextToSize(label, Math.max(20, columnWidth - 13))[0] || label;
    doc.text(clipped, x + 12, y + 1);
  }

  if (items.length > visibleItems.length) {
    const yMore = startY + maxRowsPerColumn * rowHeight + 2;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`+ ${items.length - visibleItems.length} more`, startX, yMore);
  }
}

function summarizeCurrentCostFilters(filters = {}) {
  const parts = [];
  if (filters.type) parts.push(`Type: ${filters.type}`);
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.dateFrom || filters.dateTo) {
    parts.push(`Range: ${filters.dateFrom || 'Any'} to ${filters.dateTo || 'Any'}`);
  }
  if (filters.search) parts.push(`Search: ${filters.search}`);
  if (!parts.length) return 'All records';
  return parts.join(' | ');
}

async function generateCurrentCostsReportPDF(reportData = {}, settings = {}, options = {}, action = 'download') {
  await loadPDFKitLibraries();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const headerColor = settings.header_color || '#212529';
  const headerRGB = hexToRgb(headerColor);
  const logoMode = settings.header_logo_mode || 'text';
  const logoText = settings.header_logo_text || settings.company_name || 'Castlerock Homes';
  const logoPath = settings.logo_path || '';
  const companyName = settings.company_name || 'Castlerock Homes';
  const currencySymbol = settings.currency_symbol || '€';
  const generatedAt = new Date().toLocaleString('en-GB');

  let logoAsset = null;
  try {
    logoAsset = await buildLogoAsset(logoPath);
  } catch (err) {
    console.warn('Unable to load header logo from app settings:', err);
    logoAsset = null;
  }

  const headerData = {
    title: 'Current Costs Report',
    generatedAt,
    logoAsset
  };

  const firstPageWidth = doc.internal.pageSize.getWidth();
  const firstPageMargin = 10;
  const firstPageColumnGap = 6;
  const firstPageColumnWidth = (firstPageWidth - (firstPageMargin * 2) - firstPageColumnGap) / 2;

  let y = drawCurrentCostsPageHeader(doc, firstPageWidth, settings, headerData);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(companyName, firstPageWidth - 10, y - 3.5, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const filtersText = summarizeCurrentCostFilters(options.filters || {});
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Applied Filters', 10, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  const filterLines = doc.splitTextToSize(filtersText, firstPageWidth - 20);
  doc.text(filterLines, 10, y);
  y += filterLines.length * 4 + 3;

  const summary = reportData.summary || {};
  const items = Array.isArray(reportData.items) ? reportData.items : [];
  const pageOneItemsSource = Array.isArray(reportData.top_movers) && reportData.top_movers.length
    ? reportData.top_movers
    : items;

  const summaryRows = [
    ['Tracked Items', `${Number(summary.tracked_items || 0)}/${Number(summary.total_items || 0)}`],
    ['Average Delta', `${Number(summary.avg_delta_percent || 0).toFixed(2)}%`],
    ['Rising / Falling', `${Number(summary.rising_count || 0)} / ${Number(summary.falling_count || 0)}`],
    ['Red / Yellow / Green', `${Number(summary.red_count || 0)} / ${Number(summary.yellow_count || 0)} / ${Number(summary.green_count || 0)}`],
    ['Stable', `${Number(summary.stable_count || 0)}`],
    ['Overlay Points', `${(reportData.overlay_points || []).length}`]
  ];

  const pageOneItemRows = pageOneItemsSource.slice(0, 10).map((item) => {
    const cmp = item.comparison || {};
    return [
      item.code || '',
      item.description || '',
      formatCurrency(item.cost_per || 0, currencySymbol),
      `${Number(cmp.delta_percent || 0).toFixed(2)}%`
    ];
  });

  const pageOneStartY = y;

  doc.autoTable({
    startY: pageOneStartY,
    head: [['Metric', 'Value']],
    body: summaryRows,
    theme: 'grid',
    tableWidth: firstPageColumnWidth,
    margin: { left: firstPageMargin },
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: headerRGB },
    didDrawPage: () => {
      drawCurrentCostsPageHeader(doc, doc.internal.pageSize.getWidth(), settings, headerData);
    }
  });

  const summaryEndY = doc.lastAutoTable?.finalY || pageOneStartY;

  doc.autoTable({
    startY: pageOneStartY,
    head: [['Code', 'Item', 'Current', 'Delta %']],
    body: pageOneItemRows,
    theme: 'grid',
    tableWidth: firstPageColumnWidth,
    margin: { left: firstPageMargin + firstPageColumnWidth + firstPageColumnGap, right: firstPageMargin },
    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 46 },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: 14, halign: 'right' }
    },
    headStyles: { fillColor: headerRGB },
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    didDrawPage: () => {
      drawCurrentCostsPageHeader(doc, doc.internal.pageSize.getWidth(), settings, headerData);
    }
  });

  const pageOneItemsEndY = doc.lastAutoTable?.finalY || pageOneStartY;
  y = Math.max(summaryEndY, pageOneItemsEndY) + 4;

  const chartSvg = options.chartSvg || '';
  const legendItems = Array.isArray(options.legendItems) ? options.legendItems : [];
  if (chartSvg) {
    doc.addPage('a3', 'landscape');
    y = drawCurrentCostsPageHeader(doc, doc.internal.pageSize.getWidth(), settings, headerData);

    const chartPageWidth = doc.internal.pageSize.getWidth();
    const chartPageHeight = doc.internal.pageSize.getHeight();
    const marginX = 12;
    const chartAreaTop = y + 2;
    const legendAreaHeight = 54;
    const chartAreaBottomGap = 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('Trend Chart', marginX, y);

    try {
      const chartPng = await svgToPngDataUrl(chartSvg);
      if (chartPng) {
        const svgSize = getSvgDimensions(chartSvg);
        const maxChartWidth = chartPageWidth - (marginX * 2);
        const maxChartHeight = chartPageHeight - chartAreaTop - legendAreaHeight - chartAreaBottomGap;
        const aspect = svgSize.width / Math.max(1, svgSize.height);

        let chartWidth = maxChartWidth;
        let chartHeight = chartWidth / aspect;

        if (chartHeight > maxChartHeight) {
          chartHeight = maxChartHeight;
          chartWidth = chartHeight * aspect;
        }

        const chartX = marginX + ((maxChartWidth - chartWidth) / 2);
        const chartY = chartAreaTop;

        doc.addImage(chartPng, 'PNG', chartX, chartY, chartWidth, chartHeight);

        const legendTop = chartY + chartHeight + 8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('Legend', marginX, legendTop);

        drawLegendColumns(
          doc,
          legendItems,
          marginX,
          legendTop + 6,
          maxChartWidth,
          Math.max(24, chartPageHeight - (legendTop + 12)),
          4
        );
      }
    } catch (err) {
      console.warn('Unable to embed chart in Current Costs PDF:', err);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Chart could not be rendered.', marginX, y + 8);
    }

    doc.addPage('a4', 'portrait');
    y = drawCurrentCostsPageHeader(doc, doc.internal.pageSize.getWidth(), settings, headerData);
  } else {
    doc.addPage('a4', 'portrait');
    y = drawCurrentCostsPageHeader(doc, doc.internal.pageSize.getWidth(), settings, headerData);
  }

  const bodyRows = items.map((item) => {
    const cmp = item.comparison || {};
    const avg = cmp.average_cost === null || cmp.average_cost === undefined
      ? '-'
      : formatCurrency(cmp.average_cost, currencySymbol);
    return [
      item.code || '',
      item.description || '',
      item.type || '',
      formatCurrency(item.cost_per || 0, currencySymbol),
      avg,
      `${Number(cmp.delta_percent || 0).toFixed(2)}%`,
      String(cmp.status || '').toUpperCase(),
      String(Number(cmp.sample_count || 0))
    ];
  });

  const detailPageWidth = doc.internal.pageSize.getWidth();
  const detailPageHeight = doc.internal.pageSize.getHeight();
  const detailIsPortrait = detailPageHeight > detailPageWidth;
  const detailColumnStyles = detailIsPortrait
    ? {
      0: { cellWidth: 16 },
      1: { cellWidth: 62 },
      2: { cellWidth: 20 },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 14, halign: 'center' },
      7: { cellWidth: 12, halign: 'right' }
    }
    : {
      0: { cellWidth: 24 },
      1: { cellWidth: 86 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 18, halign: 'center' },
      7: { cellWidth: 16, halign: 'right' }
    };
  const detailFontSize = detailIsPortrait ? 7 : 8;

  if (y > 185) {
    doc.addPage();
    y = drawCurrentCostsPageHeader(doc, doc.internal.pageSize.getWidth(), settings, headerData);
  }

  doc.autoTable({
    startY: y,
    head: [['Code', 'Description', 'Type', 'Current Cost', '3M Avg', 'Delta %', 'Status', 'Samples']],
    body: bodyRows,
    theme: 'grid',
    styles: { fontSize: detailFontSize, cellPadding: 1.6, overflow: 'linebreak' },
    columnStyles: detailColumnStyles,
    headStyles: { fillColor: headerRGB },
    margin: { left: 10, right: 10 },
    didDrawPage: () => {
      drawCurrentCostsPageHeader(doc, doc.internal.pageSize.getWidth(), settings, headerData);
    }
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page ${page} of ${totalPages}`, pageWidth - 10, pageHeight - 5, { align: 'right' });
  }

  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `Current-Costs-Report-${datePart}.pdf`;
  if (action === 'download') {
    doc.save(fileName);
  } else if (action === 'view') {
    window.open(doc.output('bloburl'), '_blank');
  }

  return doc;
}

// Export functions
window.generatePOPDF = generatePOPDF;
window.generateWorkerPDF = generateWorkerPDF;
window.generateGDPRPDF = generateGDPRPDF;
window.generateCurrentCostsReportPDF = generateCurrentCostsReportPDF;
window.loadPDFKitLibraries = loadPDFKitLibraries;

