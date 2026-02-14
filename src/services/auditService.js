const pool = require('../db');

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
  try {
    // Extract IP and user agent from request if available
    const ip_address = req ? (req.ip || req.connection?.remoteAddress || null) : null;
    const user_agent = req ? (req.get('user-agent') || null) : null;
    
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
  } catch (error) {
    console.error('❌ Audit log failed:', error.message);
    console.error('Audit data:', { table_name, record_id, action, changed_by });
    // Don't throw - we don't want audit failures to break the application
  }
}

module.exports = logAudit;


