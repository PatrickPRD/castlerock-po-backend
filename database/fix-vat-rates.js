require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

const config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  charset: 'utf8mb4',
  multipleStatements: true
};

async function runMigration() {
  const conn = await mysql.createConnection(config);
  
  try {
    const migrationPath = path.join(__dirname, 'migrations', '20260205_fix_vat_rates.sql');
    const sql = await fs.readFile(migrationPath, 'utf8');
    
    console.log('Running migration: 20260205_fix_vat_rates.sql');
    console.log('Fixing incorrect VAT rates (14% -> 13.5%)...\n');
    
    const [results] = await conn.query(sql);
    
    // Display results
    if (Array.isArray(results)) {
      results.forEach(result => {
        if (result.constructor.name === 'ResultSetHeader') {
          if (result.affectedRows > 0) {
            console.log(`✅ Updated ${result.affectedRows} rows`);
          }
        } else if (Array.isArray(result)) {
          console.table(result);
        }
      });
    }
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await conn.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
