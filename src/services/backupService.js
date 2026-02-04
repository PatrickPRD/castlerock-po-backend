const pool = require('../db');

/**
 * Create a backup of all data except users
 * Returns JSON structure with metadata and all tables
 */
async function createBackup() {
  const connection = await pool.getConnection();

  try {
    const backup = {
      metadata: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        database: process.env.DB_NAME
      },
      tables: {}
    };

    // Tables to backup (excluding users and audit_log)
    const tables = [
      'purchase_orders',
      'invoices',
      'sites',
      'locations',
      'suppliers',
      'po_stages'
    ];

    for (const table of tables) {
      const [rows] = await connection.query(`SELECT * FROM ${table}`);
      backup.tables[table] = rows;
    }

    return backup;
  } finally {
    connection.release();
  }
}

/**
 * Restore a backup
 * Clears all data except users and audit_log, then restores from backup
 */
async function restoreBackup(backupData) {
  const connection = await pool.getConnection();

  try {
    // Validate backup structure
    if (!backupData.metadata || !backupData.tables) {
      throw new Error('Invalid backup format: missing metadata or tables');
    }

    // Start transaction
    await connection.beginTransaction();

    try {
      // Disable foreign key checks
      await connection.query('SET FOREIGN_KEY_CHECKS=0');

      // Clear all tables (in correct order to avoid FK constraints)
      const clearOrder = [
        'invoices',
        'purchase_orders',
        'locations',
        'sites',
        'suppliers',
        'po_stages'
      ];

      for (const table of clearOrder) {
        await connection.query(`DELETE FROM ${table} WHERE 1=1`);
      }

      // Restore data
      const restoreOrder = [
        'po_stages',
        'suppliers',
        'sites',
        'locations',
        'purchase_orders',
        'invoices'
      ];

      for (const table of restoreOrder) {
        const rows = backupData.tables[table];

        if (!rows || rows.length === 0) {
          continue;
        }

        const columns = Object.keys(rows[0]);
        const placeholders = columns.map(() => '?').join(',');
        const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;

        for (const row of rows) {
          const values = columns.map(col => row[col]);
          await connection.query(sql, values);
        }
      }

      // Re-enable foreign key checks
      await connection.query('SET FOREIGN_KEY_CHECKS=1');

      // Commit transaction
      await connection.commit();

      return { success: true, message: 'Backup restored successfully' };
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } finally {
    connection.release();
  }
}

module.exports = {
  createBackup,
  restoreBackup
};
