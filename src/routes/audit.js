const express = require('express');
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorizeRoles');
const db = require('../db');

/* ======================================================
   AUDIT LOG – SUPER ADMIN ONLY
   ====================================================== */

/**
 * Get all audit logs with filtering and pagination
 * Query params:
 * - page: page number (default 1)
 * - limit: items per page (default 50)
 * - table: filter by table name
 * - action: filter by action type
 * - user_id: filter by user
 */
router.get(
  '/',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;
      
      let whereConditions = [];
      let queryParams = [];
      
      if (req.query.table) {
        whereConditions.push('a.table_name = ?');
        queryParams.push(req.query.table);
      }
      
      if (req.query.action) {
        whereConditions.push('a.action = ?');
        queryParams.push(req.query.action);
      }
      
      if (req.query.user_id) {
        whereConditions.push('a.user_id = ?');
        queryParams.push(req.query.user_id);
      }
      
      const whereClause = whereConditions.length > 0 
        ? 'WHERE ' + whereConditions.join(' AND ')
        : '';
      
      // Get total count
      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) as total FROM audit_log a ${whereClause}`,
        queryParams
      );
      
      // Get paginated results
      const [rows] = await db.query(
        `
        SELECT
          a.id,
          a.user_id,
          a.action,
          a.table_name,
          a.record_id,
          a.old_values,
          a.new_values,
          a.ip_address,
          a.user_agent,
          a.created_at,
          COALESCE(u.email, 'System') AS performed_by,
          CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS performed_by_name
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
        `,
        [...queryParams, limit, offset]
      );
      
      // Parse JSON fields in audit log entries with error handling
      const parsedRows = rows.map(row => {
        let oldValues = null;
        let newValues = null;
        
        try {
          oldValues = row.old_values ? JSON.parse(row.old_values) : null;
        } catch (e) {
          console.error('Failed to parse old_values for audit entry', row.id, ':', e.message);
          oldValues = row.old_values; // Return raw string if parsing fails
        }
        
        try {
          newValues = row.new_values ? JSON.parse(row.new_values) : null;
        } catch (e) {
          console.error('Failed to parse new_values for audit entry', row.id, ':', e.message);
          newValues = row.new_values; // Return raw string if parsing fails
        }
        
        return {
          ...row,
          old_values: oldValues,
          new_values: newValues
        };
      });

      res.json({
        data: parsedRows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

/**
 * Get audit log for a specific record
 * tableName: table name (e.g., 'purchase_orders', 'invoices')
 * recordId: numeric ID
 */
router.get(
  '/:tableName/:recordId',
  authenticate,
  authorizeRoles('super_admin'),
  async (req, res) => {
    try {
      const { tableName, recordId } = req.params;

      const [rows] = await db.query(
        `
        SELECT
          a.id,
          a.user_id,
          a.action,
          a.table_name,
          a.record_id,
          a.old_values,
          a.new_values,
          a.ip_address,
          a.user_agent,
          a.created_at,
          COALESCE(u.email, 'System') AS performed_by,
          CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS performed_by_name
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.table_name = ?
          AND a.record_id = ?
        ORDER BY a.created_at DESC
        `,
        [tableName, recordId]
      );

      res.json(rows);
    } catch (error) {
      console.error('Error fetching record audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

module.exports = router;
