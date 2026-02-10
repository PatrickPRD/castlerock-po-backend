require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

async function migrateDatabase() {
  try {
    console.log('🔧 Running database migrations...\n');

    // Check current users table structure
    const [columns] = await pool.query(`
      SHOW COLUMNS FROM users
    `);
    
    console.log('Current users table columns:');
    columns.forEach(col => console.log(`  - ${col.Field} (${col.Type})`));
    console.log('');

    const columnNames = columns.map(col => col.Field);

    // Add missing columns
    const migrations = [];

    if (!columnNames.includes('active')) {
      migrations.push({
        name: 'Add active column',
        sql: `ALTER TABLE users ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER role`
      });
    }

    if (!columnNames.includes('reset_token')) {
      migrations.push({
        name: 'Add reset_token column',
        sql: `ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) DEFAULT NULL AFTER active`
      });
    }

    if (!columnNames.includes('reset_token_expires')) {
      migrations.push({
        name: 'Add reset_token_expires column',
        sql: `ALTER TABLE users ADD COLUMN reset_token_expires DATETIME DEFAULT NULL AFTER reset_token`
      });
    }

    if (!columnNames.includes('created_at')) {
      migrations.push({
        name: 'Add created_at column',
        sql: `ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER reset_token_expires`
      });
    }

    if (!columnNames.includes('updated_at')) {
      migrations.push({
        name: 'Add updated_at column',
        sql: `ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`
      });
    }

    if (migrations.length === 0) {
      console.log('✅ No migrations needed - table is up to date!\n');
    } else {
      console.log(`Running ${migrations.length} migration(s)...\n`);
      
      for (const migration of migrations) {
        console.log(`  ⏳ ${migration.name}...`);
        await pool.query(migration.sql);
        console.log(`  ✅ ${migration.name} - Done`);
      }
      
      console.log('\n🎉 All migrations completed successfully!\n');
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [appliedRows] = await pool.query(
      'SELECT filename FROM schema_migrations'
    );
    const applied = new Set(appliedRows.map(row => row.filename));

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('ℹ️  No SQL migrations found.');
      return;
    }

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8').trim();

      if (!sql) {
        console.log(`⚠️  Skipping empty migration: ${file}`);
        continue;
      }

      console.log(`  ⏳ Applying ${file}...`);
      try {
        await pool.query(sql);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
          throw err;
        }
        console.warn(`  ⚠️  Skipped ${file} (duplicate column)`);
      }
      await pool.query(
        'INSERT INTO schema_migrations (filename) VALUES (?)',
        [file]
      );
      console.log(`  ✅ Applied ${file}`);
    }

    // Show updated structure
    const [updatedColumns] = await pool.query(`SHOW COLUMNS FROM users`);
    console.log('Updated users table columns:');
    updatedColumns.forEach(col => console.log(`  - ${col.Field} (${col.Type})`));

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateDatabase();
