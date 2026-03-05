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

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      if (ch === '-' && next === '-' && /\s/.test(sql[i + 2] || '')) {
        current += ch + next;
        i += 1;
        inLineComment = true;
        continue;
      }

      if (ch === '#') {
        current += ch;
        inLineComment = true;
        continue;
      }

      if (ch === '/' && next === '*') {
        current += ch + next;
        i += 1;
        inBlockComment = true;
        continue;
      }
    }

    if (ch === "'" && !inDoubleQuote && !inBacktick) {
      const escaped = sql[i - 1] === '\\';
      if (!escaped) {
        inSingleQuote = !inSingleQuote;
      }
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote && !inBacktick) {
      const escaped = sql[i - 1] === '\\';
      if (!escaped) {
        inDoubleQuote = !inDoubleQuote;
      }
      current += ch;
      continue;
    }

    if (ch === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      current += ch;
      continue;
    }

    if (ch === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }

  return statements;
}

function extractCreatedTables(sql) {
  const tableNames = new Set();
  const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+`?([a-zA-Z0-9_]+)`?/gi;

  let match;
  while ((match = createTableRegex.exec(sql)) !== null) {
    tableNames.add(match[1]);
  }

  return Array.from(tableNames);
}

async function getMissingCreatedTables(sql) {
  const expectedTables = extractCreatedTables(sql);
  if (expectedTables.length === 0) {
    return [];
  }

  const missingTables = [];
  for (const tableName of expectedTables) {
    const [rows] = await pool.query('SHOW TABLES LIKE ?', [tableName]);
    if (!Array.isArray(rows) || rows.length === 0) {
      missingTables.push(tableName);
    }
  }

  return missingTables;
}

async function recordMigrationAsApplied(file, hasLegacyMigrationName) {
  if (hasLegacyMigrationName) {
    await pool.query(
      'INSERT INTO schema_migrations (filename, migration_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE filename = VALUES(filename), migration_name = VALUES(migration_name)',
      [file, file]
    );
    return;
  }

  await pool.query(
    'INSERT INTO schema_migrations (filename) VALUES (?) ON DUPLICATE KEY UPDATE filename = VALUES(filename)',
    [file]
  );
}

async function executeMigrationStatements(file, sql, mode = 'apply') {
  const statements = splitSqlStatements(sql).filter((statement) => statement.trim().length > 0);

  if (!statements.length) {
    return { executedStatements: 0, recoverableErrors: 0 };
  }

  let recoverableErrors = 0;

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];

    try {
      await pool.query(statement);
    } catch (error) {
      if (!RECOVERABLE_MIGRATION_ERRORS.has(error?.code)) {
        throw new Error(`Migration ${file} failed at statement ${index + 1}: ${error.message}`);
      }

      recoverableErrors += 1;
      console.warn(
        `⚠️  ${mode === 'repair' ? 'Repair' : 'Migration'} ${file} statement ${index + 1} already effectively applied (${error.code})`
      );
    }
  }

  return {
    executedStatements: statements.length,
    recoverableErrors
  };
}

async function reconcileAppliedMigrationsAgainstSchema(hasLegacyMigrationName) {
  const [appliedRows] = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.filename));
  const files = getMigrationFiles();

  if (!files.length || applied.size === 0) {
    return;
  }

  let repairedCount = 0;

  for (const file of files) {
    if (!applied.has(file)) {
      continue;
    }

    const filePath = path.join(__dirname, '../../database/migrations', file);
    const sql = fs.readFileSync(filePath, 'utf8').trim();

    if (!sql) {
      continue;
    }

    const missingTables = await getMissingCreatedTables(sql);
    if (missingTables.length === 0) {
      continue;
    }

    console.warn(
      `⚠️  Migration drift detected for ${file}. Missing table(s): ${missingTables.join(', ')}. Running repair...`
    );

    await executeMigrationStatements(file, sql, 'repair');
    await recordMigrationAsApplied(file, hasLegacyMigrationName);

    const missingAfterRepair = await getMissingCreatedTables(sql);
    if (missingAfterRepair.length > 0) {
      throw new Error(
        `Migration repair failed for ${file}. Still missing table(s): ${missingAfterRepair.join(', ')}`
      );
    }

    repairedCount += 1;
    console.log(`✅ Repaired migration drift for ${file}`);
  }

  if (repairedCount > 0) {
    console.log(`✅ Repaired ${repairedCount} applied migration(s) with schema drift`);
  }
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
    await executeMigrationStatements(file, sql, 'apply');
    await recordMigrationAsApplied(file, hasLegacyMigrationName);

    appliedCount += 1;
  }

  if (appliedCount > 0) {
    console.log(`✅ Applied ${appliedCount} SQL migration(s)`);
  } else {
    console.log('✅ SQL migrations already up to date');
  }

  await reconcileAppliedMigrationsAgainstSchema(hasLegacyMigrationName);
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
