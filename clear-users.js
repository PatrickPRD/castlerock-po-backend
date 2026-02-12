#!/usr/bin/env node
/**
 * Clear users to show setup wizard on first load
 * For fresh deployments that want the browser wizard to create the first admin
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

(async function() {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    await pool.query('DELETE FROM users');
    console.log('✅ All users deleted - setup wizard will now appear on first access');

    await pool.end();
  } catch(error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
