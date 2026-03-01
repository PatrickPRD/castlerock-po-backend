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
async function generateWorkerPDF(workerData, leaveSummary = {}, settings = {}, action = 'download', isBlank = false, userRole = null) {
  await loadPDFKitLibraries();

  const doc = new jsPDF();
  
  const headerColor = settings.header_color || '#212529';
  const logoMode = settings.header_logo_mode || 'text';
  const logoText = settings.header_logo_text || settings.company_name || 'Castlerock Homes';
  const logoPath = settings.logo_path || '';
  const companyName = settings.company_name || 'Castlerock Homes';
  const currencySymbol = settings.currency_symbol || '€';
  const headerRGB = hexToRgb(headerColor);

  // Header background
  doc.setFillColor(headerRGB[0], headerRGB[1], headerRGB[2]);
  doc.rect(0, 0, 210, 35, 'F');

  // Company logo or text
  doc.setTextColor(255, 255, 255);
  
  if (logoMode === 'image' && logoPath) {
    try {
      const logoUrl = logoPath.startsWith('http') ? logoPath : `${window.location.origin}${logoPath}`;
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          try {
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
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text(logoText, 15, 15);
  }

  // Document title and worker name in header
  const workerName = `${workerData.first_name || ''} ${workerData.last_name || ''}`.trim();
  doc.setFontSize(12);
  doc.text('Worker Information', 195, 12, { align: 'right' });
  
  if (isBlank || !workerName) {
    // For blank forms, show "Name:" with white box
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Name:', 105, 25, { align: 'left' });
    
    // Draw white box for name (220% wider = 112mm, adjusted to fit page)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(255, 255, 255);
    doc.rect(120, 18, 75, 8, 'FD');
    
    // Draw border around the name box
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(120, 18, 75, 8, 'S');
  } else {
    // For filled forms, show worker name
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(workerName, 195, 25, { align: 'right' });
  }

  // Reset text color
  doc.setTextColor(0, 0, 0);
  
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
    margin: { left: 15, right: 15 }
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
    margin: { left: 15, right: 15 }
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
    margin: { left: 15, right: 15 }
  });

  yPos = doc.lastAutoTable.finalY + 5;

  // Leave Summary Table
  if (leaveSummary && leaveSummary.totals) {
    const entitlements = leaveSummary.entitlements || { annual_leave: 20, bank_holiday: 9, sick: 3 };
    
    const annualTaken = leaveSummary.totals.annual_leave || 0;
    const annualRemaining = entitlements.annual_leave - annualTaken;
    
    const bankTaken = leaveSummary.totals.bank_holiday || 0;
    const bankRemaining = entitlements.bank_holiday - bankTaken;
    
    const sickTaken = leaveSummary.totals.sick || 0;
    const sickRemaining = entitlements.sick - sickTaken;
    
    const leaveData = [
      ['Annual Leave', `${annualTaken} days`, annualRemaining >= 0 ? `${annualRemaining} days` : 'Over limit'],
      ['Bank Holidays', `${bankTaken} days`, bankRemaining >= 0 ? `${bankRemaining} days` : 'Over limit'],
      ['Paid Sick Days', `${sickTaken} days`, sickRemaining >= 0 ? `${sickRemaining} days` : 'Over limit']
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
      margin: { left: 15, right: 15 }
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
      margin: { left: 15, right: 15 }
    });
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text('This is an electronically generated document.', 105, 285, { align: 'center' });

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
 * Generate GDPR Privacy Notice PDF
 */
async function generateGDPRPDF(settings = {}, action = 'download') {
  await loadPDFKitLibraries();

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50
  });

  const stream = doc.pipe(blobStream());

  const companyName = settings.company_name || 'Castlerock Homes';
  const companyAddress = settings.company_address || '';
  const companyEmail = settings.company_email || '';

  // Title
  doc.fontSize(18).font('Helvetica-Bold').text('GDPR Privacy Notice', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).font('Helvetica').text(companyName, { align: 'center' });
  if (companyAddress) doc.text(companyAddress, { align: 'center' });
  doc.moveDown(2);

  // Content
  doc.fontSize(12).font('Helvetica-Bold').text('1. Introduction');
  doc.fontSize(10).font('Helvetica');
  doc.text(`${companyName} is committed to protecting your personal data and respecting your privacy rights. This notice explains how we collect, use, and protect your personal information in accordance with the General Data Protection Regulation (GDPR) and applicable data protection laws.`);
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('2. Data We Collect');
  doc.fontSize(10).font('Helvetica');
  doc.text('We collect and process the following categories of personal data:');
  doc.list([
    'Personal identification information (name, address, contact details)',
    'Employment information (job title, start date, employee ID)',
    'Financial information (bank details, salary information)',
    'Tax information (PPS number, tax status)',
    'Safety certifications (Safe Pass details)',
    'Leave and attendance records'
  ]);
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('3. How We Use Your Data');
  doc.fontSize(10).font('Helvetica');
  doc.text('We process your personal data for the following purposes:');
  doc.list([
    'Managing employment relationships',
    'Processing payroll and benefits',
    'Compliance with legal and tax obligations',
    'Health and safety management',
    'Internal record keeping and reporting'
  ]);
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('4. Your Rights');
  doc.fontSize(10).font('Helvetica');
  doc.text('Under GDPR, you have the following rights:');
  doc.list([
    'Right to access your personal data',
    'Right to rectification of inaccurate data',
    'Right to erasure ("right to be forgotten")',
    'Right to restrict processing',
    'Right to data portability',
    'Right to object to processing'
  ]);
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('5. Contact Information');
  doc.fontSize(10).font('Helvetica');
  doc.text(`If you have any questions about this privacy notice or wish to exercise your rights, please contact us at:`);
  doc.text(`Email: ${companyEmail || 'N/A'}`);
  if (companyAddress) doc.text(`Address: ${companyAddress}`);

  // Footer
  doc.fontSize(8).fillColor('gray');
  doc.text(`Generated on ${new Date().toLocaleDateString('en-GB')}`, 40, doc.page.height - 50, {
    width: doc.page.width - 80,
    align: 'center'
  });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      const blob = stream.toBlob('application/pdf');
      const today = new Date().toISOString().split('T')[0];
      const fileName = `GDPR-Privacy-Notice-${companyName.replace(/\s+/g, '-')}-${today}.pdf`;
      if (action === 'download') {
        downloadBlob(blob, fileName);
      } else if (action === 'view') {
        viewBlob(blob);
      }
      resolve(blob);
    });
    stream.on('error', reject);
  });
}

