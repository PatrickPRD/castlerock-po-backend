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
                <td style="padding: 6px; text-align: right; font-size: 11px;">€${Number(item.unit_price || 0).toFixed(2)}</td>
                <td style="padding: 6px; text-align: right; font-size: 11px; font-weight: 500;">€${Number(item.line_total || 0).toFixed(2)}</td>
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
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">Net (€)</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">VAT %</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">VAT (€)</th>
                <th style="padding: 6px; text-align: right; font-weight: 600; font-size: 11px;">Total (€)</th>
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
                <td style="padding: 6px; text-align: right; font-size: 11px;">€${parseFloat(inv.net_amount || 0).toFixed(2)}</td>
                <td style="padding: 6px; text-align: right; font-size: 11px;">${parseFloat(inv.vat_rate || 0)}%</td>
                <td style="padding: 6px; text-align: right; font-size: 11px;">€${parseFloat(inv.vat_amount || 0).toFixed(2)}</td>
                <td style="padding: 6px; text-align: right; font-size: 11px; font-weight: 500;">€${parseFloat(inv.total_amount || 0).toFixed(2)}</td>
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
              <div style="text-align: right;">€${totalInvoiced.toFixed(2)}</div>
            </div>
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 15px; font-size: 12px;">
              <div style="text-align: right; font-weight: 500;">Uninvoiced Amount:</div>
              <div style="text-align: right; font-weight: 600; color: ${uninvoiced < 0 ? '#d32f2f' : '#2e7d32'};">€${uninvoiced}</div>
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
                  <div class="totals-value">€${parseFloat(po_net_amount || 0).toFixed(2)}</div>
                </div>
                <div class="totals-row">
                  <div class="totals-label">VAT (${po_vat_rate || 0}%):</div>
                  <div class="totals-value">€${parseFloat(vatAmount).toFixed(2)}</div>
                </div>
                <div class="totals-row">
                  <div class="totals-label total-amount">Total Amount (inc VAT):</div>
                  <div class="totals-value total-amount">€${parseFloat(po_total_amount || 0).toFixed(2)}</div>
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
