require('dotenv').config();
const pool = require('../src/db');

async function fixUsersTable() {
  try {
    console.log('🔧 Fixing users table structure...\n');

    // Check if first_name and last_name exist
    const [columns] = await pool.query(`SHOW COLUMNS FROM users`);
    const columnNames = columns.map(col => col.Field);

    // Add missing columns if needed
    if (!columnNames.includes('first_name')) {
      console.log('⏳ Adding first_name column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN first_name VARCHAR(100) 
        AFTER email
      `);
      console.log('✅ Added first_name column');
    }

    if (!columnNames.includes('last_name')) {
      console.log('⏳ Adding last_name column...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN last_name VARCHAR(100) 
        AFTER first_name
      `);
      console.log('✅ Added last_name column');
    }

    // Update the role enum to match what the code expects
    console.log('⏳ Updating role enum values...');
    await pool.query(`
      ALTER TABLE users 
      MODIFY COLUMN role ENUM('super_admin', 'admin', 'user', 'viewer') NOT NULL DEFAULT 'user'
    `);
    console.log('✅ Updated role enum');

    // Migrate existing data - use primary_contact names for first/last name if available
    console.log('⏳ Migrating existing user data...');
    await pool.query(`
      UPDATE users 
      SET 
        first_name = COALESCE(primary_contact_first_name, 'User'),
        last_name = COALESCE(primary_contact_second_name, 'Name')
      WHERE first_name IS NULL OR last_name IS NULL
    `);
    console.log('✅ Migrated existing user data');

    // Update role values from SUPER_ADMIN to super_admin format
    await pool.query(`
      UPDATE users 
      SET role = LOWER(role)
    `);
    console.log('✅ Updated role values to lowercase');

    console.log('\n🎉 Users table structure fixed!\n');

    // Show current users
    const [users] = await pool.query(`
      SELECT id, email, first_name, last_name, role, active 
      FROM users
    `);
    
    console.log('Current users:');
    users.forEach(user => {
      console.log(`  - ${user.email} (${user.first_name} ${user.last_name}) - Role: ${user.role}, Active: ${user.active}`);
    });

  } catch (error) {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixUsersTable();
