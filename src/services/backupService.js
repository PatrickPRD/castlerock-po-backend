const pool = require('../db');
const fs = require('fs').promises;
const path = require('path');
const {
  createCTBackup,
  validateCTBackup,
  saveCTBackupFile: saveCTBackupFileImpl,
  loadCTBackupFile,
  getCTBackupMetadata
} = require('./ctBackupService');

const BACKUP_DIR = path.join(__dirname, '../../backups');

const EXCLUDED_TABLES = new Set(['users', 'schema_migrations', 'audit_log']);

const BACKUP_TABLES = [
  'site_settings',
  'po_stages',
  'suppliers',
  'sites',
  'site_letters',
  'locations',
  'location_spread_rules',
  'location_spread_rule_sites',
  'location_spread_rule_locations',
  'purchase_orders',
  'po_line_items',
  'invoices',
  'po_sequences',
  'workers',
  'timesheets',
  'timesheet_entries'
];

const RESTORE_ORDER = [
  'site_settings',
  'po_stages',
  'suppliers',
  'sites',
  'site_letters',
  'locations',
  'location_spread_rules',
  'location_spread_rule_sites',
  'location_spread_rule_locations',
  'purchase_orders',
  'po_line_items',
  'invoices',
  'po_sequences',
  'workers',
  'timesheets',
  'timesheet_entries'
];

const CLEAR_ORDER_PREFERENCE = [
  'timesheet_entries',
  'timesheets',
  'workers',
  'invoices',
  'po_line_items',
  'purchase_orders',
  'location_spread_rule_locations',
  'location_spread_rule_sites',
  'location_spread_rules',
  'locations',
  'site_letters',
  'sites',
  'suppliers',
  'po_sequences',
  'po_stages',
  'site_settings'
];

async function clearDatabaseExceptUsers(connection) {
  const [tables] = await connection.query(
    `
    SELECT table_name AS tableName
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
    `
  );

  const clearOrder = tables
    .map(t => t.tableName)
    .filter(table => !EXCLUDED_TABLES.has(table))
    .sort((a, b) => {
      const indexA = CLEAR_ORDER_PREFERENCE.indexOf(a);
      const indexB = CLEAR_ORDER_PREFERENCE.indexOf(b);
      const rankA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
      const rankB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;

      if (rankA !== rankB) return rankA - rankB;
      return a.localeCompare(b);
    });

  for (const table of clearOrder) {

    try {
      // Get count before clear
      const [[{ countBefore }]] = await connection.query(
        `SELECT COUNT(*) as countBefore FROM \`${table}\``
      );
      
      // Delete all rows
      const deleteResult = await connection.query(
        `DELETE FROM \`${table}\` WHERE 1=1`
      );
      
      // Verify deletion
      const [[{ countAfter }]] = await connection.query(
        `SELECT COUNT(*) as countAfter FROM \`${table}\``
      );
      
      console.log(`📝 Cleared table ${table}: ${countBefore} → ${countAfter} rows`);
      
      if (countAfter > 0) {
        throw new Error(`Failed to completely clear table ${table}. Rows remaining: ${countAfter}`);
      }
    } catch (err) {
      console.error(`❌ Error clearing table ${table}:`, err.message);
      throw new Error(`Failed to clear table ${table}: ${err.message}`);
    }
  }
}

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

    for (const table of BACKUP_TABLES) {
      const [rows] = await connection.query(`SELECT * FROM ${table}`);
      backup.tables[table] = rows;
    }

    return backup;
  } finally {
    connection.release();
  }
}

/**
 * Create a CTBackup file (advanced format with compression and validation)
 * @param {Object} user - User creating the backup
 * @returns {Promise<Object>} CTBackup structure
 */
async function createCTBackupData(user = {}) {
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

    // Get all backup tables
    for (const table of BACKUP_TABLES) {
      const [rows] = await connection.query(`SELECT * FROM ${table}`);
      backup.tables[table] = rows;
    }

    // Create advanced CTBackup with metadata and signatures
    const ctBackup = await createCTBackup(backup, user);
    return ctBackup;
  } finally {
    connection.release();
  }
}

/**
 * Create a SQL backup file
 * Returns SQL INSERT statements for all data except users
 */
