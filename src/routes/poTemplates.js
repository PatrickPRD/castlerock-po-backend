const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');
const logAudit = require('../services/auditService');
const { syncCostItemsFromLineItems } = require('../services/costSyncService');

function normalizeTemplateLineItems(lineItems) {
  if (!Array.isArray(lineItems)) return [];

  return lineItems
    .map((item, index) => {
      const description = String(item.description || '').trim();
      const quantity = Number(item.quantity) || 0;
      const unit = item.unit ? String(item.unit).trim() : null;
      const unitPrice = Number(item.unitPrice ?? item.unit_price) || 0;
      const costItemId = Number(item.costItemId ?? item.cost_item_id) || null;
      const costItemCode = item.costItemCode
        ? String(item.costItemCode).trim().toUpperCase()
        : (item.cost_item_code ? String(item.cost_item_code).trim().toUpperCase() : null);
      const costItemType = item.costItemType
        ? String(item.costItemType).trim()
        : (item.cost_item_type ? String(item.cost_item_type).trim() : null);

      return {
        line_number: index + 1,
        description,
        quantity,
        unit,
        unit_price: unitPrice,
        cost_item_id: Number.isInteger(costItemId) && costItemId > 0 ? costItemId : null,
        cost_item_code: costItemCode || null,
        cost_item_type: costItemType || null
      };
    })
    .filter(item => item.description);
}

/* ======================================================
   GET ALL TEMPLATES
   ====================================================== */
router.get(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT
          t.id,
          t.name,
          t.stage_id,
          ps.name AS stage_name,
          t.active,
          t.created_at,
          t.updated_at,
          u.email AS created_by_email,
          (SELECT COUNT(*) FROM po_template_line_items WHERE template_id = t.id) AS line_item_count
        FROM po_templates t
        LEFT JOIN po_stages ps ON ps.id = t.stage_id
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.active = 1
        ORDER BY t.name ASC
      `);
      res.json(rows);
    } catch (err) {
      console.error('GET PO TEMPLATES ERROR:', err);
      res.status(500).json({ error: 'Failed to load templates' });
    }
  }
);

/* ======================================================
   GET SINGLE TEMPLATE (with line items)
   ====================================================== */
router.get(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin', 'staff'),
  async (req, res) => {
    try {
      const [[template]] = await db.query(`
        SELECT
          t.id,
          t.name,
          t.delivery_notes,
          t.stage_id,
          ps.name AS stage_name,
          t.active,
          t.created_at,
          t.updated_at
        FROM po_templates t
        LEFT JOIN po_stages ps ON ps.id = t.stage_id
        WHERE t.id = ?
      `, [req.params.id]);

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const [lineItems] = await db.query(`
        SELECT
          id,
          line_number,
          description,
          quantity,
          unit,
          unit_price,
          cost_item_id,
          cost_item_code,
          cost_item_type
        FROM po_template_line_items
        WHERE template_id = ?
        ORDER BY line_number ASC, id ASC
      `, [req.params.id]);

      template.line_items = lineItems;
      res.json(template);
    } catch (err) {
      console.error('GET PO TEMPLATE ERROR:', err);
      res.status(500).json({ error: 'Failed to load template' });
    }
  }
);

/* ======================================================
   CREATE TEMPLATE
   ====================================================== */
router.post(
  '/',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    const { name, stageId, lineItems, deliveryNotes } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const normalizedItems = normalizeTemplateLineItems(lineItems);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(`
        INSERT INTO po_templates (name, delivery_notes, stage_id, created_by)
        VALUES (?, ?, ?, ?)
      `, [String(name).trim(), deliveryNotes || '', stageId || null, req.user.id]);

      const values = normalizedItems.map(item => [
        result.insertId,
        item.line_number,
        item.description,
        item.quantity,
        item.unit,
        item.unit_price,
        item.cost_item_id,
        item.cost_item_code,
        item.cost_item_type
      ]);

      await conn.query(`
        INSERT INTO po_template_line_items
          (template_id, line_number, description, quantity, unit, unit_price, cost_item_id, cost_item_code, cost_item_type)
        VALUES ?
      `, [values]);

      await syncCostItemsFromLineItems(conn, normalizedItems, req.user.id, 'po_template');

      await conn.commit();

      await logAudit({
        table_name: 'po_templates',
        record_id: result.insertId,
        action: 'CREATE',
        old_data: null,
        new_data: {
          name: String(name).trim(),
          stage_id: stageId || null,
          line_items_count: normalizedItems.length
        },
        changed_by: req.user.id,
        req
      });

      res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
      await conn.rollback();
      console.error('CREATE PO TEMPLATE ERROR:', err);
      res.status(500).json({ error: 'Failed to create template' });
    } finally {
      conn.release();
    }
  }
);

/* ======================================================
   UPDATE TEMPLATE
   ====================================================== */
router.put(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    const { name, stageId, lineItems, deliveryNotes } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const normalizedItems = normalizeTemplateLineItems(lineItems);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[existing]] = await conn.query(
        'SELECT id, name, stage_id FROM po_templates WHERE id = ?',
        [req.params.id]
      );

      if (!existing) {
        await conn.rollback();
        return res.status(404).json({ error: 'Template not found' });
      }

      await conn.query(`
        UPDATE po_templates SET name = ?, delivery_notes = ?, stage_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [String(name).trim(), deliveryNotes || '', stageId || null, req.params.id]);

      await conn.query('DELETE FROM po_template_line_items WHERE template_id = ?', [req.params.id]);

      const values = normalizedItems.map(item => [
        req.params.id,
        item.line_number,
        item.description,
        item.quantity,
        item.unit,
        item.unit_price,
        item.cost_item_id,
        item.cost_item_code,
        item.cost_item_type
      ]);

      await conn.query(`
        INSERT INTO po_template_line_items
          (template_id, line_number, description, quantity, unit, unit_price, cost_item_id, cost_item_code, cost_item_type)
        VALUES ?
      `, [values]);

      await syncCostItemsFromLineItems(conn, normalizedItems, req.user.id, 'po_template');

      await conn.commit();

      await logAudit({
        table_name: 'po_templates',
        record_id: Number(req.params.id),
        action: 'UPDATE',
        old_data: {
          name: existing.name,
          stage_id: existing.stage_id
        },
        new_data: {
          name: String(name).trim(),
          stage_id: stageId || null,
          line_items_count: normalizedItems.length
        },
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (err) {
      await conn.rollback();
      console.error('UPDATE PO TEMPLATE ERROR:', err);
      res.status(500).json({ error: 'Failed to update template' });
    } finally {
      conn.release();
    }
  }
);

/* ======================================================
   DELETE (SOFT) TEMPLATE
   ====================================================== */
router.delete(
  '/:id',
  authenticate,
  authorizeRoles('super_admin', 'admin'),
  async (req, res) => {
    try {
      const [[existing]] = await db.query(
        'SELECT id, name FROM po_templates WHERE id = ? AND active = 1',
        [req.params.id]
      );

      if (!existing) {
        return res.status(404).json({ error: 'Template not found' });
      }

      await db.query(
        'UPDATE po_templates SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [req.params.id]
      );

      await logAudit({
        table_name: 'po_templates',
        record_id: Number(req.params.id),
        action: 'DELETE',
        old_data: { name: existing.name, active: 1 },
        new_data: { name: existing.name, active: 0 },
        changed_by: req.user.id,
        req
      });

      res.json({ success: true });
    } catch (err) {
      console.error('DELETE PO TEMPLATE ERROR:', err);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  }
);

module.exports = router;