/**
 * Generate GDPR Privacy Notice PDF
 */
async function generateGDPRPDF(settings = {}, action = 'download') {
  await loadPDFKitLibraries();

  const doc = new jsPDF();
  
  const companyName = settings.company_name || 'Castlerock Homes';
  const companyAddress = settings.company_address || '';
  const companyEmail = settings.company_email || '';

  let yPos = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('GDPR Privacy Notice', 105, yPos, { align: 'center' });
  yPos += 10;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(companyName, 105, yPos, { align: 'center' });
  yPos += 5;
  
  if (companyAddress) {
    const addressLines = doc.splitTextToSize(companyAddress, 180);
    addressLines.forEach(line => {
      doc.text(line, 105, yPos, { align: 'center' });
      yPos += 5;
    });
  }
  yPos += 10;

  // Introduction
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Introduction', 15, yPos);
  yPos += 6;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const introLines = doc.splitTextToSize(
    `${companyName} is committed to protecting your personal data and respecting your privacy rights. This notice explains how we collect, use, and protect your personal information in accordance with the General Data Protection Regulation (GDPR) and applicable data protection laws.`,
    180
  );
  introLines.forEach(line => {
    doc.text(line, 15, yPos);
    yPos += 5;
  });
  yPos += 5;

  // Data We Collect
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Data We Collect', 15, yPos);
  yPos += 6;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('We collect and process the following categories of personal data:', 15, yPos);
  yPos += 6;
  
  const dataCategories = [
    'Personal identification information (name, address, contact details)',
    'Employment information (job title, start date, employee ID)',
    'Financial information (bank details, salary information)',
    'Tax information (PPS number, tax status)',
    'Safety certifications (Safe Pass details)',
    'Leave and attendance records'
  ];
  
  dataCategories.forEach(item => {
    const itemLines = doc.splitTextToSize(`• ${item}`, 175);
    itemLines.forEach(line => {
      doc.text(line, 20, yPos);
      yPos += 5;
    });
  });
  yPos += 5;

  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // How We Use Your Data
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('3. How We Use Your Data', 15, yPos);
  yPos += 6;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('We process your personal data for the following purposes:', 15, yPos);
  yPos += 6;
  
  const usagePurposes = [
    'Managing employment relationships',
    'Processing payroll and benefits',
    'Compliance with legal and tax obligations',
    'Health and safety management',
    'Internal record keeping and reporting'
  ];
  
  usagePurposes.forEach(item => {
    doc.text(`• ${item}`, 20, yPos);
    yPos += 5;
  });
  yPos += 5;

  // Your Rights
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('4. Your Rights', 15, yPos);
  yPos += 6;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Under GDPR, you have the following rights:', 15, yPos);
  yPos += 6;
  
  const rights = [
    'Right to access your personal data',
    'Right to rectification of inaccurate data',
    'Right to erasure ("right to be forgotten")',
    'Right to restrict processing',
    'Right to data portability',
    'Right to object to processing'
  ];
  
  rights.forEach(item => {
    doc.text(`• ${item}`, 20, yPos);
    yPos += 5;
  });
  yPos += 5;

  // Contact Information
  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('5. Contact Information', 15, yPos);
  yPos += 6;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('If you have any questions about this privacy notice or wish to', 15, yPos);
  yPos += 5;
  doc.text('exercise your rights, please contact us at:', 15, yPos);
  yPos += 6;
  doc.text(`Email: ${companyEmail || 'N/A'}`, 15, yPos);
  yPos += 5;
  
  if (companyAddress) {
    const contactAddressLines = doc.splitTextToSize(`Address: ${companyAddress}`, 180);
    contactAddressLines.forEach(line => {
      doc.text(line, 15, yPos);
      yPos += 5;
    });
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Generated on ${new Date().toLocaleDateString('en-GB')}`, 105, 285, { align: 'center' });

  // Save or view
  const today = new Date().toISOString().split('T')[0];
  const fileName = `GDPR-Privacy-Notice-${companyName.replace(/\s+/g, '-')}-${today}.pdf`;
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
window.loadPDFKitLibraries = loadPDFKitLibraries;