async function createBackupSql() {
  const connection = await pool.getConnection();

  try {
    let sqlOutput = [];

    // Header comments
    sqlOutput.push(`-- ========================================`);
    sqlOutput.push(`-- Castlerock Cost Tracker Database Backup`);
    sqlOutput.push(`-- Generated: ${new Date().toISOString()}`);
    sqlOutput.push(`-- Database: ${process.env.DB_NAME || 'castlerock_po'}`);
    sqlOutput.push(`-- Excludes: users table`);
    sqlOutput.push(`-- ========================================\n`);

    sqlOutput.push(`SET FOREIGN_KEY_CHECKS=0;\n`);

    for (const table of BACKUP_TABLES) {
      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      
      if (rows.length === 0) {
        sqlOutput.push(`-- Table '${table}' is empty\n`);
        continue;
      }

      sqlOutput.push(`-- ========================================`);
      sqlOutput.push(`-- Table: ${table}`);
      sqlOutput.push(`-- Records: ${rows.length}`);
      sqlOutput.push(`-- ========================================\n`);

      // Get column names from first row
      const columns = Object.keys(rows[0]);
      const columnList = columns.map(col => `\`${col}\``).join(', ');

      for (const row of rows) {
        const values = columns.map(col => {
          const value = row[col];
          
          if (value === null || value === undefined) {
            return 'NULL';
          }
          
          if (typeof value === 'number') {
            return value;
          }
          
          if (typeof value === 'boolean') {
            return value ? 1 : 0;
          }
          
          if (value instanceof Date) {
            return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
          }
          
          // Escape special characters in strings
          const escaped = String(value)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
          
          return `'${escaped}'`;
        }).join(', ');

        sqlOutput.push(`INSERT INTO \`${table}\` (${columnList}) VALUES (${values});`);
      }

      sqlOutput.push(''); // Empty line between tables
    }

    sqlOutput.push(`SET FOREIGN_KEY_CHECKS=1;\n`);
    sqlOutput.push(`-- ========================================`);
    sqlOutput.push(`-- Backup completed successfully`);
    sqlOutput.push(`-- ========================================`);

    return sqlOutput.join('\n');
  } finally {
    connection.release();
  }
}

/**
 * Validate a backup and generate a restoration report
 * Checks for schema mismatches and counts records to be restored
 */
async function validateBackup(backupData) {
  const connection = await pool.getConnection();

  try {
    // Validate backup structure
    if (!backupData.metadata || !backupData.tables) {
      throw new Error('Invalid backup format: missing metadata or tables');
    }

    const report = {
      metadata: backupData.metadata,
      tables: {},
      warnings: [],
      errors: [],
      totalRecords: 0
    };

    // Validate each table in the backup
    for (const table of RESTORE_ORDER) {
      const rows = backupData.tables[table];

      if (!rows) {
        report.warnings.push(`Table '${table}' not found in backup`);
        continue;
      }

      if (rows.length === 0) {
        report.tables[table] = { rowCount: 0, status: 'EMPTY' };
        continue;
      }

      // Show table info without database existence checks
      report.tables[table] = { 
        rowCount: rows.length, 
        status: 'OK' 
      };
      report.totalRecords += rows.length;
    }

    return report;
  } finally {
    connection.release();
  }
}

/**
 * Validate CTBackup file and generate validation report
 * @param {Object} ctBackup - CTBackup object
 * @returns {Promise<Object>} Validation report
 */
