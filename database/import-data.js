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

    const dataFile = path.join(__dirname, 'po-export-20260204T151726.sql');
    
    if (!fs.existsSync(dataFile)) {
      console.error('❌ Data file not found:', dataFile);
      process.exit(1);
    }

    console.log('📋 Reading data file...');
    let sql = fs.readFileSync(dataFile, 'utf8');
    
    // Convert VAT rates from decimals (0.135, 0.23) to percentages (13.5, 23)
    // For invoices: match description/net_amount pattern then convert the following vat_rate
    sql = sql.replace(
      /INSERT INTO `invoices`[\s\S]*?VALUES\s([\s\S]*?);/,
      function(match) {
        // Process each row: find rows with VAT rates in decimal format
        return match.replace(
          /('[^']*',\s*'[\d.]+',\s*)'(\d+\.\d{4})'/g,
          function(rowMatch, beforeVat, vatRate) {
            const rate = parseFloat(vatRate);
            if (rate > 0 && rate < 1) {
              const percentRate = (rate * 100).toFixed(2);
              return beforeVat + `'${percentRate}'`;
            }
            return rowMatch;
          }
        );
      }
    );
    
    // For purchase_orders: match description/net_amount then convert the following vat_rate
    sql = sql.replace(
      /INSERT INTO `purchase_orders`[\s\S]*?VALUES\s([\s\S]*?);/,
      function(match) {
        // Process each row: description is always before net_amount, vat_rate comes after net_amount
        return match.replace(
          /('[^']*',\s*'[\d.]+',\s*)'(\d+\.\d{4})'/g,
          function(rowMatch, beforeVat, vatRate) {
            const rate = parseFloat(vatRate);
            if (rate > 0 && rate < 1) {
              const percentRate = (rate * 100).toFixed(2);
              return beforeVat + `'${percentRate}'`;
            }
            return rowMatch;
          }
        );
      }
    );
    
    // Remove duplicate inserts for users and po_stages only (keep suppliers, sites, locations)
    sql = sql.replace(/INSERT INTO `users`.*?;/s, '');
    sql = sql.replace(/INSERT INTO `po_stages`.*?;/s, '');
    
    // Replace sites INSERT with proper schema (with site_letter)
    sql = sql.replace(
      /INSERT INTO `sites` \(`id`, `name`\) VALUES[\s\S]*?\);/,
      `INSERT INTO \`sites\` (\`id\`, \`name\`, \`site_letter\`) VALUES
       (1, 'Bandon Phase 1', 'B'),
       (2, 'Bandon Phase 2', 'P'),
       (3, 'Midleton', 'M');`
    );
    
    // Disable foreign key checks at the beginning
    sql = 'SET FOREIGN_KEY_CHECKS = 0;\n' + sql;
    
    // Clear existing data (except users)
    const clearTables = `
      DELETE FROM invoices;
      DELETE FROM purchase_orders;
      DELETE FROM locations;
      DELETE FROM suppliers;
      DELETE FROM sites;
      DELETE FROM site_letters;
      ALTER TABLE suppliers AUTO_INCREMENT = 1;
      ALTER TABLE locations AUTO_INCREMENT = 1;
      ALTER TABLE sites AUTO_INCREMENT = 1;
      ALTER TABLE purchase_orders AUTO_INCREMENT = 1;
      ALTER TABLE invoices AUTO_INCREMENT = 1;
    `;
    
    sql = clearTables + '\n' + sql;

    console.log('📋 Importing data (this may take a while)...');
    await connection.query(sql);

    // Set all suppliers to active = 1
    console.log('✅ Data imported successfully!\n');
    console.log('📋 Activating suppliers and locations...');
    await connection.query('UPDATE suppliers SET active = 1 WHERE active = 0 OR active IS NULL');
    await connection.query('UPDATE locations SET active = 1 WHERE active = 0 OR active IS NULL');
    console.log('✅ Suppliers and locations activated!\n');

    // Insert default site letter mappings
    console.log('📋 Setting up site letter mappings...');
    await connection.query(`
      INSERT INTO site_letters (site_id, letter) VALUES
      (1, 'B'),
      (3, 'M'),
      (2, 'P')
      ON DUPLICATE KEY UPDATE letter = VALUES(letter)
    `);
    console.log('✅ Site letter mappings created!\n');

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
