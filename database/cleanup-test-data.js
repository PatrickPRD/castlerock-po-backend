require('dotenv').config();
const mysql = require('mysql2/promise');

async function cleanupTestData() {
  let connection;
  
  try {
    console.log('🧹 Cleaning up test data...\n');

    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME
    });

    // Step 1: Find all POs with 'T' prefix
    const [testPOs] = await connection.query(`
      SELECT id, po_number FROM purchase_orders 
      WHERE po_number LIKE 'T%'
      ORDER BY po_number
    `);

    if (testPOs.length > 0) {
      console.log(`Found ${testPOs.length} test PO(s) with 'T' prefix:`);
      testPOs.forEach(po => console.log(`  • ${po.po_number} (ID: ${po.id})`));
      
      // Delete test POs and related invoices
      console.log('\n🗑️  Deleting test POs and related invoices...');
      
      for (const po of testPOs) {
        // Try to delete invoices with either po_id or purchase_order_id column
        try {
          await connection.query('DELETE FROM invoices WHERE po_id = ?', [po.id]);
        } catch (err) {
          // If po_id doesn't exist, try purchase_order_id
          if (err.code === 'ER_BAD_FIELD_ERROR') {
            await connection.query('DELETE FROM invoices WHERE purchase_order_id = ?', [po.id]);
          } else {
            throw err;
          }
        }
        // Then delete PO
        await connection.query('DELETE FROM purchase_orders WHERE id = ?', [po.id]);
      }
      
      console.log(`✅ Deleted ${testPOs.length} test PO(s)\n`);
    } else {
      console.log('ℹ️  No test POs with \'T\' prefix found\n');
    }

    // Step 2: Find sites with no POs
    const [orphanedSites] = await connection.query(`
      SELECT s.id, s.name
      FROM sites s
      LEFT JOIN purchase_orders po ON po.site_id = s.id
      WHERE po.id IS NULL
      GROUP BY s.id, s.name
    `);

    if (orphanedSites.length > 0) {
      console.log(`Found ${orphanedSites.length} site(s) with no POs:`);
      orphanedSites.forEach(site => console.log(`  • ${site.name} (ID: ${site.id})`));
      
      console.log('\nℹ️  Note: These sites are not automatically deleted.');
      console.log('   You can manually delete them if they are test sites.');
    } else {
      console.log('ℹ️  All sites have associated POs\n');
    }

    // Step 3: Summary
    const [poCount] = await connection.query('SELECT COUNT(*) as count FROM purchase_orders');
    const [siteCount] = await connection.query('SELECT COUNT(*) as count FROM sites');
    
    console.log('\n📊 Database Summary:');
    console.log(`   Total POs: ${poCount[0].count}`);
    console.log(`   Total Sites: ${siteCount[0].count}`);
    
    console.log('\n✅ Cleanup complete!');

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

cleanupTestData();
