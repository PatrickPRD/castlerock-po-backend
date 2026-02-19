const pool = require('../db');

const AUDIT_LOG_RETENTION_LIMIT = 300;

/**
 * Clean up old audit logs to keep only the latest 300 entries
 * Worker table entries are EXCLUDED from cleanup and kept indefinitely
 * This function runs asynchronously and doesn't block the main operation
 */
async function cleanupOldAuditLogs() {
  try {
    // Count non-worker entries only
    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) as count FROM audit_log WHERE table_name != 'workers'`
    );

    // If we exceed the limit, delete oldest non-worker entries
    if (count > AUDIT_LOG_RETENTION_LIMIT) {
      const entriesToDelete = count - AUDIT_LOG_RETENTION_LIMIT;
      
      const result = await pool.query(
        `
        DELETE FROM audit_log
        WHERE table_name != 'workers'
          AND id IN (
            SELECT id FROM audit_log
            WHERE table_name != 'workers'
            ORDER BY created_at ASC
            LIMIT ?
          )
        `,
        [entriesToDelete]
      );

      console.log(`🧹 Cleaned up ${result[0].affectedRows} old audit log entries (${count} → ${AUDIT_LOG_RETENTION_LIMIT}). Worker entries preserved indefinitely.`);
    }
  } catch (error) {
    console.error('❌ Audit log cleanup failed:', error.message);
    // Don't throw - cleanup failure shouldn't affect the application
  }
}

/**
 * Write an audit log entry
 * @param {Object} params
 * @param {string} params.table_name - Table name
 * @param {number} params.record_id - Record ID
 * @param {string} params.action - Action type (CREATE, UPDATE, DELETE, etc.)
 * @param {Object} params.old_data - Old values before change
 * @param {Object} params.new_data - New values after change
 * @param {number} params.changed_by - User ID
 * @param {Object} params.req - Express request object (optional, for IP and user agent)
 */
async function logAudit({
  table_name,
  record_id,
  action,
  old_data,
  new_data,
  changed_by,
  req
}) {
  console.log('🔍 logAudit called with:', { table_name, record_id, action, changed_by });
  
  try {
    // Extract IP and user agent from request if available
    // Handle both direct connections and proxied requests
    let ip_address = null;
    if (req) {
      // req.ip properly handles X-Forwarded-For when trust proxy is enabled
      // Use optional chaining to safely handle mock/incomplete request objects
      ip_address = req.ip || 
                   req.headers?.['x-forwarded-for']?.split(',')[0].trim() ||
                   req.connection?.remoteAddress || 
                   null;
    }
    const user_agent = req ? (req.get?.('user-agent') || null) : null;
    
    console.log('🔍 Inserting into audit_log:', { changed_by, action, table_name, record_id, ip_address });
    
    await pool.query(
      `
      INSERT INTO audit_log
        (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        changed_by,
        action,
        table_name,
        record_id,
        old_data ? JSON.stringify(old_data) : null,
        new_data ? JSON.stringify(new_data) : null,
        ip_address,
        user_agent
      ]
    );
    console.log(`✓ Audit log: ${action} on ${table_name}#${record_id} by user ${changed_by}`);

    // Run cleanup asynchronously without blocking
    cleanupOldAuditLogs().catch(err => {
      console.error('Audit log cleanup error:', err.message);
    });
  } catch (error) {
    console.error('❌ Audit log failed:', error.message);
    console.error('❌ Audit error:', error);
    console.error('Audit data:', { table_name, record_id, action, changed_by });
    // Don't throw - we don't want audit failures to break the application
  }
}

module.exports = logAudit;


