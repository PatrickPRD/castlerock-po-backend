const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'admin',
    password: 'Hj1ltl1nd&!',
    database: 'castlerock_po_dev',
    port: 3306
  });

  const [result] = await conn.query(`
    SELECT 
      po.id, 
      po.po_number, 
      COUNT(li.id) as item_count, 
      SUM(li.line_total) as total 
    FROM purchase_orders po 
    LEFT JOIN po_line_items li ON po.id = li.po_id 
    GROUP BY po.id, po.po_number 
    HAVING item_count > 0 
    LIMIT 5
  `);

  console.log('POs with line items:');
  result.forEach(r => {
    console.log(`  PO ${r.po_number}: ${r.item_count} items, Total: €${r.total}`);
  });

  await conn.end();
})();
