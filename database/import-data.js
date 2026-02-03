require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function importData() {
  let connection;
  
  try {
    console.log('📥 Importing data from po-export file...\n');

    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      multipleStatements: true
    });

    const dataFile = path.join(__dirname, 'po-export-20260203T214327.sql');
    
    if (!fs.existsSync(dataFile)) {
      console.error('❌ Data file not found:', dataFile);
      process.exit(1);
    }

    console.log('📋 Reading data file...');
    let sql = fs.readFileSync(dataFile, 'utf8');
    
    // Remove duplicate inserts that are already in schema
    sql = sql.replace(/INSERT INTO `users`.*?;/s, '');
    sql = sql.replace(/INSERT INTO `po_stages`.*?;/s, '');

    console.log('📋 Importing data (this may take a while)...');
    await connection.query(sql);

    console.log('✅ Data imported successfully!\n');

    // Show summary
    const [userCount] = await connection.query('SELECT COUNT(*) as count FROM users');
    const [siteCount] = await connection.query('SELECT COUNT(*) as count FROM sites');
    const [supplierCount] = await connection.query('SELECT COUNT(*) as count FROM suppliers');
    const [locationCount] = await connection.query('SELECT COUNT(*) as count FROM locations');
    const [poCount] = await connection.query('SELECT COUNT(*) as count FROM purchase_orders');
    const [invoiceCount] = await connection.query('SELECT COUNT(*) as count FROM invoices');

    console.log('📊 Import Summary:');
    console.log(`   Users: ${userCount[0].count}`);
    console.log(`   Sites: ${siteCount[0].count}`);
    console.log(`   Suppliers: ${supplierCount[0].count}`);
    console.log(`   Locations: ${locationCount[0].count}`);
    console.log(`   Purchase Orders: ${poCount[0].count}`);
    console.log(`   Invoices: ${invoiceCount[0].count}`);

    console.log('\n🎉 Import complete!');

  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

importData();
