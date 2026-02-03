const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
  console.log('🔍 Testing MySQL Connection...\n');
  console.log(`Host: ${process.env.DB_HOST}`);
  console.log(`User: ${process.env.DB_USER}`);
  console.log(`Port: ${process.env.DB_PORT}`);
  console.log(`Database: ${process.env.DB_NAME}\n`);

  // Test 1: Try connecting with provided credentials
  console.log('Test 1: Connecting with provided credentials...');
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT
    });
    console.log('✅ Connection successful!\n');
    
    // Check if database exists
    const [databases] = await connection.query(
      `SHOW DATABASES LIKE '${process.env.DB_NAME}'`
    );
    
    if (databases.length > 0) {
      console.log(`✅ Database '${process.env.DB_NAME}' exists`);
    } else {
      console.log(`⚠️  Database '${process.env.DB_NAME}' does not exist`);
      console.log(`   Creating database...`);
      await connection.query(`CREATE DATABASE ${process.env.DB_NAME}`);
      console.log(`✅ Database '${process.env.DB_NAME}' created successfully!`);
    }
    
    await connection.end();
    console.log('\n🎉 MySQL connection test passed!\n');
    console.log('You can now run: npm run setup');
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('\n💡 Common Solutions:\n');
    console.log('1. Check if MySQL is running:');
    console.log('   - Open Services (services.msc) and look for MySQL');
    console.log('   - Or run: mysql -u root -p\n');
    console.log('2. Verify credentials in .env file:');
    console.log('   - DB_USER should be your MySQL username (usually "root")');
    console.log('   - DB_PASSWORD should match your MySQL password\n');
    console.log('3. Try connecting with root user:');
    console.log('   - Update .env: DB_USER=root\n');
    console.log('4. Reset MySQL root password if forgotten:');
    console.log('   - Google "reset MySQL root password Windows"\n');
    
    process.exit(1);
  }
}

testConnection();
