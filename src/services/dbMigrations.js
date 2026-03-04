const fs = require('fs');
const path = require('path');
const pool = require('../db');

const RECOVERABLE_MIGRATION_ERRORS = new Set([
  'ER_DUP_FIELDNAME',
  'ER_DUP_KEYNAME',
  'ER_TABLE_EXISTS_ERROR',
  'ER_CANT_DROP_FIELD_OR_KEY'
]);

async function ensureLegacyUsersColumns() {
  const [tables] = await pool.query("SHOW TABLES LIKE 'users'");
  if (!Array.isArray(tables) || tables.length === 0) {
    return;
  }

  const [columns] = await pool.query('SHOW COLUMNS FROM users');
  const columnNames = new Set(columns.map((column) => String(column.Field || '').toLowerCase()));

  const migrations = [];

  if (!columnNames.has('active')) {
    migrations.push('ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER role');
  }

  if (!columnNames.has('reset_token')) {
    migrations.push('ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) DEFAULT NULL AFTER active');
  }

  if (!columnNames.has('reset_token_expires')) {
    migrations.push('ALTER TABLE users ADD COLUMN reset_token_expires DATETIME DEFAULT NULL AFTER reset_token');
  }

  if (!columnNames.has('created_at')) {
    migrations.push('ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER reset_token_expires');
  }

  if (!columnNames.has('updated_at')) {
    migrations.push('ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
  }

  if (!migrations.length) {
    return;
  }

  console.log(`🧩 Applying ${migrations.length} legacy user-column fix(es)...`);
  for (const sql of migrations) {
    await pool.query(sql);
  }
}

async function ensureSchemaMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [columns] = await pool.query('SHOW COLUMNS FROM schema_migrations');
  const columnNames = new Set(columns.map((column) => String(column.Field || '').toLowerCase()));

  if (!columnNames.has('filename')) {
    await pool.query('ALTER TABLE schema_migrations ADD COLUMN filename VARCHAR(255) NULL');

    if (columnNames.has('migration_name')) {
      await pool.query('UPDATE schema_migrations SET filename = migration_name WHERE filename IS NULL');
    }

    await pool.query('ALTER TABLE schema_migrations MODIFY COLUMN filename VARCHAR(255) NOT NULL');
  }

  if (!columnNames.has('applied_at') && columnNames.has('executed_at')) {
    await pool.query('ALTER TABLE schema_migrations ADD COLUMN applied_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP');
    await pool.query('UPDATE schema_migrations SET applied_at = executed_at WHERE applied_at IS NULL');
  }

  try {
    await pool.query('ALTER TABLE schema_migrations ADD UNIQUE INDEX idx_schema_migrations_filename (filename)');
  } catch (error) {
    if (!RECOVERABLE_MIGRATION_ERRORS.has(error?.code)) {
      throw error;
    }
  }
}

function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, '../../database/migrations');

  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

async function applyPendingSqlMigrations() {
  const [columns] = await pool.query('SHOW COLUMNS FROM schema_migrations');
  const columnNames = new Set(columns.map((column) => String(column.Field || '').toLowerCase()));
  const hasLegacyMigrationName = columnNames.has('migration_name');

  const [appliedRows] = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.filename));
  const files = getMigrationFiles();

  if (!files.length) {
    console.log('ℹ️  No SQL migration files found.');
    return;
  }

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const filePath = path.join(__dirname, '../../database/migrations', file);
    const sql = fs.readFileSync(filePath, 'utf8').trim();

    if (!sql) {
      console.log(`⚠️  Skipping empty migration: ${file}`);
      continue;
    }

    console.log(`⏳ Applying migration ${file}...`);
    try {
      await pool.query(sql);
    } catch (error) {
      if (!RECOVERABLE_MIGRATION_ERRORS.has(error?.code)) {
        throw error;
      }
      console.warn(`⚠️  Migration ${file} is already effectively applied (${error.code})`);
    }

    if (hasLegacyMigrationName) {
      await pool.query(
        'INSERT INTO schema_migrations (filename, migration_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE filename = VALUES(filename), migration_name = VALUES(migration_name)',
        [file, file]
      );
    } else {
      await pool.query(
        'INSERT INTO schema_migrations (filename) VALUES (?) ON DUPLICATE KEY UPDATE filename = VALUES(filename)',
        [file]
      );
    }

    appliedCount += 1;
  }

  if (appliedCount > 0) {
    console.log(`✅ Applied ${appliedCount} SQL migration(s)`);
  } else {
    console.log('✅ SQL migrations already up to date');
  }
}

async function runStartupMigrations() {
  console.log('🔧 Running startup DB migration check...');
  await ensureLegacyUsersColumns();
  await ensureSchemaMigrationsTable();
  await applyPendingSqlMigrations();
}

module.exports = {
  runStartupMigrations
};
