const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { generatePONumber } = require('../services/poService');

/* ======================================================
   GET /purchase-orders
   Supports filters:
   supplierId, siteId, fromDate, toDate, netMin, netMax
   ====================================================== */
router.get(
  '/',
  authenticate,
  authorizeRoles('admin', 'staff', 'viewer'),
  async (req, res) => {

    const {
      supplierId,
      siteId,
      fromDate,
      toDate,
      netMin,
      netMax
    } = req.query;

    const filters = [];
    const values = [];

    if (supplierId) {
      filters.push('po.supplier_id = ?');
      values.push(supplierId);
    }

    if (siteId) {
      filters.push('po.site_id = ?');
      values.push(siteId);
    }

    if (fromDate) {
      filters.push('po.po_date >= ?');
      values.push(fromDate);
    }

    if (toDate) {
      filters.push('po.po_date <= ?');
      values.push(toDate);
    }

    if (netMin !== undefined && netMin !== '') {
      filters.push('po.net_amount >= ?');
      values.push(Number(netMin));
    }

    if (netMax !== undefined && netMax !== '') {
      filters.push('po.net_amount <= ?');
      values.push(Number(netMax));
    }

    const whereClause = filters.length
      ? `WHERE ${filters.join(' AND ')}`
      : '';

    try {
      const [rows] = await pool.query(
        `
        SELECT
          po.id,
          po.po_number,
          DATE_FORMAT(po.po_date, '%Y-%m-%d') AS po_date,
          s.name  AS supplier,
          si.name AS site,
          l.name  AS location,
          po.net_amount,
          po.status
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.id
        JOIN sites si ON po.site_id = si.id
        JOIN locations l ON po.location_id = l.id
        ${whereClause}
        ORDER BY po.po_date DESC, po.po_number DESC
        `,
        values
      );

      res.json(rows);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load purchase orders' });
    }
  }
);

/* ======================================================
   POST /purchase-orders
   ====================================================== */
router.post(
  '/',
  authenticate,
  authorizeRoles('admin', 'staff'),
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
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const net = Number(netAmount) || 0;
    const vatR = Number(vatRate) || 0;
    const vat = Number((net * vatR / 100).toFixed(2));
    const total = Number((net + vat).toFixed(2));

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const poNumber = await generatePONumber(conn, siteId);

      const [result] = await conn.query(
        `
        INSERT INTO purchase_orders
        (
          po_number,
          po_date,
          supplier_id,
          site_id,
          location_id,
          description,
          net_amount,
          vat_rate,
          vat_amount,
          total_amount,
          status,
          created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)
        `,
        [
          poNumber,
          poDate,
          supplierId,
          siteId,
          locationId,
          description || '',
          net,
          vatR,
          vat,
          total,
          req.user.id
        ]
      );

      await conn.commit();

      res.status(201).json({
        success: true,
        poNumber,
        id: result.insertId
      });

    } catch (err) {
      await conn.rollback();
      console.error(err);
      res.status(500).json({ error: 'PO creation failed' });
    } finally {
      conn.release();
    }
  }
);

/* ======================================================
   DELETE /purchase-orders/:id
   ====================================================== */
router.delete(
  '/:id',
  authenticate,
  authorizeRoles('admin'),
  async (req, res) => {

    try {
      await pool.query(
        'DELETE FROM purchase_orders WHERE id = ?',
        [req.params.id]
      );

      res.json({ success: true });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Delete failed' });
    }
  }
);

module.exports = router;
