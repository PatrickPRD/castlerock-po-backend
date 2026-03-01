/**
 * PDFKit Browser Generator
 * Client-side PDF generation using PDFKit
 * Reduces server RAM usage by generating PDFs in the browser
 */

// Load PDFKit from CDN
const PDFKIT_CDN = 'https://cdn.jsdelivr.net/npm/pdfkit@0.15.0/js/pdfkit.standalone.js';
const BLOB_STREAM_CDN = 'https://cdn.jsdelivr.net/npm/blob-stream@0.1.3/blob-stream.js';

// Load required libraries
let PDFDocument = null;
let blobStream = null;

async function loadPDFKitLibraries() {
  if (PDFDocument && blobStream) {
    return; // Already loaded
  }

  // Load PDFKit
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFKIT_CDN;
    script.onload = () => {
      PDFDocument = window.PDFDocument;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  // Load blob-stream
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = BLOB_STREAM_CDN;
    script.onload = () => {
      blobStream = window.blobStream;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
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
 * Generate Purchase Order PDF
 */
async function generatePOPDF(poData, invoices = [], settings = {}, action = 'download') {
  await loadPDFKitLibraries();

  const doc = new PDFDocument({
    size: 'A4',
    margin: 30,
    bufferPages: true
  });

  const stream = doc.pipe(blobStream());

  // Get branding settings
  const headerColor = settings.header_color || '#212529';
  const logoMode = settings.header_logo_mode || 'image';
  const logoText = settings.header_logo_text || settings.company_name || 'Castlerock Homes';
  const companyName = settings.company_name || 'Castlerock Homes';
  const companyAddress = settings.company_address || '';
  const companyPhone = settings.company_phone || '';
  const companyEmail = settings.company_email || '';
  const currencySymbol = settings.currency_symbol || '€';

  // Parse header color to RGB
  const headerRGB = hexToRgb(headerColor);

  // Header
  doc.rect(0, 0, doc.page.width, 80).fill(headerRGB);

  // Logo or text
  doc.fillColor('white').fontSize(20).font('Helvetica-Bold');
  if (logoMode === 'text') {
    doc.text(logoText, 40, 30, { width: 300 });
  } else {
    doc.text(companyName, 40, 30, { width: 300 });
  }

  // Document title
  doc.fontSize(12).text('Purchase Order', doc.page.width - 200, 30, { width: 150, align: 'right' });
  doc.fontSize(10).fillColor('white').text(`PO #${poData.po_number || 'N/A'}`, doc.page.width - 200, 50, { width: 150, align: 'right' });

  doc.fillColor('black').moveDown(2);

  // Company Info
  doc.y = 100;
  doc.fontSize(10).font('Helvetica');
  doc.text(companyName, 40, doc.y);
  if (companyAddress) doc.text(companyAddress, 40);
  if (companyPhone) doc.text(`Phone: ${companyPhone}`, 40);
  if (companyEmail) doc.text(`Email: ${companyEmail}`, 40);

  // PO Info on right
  const rightX = doc.page.width / 2 + 20;
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('PO Details', rightX, 100);
  doc.font('Helvetica').fontSize(9);
  doc.text(`Date: ${formatDate(poData.created_at)}`, rightX);
  doc.text(`Status: ${poData.status || 'N/A'}`, rightX);
  if (poData.site_name) doc.text(`Site: ${poData.site_name}`, rightX);
  if (poData.location_name) doc.text(`Location: ${poData.location_name}`, rightX);
  if (poData.stage_name) doc.text(`Stage: ${poData.stage_name}`, rightX);

  doc.moveDown(2);

  // Supplier Info
  doc.fontSize(11).font('Helvetica-Bold').text('Supplier', 40);
  doc.fontSize(10).font('Helvetica');
  doc.text(poData.supplier_name || 'N/A', 40);
  if (poData.supplier_address) doc.text(poData.supplier_address, 40);
  if (poData.supplier_email) doc.text(`Email: ${poData.supplier_email}`, 40);
  if (poData.supplier_phone) doc.text(`Phone: ${poData.supplier_phone}`, 40);

  doc.moveDown(2);

  // Description
  if (poData.description) {
    doc.fontSize(11).font('Helvetica-Bold').text('Description', 40);
    doc.fontSize(9).font('Helvetica').text(poData.description, 40, doc.y, { width: doc.page.width - 80 });
    doc.moveDown();
  }

  // Line Items
  if (poData.line_items && poData.line_items.length > 0) {
    doc.moveDown();
    doc.fontSize(11).font('Helvetica-Bold').text('Line Items', 40);
    doc.moveDown(0.5);

    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    const tableTop = doc.y;
    doc.text('Description', 40, tableTop);
    doc.text('Qty', 300, tableTop, { width: 50, align: 'right' });
    doc.text('Unit', 360, tableTop, { width: 60, align: 'left' });
    doc.text('Price', 420, tableTop, { width: 60, align: 'right' });
    doc.text('Total', 490, tableTop, { width: 70, align: 'right' });

    doc.moveTo(40, doc.y + 5).lineTo(doc.page.width - 40, doc.y + 5).stroke();
    doc.moveDown(0.5);

    // Table rows
    doc.font('Helvetica').fontSize(9);
    poData.line_items.forEach(item => {
      const y = doc.y;
      doc.text(item.description || '', 40, y, { width: 250 });
      doc.text(item.quantity || '0', 300, y, { width: 50, align: 'right' });
      doc.text(item.unit || '', 360, y, { width: 60, align: 'left' });
      doc.text(formatCurrency(item.unit_price, currencySymbol), 420, y, { width: 60, align: 'right' });
      doc.text(formatCurrency(item.total_price, currencySymbol), 490, y, { width: 70, align: 'right' });
      doc.moveDown(0.8);
    });

    doc.moveDown();
  }

  // Invoices
  if (invoices && invoices.length > 0) {
    doc.moveDown();
    doc.fontSize(11).font('Helvetica-Bold').text('Invoices', 40);
    doc.moveDown(0.5);

    doc.fontSize(9).font('Helvetica-Bold');
    const invoiceTableTop = doc.y;
    doc.text('Invoice #', 40, invoiceTableTop);
    doc.text('Date', 200, invoiceTableTop);
    doc.text('Amount', 490, invoiceTableTop, { width: 70, align: 'right' });

    doc.moveTo(40, doc.y + 5).lineTo(doc.page.width - 40, doc.y + 5).stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9);
    invoices.forEach(invoice => {
      const y = doc.y;
      doc.text(invoice.invoice_number || 'N/A', 40, y);
      doc.text(formatDate(invoice.invoice_date), 200, y);
      doc.text(formatCurrency(invoice.amount, currencySymbol), 490, y, { width: 70, align: 'right' });
      doc.moveDown(0.8);
    });

    doc.moveDown();
  }

  // Financial Summary
  doc.moveDown();
  const summaryX = doc.page.width - 240;
  doc.fontSize(10).font('Helvetica-Bold');
  
  doc.text('Subtotal:', summaryX, doc.y);
  doc.text(formatCurrency(poData.subtotal, currencySymbol), summaryX + 100, doc.y, { width: 100, align: 'right' });
  
  doc.text('VAT:', summaryX, doc.y);
  doc.text(formatCurrency(poData.vat_amount, currencySymbol), summaryX + 100, doc.y, { width: 100, align: 'right' });
  
  doc.fontSize(12).text('Total:', summaryX, doc.y);
  doc.text(formatCurrency(poData.total, currencySymbol), summaryX + 100, doc.y, { width: 100, align: 'right' });

  // Footer
  doc.fontSize(8).font('Helvetica').fillColor('gray');
  doc.text('This is an electronically generated document.', 40, doc.page.height - 50, {
    width: doc.page.width - 80,
    align: 'center'
  });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      const blob = stream.toBlob('application/pdf');
      if (action === 'download') {
        downloadBlob(blob, `PO-${poData.po_number}.pdf`);
      } else if (action === 'view') {
        viewBlob(blob);
      }
      resolve(blob);
    });
    stream.on('error', reject);
  });
}

