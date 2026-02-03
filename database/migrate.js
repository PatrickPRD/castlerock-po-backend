require('dotenv').config();
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