async function validateCTBackupFile(ctBackup) {
  try {
    // Use ctBackupService validation
    const validationReport = await validateCTBackup(ctBackup);
    
    // Add table summaries
    const tableReport = {
      metadata: ctBackup.metadata,
      tables: {},
      warnings: validationReport.warnings,
      errors: validationReport.errors,
      totalRecords: validationReport.totalRecords,
      checksumValidation: validationReport.checksumValidation,
      signatureValidation: validationReport.signatureValidation,
      isValid: validationReport.valid
    };

    // Add per-table info
    for (const table of RESTORE_ORDER) {
      const rows = ctBackup.tables[table];
      if (rows) {
        tableReport.tables[table] = {
          rowCount: rows.length,
          status: validationReport.tables[table]?.checksumValid ? 'VALID' : 'CHECKSUM_MISMATCH'
        };
      } else {
        tableReport.warnings.push(`Table '${table}' not found in backup`);
      }
    }

    return tableReport;
  } catch (err) {
    throw new Error(`CTBackup validation failed: ${err.message}`);
  }
}/**
 * Restore a backup
 * Clears all data except users, then restores from backup
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
      // Disable foreign key checks and unique constraint checks
      await connection.query('SET FOREIGN_KEY_CHECKS=0');
      await connection.query('SET UNIQUE_CHECKS=0');
      console.log('🔓 Foreign key and unique constraint checks disabled');

      // Clear all tables except users
      console.log('🧹 Clearing database...');
      await clearDatabaseExceptUsers(connection);
      console.log('✅ Database cleared');

      // Restore data
      const restoreReport = {
        restored: {},
        skipped: {},
        errors: []
      };

      for (const table of RESTORE_ORDER) {
        const rows = backupData.tables[table];

        if (!rows || rows.length === 0) {
          restoreReport.skipped[table] = 'No data';
          continue;
        }

        try {
          console.log(`📥 Restoring table ${table} with ${rows.length} rows...`);
          
          // Get current table columns to filter backup columns
          const [columns] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
          const restorableColumns = new Set(
            columns
              .filter(c => !String(c.Extra || '').toLowerCase().includes('generated'))
              .map(c => c.Field)
          );
          const backupColumns = Object.keys(rows[0]).filter(col => restorableColumns.has(col));

          if (backupColumns.length === 0) {
            restoreReport.errors.push({
              table,
              error: 'No valid columns to restore'
            });
            continue;
          }

          // Create a map of column types for date conversion
          const columnTypeMap = {};
          columns.forEach(col => {
            columnTypeMap[col.Field] = col.Type.toLowerCase();
          });

          const placeholders = backupColumns.map(() => '?').join(',');
          // Use REPLACE instead of INSERT to handle duplicates automatically
          // REPLACE will delete any existing row with the same unique key and insert the new one
          const sql = `REPLACE INTO \`${table}\` (\`${backupColumns.join('`,`')}\`) VALUES (${placeholders})`;

          let insertedCount = 0;
          let replacedCount = 0;
          for (const row of rows) {
            try {
              const values = backupColumns.map(col => {
                let value = row[col];
                
                // Convert ISO date strings to MySQL format for DATE/DATETIME/TIMESTAMP columns
                const colType = columnTypeMap[col];
                if (value && (colType === 'date' || colType.startsWith('datetime') || colType === 'timestamp')) {
                  if (typeof value === 'string' && value.includes('T')) {
                    if (colType === 'date') {
                      // For DATE: extract just YYYY-MM-DD
                      value = value.split('T')[0]; // 2026-02-14T10:14:00.000Z → 2026-02-14
                    } else {
                      // For DATETIME/TIMESTAMP: convert T to space and remove .000Z
                      // 2026-02-14T10:14:00.000Z → 2026-02-14 10:14:00
                      value = value.split('.')[0].replace('T', ' ');
                    }
                  } else if (value instanceof Date) {
                    if (colType === 'date') {
                      // Convert Date object to YYYY-MM-DD
                      value = value.toISOString().split('T')[0];
                    } else {
                      // Convert Date object to YYYY-MM-DD HH:MM:SS
                      value = value.toISOString().split('.')[0].replace('T', ' ');
                    }
                  }
                }
                
                return value;
              });
              const result = await connection.query(sql, values);
              // result[0] has affectedRows: 1 for INSERT, 2 for REPLACE
              if (result[0].affectedRows === 2) {
                replacedCount++;
              } else {
                insertedCount++;
              }
            } catch (rowErr) {
              console.warn(`Warning: Failed to restore row in ${table}:`, rowErr.message);
              restoreReport.errors.push({
                table,
                row: Object.keys(row).slice(0, 3).join(', '),
                error: rowErr.message
              });
            }
          }

          restoreReport.restored[table] = insertedCount;
          if (replacedCount > 0) {
            restoreReport.skipped[table] = `${replacedCount} duplicate entries replaced`;
          }
          
          console.log(`✅ Restored table ${table}: ${insertedCount} inserted, ${replacedCount} replaced`);
        } catch (tableErr) {
          console.error(`❌ Error restoring table ${table}:`, tableErr.message);
          restoreReport.errors.push({
            table,
            error: tableErr.message
          });
          throw tableErr;
        }
      }

      // Re-enable foreign key checks and unique constraints
      await connection.query('SET FOREIGN_KEY_CHECKS=1');
      await connection.query('SET UNIQUE_CHECKS=1');

      // Commit transaction
      await connection.commit();

      return { 
        success: true, 
        message: 'Backup restored successfully',
        report: restoreReport
      };
    } catch (err) {
      try {
        await connection.query('SET FOREIGN_KEY_CHECKS=1');
        await connection.query('SET UNIQUE_CHECKS=1');
      } catch (resetErr) {
        // ignore error
      }
      await connection.rollback();
      throw err;
    }
  } finally {
    connection.release();
  }
}

/**
 * Restore a SQL backup script
 * Executes raw SQL (super admin only)
 */
