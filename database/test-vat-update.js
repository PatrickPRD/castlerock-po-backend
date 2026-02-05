require('dotenv').config();
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  charset: 'utf8mb4'
};

(async () => {
  try {
    const conn = await mysql.createConnection(config);
    
    // Check one specific record
    const [po] = await conn.query('SELECT id, po_number, vat_rate, net_amount, vat_amount FROM purchase_orders WHERE id = 10');
    console.log('Before update:', po[0]);
    
    // Try direct update with exact decimal
    await conn.query('UPDATE purchase_orders SET vat_rate = 0.1350 WHERE id = 10');
    
    const [po2] = await conn.query('SELECT id, po_number, vat_rate, net_amount, vat_amount FROM purchase_orders WHERE id = 10');
    console.log('After update:', po2[0]);
    
    // Check if it's actually different
    console.log('\nComparison:');
    console.log('vat_rate = 0.14:', po2[0].vat_rate == 0.14);
    console.log('vat_rate = 0.1350:', po2[0].vat_rate == 0.1350);
    console.log('vat_rate = 0.1400:', po2[0].vat_rate == 0.1400);
    console.log('Actual value:', po2[0].vat_rate);
    
    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
