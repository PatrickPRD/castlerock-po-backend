require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

(async () => {
  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
      multipleStatements: true
    });

    // Create migrations tracking table if it doesn't exist
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_migration_name (migration_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Get list of already executed migrations
    const [executedMigrations] = await conn.query(
      'SELECT migration_name FROM schema_migrations ORDER BY migration_name'
    );
    const executedSet = new Set(executedMigrations.map(m => m.migration_name));

    // Read all migration files
    const migrationsDir = path.join(__dirname, 'database', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort by filename (timestamp prefix ensures correct order)

    if (migrationFiles.length === 0) {
      console.log('No migration files found.');
      await conn.end();
      return;
    }

    // Find pending migrations
    const pendingMigrations = migrationFiles.filter(file => !executedSet.has(file));

    if (pendingMigrations.length === 0) {
      console.log('✅ Database is up to date. No pending migrations.');
      await conn.end();
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s):\n`);
    pendingMigrations.forEach(file => console.log(`  - ${file}`));
    console.log('');

    // Execute each pending migration
    for (const migrationFile of pendingMigrations) {
      console.log(`Running migration: ${migrationFile}`);
      
      const migrationPath = path.join(migrationsDir, migrationFile);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      try {
        // Execute the migration
        await conn.query(sql);
        
        // Record that this migration has been executed
        await conn.query(
          'INSERT INTO schema_migrations (migration_name) VALUES (?)',
          [migrationFile]
        );
        
        console.log(`✅ ${migrationFile} completed successfully\n`);
      } catch (err) {
        console.error(`❌ Error executing ${migrationFile}:`, err.message);
        throw err;
      }
    }

    console.log(`\n✅ All migrations completed successfully!`);
    console.log(`   Total migrations executed: ${pendingMigrations.length}`);

    await conn.end();
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    if (conn) await conn.end();
    process.exit(1);
  }
})();
