require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });

    console.log('=== Running VAT Rate Fix Migration ===\n');

    console.log('Disabling foreign key checks...');
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    console.log('✅ Foreign key checks disabled\n');

    console.log('Step 1: Altering purchase_orders vat_rate column...');
    await conn.query(`
      ALTER TABLE purchase_orders 
      MODIFY COLUMN vat_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.2300 
      COMMENT 'Valid rates: 0, 0.1350, 0.2300'
    `);
    console.log('✅ purchase_orders column altered to DECIMAL(5, 4)');

    console.log('\nStep 2: Altering invoices vat_rate column...');
    await conn.query(`
      ALTER TABLE invoices 
      MODIFY COLUMN vat_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.2300 
      COMMENT 'Valid rates: 0, 0.1350, 0.2300'
    `);
    console.log('✅ invoices column altered to DECIMAL(5, 4)');

    console.log('\nStep 3: Updating purchase_orders (0.14 -> 0.1350)...');
    const [result1] = await conn.query(`
      UPDATE purchase_orders 
      SET vat_rate = 0.1350,
          vat_amount = ROUND(net_amount * 0.1350, 2),
          total_amount = net_amount + ROUND(net_amount * 0.1350, 2)
      WHERE vat_rate >= 0.1399 AND vat_rate <= 0.1401
    `);
    console.log(`✅ Updated ${result1.affectedRows} rows in purchase_orders`);

    console.log('\nStep 4: Updating invoices (0.14 -> 0.1350)...');
    const [result2] = await conn.query(`
      UPDATE invoices 
      SET vat_rate = 0.1350,
          vat_amount = ROUND(net_amount * 0.1350, 2),
          total_amount = net_amount + ROUND(net_amount * 0.1350, 2)
      WHERE vat_rate >= 0.1399 AND vat_rate <= 0.1401
    `);
    console.log(`✅ Updated ${result2.affectedRows} rows in invoices`);

    console.log('\n=== Verification ===\n');

    const [check] = await conn.query('SHOW COLUMNS FROM purchase_orders WHERE Field = "vat_rate"');
    console.log('New purchase_orders.vat_rate column definition:');
    console.log(check[0]);

    const [rates] = await conn.query(`
      SELECT DISTINCT vat_rate, COUNT(*) as count 
      FROM purchase_orders 
      GROUP BY vat_rate 
      ORDER BY vat_rate
    `);
    console.log('\nPurchase Orders VAT Rates:');
    console.table(rates);

    const [invRates] = await conn.query(`
      SELECT DISTINCT vat_rate, COUNT(*) as count 
      FROM invoices 
      GROUP BY vat_rate 
      ORDER BY vat_rate
    `);
    console.log('\nInvoices VAT Rates:');
    console.table(invRates);

    console.log('\nRe-enabling foreign key checks...');
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    console.log('✅ Foreign key checks re-enabled');

    console.log('\n✅ Migration completed successfully!');

    await conn.end();
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
})();
