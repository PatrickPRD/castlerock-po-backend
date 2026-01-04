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
      (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      table_name,
      record_id,
      action,
      old_data ? JSON.stringify(old_data) : null,
      new_data ? JSON.stringify(new_data) : null,
      changed_by
    ]
  );
}

module.exports = logAudit;


