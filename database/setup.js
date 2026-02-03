require('dotenv').config();
const pool = require('../src/db');
const bcrypt = require('bcrypt');

async function setupDatabase() {
  try {
    console.log('🔧 Setting up database...\n');

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) DEFAULT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role ENUM('super_admin', 'admin', 'user', 'viewer') NOT NULL DEFAULT 'user',
        active TINYINT(1) NOT NULL DEFAULT 1,
        reset_token VARCHAR(255) DEFAULT NULL,
        reset_token_expires DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Users table created');

    // Check if super admin exists
    const [[existingAdmin]] = await pool.query(
      "SELECT id FROM users WHERE role = 'super_admin' LIMIT 1"
    );

    if (existingAdmin) {
      console.log('ℹ️  Super admin already exists');
    } else {
      // Create super admin - Password: Admin@123
      const passwordHash = await bcrypt.hash('Admin@123', 12);
      
      await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin@castlerock.com', passwordHash, 'Super', 'Admin', 'super_admin', 1]
      );
      console.log('✅ Super admin created');
      console.log('   📧 Email: admin@castlerock.com');
      console.log('   🔑 Password: Admin@123');
      console.log('   ⚠️  Please change password after first login!\n');
    }

    // Create other essential tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Suppliers table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        address TEXT,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Locations table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_number VARCHAR(100) NOT NULL UNIQUE,
        supplier_id INT NOT NULL,
        location_id INT,
        order_date DATE NOT NULL,
        expected_delivery_date DATE,
        total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        status ENUM('draft', 'pending', 'approved', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
        notes TEXT,
        created_by INT NOT NULL,
        approved_by INT,
        approved_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_po_number (po_number),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Purchase orders table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS po_line_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_id INT NOT NULL,
        line_number INT NOT NULL,
        description TEXT NOT NULL,
        quantity DECIMAL(10, 2) NOT NULL,
        unit_price DECIMAL(15, 2) NOT NULL,
        line_total DECIMAL(15, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
        received_quantity DECIMAL(10, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
        INDEX idx_po_id (po_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ PO line items table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(100) NOT NULL UNIQUE,
        po_id INT,
        supplier_id INT NOT NULL,
        invoice_date DATE NOT NULL,
        due_date DATE,
        total_amount DECIMAL(15, 2) NOT NULL,
        paid_amount DECIMAL(15, 2) DEFAULT 0.00,
        status ENUM('pending', 'partial', 'paid', 'overdue', 'cancelled') NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_invoice_number (invoice_number),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Invoices table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        table_name VARCHAR(100),
        record_id INT,
        old_values JSON,
        new_values JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Audit log table created');

    console.log('\n🎉 Database setup complete!\n');

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
