const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');

/* ======================================================
   AUDIT LOG – SUPER ADMIN ONLY
   ====================================================== */

/**
 * Get audit log for a specific entity
 * entityType: 'purchase_order' | 'invoice'
 * entityId: numeric ID
 */
router.get(
  '/:entityType/:entityId',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    const { entityType, entityId } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        a.id,
        a.entity_type,
        a.entity_id,
        a.action,
        a.old_value,
        a.new_value,
        a.created_at,
        u.email AS performed_by
      FROM audit_log a
      JOIN users u ON a.user_id = u.id
      WHERE a.entity_type = ?
        AND a.entity_id = ?
      ORDER BY a.created_at DESC
      `,
      [entityType, entityId]
    );

    res.json(rows);
  }
);

module.exports = router;
