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
    
    console.log('Testing decimal precision...\n');
    
    // Update one record with exact value
    await conn.query('UPDATE purchase_orders SET vat_rate = 0.1350 WHERE id = 10');
    const [po1] = await conn.query('SELECT vat_rate FROM purchase_orders WHERE id = 10');
    console.log('Set to 0.1350, reads as:', po1[0].vat_rate);
    
    // Try with string
    await conn.query("UPDATE purchase_orders SET vat_rate = '0.1350' WHERE id = 10");
    const [po2] = await conn.query('SELECT vat_rate FROM purchase_orders WHERE id = 10');
    console.log('Set to "0.1350", reads as:', po2[0].vat_rate);
    
    // Check column definition
    const [cols] = await conn.query("SHOW COLUMNS FROM purchase_orders LIKE 'vat_rate'");
    console.log('\nColumn definition:', cols[0]);
    
    await conn.end();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
