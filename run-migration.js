require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });

    const migrationPath = path.join(__dirname, 'database', 'migrations', '20260205_fix_vat_rates.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Running migration: 20260205_fix_vat_rates.sql\n');
    
    const statements = sql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim() && !statement.trim().startsWith('--')) {
        try {
          const result = await conn.query(statement);
          if (Array.isArray(result) && result[0] && result[0].constructor.name === 'ResultSetHeader') {
            if (result[0].affectedRows > 0) {
              console.log(`✅ Updated ${result[0].affectedRows} rows`);
            }
          }
        } catch (e) {
          // Ignore warning messages
          if (!e.message.includes('warning')) {
            throw e;
          }
        }
      }
    }

    console.log('\n✅ Migration completed successfully!');

    const [result] = await conn.query('SHOW COLUMNS FROM purchase_orders WHERE Field = "vat_rate"');
    console.log('\nUpdated column definition:');
    console.log(result[0]);

    // Check the VAT rates
    const [rates] = await conn.query('SELECT DISTINCT vat_rate, COUNT(*) as count FROM purchase_orders GROUP BY vat_rate ORDER BY vat_rate');
    console.log('\nVAT Rate Distribution after migration:');
    console.log(rates);

    await conn.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