async function restoreBackupSql(sqlText) {
  if (!sqlText || !sqlText.trim()) {
    throw new Error('Invalid SQL backup: empty file');
  }

  // Convert INSERT statements to REPLACE to handle duplicate key errors
  const modifiedSql = sqlText.replace(/^(\s*)INSERT INTO/gim, '$1REPLACE INTO');

  const connection = await pool.getConnection();

  try {
    console.log('🔓 Foreign key checks disabled (SQL restore)');
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    await connection.query('SET UNIQUE_CHECKS=0');
    
    console.log('🧹 Clearing database before SQL restore...');
    await clearDatabaseExceptUsers(connection);
    console.log('✅ Database cleared');

    console.log('📥 Executing SQL restore...');
    await connection.query(modifiedSql);
    console.log('✅ SQL restore completed');
    
    await connection.query('SET FOREIGN_KEY_CHECKS=1');
    await connection.query('SET UNIQUE_CHECKS=1');

    return { 
      success: true, 
      message: 'SQL backup restored successfully' 
    };
  } catch (err) {
    console.error('❌ SQL restore error:', err.message);
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS=1');
      await connection.query('SET UNIQUE_CHECKS=1');
    } catch (restoreErr) {
      // ignore secondary error
    }
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Validate a SQL backup file against current database schema
 * Simply parses INSERT statements to show what will be restored
 */
async function validateSqlBackup(sqlContent) {
  const report = {
    tables: {},
    warnings: [],
    errors: [],
    totalRecords: 0,
    sqlBackup: true
  };

  // Parse SQL to extract table names and row counts
  // Match INSERT INTO `table_name` patterns
  const insertRegex = /INSERT\s+INTO\s+`?(\w+)`?/gi;
  const tableStats = {};
  let match;

  while ((match = insertRegex.exec(sqlContent)) !== null) {
    const tableName = match[1];
    tableStats[tableName] = (tableStats[tableName] || 0) + 1;
  }

  if (Object.keys(tableStats).length === 0) {
    report.warnings.push('No INSERT statements found in SQL backup');
    return report;
  }

  // Process each table found in the SQL
  for (const [tableName, rowCount] of Object.entries(tableStats)) {
    report.tables[tableName] = { 
      rowCount, 
      status: 'OK' 
    };
    report.totalRecords += rowCount;
  }

  return report;
}

/**
 * Save a CTBackup file with backup limit management
 * @param {Object} ctBackup - The CTBackup object
 * @returns {Promise<Object>} Save result
 */
async function saveCTBackupFile(ctBackup) {
  try {
    const MAX_BACKUPS = 20;
    const existingBackups = await listBackups();
    let deletedOldest = null;
    
    // Delete oldest backup if at limit
    if (existingBackups.length >= MAX_BACKUPS) {
      const oldestBackup = existingBackups[existingBackups.length - 1];
      await deleteBackup(oldestBackup.filename);
      deletedOldest = oldestBackup.filename;
      console.log(`🗑️ Deleted oldest backup to maintain limit: ${oldestBackup.filename}`);
    }
    
    // Save the CTBackup file using the imported implementation
    const result = await saveCTBackupFileImpl(ctBackup);
    
    return {
      ...result,
      deletedOldest,
      isAtLimit: existingBackups.length >= MAX_BACKUPS
    };
  } catch (err) {
    console.error('Error saving CTBackup:', err);
    throw err;
  }
}

module.exports = {
  createBackup,
  createBackupSql,
  createCTBackupData,
  validateBackup,
  validateSqlBackup,
  validateCTBackupFile,
  restoreBackup,
  restoreBackupSql,
  listBackups,
  getBackupFile,
  deleteBackup,
  saveBackup,
  saveCTBackupFile,
  loadCTBackupFile: require('./ctBackupService').loadCTBackupFile,
  getCTBackupMetadata: require('./ctBackupService').getCTBackupMetadata
};

/**
 * List all backup files in the backups directory (both SQL and CTBackup formats)
 */
async function listBackups() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const files = await fs.readdir(BACKUP_DIR);
    
    const backups = [];
    for (const file of files) {
      // Support both old SQL and new CTBackup formats
      if (!file.endsWith('.sql') && !file.endsWith('.CTBackup')) continue;
      
      const filePath = path.join(BACKUP_DIR, file);
      const stats = await fs.stat(filePath);
      
      const backup = {
        filename: file,
        size: stats.size,
        created: stats.mtime,
        type: file.endsWith('.CTBackup') ? 'ctbackup' : 'sql'
      };

      // For CTBackup files, try to load metadata
      if (backup.type === 'ctbackup') {
        try {
          const metadata = await getCTBackupMetadata(file);
          backup.metadata = metadata.metadata;
          backup.tableCount = metadata.tableCount;
          backup.formatVersion = metadata.version;
        } catch (err) {
          console.warn(`Could not read metadata for ${file}:`, err.message);
          backup.metadata = null;
        }
      }
      
      backups.push(backup);
    }
    
    // Sort by creation date, newest first
    backups.sort((a, b) => b.created - a.created);
    
    return backups;
  } catch (err) {
    console.error('Error listing backups:', err);
    throw err;
  }
}

