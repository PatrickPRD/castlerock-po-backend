const express = require('express');
const router = express.Router();

const db = require('../db');
const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const logAudit = require('../services/auditService');

/* ======================================================
   GET suppliers (list + filter)
   ====================================================== */
router.get(
  '/',
  authenticate,
  authorizeRoles('admin', 'super_admin'),
  async (req, res) => {

    const q = req.query.q ? `%${req.query.q}%` : '%';

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        contact_person,
        email,
        phone,
        address
      FROM suppliers
      WHERE active = 1
        AND name LIKE ?
      ORDER BY name
      `,
      [q]
    );

    res.json(rows);
  }
);

/* ======================================================
   GET single supplier
   ====================================================== */
router.get(
  '/:id',
  authenticate,
  authorizeRoles('admin', 'super_admin'),
  async (req, res) => {

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        contact_person,
        email,
        phone,
        address
      FROM suppliers
      WHERE id = ?
      `,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json(rows[0]);
  }
);

/* ======================================================
   CREATE supplier
   ====================================================== */
router.post(
  '/',
  authenticate,
  authorizeRoles('admin', 'super_admin'),
  async (req, res) => {

    const { name, contact_person, email, phone, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    try {
      const [result] = await db.query(
        `
        INSERT INTO suppliers
          (name, contact_person, email, phone, address)
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          name.trim(),
          contact_person || null,
          email || null,
          phone || null,
          address || null
        ]
      );

      await logAudit({
        table_name: 'suppliers',
        record_id: result.insertId,
        action: 'INSERT',
        old_data: null,
        new_data: { name, contact_person, email, phone, address },
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });

    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          error: 'Supplier with this name already exists'
        });
      }
      throw err;
    }
  }
);

/* ======================================================
   UPDATE supplier
   ====================================================== */
router.put(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {

    const { name, contact_person, email, phone, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Supplier name is required' });
    }

    const [[oldSupplier]] = await db.query(
      'SELECT * FROM suppliers WHERE id = ?',
      [req.params.id]
    );

    if (!oldSupplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    await db.query(
      `
      UPDATE suppliers
      SET
        name = ?,
        contact_person = ?,
        email = ?,
        phone = ?,
        address = ?
      WHERE id = ?
      `,
      [
        name.trim(),
        contact_person || null,
        email || null,
        phone || null,
        address || null,
        req.params.id
      ]
    );

    await logAudit({
      table_name: 'suppliers',
      record_id: req.params.id,
      action: 'UPDATE',
      old_data: oldSupplier,
      new_data: { name, contact_person, email, phone, address },
      changed_by: req.user.id,
      req
    });

    res.json({ success: true });
  }
);

/* ======================================================
   DELETE supplier
   ====================================================== */
router.delete(
  '/:id',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {

    const [[supplier]] = await db.query(
      'SELECT * FROM suppliers WHERE id = ?',
      [req.params.id]
    );

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const [[used]] = await db.query(
      'SELECT COUNT(*) AS cnt FROM purchase_orders WHERE supplier_id = ?',
      [req.params.id]
    );

    if (used.cnt > 0) {
      return res.status(400).json({
        error: 'Supplier cannot be deleted because it is used by Purchase Orders'
      });
    }

    await db.query(
      'DELETE FROM suppliers WHERE id = ?',
      [req.params.id]
    );

    await logAudit({
      table_name: 'suppliers',
      record_id: req.params.id,
      action: 'DELETE',
      old_data: supplier,
      new_data: null,
      changed_by: req.user.id,
      req
    });

    res.json({ success: true });
  }
);

/* ======================================================
   MERGE suppliers
   ====================================================== */
router.post(
  '/merge',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {

    const { sourceId, targetId } = req.body;

    if (!sourceId || !targetId) {
      return res.status(400).json({ error: 'Source and target suppliers are required' });
    }

    if (sourceId === targetId) {
      return res.status(400).json({ error: 'Suppliers must be different' });
    }

    const [[source]] = await db.query(
      'SELECT * FROM suppliers WHERE id = ?',
      [sourceId]
    );

    const [[target]] = await db.query(
      'SELECT * FROM suppliers WHERE id = ?',
      [targetId]
    );

    if (!source || !target) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Reassign POs
    await db.query(
      'UPDATE purchase_orders SET supplier_id = ? WHERE supplier_id = ?',
      [targetId, sourceId]
    );

    // Delete source supplier
    await db.query(
      'DELETE FROM suppliers WHERE id = ?',
      [sourceId]
    );

    await logAudit({
      table_name: 'suppliers',
      record_id: sourceId,
      action: 'MERGE',
      old_data: source,
      new_data: { merged_into: targetId, target_name: target.name },
      changed_by: req.user.id,
      req
    });

    res.json({ success: true });
  }
);


module.exports = router;
