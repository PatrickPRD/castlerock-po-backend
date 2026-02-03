require('dotenv').config();
const pool = require('../src/db');

(async () => {
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM sites');
    console.log('Sites table columns:');
    cols.forEach(c => console.log(`  ${c.Field} (${c.Type})`));
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
