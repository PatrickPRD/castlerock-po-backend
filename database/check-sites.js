require('dotenv').config();
const pool = require('../src/db');

(async () => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT 
        SUBSTRING(po_number, 1, 1) as site_letter, 
        COUNT(*) as count 
      FROM purchase_orders 
      GROUP BY site_letter 
      ORDER BY site_letter
    `);
    
    console.log('PO Site Letters:');
    rows.forEach(r => console.log(`  ${r.site_letter}: ${r.count} POs`));
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
