const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'admin',
    password: 'Hj1ltl1nd&!',
    database: 'castlerock_po_dev',
    port: 3306
  });

  // Check total POs
  const [poCount] = await conn.query('SELECT COUNT(*) as count FROM purchase_orders');
  console.log(`Total POs: ${poCount[0].count}`);

  // Check total line items
  const [itemCount] = await conn.query('SELECT COUNT(*) as count FROM po_line_items');
  console.log(`Total line items: ${itemCount[0].count}`);

  // Show structure of PO P62001
  const [po] = await conn.query('SELECT * FROM purchase_orders WHERE po_number = ? LIMIT 1', ['P62001']);
  if (po.length > 0) {
    console.log('\nPO P62001 details:');
    console.log(`  ID: ${po[0].id}`);
    console.log(`  Net Amount: ${po[0].net_amount}`);
    console.log(`  Total Amount: ${po[0].total_amount}`);
    console.log(`  Status: ${po[0].status}`);
  }

  await conn.end();
})();
