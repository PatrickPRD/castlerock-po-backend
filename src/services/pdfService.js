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

  static generateWorkerHTML(workerData, leaveSummary = {}, settings = {}) {
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

    const workerName = `${workerData.first_name || ''} ${workerData.last_name || ''}`.trim()
      || 'Unnamed worker';

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
              <div class="doc-name">${this.escapeHtml(workerName)}</div>
            </div>
          </div>

          <div class="content">
            <div class="section">
              <div class="section-title">Worker Details</div>
              <div class="row">
                <div class="field">
                  <div class="field-label">Worker Name</div>
                  <div class="field-value">${this.escapeHtml(workerName)}</div>
                </div>
                <div class="field">
                  <div class="field-label">Employee ID</div>
                  <div class="field-value">${this.escapeHtml(workerData.employee_id || 'N/A')}</div>
                </div>
              </div>
              <div class="row">
                <div class="field">
                  <div class="field-label">PPS Number</div>
                  <div class="field-value">${this.escapeHtml(workerData.pps_number || 'N/A')}</div>
                </div>
                <div class="field">
                  <div class="field-label">Status</div>
                  <div class="field-value">${workerData.left_at ? 'Inactive' : 'Active'}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Employment</div>
              <div class="row">
                <div class="field">
                  <div class="field-label">Date of Employment</div>
                  <div class="field-value">${formatDateValue(workerData.date_of_employment)}</div>
                </div>
                <div class="field">
                  <div class="field-label">Date Ceased Employment</div>
                  <div class="field-value">${formatDateValue(workerData.left_at)}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Compensation</div>
              <div class="row">
                <div class="field">
                  <div class="field-label">Weekly Take Home</div>
                  <div class="field-value">${formatMoney(workerData.weekly_take_home)}</div>
                </div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Safe Pass</div>
              <div class="row">
                <div class="field">
                  <div class="field-label">Safe Pass Number</div>
                  <div class="field-value">${this.escapeHtml(workerData.safe_pass_number || 'N/A')}</div>
                </div>
                <div class="field">
                  <div class="field-label">Safe Pass Expiry</div>
                  <div class="field-value">${formatDateValue(workerData.safe_pass_expiry_date)}</div>
                </div>
              </div>
            </div>

            ${workerData.notes ? `
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
                      <td>${Number(leaveTotals.paid_sick || 0)}</td>
                      <td>${Number(leaveAllowances.paid_sick || 0)}</td>
                      <td>${Number(leaveRemaining.paid_sick || 0)}</td>
                    </tr>
                    <tr>
                      <td>Annual Leave</td>
                      <td>${Number(leaveTotals.annual_leave || 0)}</td>
                      <td>${Number(leaveAllowances.annual_leave || 0)}</td>
                      <td>${Number(leaveRemaining.annual_leave || 0)}</td>
                    </tr>
                    <tr>
                      <td>Bank Holidays</td>
                      <td>${Number(leaveTotals.bank_holiday || 0)}</td>
                      <td>${Number(leaveAllowances.bank_holiday || 0)}</td>
                      <td>${Number(leaveRemaining.bank_holiday || 0)}</td>
                    </tr>
                    <tr>
                      <td>Unpaid Sick</td>
                      <td>${Number(leaveTotals.sick || 0)}</td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                    <tr>
                      <td>Unpaid Leave</td>
                      <td>${Number(leaveTotals.unpaid_leave || 0)}</td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                    <tr>
                      <td>Absent</td>
                      <td>${Number(leaveTotals.absent || 0)}</td>
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
}

module.exports = PDFService;
