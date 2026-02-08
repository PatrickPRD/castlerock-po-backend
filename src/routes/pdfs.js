/**
 * PDF Routes
 * Handles PDF generation and download
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFService = require('../services/pdfService');
const SettingsService = require('../services/settingsService');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');

/**
 * GET /pdfs/po/:poId
 * Download a PO as PDF
 * Accessible to: super_admin, admin, staff, viewer
 */
router.get(
  '/po/:poId',
  authenticate,
  async (req, res) => {
    try {
      const { poId } = req.params;
      const token = req.headers.authorization?.split(' ')[1];

      // Verify user has access to view POs
      if (!['super_admin', 'admin', 'staff', 'viewer'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Fetch PO data
      const [pos] = await db.query(`
        SELECT
          po.id,
          po.po_number,
          po.po_date,
          po.net_amount AS po_net_amount,
          po.total_amount AS po_total_amount,
          po.vat_rate AS po_vat_rate,
          po.description,
          po.status,
          po.created_at,
          
          s.name AS supplier,
          si.name AS site,
          si.address AS site_address,
          l.name AS location,
          ps.name AS stage
          
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN sites si ON po.site_id = si.id
        LEFT JOIN locations l ON po.location_id = l.id
        LEFT JOIN po_stages ps ON po.stage_id = ps.id
        
        WHERE po.id = ?
      `, [poId]);

      if (!pos || pos.length === 0) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const poData = pos[0];

      // Fetch invoices for this PO
      const [invoices] = await db.query(`
        SELECT
          i.id,
          i.invoice_number,
          DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
          i.net_amount,
          i.vat_rate,
          i.vat_amount,
          i.total_amount
        FROM invoices i
        WHERE i.purchase_order_id = ?
        ORDER BY i.invoice_date DESC
      `, [poId]);

      const [lineItems] = await db.query(`
        SELECT
          line_number,
          description,
          quantity,
          unit,
          unit_price,
          line_total
        FROM po_line_items
        WHERE po_id = ?
        ORDER BY line_number ASC, id ASC
      `, [poId]);

      poData.line_items = lineItems;

      // Fetch settings
      const settings = await SettingsService.getSettings();

      // Generate PDF
      const pdf = await PDFService.generatePOPDF(poData, invoices, settings);

      // Send PDF
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="PO-${poData.po_number}.pdf"`,
        'Content-Length': pdf.length
      });

      res.send(pdf);
    } catch (error) {
      console.error('Error generating PO PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
  }
);

/**
 * GET /pdfs/po-preview/:poId
 * Get PO as inline PDF (view in browser)
 */
router.get(
  '/po-preview/:poId',
  authenticate,
  async (req, res) => {
    try {
      const { poId } = req.params;

      // Verify user has access
      if (!['super_admin', 'admin', 'staff', 'viewer'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Fetch PO data
      const [pos] = await db.query(`
        SELECT
          po.id,
          po.po_number,
          po.po_date,
          po.net_amount AS po_net_amount,
          po.total_amount AS po_total_amount,
          po.vat_rate AS po_vat_rate,
          po.description,
          po.created_at,
          
          s.name AS supplier,
          si.name AS site,
          si.address AS site_address,
          l.name AS location,
          ps.name AS stage
          
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN sites si ON po.site_id = si.id
        LEFT JOIN locations l ON po.location_id = l.id
        LEFT JOIN po_stages ps ON po.stage_id = ps.id
        
        WHERE po.id = ?
      `, [poId]);

      if (!pos || pos.length === 0) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const poData = pos[0];

      // Fetch invoices for this PO
      const [invoices] = await db.query(`
        SELECT
          i.id,
          i.invoice_number,
          DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
          i.net_amount,
          i.vat_rate,
          i.vat_amount,
          i.total_amount
        FROM invoices i
        WHERE i.purchase_order_id = ?
        ORDER BY i.invoice_date DESC
      `, [poId]);

      const [lineItems] = await db.query(`
        SELECT
          line_number,
          description,
          quantity,
          unit,
          unit_price,
          line_total
        FROM po_line_items
        WHERE po_id = ?
        ORDER BY line_number ASC, id ASC
      `, [poId]);

      poData.line_items = lineItems;

      // Fetch settings
      const settings = await SettingsService.getSettings();

      // Generate PDF
      const pdf = await PDFService.generatePOPDF(poData, invoices, settings);

      // Send PDF inline for viewing
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="PO-${poData.po_number}.pdf"`,
        'Content-Length': pdf.length
      });

      res.send(pdf);
    } catch (error) {
      console.error('Error generating PO preview:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
  }
);

module.exports = router;
