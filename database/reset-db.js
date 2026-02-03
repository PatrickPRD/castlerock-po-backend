require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

async function resetDatabase() {
  let connection;
  
  try {
    console.log('🔧 Resetting database...\n');

    // Connect without selecting a database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      multipleStatements: true
    });

    console.log('📋 Step 1: Dropping existing database...');
    await connection.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`);
    console.log('✅ Database dropped');

    console.log('\n📋 Step 2: Creating new database...');
    await connection.query(`CREATE DATABASE ${process.env.DB_NAME}`);
    await connection.query(`USE ${process.env.DB_NAME}`);
    console.log('✅ Database created');

    console.log('\n📋 Step 3: Creating tables...');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'complete-schema.sql');
    let schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Remove the database creation commands from schema as we already handled them
    schema = schema.replace(/DROP DATABASE IF EXISTS.*?;/gs, '');
    schema = schema.replace(/CREATE DATABASE.*?;/gs, '');
    schema = schema.replace(/USE .*?;/gs, '');
    
    // Execute the schema in one go
    await connection.query(schema);
    console.log('✅ All tables created');

    console.log('\n📋 Step 4: Creating super admin...');
    const passwordHash = await bcrypt.hash('Admin@123', 12);
    await connection.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, active)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
      ['admin@castlerock.com', passwordHash, 'Super', 'Admin', 'super_admin', 1]
    );
    console.log('✅ Super admin created');

    console.log('\n🎉 Database reset complete!\n');
    console.log('📧 Admin Email: admin@castlerock.com');
    console.log('🔑 Admin Password: Admin@123\n');
    console.log('Next step: Import your data from po-export file');

  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

resetDatabase();
