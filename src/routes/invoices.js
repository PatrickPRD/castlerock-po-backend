const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const logAudit = require('../services/auditService');

/* ======================================================
   GET invoices for PO
   ====================================================== */
router.get(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff', 'viewer'),
  async (req, res) => {

    const { poId } = req.query;
    if (!poId) return res.status(400).json({ error: 'PO ID required' });

    const [rows] = await pool.query(
      `
      SELECT
        id,
        invoice_number,
        DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date,
        net_amount,
        vat_rate,
        vat_amount,
        total_amount
      FROM invoices
      WHERE purchase_order_id = ?
      ORDER BY invoice_date DESC
      `,
      [poId]
    );

    res.json(rows);
  }
);

/* ======================================================
   CREATE invoice
   ====================================================== */
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin','admin'),
  async (req, res) => {
    try {
      const { purchaseOrderId, invoiceNumber, invoiceDate, netAmount, vatRate } = req.body;
      const invoiceNumberTrimmed = String(invoiceNumber || '').trim();

      if (!purchaseOrderId || !invoiceNumberTrimmed || !invoiceDate) {
        return res.status(400).json({ error: 'Purchase order, invoice number and invoice date are required' });
      }

      const [[existingInvoice]] = await pool.query(
        `
        SELECT id
        FROM invoices
        WHERE purchase_order_id = ?
          AND invoice_number = ?
        LIMIT 1
        `,
        [purchaseOrderId, invoiceNumberTrimmed]
      );

      if (existingInvoice) {
        return res.status(409).json({ error: 'Invoice number already exists for this purchase order' });
      }

      const net = Number(netAmount) || 0;
      const ratePercent = Number(vatRate) || 0;
      const rateDecimal = ratePercent / 100; // Convert percentage to decimal (13.5 -> 0.135)
      const vat = +(net * ratePercent / 100).toFixed(2);
      const total = +(net + vat).toFixed(2);

      const [result] = await pool.query(
        `
        INSERT INTO invoices
        (
          purchase_order_id,
          invoice_number,
          invoice_date,
          net_amount,
          vat_rate,
          vat_amount,
          total_amount,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          purchaseOrderId,
          invoiceNumberTrimmed,
          invoiceDate,
          net,
          rateDecimal,
          vat,
          total,
          req.user.id
        ]
      );

      logAudit({
        table_name: 'invoices',
        record_id: result.insertId,
        action: 'CREATE',
        old_data: null,
        new_data: { purchaseOrderId, invoiceNumber, invoiceDate, netAmount, vatRate, vat, total },
        changed_by: req.user.id,
        req
      }).catch(err => {
        console.error('Invoice create audit log failed:', err);
      });

      res.json({ success: true });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Invoice number already exists for this purchase order' });
      }
      console.error('Create invoice error:', err);
      res.status(500).json({ error: 'Failed to save invoice' });
    }
  }
);

/* ======================================================
   UPDATE invoice
   ====================================================== */
router.put(
  '/:id',
  authenticate,
  authorizeRoles('super_admin','admin'),
  async (req, res) => {
    try {
      const { invoiceNumber, invoiceDate, netAmount, vatRate } = req.body;
      const invoiceNumberTrimmed = String(invoiceNumber || '').trim();

      if (!invoiceNumberTrimmed || !invoiceDate) {
        return res.status(400).json({ error: 'Invoice number and invoice date are required' });
      }

      const net = Number(netAmount) || 0;
      const ratePercent = Number(vatRate) || 0;
      const rateDecimal = ratePercent / 100; // Convert percentage to decimal (13.5 -> 0.135)
      const vat = +(net * ratePercent / 100).toFixed(2);
      const total = +(net + vat).toFixed(2);

      // Fetch old invoice for audit log
      const [[oldInvoice]] = await pool.query(
        'SELECT * FROM invoices WHERE id = ?',
        [req.params.id]
      );

      if (!oldInvoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const [[existingInvoice]] = await pool.query(
        `
        SELECT id
        FROM invoices
        WHERE purchase_order_id = ?
          AND invoice_number = ?
          AND id <> ?
        LIMIT 1
        `,
        [oldInvoice.purchase_order_id, invoiceNumberTrimmed, req.params.id]
      );

      if (existingInvoice) {
        return res.status(409).json({ error: 'Invoice number already exists for this purchase order' });
      }

      await pool.query(
        `
        UPDATE invoices
        SET
          invoice_number = ?,
          invoice_date = ?,
          net_amount = ?,
          vat_rate = ?,
          vat_amount = ?,
          total_amount = ?
        WHERE id = ?
        `,
        [
          invoiceNumberTrimmed,
          invoiceDate,
          net,
          rateDecimal,
          vat,
          total,
          req.params.id
        ]
      );

      if (oldInvoice) {
        logAudit({
          table_name: 'invoices',
          record_id: req.params.id,
          action: 'UPDATE',
          old_data: {
            invoice_number: oldInvoice.invoice_number,
            invoice_date: oldInvoice.invoice_date,
            net_amount: oldInvoice.net_amount,
            vat_rate: oldInvoice.vat_rate,
            vat_amount: oldInvoice.vat_amount,
            total_amount: oldInvoice.total_amount
          },
          new_data: { invoiceNumber, invoiceDate, netAmount: net, vatRate: rateDecimal, vatAmount: vat, totalAmount: total },
          changed_by: req.user.id,
          req
        }).catch(err => {
          console.error('Invoice update audit log failed:', err);
        });
      }

      res.json({ success: true });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Invoice number already exists for this purchase order' });
      }
      console.error('Update invoice error:', err);
      res.status(500).json({ error: 'Failed to save invoice' });
    }
  }
);

/* ======================================================
   DELETE invoice
   ====================================================== */
router.delete(
  '/:id',
  authenticate,
  authorizeRoles('super_admin','admin', 'staff'),
  async (req, res) => {

    // Fetch invoice before deletion for audit log
    const [[invoice]] = await pool.query(
      'SELECT * FROM invoices WHERE id = ?',
      [req.params.id]
    );

    await pool.query(
      'DELETE FROM invoices WHERE id = ?',
      [req.params.id]
    );

    if (invoice) {
      logAudit({
        table_name: 'invoices',
        record_id: req.params.id,
        action: 'DELETE',
        old_data: invoice,
        new_data: null,
        changed_by: req.user.id,
        req
      }).catch(err => {
        console.error('Invoice delete audit log failed:', err);
      });
    }

    res.json({ success: true });
  }
);

module.exports = router;
