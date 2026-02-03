require('dotenv').config();
const pool = require('../src/db');

(async () => {
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM locations');
    console.log('Locations table columns:');
    cols.forEach(c => console.log(`  ${c.Field} (${c.Type})`));
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
