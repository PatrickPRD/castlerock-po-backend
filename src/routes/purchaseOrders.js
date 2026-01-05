const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');
const { generatePONumber } = require('../services/poService');
const logAudit = require('../services/auditService');

/* ======================================================
   GET ALL PURCHASE ORDERS (Dashboard)
   ====================================================== */
router.get(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff', 'viewer'),
  async (req, res) => {

    const [rows] = await db.query(`
  SELECT
    po.id,
    po.po_number,
    DATE_FORMAT(po.po_date, '%Y-%m-%d') AS po_date,
    s.name AS supplier,
    si.name AS site,
    l.name AS location,

    po.net_amount,
    po.vat_rate,
    po.total_amount,

    ps.name AS stage,
    po.stage_id,

    IFNULL(SUM(i.total_amount), 0) AS invoiced_total,
    (po.total_amount - IFNULL(SUM(i.total_amount), 0)) AS uninvoiced_total

  FROM purchase_orders po
  JOIN suppliers s ON po.supplier_id = s.id
  JOIN sites si ON po.site_id = si.id
  JOIN locations l ON po.location_id = l.id
  JOIN po_stages ps ON po.stage_id = ps.id
  LEFT JOIN invoices i ON i.purchase_order_id = po.id
  WHERE po.status = 'Issued'
  GROUP BY po.id
  ORDER BY po.po_date DESC
`);

    res.json(rows);
  }
);


/* ======================================================
   GET SINGLE PURCHASE ORDER
   ====================================================== */
router.get(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {

    const poId = req.params.id;

    /* ---------------- PO ---------------- */
    const [[po]] = await db.query(
 `
      SELECT
        po.id,
        po.po_number,
        DATE_FORMAT(po.po_date, '%Y-%m-%d') AS po_date,
        po.description,
        po.net_amount,
        po.vat_rate,
        po.vat_amount,
        po.total_amount,

        po.supplier_id,
        s.name AS supplier,

        po.site_id,
        si.name AS site,

        po.location_id,
        l.name AS location,

        ps.name AS stage,
        po.stage_id

      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      JOIN sites si ON si.id = po.site_id
      JOIN locations l ON l.id = po.location_id
      JOIN po_stages ps ON ps.id = po.stage_id
      WHERE po.id = ?
      `,
      [req.params.id]
    );

    if (!po) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    /* ---------------- INVOICES ---------------- */
    const [invoices] = await db.query(
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

    /* ---------------- UNINVOICED (EX VAT) ---------------- */
    const invoicedNet = invoices.reduce((sum, i) => sum + Number(i.net_amount), 0);
    po.uninvoiced_net = +(po.net_amount - invoicedNet).toFixed(2);

    po.invoices = invoices;

    res.json(po);
  }
);


/* ======================================================
   CREATE PURCHASE ORDER
   ====================================================== */
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    const {
      supplierId,
      siteId,
      locationId,
      poDate,
      description,
      netAmount,
      vatRate
    } = req.body;

    if (!supplierId || !siteId || !locationId || !poDate) {
      return res.status(400).json({
        error: 'Supplier, site, location and PO date are required'
      });
    }
    const { stageId } = req.body;

    if (!stageId) {
      return res.status(400).json({ error: 'Stage is required' });
    }
    try {
      const net = Number(netAmount) || 0;
      const vat = Number(vatRate) || 0;
      const total = net + (net * vat / 100);

      const poNumber = await generatePONumber(db, siteId);

      await db.query(`
        INSERT INTO purchase_orders
          (
            po_number,
            supplier_id,
            site_id,
            location_id,
            po_date,
            description,
            net_amount,
            vat_rate,
            total_amount,
            created_by,
            status,
            stage_id
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        poNumber,
        supplierId,
        siteId,
        locationId,
        poDate,
        description || '',
        net,
        vat,
        total,
        req.user.id,
        'Issued',
        stageId
      ]);

      res.json({ success: true, poNumber });

    } catch (err) {
      console.error('CREATE PO ERROR:', err);
      res.status(500).json({ error: 'Failed to create purchase order' });
    }
  }
);

/* ======================================================
   UPDATE PURCHASE ORDER (NO PO NUMBER CHANGE)
   ====================================================== */
router.put(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    const { id } = req.params;
    const {
      supplierId,
      siteId,
      locationId,
      poDate,
      description,
      netAmount,
      vatRate,
      stageId
    } = req.body;

    const net = Number(netAmount) || 0;
    const vat = Number(vatRate) || 0;
    const total = net + (net * vat / 100);

    await db.query(`
      UPDATE purchase_orders
      SET
        supplier_id = ?,
        site_id = ?,
        location_id = ?,
        po_date = ?,
        description = ?,
        net_amount = ?,
        vat_rate = ?,
        total_amount = ?,
        stage_id = ?
      WHERE id = ?
    `, [
      supplierId,
      siteId,
      locationId,
      poDate,
      description || '',
      net,
      vat,
      total,
      stageId,
      id
    ]);

    res.json({ success: true });
  }
);

/* ======================================================
   CANCEL PURCHASE ORDER (BLOCK IF INVOICES EXIST)
   ====================================================== */
router.delete(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    const { id } = req.params;

    const [[check]] = await db.query(
      `SELECT COUNT(*) AS count FROM invoices WHERE purchase_order_id = ?`,
      [id]
    );

    if (check.count > 0) {
      return res.status(400).json({
        error: 'Cannot cancel PO with existing invoices'
      });
    }

    const [result] = await db.query(
      `
      UPDATE purchase_orders
      SET
        status = 'Closed',
        cancelled_at = NOW(),
        cancelled_by = ?
      WHERE id = ?
        AND cancelled_at IS NULL
      `,
      [req.user.id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        error: 'PO already cancelled or not found'
      });
    }

    res.json({ success: true });
  }
);


module.exports = router;