/**
 * Generate Worker PDF
 */
async function generateWorkerPDF(workerData, leaveSummary = {}, settings = {}, action = 'download') {
  await loadPDFKitLibraries();

  const doc = new PDFDocument({
    size: 'A4',
    margin: 30
  });

  const stream = doc.pipe(blobStream());

  const headerColor = settings.header_color || '#212529';
  const companyName = settings.company_name || 'Castlerock Homes';
  const currencySymbol = settings.currency_symbol || '€';
  const headerRGB = hexToRgb(headerColor);

  // Header
  doc.rect(0, 0, doc.page.width, 80).fill(headerRGB);
  doc.fillColor('white').fontSize(20).font('Helvetica-Bold');
  doc.text(companyName, 40, 30);
  doc.fontSize(12).text('Worker Information', doc.page.width - 200, 30, { width: 150, align: 'right' });

  doc.fillColor('black').moveDown(2);
  doc.y = 100;

  // Worker Name
  doc.fontSize(14).font('Helvetica-Bold');
  doc.text(`${workerData.first_name || ''} ${workerData.last_name || ''}`, 40);
  doc.moveDown();

  // Personal Information
  doc.fontSize(11).text('Personal Information', 40);
  doc.fontSize(9).font('Helvetica');
  doc.text(`Email: ${workerData.email || 'N/A'}`, 40);
  doc.text(`Phone: ${workerData.mobile_number || 'N/A'}`, 40);
  doc.text(`Address: ${workerData.address || 'N/A'}`, 40);
  doc.text(`PPS Number: ${workerData.pps_number || 'N/A'}`, 40);
  doc.moveDown();

  // Employment Information
  doc.fontSize(11).font('Helvetica-Bold').text('Employment', 40);
  doc.fontSize(9).font('Helvetica');
  doc.text(`Employee ID: ${workerData.employee_id || 'N/A'}`, 40);
  doc.text(`Start Date: ${formatDate(workerData.date_of_employment)}`, 40);
  doc.text(`Status: ${workerData.active ? 'Active' : 'Inactive'}`, 40);
  doc.moveDown();

  // Safety Information
  doc.fontSize(11).font('Helvetica-Bold').text('Safety', 40);
  doc.fontSize(9).font('Helvetica');
  doc.text(`Safe Pass #: ${workerData.safe_pass_number || 'N/A'}`, 40);
  doc.text(`Expiry: ${formatDate(workerData.safe_pass_expiry_date)}`, 40);
  doc.moveDown();

  // Leave Summary
  if (leaveSummary && leaveSummary.totals) {
    doc.fontSize(11).font('Helvetica-Bold').text('Leave Summary', 40);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Annual Leave Taken: ${leaveSummary.totals.annual_leave || 0} days`, 40);
    doc.text(`Bank Holidays Taken: ${leaveSummary.totals.bank_holiday || 0} days`, 40);
    doc.text(`Sick Days: ${leaveSummary.totals.sick || 0} days`, 40);
    doc.moveDown();
  }

  // Notes
  if (workerData.notes) {
    doc.fontSize(11).font('Helvetica-Bold').text('Notes', 40);
    doc.fontSize(9).font('Helvetica');
    doc.text(workerData.notes, 40, doc.y, { width: doc.page.width - 80 });
  }

  // Footer
  doc.fontSize(8).fillColor('gray');
  doc.text('This is an electronically generated document.', 40, doc.page.height - 50, {
    width: doc.page.width - 80,
    align: 'center'
  });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      const blob = stream.toBlob('application/pdf');
      const fileName = `Worker-${workerData.last_name || 'Worker'}-${workerData.first_name || ''}.pdf`;
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
 * Helper: Convert hex color to RGB object
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ] : [0.13, 0.15, 0.16]; // Default dark color
}

/**
 * Helper: Download blob as file
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Helper: View blob in new window
 */
function viewBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Note: URL will be cleaned up when window is closed
}

// Export functions
window.generatePOPDF = generatePOPDF;
window.generateWorkerPDF = generateWorkerPDF;
window.generateGDPRPDF = generateGDPRPDF;
window.loadPDFKitLibraries = loadPDFKitLibraries;