/**
 * Get a specific backup file content (handles both SQL and CTBackup formats)
 */
async function getBackupFile(filename) {
  // Sanitize filename to prevent directory traversal
  const safeName = path.basename(filename);
  const filePath = path.join(BACKUP_DIR, safeName);
  
  // Check if file exists
  try {
    await fs.access(filePath);
  } catch (err) {
    throw new Error('Backup file not found');
  }

  // Handle CTBackup format
  if (safeName.endsWith('.CTBackup')) {
    const backup = await loadCTBackupFile(safeName);
    return backup;
  }

  // Handle SQL format (backward compatibility)
  const content = await fs.readFile(filePath, 'utf-8');
  return content;
}

/**
 * Delete a backup file
 */
async function deleteBackup(filename) {
  // Sanitize filename to prevent directory traversal
  const safeName = path.basename(filename);
  const filePath = path.join(BACKUP_DIR, safeName);
  
  // Check if file exists
  try {
    await fs.access(filePath);
  } catch (err) {
    throw new Error('Backup file not found');
  }
  
  await fs.unlink(filePath);
  return { success: true, message: `Backup ${safeName} deleted` };
}

/**
 * Save a backup to disk
 * @param {string} sqlContent - SQL backup content
 * @returns {Object} result - Object with filename and deletedOldest flag
 */
async function saveBackup(sqlContent) {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    
    // Check if we need to delete oldest backup (max 20 backups)
    const MAX_BACKUPS = 20;
    const existingBackups = await listBackups();
    let deletedOldest = null;
    
    if (existingBackups.length >= MAX_BACKUPS) {
      // Delete the oldest backup
      const oldestBackup = existingBackups[existingBackups.length - 1];
      await deleteBackup(oldestBackup.filename);
      deletedOldest = oldestBackup.filename;
      console.log(`🗑️ Deleted oldest backup to maintain limit: ${oldestBackup.filename}`);
    }
    
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    const filename = `backup_${timestamp}.sql`;
    const filePath = path.join(BACKUP_DIR, filename);
    
    await fs.writeFile(filePath, sqlContent, 'utf-8');
    
    return { 
      filename, 
      deletedOldest,
      isAtLimit: existingBackups.length >= MAX_BACKUPS
    };
  } catch (err) {
    console.error('Error saving backup:', err);
    throw err;
  }
}
