/**
 * PDF Generator Service
 * Generates professional PDFs for Purchase Orders
 */

let puppeteer;

try {
  puppeteer = require('puppeteer');
} catch (error) {
  console.warn('Puppeteer not available:', error.message);
  puppeteer = null;
}

const path = require('path');
const fs = require('fs');

class PDFService {
  static buildBranding(settings = {}) {
    // Match live header branding settings used by the website navbar.
    const headerColor = /^#[0-9a-fA-F]{6}$/.test(settings?.header_color || '')
      ? settings.header_color
      : '#212529';
    const logoMode = settings?.header_logo_mode === 'text' ? 'text' : 'image';
    const logoText = String(
      settings?.header_logo_text || settings?.company_name || 'Castlerock Homes'
    ).trim();

    // Load logo from stored branding path (defaults to original logo asset).
    const logoPath = settings.logo_path || '/assets/Logo.png';

    // Convert relative path to absolute file path for reading the file
    let absoluteLogoPath = logoPath;
    if (!logoPath.startsWith('/')) {
      // For relative paths like 'assets/Logo.png', resolve from public folder
      absoluteLogoPath = path.join(__dirname, '../..', 'public', logoPath);
    } else {
      // For absolute paths like '/assets/Logo.png', resolve from public folder
      absoluteLogoPath = path.join(__dirname, '../..', 'public', logoPath.substring(1));
    }

    // Convert logo to base64 data URL for embedding in PDF
    let logoDataUrl = '';
    try {
      if (fs.existsSync(absoluteLogoPath)) {
        const logoBuffer = fs.readFileSync(absoluteLogoPath);
        const logoBase64 = logoBuffer.toString('base64');
        // Determine mime type based on file extension
        const ext = path.extname(absoluteLogoPath).toLowerCase();
        const mimeByExt = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml'
        };
        const mimeType = mimeByExt[ext] || 'image/png';
        logoDataUrl = `data:${mimeType};base64,${logoBase64}`;
      }
    } catch (error) {
      console.warn('Warning: Could not load logo from', absoluteLogoPath, error.message);
    }

    const companyName = settings.company_name || 'Castlerock Homes';
    const companyAddress = settings.company_address || '';
    const companyPhone = settings.company_phone || '';
    const companyEmail = settings.company_email || '';
    const currencyCode = String(settings.currency_code || 'EUR').toUpperCase();
    const currencySymbol = {
      EUR: '€',
      GBP: '£',
      USD: '$'
    }[currencyCode] || currencyCode;

