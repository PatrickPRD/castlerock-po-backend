/**
 * Reset EC2 RDS Database
 * 
 * This script clears all data from the EC2 RDS instance while preserving the schema.
 * Use this to prepare for a fresh setup wizard run.
 * 
 * Before running:
 * 1. Update the .env.production file with your EC2 RDS credentials
 * 2. Run: NODE_ENV=production node reset-ec2-db.js
 */

require('dotenv').config({
  path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env'
});

const mysql = require('mysql2/promise');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function resetEC2Database() {
  let connection;

  try {
    console.log('\n⚠️  EC2 RDS DATABASE RESET TOOL');
    console.log('================================\n');
    console.log(`Database: ${process.env.DB_NAME}`);
    console.log(`Host: ${process.env.DB_HOST}`);
    console.log(`User: ${process.env.DB_USER}`);
    console.log('\nThis will DELETE ALL DATA but keep the schema intact.\n');

    const confirm = await question('Type "CONFIRM" to continue: ');
    
    if (confirm !== 'CONFIRM') {
      console.log('❌ Operation cancelled');
      rl.close();
      return;
    }

    console.log('\n🔗 Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME
    });

    console.log('✅ Connected\n');

    // List of tables to clear (in order to avoid foreign key issues)
    const tables = [
      'audit_logs',
      'invoice_line_items',
      'invoices',
      'po_line_items',
      'purchase_orders',
      'timesheet_entries',
      'timesheets',
      'workers',
      'workers_locations',
      'location_spread_rules',
      'locations',
      'sites',
      'po_stages',
      'users',
      'site_settings',
      'password_reset_tokens'
    ];

    console.log('🔄 Clearing all data...\n');

    // Disable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of tables) {
      try {
        await connection.query(`TRUNCATE TABLE ${table}`);
        console.log(`✅ ${table} cleared`);
      } catch (error) {
        console.log(`⚠️  ${table} - ${error.message}`);
      }
    }

    // Re-enable foreign key checks
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n✅ Database reset complete!\n');
    console.log('Next steps:');
    console.log('1. Restart the application on EC2');
    console.log('2. Navigate to the app URL');
    console.log('3. The setup wizard should appear automatically\n');

    rl.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    rl.close();
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

resetEC2Database();
