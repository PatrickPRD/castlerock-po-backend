#!/usr/bin/env node
require('dotenv').config();
const mysql = require('mysql2/promise');

(async function() {
  try {
    console.log('Connecting to database...');
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    const [tables] = await pool.query('SHOW TABLES');
    console.log(`\n✅ Found ${tables.length} tables:\n`);
    tables.forEach((t, i) => {
      const tableName = t[Object.keys(t)[0]];
      console.log(`${i + 1}. ${tableName}`);
    });

    // Check for specific critical tables
    const tableNames = tables.map(t => t[Object.keys(t)[0]]);
    const required = ['users', 'sites', 'locations', 'purchase_orders', 'po_line_items'];
    
    console.log('\nCritical tables:');
    required.forEach(t => {
      console.log(`${tableNames.includes(t) ? '✅' : '❌'} ${t}`);
    });

    await pool.end();
  } catch(error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