    return {
      headerColor,
      logoMode,
      logoText,
      logoDataUrl,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      currencyCode,
      currencySymbol
    };
  }
  /**
   * Generate a Purchase Order PDF
   * @param {Object} poData - Purchase order data with all details
   * @param {Array} invoices - Array of invoices for this PO
   * @param {Object} settings - Site settings (logo, colors, company info)
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generatePOPDF(poData, invoices = [], settings) {
    try {
      if (!puppeteer) {
        throw new Error('Puppeteer is not installed. Please run: npm install puppeteer');
      }
      
      const html = this.generatePOHTML(poData, invoices, settings);
      const pdf = await this.htmlToPDF(html);
      return pdf;
    } catch (error) {
      console.error('Error generating PO PDF:', error);
      throw new Error('Failed to generate PDF: ' + error.message);
    }
  }

  /**
   * Convert HTML to PDF using Puppeteer
   * @param {string} html - HTML content
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async htmlToPDF(html) {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdf = await page.pdf({
        format: 'A4',
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm'
        },
        printBackground: true,
        displayHeaderFooter: false
      });

      await browser.close();
      return pdf;
    } catch (error) {
      if (browser) await browser.close().catch(() => {});
      throw error;
    }
  }

  /**
   * Generate HTML for PO PDF
   * @param {Object} poData - Purchase order data
   * @param {Array} invoices - Array of invoices
   * @param {Object} settings - Site settings
   * @returns {string} HTML content
   */
  static generatePOHTML(poData, invoices = [], settings = {}) {
    const {
      id,
      po_number,
      po_date,
      po_net_amount,
      po_total_amount,
      po_vat_rate,
      description,
      supplier,
      site,
      site_address,
      location,
      stage
    } = poData;

    const lineItems = Array.isArray(poData.line_items) ? poData.line_items : [];

    const branding = this.buildBranding(settings);
    const {
      headerColor,
      logoMode,
      logoText,
      logoDataUrl,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      currencySymbol
    } = branding;
    const formatMoney = value => `${currencySymbol}${Number(value || 0).toFixed(2)}`;

    const vatAmount = (po_net_amount * (po_vat_rate / 100)).toFixed(2);
    const poDate = new Date(po_date).toLocaleDateString('en-IE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Build line items table HTML
    let lineItemsHtml = '';
    if (lineItems.length > 0) {
      lineItemsHtml = `
        <div class="section">
          <div class="section-title">Line Items</div>
          <table class="line-items-table">
            <thead>
              <tr style="background-color: #f5f6f8;">
                <th style="padding: 6px; text-align: left; font-weight: 600; font-size: 11px;">Description</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">Qty</th>
                <th style="padding: 6px; text-align: left; font-weight: 600; font-size: 11px;">Unit</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">Unit Cost</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">Line Total</th>
              </tr>
            </thead>
            <tbody>
      `;

      lineItems.forEach((item, index) => {
        const rowBg = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
        lineItemsHtml += `
              <tr style="background-color: ${rowBg}; border-bottom: 1px solid #eee;">
                <td style="padding: 6px; font-size: 11px;">${this.escapeHtml(item.description || '')}</td>
                <td style="padding: 6px; text-align: right; font-size: 11px;">${Number(item.quantity || 0).toFixed(2)}</td>
                <td style="padding: 6px; font-size: 11px;">${this.escapeHtml(item.unit || '')}</td>
                <td style="padding: 6px; text-align: right; font-size: 11px;">${formatMoney(item.unit_price)}</td>
                <td style="padding: 6px; text-align: right; font-size: 11px; font-weight: 500;">${formatMoney(item.line_total)}</td>
              </tr>
        `;
      });

      lineItemsHtml += `
            </tbody>
          </table>
        </div>
      `;
    }

    // Build invoices table HTML
    let invoicesHtml = '';
    if (invoices && invoices.length > 0) {
      let totalInvoiced = 0;
      invoicesHtml = `
        <div class="section">
          <div class="section-title">Invoices</div>
          <table class="invoices-table">
            <thead>
              <tr style="background-color: #f5f6f8;">
                <th style="padding: 6px; text-align: left; font-weight: 600; font-size: 11px;">Invoice #</th>
                <th style="padding: 6px; text-align: left; font-weight: 600; font-size: 11px;">Date</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">Net (${currencySymbol})</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">VAT %</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">VAT (${currencySymbol})</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">Total (${currencySymbol})</th>
              </tr>
            </thead>
            <tbody>
      `;

      invoices.forEach((inv, index) => {
        totalInvoiced += parseFloat(inv.total_amount || 0);
        const rowBg = index % 2 === 0 ? '#ffffff' : '#f9f9f9';
        invoicesHtml += `
              <tr style="background-color: ${rowBg}; border-bottom: 1px solid #eee;">
                <td style="padding: 6px; font-size: 11px;">${this.escapeHtml(inv.invoice_number)}</td>
                <td style="padding: 6px; font-size: 11px;">${inv.invoice_date}</td>
                <td style="padding: 6px; text-align: right; font-size: 11px;">${formatMoney(inv.net_amount)}</td>
                <td style="padding: 6px; text-align: right; font-size: 11px;">${parseFloat(inv.vat_rate || 0)}%</td>
                <td style="padding: 6px; text-align: right; font-size: 11px;">${formatMoney(inv.vat_amount)}</td>
                <td style="padding: 6px; text-align: right; font-size: 11px; font-weight: 500;">${formatMoney(inv.total_amount)}</td>
              </tr>
        `;
      });

      const uninvoiced = (parseFloat(po_total_amount || 0) - totalInvoiced).toFixed(2);
      invoicesHtml += `
            </tbody>
          </table>
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 15px; margin-bottom: 6px; font-size: 12px;">
              <div style="text-align: right; font-weight: 500;">Total Invoiced:</div>
              <div style="text-align: right;">${formatMoney(totalInvoiced)}</div>
            </div>
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 15px; font-size: 12px;">
              <div style="text-align: right; font-weight: 500;">Uninvoiced Amount:</div>
              <div style="text-align: right; font-weight: 600; color: ${uninvoiced < 0 ? '#d32f2f' : '#2e7d32'};">${formatMoney(uninvoiced)}</div>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
            line-height: 1.4;
          }
          
          .container {
            max-width: 100%;
            background: white;
          }
          
          .header {
            background-color: ${headerColor};
            color: white;
            padding: 9px 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
          }
          
          .logo-section {
            flex: 1 1 70%;
          }
          
          .logo-section img {
            width: 100%;
            max-width: 225px;
            height: auto;
          }

          .logo-text {
            font-size: 18px;
            font-weight: 700;
            color: #ffffff;
            letter-spacing: 0.3px;
          }
          
          .po-meta {
            flex: 0 0 auto;
            text-align: right;
          }
          
          .company-title {
            display: none;
          }
          
          .po-label {
            padding: 4px 8px;
            border-radius: 3px;
            font-weight: bold;
            font-size: 12px;
            text-align: right;
            white-space: nowrap;
          }

          .po-number-inline {
            font-size: 15px;
            font-weight: 700;
            margin-left: 6px;
          }
          
          .content {
            padding: 0 15px;
          }
          
          .section {
            margin-bottom: 15px;
          }
          
          .section-title {
            color: ${headerColor};
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 2px solid ${headerColor};
            padding-bottom: 6px;
            margin-bottom: 10px;
          }
          
          .row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 12px;
          }
          
          .row.full {
            grid-template-columns: 1fr;
          }
          
          .field {
            margin-bottom: 8px;
          }
          
          .field-label {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.4px;
            margin-bottom: 2px;
          }
          
          .field-value {
            font-size: 13px;
            color: #333;
            font-weight: 500;
          }
          
          .description-section {
            background-color: #f8f9fa;
            padding: 10px;
            border-radius: 3px;
            margin-bottom: 15px;
          }
          
          .totals-section {
            margin-top: 15px;
            padding-top: 15px;
            border-top: 2px solid #eee;
          }
          
          .totals-row {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 15px;
            margin-bottom: 8px;
            align-items: center;
          }
          
          .totals-label {
            text-align: right;
            font-weight: 500;
            font-size: 13px;
          }
          
          .totals-value {
            text-align: right;
            font-size: 13px;
          }
          
          .total-amount {
            background-color: transparent;
            color: #111;
            padding: 10px;
            border-radius: 3px;
            font-size: 14px;
            font-weight: bold;
            border: 1px solid #ddd;
          }
          
          .invoices-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            font-size: 12px;
          }

          .line-items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 8px;
            font-size: 12px;
          }
          
          .invoices-table th,
          .invoices-table td,
          .line-items-table th,
          .line-items-table td {
            border: 1px solid #e0e0e0;
          }
          
          .footer-info {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            font-size: 11px;
            color: #666;
          }
          
          .footer-info div {
            margin-bottom: 3px;
          }
          
          @media print {
            body {
              background: white;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <div class="logo-section">
              ${logoMode === 'text'
                ? `<div class="logo-text">${this.escapeHtml(logoText || companyName)}</div>`
                : (logoDataUrl
                  ? `<img src="${logoDataUrl}" alt="Logo">`
                  : `<div class="logo-text">${this.escapeHtml(companyName)}</div>`)}
              <div class="company-title">${this.escapeHtml(companyName)}</div>
            </div>
            <div class="po-meta">
              <div class="po-label">PURCHASE ORDER <span class="po-number-inline">#${po_number}</span></div>
            </div>
          </div>

          <div class="content">
            <!-- Date Section -->
            <div class="section">
              <div class="field">
                <div class="field-label">PO Date</div>
                <div class="field-value">${poDate}</div>
              </div>
            </div>

            <!-- Supplier & Location Section -->
            <div class="section">
              <div class="row">
                <div>
                  <div class="field">
                    <div class="field-label">Supplier</div>
                    <div class="field-value">${supplier || 'N/A'}</div>
                  </div>
                </div>
                <div>
                  <div class="field">
                    <div class="field-label">Site</div>
                    <div class="field-value">${site || 'N/A'}</div>
                    ${site_address ? `<div class="field-value" style="font-size: 12px; color: #666; margin-top: 2px;">${this.escapeHtml(site_address)}</div>` : ''}
                  </div>
                </div>
              </div>
              <div class="row">
                <div>
                  <div class="field">
                    <div class="field-label">Location</div>
                    <div class="field-value">${location || 'N/A'}</div>
                  </div>
                </div>
                <div>
                  <div class="field">
                    <div class="field-label">Stage</div>
                    <div class="field-value">${stage || 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Description Section -->
            ${description ? `
            <div class="section">
              <div class="section-title">Description</div>
              <div class="description-section">
                <div style="white-space: pre-wrap; font-size: 13px;">${this.escapeHtml(description)}</div>
              </div>
            </div>
            ` : ''}

            ${lineItemsHtml}

            <!-- Invoices Section -->
            ${invoicesHtml}

            <!-- PO Financial Summary -->
            <div class="section">
              <div class="section-title">PO Financial Summary</div>
              <div class="totals-section">
                <div class="totals-row">
                  <div class="totals-label">Subtotal (ex VAT):</div>
                  <div class="totals-value">${formatMoney(po_net_amount)}</div>
                </div>
                <div class="totals-row">
                  <div class="totals-label">VAT (${po_vat_rate || 0}%):</div>
                  <div class="totals-value">${formatMoney(vatAmount)}</div>
                </div>
                <div class="totals-row">
                  <div class="totals-label total-amount">Total Amount (inc VAT):</div>
                  <div class="totals-value total-amount">${formatMoney(po_total_amount)}</div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="footer-info">
              ${companyAddress ? `<div><strong>Address:</strong> ${this.escapeHtml(companyAddress)}</div>` : ''}
              ${companyPhone ? `<div><strong>Phone:</strong> ${this.escapeHtml(companyPhone)}</div>` : ''}
              ${companyEmail ? `<div><strong>Email:</strong> ${this.escapeHtml(companyEmail)}</div>` : ''}
              <div style="margin-top: 10px; font-size: 11px;">This is an electronically generated document.</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate a Worker Summary PDF
   * @param {Object} workerData - Worker data with details
   * @param {Object} leaveSummary - Leave summary data
   * @param {Object} settings - Site settings (logo, colors, company info)
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generateWorkerPDF(workerData, leaveSummary, settings) {
    try {
      if (!puppeteer) {
        throw new Error('Puppeteer is not installed. Please run: npm install puppeteer');
      }

      const html = this.generateWorkerHTML(workerData, leaveSummary, settings);
      const pdf = await this.htmlToPDF(html);
      return pdf;
    } catch (error) {
      console.error('Error generating worker PDF:', error);
      throw new Error('Failed to generate PDF: ' + error.message);
    }
  }

  static async generateBlankWorkerPDF(leaveSummary, settings) {
    try {
      if (!puppeteer) {
        throw new Error('Puppeteer is not installed. Please run: npm install puppeteer');
      }

      const html = this.generateWorkerHTML({}, leaveSummary, settings, {
        blank: true,
        docName: 'Blank Worker Form'
      });
      const pdf = await this.htmlToPDF(html);
      return pdf;
    } catch (error) {
      console.error('Error generating blank worker PDF:', error);
      throw new Error('Failed to generate PDF: ' + error.message);
    }
  }

  static generateWorkerHTML(workerData, leaveSummary = {}, settings = {}, options = {}) {
    const branding = this.buildBranding(settings);
    const {
      headerColor,
      logoMode,
      logoText,
      logoDataUrl,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      currencySymbol
    } = branding;

    const isBlank = options.blank === true;
    const workerName = `${workerData.first_name || ''} ${workerData.last_name || ''}`.trim()
      || 'Unnamed worker';
    const docName = options.docName || (isBlank ? 'Blank Worker Form' : workerName);
    const workerNameDisplay = isBlank ? '' : workerName;

    const valueOrFallback = (value, fallback = 'N/A') => {
      if (isBlank) return '';
      if (value === null || value === undefined || value === '') return fallback;
      return String(value);
    };

    const dateOrBlank = (value) => (isBlank ? '' : formatDateValue(value));
    const leaveCell = (value) => (isBlank ? '' : Number(value || 0));

    const formatMoney = value => `${currencySymbol}${Number(value || 0).toFixed(2)}`;
    const formatDateValue = value => {
      if (!value) return 'N/A';
      const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString('en-IE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const leaveTotals = leaveSummary?.totals || {};
    const leaveAllowances = leaveSummary?.allowances || {};
    const leaveRemaining = leaveSummary?.remaining || {};

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #333;
            line-height: 1.4;
          }

          .container {
            max-width: 100%;
            background: white;
          }

          .header {
            background-color: ${headerColor};
            color: white;
            padding: 9px 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
          }

          .logo-section {
            flex: 1 1 70%;
          }

          .logo-section img {
            width: 100%;
            max-width: 225px;
            height: auto;
          }

          .logo-text {
            font-size: 18px;
            font-weight: 700;
            color: #ffffff;
            letter-spacing: 0.3px;
          }

          .doc-meta {
            flex: 0 0 auto;
            text-align: right;
          }

          .doc-label {
            padding: 4px 8px;
            border-radius: 3px;
            font-weight: bold;
            font-size: 12px;
            text-align: right;
            white-space: nowrap;
          }

          .doc-name {
            font-size: 24px;
            margin-top: 4px;
            font-weight: 600;
          }

          .content {
            padding: 0 15px;
          }

          .section {
            margin-bottom: 15px;
          }

          .section-title {
            color: ${headerColor};
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            border-bottom: 2px solid ${headerColor};
            padding-bottom: 6px;
            margin-bottom: 10px;
          }

          .row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 12px;
          }

          .row.full {
            grid-template-columns: 1fr;
          }

          .field {
            margin-bottom: 8px;
          }

          .field-label {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.4px;
            margin-bottom: 2px;
          }

          .field-value {
            font-size: 13px;
            color: #333;
            font-weight: 500;
          }

          .leave-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }

          .leave-table th,
          .leave-table td {
            border: 1px solid #e0e0e0;
            padding: 6px;
            text-align: left;
          }

          .leave-table th {
            background-color: #f5f6f8;
            font-weight: 600;
          }

          .footer-info {
            margin-top: 20px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            font-size: 11px;
            color: #666;
          }

          .footer-info div {
            margin-bottom: 3px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-section">
              ${logoMode === 'text'
                ? `<div class="logo-text">${this.escapeHtml(logoText || companyName)}</div>`
                : (logoDataUrl
                  ? `<img src="${logoDataUrl}" alt="Logo">`
                  : `<div class="logo-text">${this.escapeHtml(companyName)}</div>`) }
            </div>
            <div class="doc-meta">
              <div class="doc-label">EMPLOYEE INFORMATION</div>
              <div class="doc-name">${this.escapeHtml(docName)}</div>
            </div>
          </div>

          <div class="content">
            <div class="section">
              <div class="section-title">Worker Details</div>
              <div class="row">
                <div class="field">
                  <div class="field-label">Worker Name</div>
                  <div class="field-value">${this.escapeHtml(workerNameDisplay)}</div>
                </div>
                <div class="field">
                  <div class="field-label">Employee ID</div>
                  <div class="field-value">${this.escapeHtml(valueOrFallback(workerData.employee_id))}</div>
                </div>
              </div>
              <div class="row">
                <div class="field">
                  <div class="field-label">Status</div>
                  <div class="field-value">${isBlank ? '' : (workerData.left_at ? 'Inactive' : 'Active')}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Contact & Address</div>
              <div class="row">
                <div class="field">
                  <div class="field-label">Email Address</div>
                  <div class="field-value">${this.escapeHtml(valueOrFallback(workerData.email))}</div>
                </div>
                <div class="field">
                  <div class="field-label">Mobile Number</div>
                  <div class="field-value">${this.escapeHtml(valueOrFallback(workerData.mobile_number))}</div>
                </div>
              </div>
              <div class="row full">
                <div class="field">
                  <div class="field-label">Address</div>
                  <div class="field-value">${this.escapeHtml(valueOrFallback(workerData.address))}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Employment</div>
              <div class="row">
                <div class="field">
                  <div class="field-label">Date of Employment</div>
                  <div class="field-value">${dateOrBlank(workerData.date_of_employment)}</div>
                </div>
                <div class="field">
                  <div class="field-label">Date Ceased Employment</div>
                  <div class="field-value">${dateOrBlank(workerData.left_at)}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Safe Pass</div>
              <div class="row">
                <div class="field">
                  <div class="field-label">Safe Pass Number</div>
                  <div class="field-value">${this.escapeHtml(valueOrFallback(workerData.safe_pass_number))}</div>
                </div>
                <div class="field">
                  <div class="field-label">Safe Pass Expiry</div>
                  <div class="field-value">${dateOrBlank(workerData.safe_pass_expiry_date)}</div>
                </div>
              </div>
            </div>

            ${!isBlank && workerData.notes ? `
              <div class="section">
                <div class="section-title">Notes</div>
                <div class="field-value" style="white-space: pre-wrap; font-size: 12px;">${this.escapeHtml(workerData.notes)}</div>
              </div>
            ` : ''}

            ${leaveSummary ? `
              <div class="section">
                <div class="section-title">Leave Information (${this.escapeHtml(leaveSummary.leave_year_start || '01-01')})</div>
                <div class="field" style="margin-bottom: 8px; font-size: 11px; color: #666;">
                  ${this.escapeHtml(leaveSummary.start_date || '')} to ${this.escapeHtml(leaveSummary.end_date || '')}
                </div>
                <table class="leave-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Used</th>
                      <th>Allowance</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Paid Sick</td>
                      <td>${leaveCell(leaveTotals.paid_sick)}</td>
                      <td>${leaveCell(leaveAllowances.paid_sick)}</td>
                      <td>${leaveCell(leaveRemaining.paid_sick)}</td>
                    </tr>
                    <tr>
                      <td>Annual Leave</td>
                      <td>${leaveCell(leaveTotals.annual_leave)}</td>
                      <td>${leaveCell(leaveAllowances.annual_leave)}</td>
                      <td>${leaveCell(leaveRemaining.annual_leave)}</td>
                    </tr>
                    <tr>
                      <td>Bank Holidays</td>
                      <td>${leaveCell(leaveTotals.bank_holiday)}</td>
                      <td>${leaveCell(leaveAllowances.bank_holiday)}</td>
                      <td>${leaveCell(leaveRemaining.bank_holiday)}</td>
                    </tr>
                    <tr>
                      <td>Unpaid Sick</td>
                      <td>${leaveCell(leaveTotals.sick)}</td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                    <tr>
                      <td>Unpaid Leave</td>
                      <td>${leaveCell(leaveTotals.unpaid_leave)}</td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                    <tr>
                      <td>Absent</td>
                      <td>${leaveCell(leaveTotals.absent)}</td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ` : ''}

            <div class="footer-info">
              ${companyAddress ? `<div><strong>Address:</strong> ${this.escapeHtml(companyAddress)}</div>` : ''}
              ${companyPhone ? `<div><strong>Phone:</strong> ${this.escapeHtml(companyPhone)}</div>` : ''}
              ${companyEmail ? `<div><strong>Email:</strong> ${this.escapeHtml(companyEmail)}</div>` : ''}
              <div style="margin-top: 10px; font-size: 11px;">This is an electronically generated document.</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  static escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Generate GDPR Privacy Notice PDF
   * @param {Object} settings - Application settings
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generateGDPRPDF(settings) {
    try {
      if (!puppeteer) {
        throw new Error('Puppeteer is not installed. Please run: npm install puppeteer');
      }
      
      const html = this.generateGDPRHTML(settings);
      const pdf = await this.htmlToPDF(html);
      return pdf;
    } catch (error) {
      console.error('Error generating GDPR PDF:', error);
      throw new Error('Failed to generate PDF: ' + error.message);
    }
  }

  /**
   * Generate HTML for GDPR Privacy Notice PDF
   * @param {Object} settings - Application settings
   * @returns {string} HTML content
   */
  static generateGDPRHTML(settings) {
    const branding = this.buildBranding(settings);
    const {
      headerColor,
      logoMode,
      logoText,
      logoDataUrl,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail
    } = branding;
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GDPR Privacy Notice - ${companyName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 10.5pt;
      line-height: 1.6;
      color: #333;
      background: #f5f6f8;
      padding: 15px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: ${headerColor};
      color: white;
      padding: 25px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid rgba(255,255,255,0.2);
    }
    .logo-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .logo-section img {
      max-height: 50px;
      width: auto;
    }
    .logo-text {
      font-size: 22pt;
      font-weight: 700;
      color: white;
    }
    .company-title {
      font-size: 11pt;
      font-weight: 400;
      opacity: 0.95;
      color: white;
    }
    .header-title {
      text-align: right;
    }
    .header-title h1 {
      font-size: 18pt;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .header-title p {
      font-size: 11pt;
      opacity: 0.9;
    }
    .content {
      padding: 30px;
    }
    .section {
      margin-bottom: 25px;
      page-break-inside: avoid;
      background: #fafbfc;
      padding: 20px;
      border-radius: 6px;
      border: 1px solid #e9ecef;
    }
    .section h2 {
      color: ${headerColor};
      font-size: 14pt;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e9ecef;
      font-weight: 600;
    }
    .section h3 {
      color: #495057;
      font-size: 12pt;
      margin-top: 15px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .section p, .section li {
      color: #495057;
      margin-bottom: 10px;
      font-size: 10.5pt;
    }
    .section ul {
      margin-left: 25px;
      margin-top: 10px;
    }
    .section li {
      margin-bottom: 6px;
    }
    .contact-box {
      background: white;
      border: 1px solid ${headerColor};
      border-left: 4px solid ${headerColor};
      padding: 15px;
      margin-top: 12px;
      border-radius: 4px;
    }
    .contact-box p {
      margin-bottom: 6px;
      color: #495057;
    }
    .footer-info {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 2px solid #e9ecef;
      text-align: center;
      color: #6c757d;
      font-size: 9pt;
    }
    .footer-info p {
      margin-bottom: 4px;
    }
    @media print {
      body {
        background: white;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        ${logoMode === 'text'
          ? `<div class="logo-text">${this.escapeHtml(logoText || companyName)}</div>`
          : (logoDataUrl
            ? `<img src="${logoDataUrl}" alt="Logo">`
            : `<div class="logo-text">${this.escapeHtml(companyName)}</div>`)}
        <div class="company-title">${this.escapeHtml(companyName)}</div>
      </div>
      <div class="header-title">
        <h1>GDPR Privacy Notice</h1>
        <p>Data Protection & Privacy Rights</p>
      </div>
    </div>

    <div class="content">

  <div class="section">
    <h2>1. Introduction</h2>
    <p>
      <strong>${companyName}</strong> ("we", "us", or "our") is committed to protecting your personal data and respecting your privacy rights. This Privacy Notice explains how we collect, use, store, and protect your personal information in accordance with the General Data Protection Regulation (GDPR) (EU) 2016/679 and the Data Protection Act 2018 as implemented in Ireland.
    </p>
    <p>
      This notice applies to all personal data we process about our employees, contractors, suppliers, and other individuals in connection with our construction and property development business operations.
    </p>
  </div>

  <div class="section">
    <h2>2. Data Controller</h2>
    <p>
      <strong>${companyName}</strong> is the data controller responsible for your personal data. For any queries or concerns about how we handle your data, please contact us using the details provided in Section 11 of this notice.
    </p>
  </div>

  <div class="section">
    <h2>3. Personal Data We Collect</h2>
    <p>We may collect and process the following categories of personal data:</p>
    
    <h3>3.1 Identity and Contact Information</h3>
    <ul>
      <li>Full name, date of birth, and gender</li>
      <li>Contact details (email address, phone number, postal address)</li>
      <li>PPS Number (for employment and payroll purposes)</li>
      <li>Emergency contact details</li>
    </ul>

    <h3>3.2 Employment and Financial Information</h3>
    <ul>
      <li>Employment records, job title, and work history</li>
      <li>Bank account details for payroll processing</li>
      <li>Salary, wages, and payment information</li>
      <li>Tax and National Insurance details</li>
      <li>Time and attendance records (timesheets)</li>
      <li>Leave records and entitlements</li>
    </ul>

    <h3>3.3 Health and Safety Information</h3>
    <ul>
      <li>Safe Pass certification and expiry dates</li>
      <li>Health and safety training records</li>
      <li>Accident reports and incident records</li>
      <li>Medical information relevant to workplace safety</li>
    </ul>

    <h3>3.4 Technical and System Data</h3>
    <ul>
      <li>Login credentials and access logs</li>
      <li>IP addresses and device information</li>
      <li>System usage and activity logs</li>
    </ul>
  </div>

  <div class="section">
    <h2>4. How We Use Your Personal Data</h2>
    <p>We use your personal data for the following purposes:</p>
    
    <h3>4.1 Employment and Payroll Management</h3>
    <ul>
      <li>Processing payroll and making payments</li>
      <li>Managing employment contracts and benefits</li>
      <li>Recording attendance and leave</li>
      <li>Performance management and development</li>
    </ul>

    <h3>4.2 Legal and Regulatory Compliance</h3>
    <ul>
      <li>Complying with employment law and tax obligations</li>
      <li>Meeting health and safety regulations</li>
      <li>Maintaining Safe Pass and certification records</li>
      <li>Responding to legal claims or regulatory investigations</li>
    </ul>

    <h3>4.3 Business Operations</h3>
    <ul>
      <li>Managing purchase orders and supplier relationships</li>
      <li>Project planning and site management</li>
      <li>Financial reporting and cost tracking</li>
      <li>Audit and quality assurance</li>
    </ul>

    <h3>4.4 System Security and Administration</h3>
    <ul>
      <li>Maintaining system security and preventing fraud</li>
      <li>User access management and authentication</li>
      <li>System backup and disaster recovery</li>
    </ul>
  </div>

  <div class="section">
    <h2>5. Legal Basis for Processing</h2>
    <p>We process your personal data under the following legal bases:</p>
    <ul>
      <li><strong>Contractual necessity:</strong> Processing is necessary to perform our employment or supplier contracts</li>
      <li><strong>Legal obligation:</strong> We must process your data to comply with employment law, tax law, and health and safety regulations</li>
      <li><strong>Legitimate interests:</strong> Processing is necessary for our legitimate business interests, such as preventing fraud and maintaining system security</li>
      <li><strong>Consent:</strong> Where you have given explicit consent for specific processing activities</li>
    </ul>
  </div>

  <div class="section">
    <h2>6. Data Sharing and Disclosure</h2>
    <p>We may share your personal data with the following categories of recipients:</p>
    <ul>
      <li><strong>Revenue Commissioners:</strong> For tax and PAYE/PRSI purposes</li>
      <li><strong>Banks and financial institutions:</strong> For payroll processing</li>
      <li><strong>Health and Safety Authority (HSA):</strong> For compliance and incident reporting</li>
      <li><strong>Pension providers and insurers:</strong> For employee benefits administration</li>
      <li><strong>IT service providers:</strong> For system hosting, maintenance, and support</li>
      <li><strong>Professional advisors:</strong> Including legal, accounting, and audit services</li>
      <li><strong>Regulatory authorities:</strong> When required by law</li>
    </ul>
    <p>We do not sell or rent your personal data to third parties for marketing purposes.</p>
  </div>

  <div class="section">
    <h2>7. International Data Transfers</h2>
    <p>
      Your personal data is primarily stored and processed within the European Economic Area (EEA). If we transfer your data outside the EEA, we will ensure appropriate safeguards are in place, such as:
    </p>
    <ul>
      <li>EU-approved Standard Contractual Clauses</li>
      <li>Adequacy decisions by the European Commission</li>
      <li>Binding Corporate Rules or other approved mechanisms</li>
    </ul>
  </div>

  <div class="section">
    <h2>8. Data Retention</h2>
    <p>We retain your personal data only for as long as necessary to fulfil the purposes for which it was collected and to comply with legal obligations:</p>
    <ul>
      <li><strong>Employment records:</strong> 6 years after employment ends (as required by Irish employment law)</li>
      <li><strong>Payroll and tax records:</strong> 6 years (as required by Revenue Commissioners)</li>
      <li><strong>Health and safety records:</strong> Up to 40 years for certain types of injuries or exposure (as required by HSA)</li>
      <li><strong>Audit logs:</strong> 2 years for operational purposes</li>
      <li><strong>Purchase order records:</strong> 6 years from date of last transaction</li>
    </ul>
    <p>After the retention period expires, we will securely delete or anonymize your personal data.</p>
  </div>

  <div class="section">
    <h2>9. Your Rights Under GDPR</h2>
    <p>You have the following rights in relation to your personal data:</p>
    
    <h3>9.1 Right of Access</h3>
    <p>You can request a copy of the personal data we hold about you.</p>

    <h3>9.2 Right to Rectification</h3>
    <p>You can request that we correct any inaccurate or incomplete personal data.</p>

    <h3>9.3 Right to Erasure ("Right to be Forgotten")</h3>
    <p>You can request deletion of your personal data in certain circumstances, subject to legal retention requirements.</p>

    <h3>9.4 Right to Restrict Processing</h3>
    <p>You can request that we limit how we use your personal data in certain situations.</p>

    <h3>9.5 Right to Data Portability</h3>
    <p>You can request a copy of your personal data in a structured, machine-readable format.</p>

    <h3>9.6 Right to Object</h3>
    <p>You can object to processing based on legitimate interests or for direct marketing purposes.</p>

    <h3>9.7 Rights Related to Automated Decision-Making</h3>
    <p>You have the right not to be subject to decisions based solely on automated processing that produce legal effects.</p>

    <div class="contact-box">
      <p><strong>To exercise any of these rights, please contact us using the details in Section 11.</strong></p>
    </div>
  </div>

  <div class="section">
    <h2>10. Data Security</h2>
    <p>
      We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction. These measures include:
    </p>
    <ul>
      <li>Encryption of data in transit and at rest</li>
      <li>Role-based access controls and authentication</li>
      <li>Regular security audits and vulnerability assessments</li>
      <li>Secure backup and disaster recovery procedures</li>
      <li>Staff training on data protection and security</li>
      <li>Incident response and breach notification procedures</li>
    </ul>
    <p>
      While we strive to protect your personal data, no method of transmission over the internet or electronic storage is 100% secure. We cannot guarantee absolute security but will notify you and the Data Protection Commission in the event of a data breach where required by law.
    </p>
  </div>

  <div class="section">
    <h2>11. Contact Information</h2>
    <p>If you have any questions, concerns, or requests regarding this Privacy Notice or how we handle your personal data, please contact us:</p>
    <div class="contact-box">
      <p><strong>${companyName}</strong></p>
      ${companyEmail ? `<p>Email: ${companyEmail}</p>` : ''}
      ${companyPhone ? `<p>Phone: ${companyPhone}</p>` : ''}
      ${companyAddress ? `<p>Address: ${this.escapeHtml(companyAddress)}</p>` : ''}
    </div>
  </div>

  <div class="section">
    <h2>12. Right to Lodge a Complaint</h2>
    <p>
      If you believe we have not handled your personal data in accordance with GDPR, you have the right to lodge a complaint with the Data Protection Commission (DPC), Ireland's supervisory authority for data protection:
    </p>
    <div class="contact-box">
      <p><strong>Data Protection Commission</strong></p>
      <p>21 Fitzwilliam Square South</p>
      <p>Dublin 2, D02 RD28</p>
      <p>Ireland</p>
      <p>Email: info@dataprotection.ie</p>
      <p>Phone: +353 57 868 4800</p>
      <p>Website: www.dataprotection.ie</p>
    </div>
  </div>

  <div class="section">
    <h2>13. Changes to This Privacy Notice</h2>
    <p>
      We may update this Privacy Notice from time to time to reflect changes in our practices or legal requirements. We will notify you of any material changes by posting the updated notice on our system and updating the "Last Updated" date below.
    </p>
    <p><strong>Last Updated:</strong> February 11, 2026</p>
  </div>

      <!-- Footer -->
      <div class="footer-info">
        ${companyAddress ? `<p><strong>Address:</strong> ${this.escapeHtml(companyAddress)}</p>` : ''}
        ${companyPhone ? `<p><strong>Phone:</strong> ${companyPhone}</p>` : ''}
        ${companyEmail ? `<p><strong>Email:</strong> ${companyEmail}</p>` : ''}
        <p style="margin-top: 15px;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
        <p>This document is confidential and intended for authorized personnel only.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }
}

module.exports = PDFService;
