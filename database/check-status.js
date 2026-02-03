require('dotenv').config();
const pool = require('../src/db');

(async () => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT status, COUNT(*) as count 
      FROM purchase_orders 
      GROUP BY status
    `);
    
    console.log('Purchase Order Statuses in Database:');
    rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
