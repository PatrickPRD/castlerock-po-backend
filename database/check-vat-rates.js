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
    
    // Check purchase_orders for invalid VAT rates
    const [pos] = await conn.query(`
      SELECT id, po_number, vat_rate 
      FROM purchase_orders 
      WHERE vat_rate NOT IN (0, 0.135, 0.23) 
      LIMIT 20
    `);
    console.log('\n=== Purchase Orders with invalid VAT rates ===');
    console.log(pos);
    
    // Check invoices for invalid VAT rates
    const [invs] = await conn.query(`
      SELECT id, invoice_number, vat_rate 
      FROM invoices 
      WHERE vat_rate NOT IN (0, 0.135, 0.23) 
      LIMIT 20
    `);
    console.log('\n=== Invoices with invalid VAT rates ===');
    console.log(invs);
    
    // Count distinct VAT rates in each table
    const [poRates] = await conn.query(`
      SELECT DISTINCT vat_rate, COUNT(*) as count 
      FROM purchase_orders 
      GROUP BY vat_rate 
      ORDER BY vat_rate
    `);
    console.log('\n=== Distinct VAT rates in purchase_orders ===');
    console.log(poRates);
    
    const [invRates] = await conn.query(`
      SELECT DISTINCT vat_rate, COUNT(*) as count 
      FROM invoices 
      GROUP BY vat_rate 
      ORDER BY vat_rate
    `);
    console.log('\n=== Distinct VAT rates in invoices ===');
    console.log(invRates);
    
    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
