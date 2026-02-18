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
        
        // Parse old_values - handle corrupted data gracefully
        if (row.old_values) {
          try {
            // Check if it's already an object (some databases may return parsed JSON)
            if (typeof row.old_values === 'object') {
              oldValues = row.old_values;
            } else {
              oldValues = JSON.parse(row.old_values);
            }
          } catch (e) {
            // Silently ignore JSON parse errors for corrupted legacy data
            oldValues = null;
          }
        }
        
        // Parse new_values - handle corrupted data gracefully  
        if (row.new_values) {
          try {
            // Check if it's already an object (some databases may return parsed JSON)
            if (typeof row.new_values === 'object') {
              newValues = row.new_values;
            } else {
              newValues = JSON.parse(row.new_values);
            }
          } catch (e) {
            // Silently ignore JSON parse errors for corrupted legacy data
            newValues = null;
          }
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

      // Parse JSON fields with error handling
      const parsedRows = rows.map(row => {
        let oldValues = null;
        let newValues = null;
        
        if (row.old_values) {
          try {
            if (typeof row.old_values === 'object') {
              oldValues = row.old_values;
            } else {
              oldValues = JSON.parse(row.old_values);
            }
          } catch (e) {
            oldValues = null;
          }
        }
        
        if (row.new_values) {
          try {
            if (typeof row.new_values === 'object') {
              newValues = row.new_values;
            } else {
              newValues = JSON.parse(row.new_values);
            }
          } catch (e) {
            newValues = null;
          }
        }
        
        return {
          ...row,
          old_values: oldValues,
          new_values: newValues
        };
      });

      res.json(parsedRows);
    } catch (error) {
      console.error('Error fetching record audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }
);

module.exports = router;
