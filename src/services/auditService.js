const pool = require('../db');

/**
 * Write an audit log entry
 */
async function logAudit({
  table_name,
  record_id,
  action,
  old_data,
  new_data,
  changed_by
}) {
  await pool.query(
    `
    INSERT INTO audit_log
      (user_id, action, table_name, record_id, old_values, new_values)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      changed_by,
      action,
      table_name,
      record_id,
      old_data ? JSON.stringify(old_data) : null,
      new_data ? JSON.stringify(new_data) : null
    ]
  );
}

module.exports = logAudit;


