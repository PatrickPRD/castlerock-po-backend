const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, authorizeRoles } = require('../middleware/auth');

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

    const { purchaseOrderId, invoiceNumber, invoiceDate, netAmount, vatRate } = req.body;

    const net = Number(netAmount) || 0;
    const ratePercent = Number(vatRate) || 0;
    const rateDecimal = ratePercent / 100; // Convert percentage to decimal (13.5 -> 0.135)
    const vat = +(net * ratePercent / 100).toFixed(2);
    const total = +(net + vat).toFixed(2);

    await pool.query(
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
        invoiceNumber,
        invoiceDate,
        net,
        rateDecimal,
        vat,
        total,
        req.user.id
      ]
    );

    res.json({ success: true });
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

    const { invoiceNumber, invoiceDate, netAmount, vatRate } = req.body;

    const net = Number(netAmount) || 0;
    const ratePercent = Number(vatRate) || 0;
    const rateDecimal = ratePercent / 100; // Convert percentage to decimal (13.5 -> 0.135)
    const vat = +(net * ratePercent / 100).toFixed(2);
    const total = +(net + vat).toFixed(2);

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
        invoiceNumber,
        invoiceDate,
        net,
        rateDecimal,
        vat,
        total,
        req.params.id
      ]
    );

    res.json({ success: true });
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

    await pool.query(
      'DELETE FROM invoices WHERE id = ?',
      [req.params.id]
    );

    res.json({ success: true });
  }
);

module.exports = router;
