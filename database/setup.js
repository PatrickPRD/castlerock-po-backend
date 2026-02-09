require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');

function runDependencyPreflight() {
  try {
    require('bcrypt');
  } catch (error) {
    console.warn('⚠️  bcrypt native module not available:', error.message);
    console.warn('   You can switch to bcryptjs or install build tools for your OS.');
  }

  try {
    const puppeteer = require('puppeteer');
    const chromePath = puppeteer.executablePath();
    if (!chromePath || !fs.existsSync(chromePath)) {
      console.warn('⚠️  Puppeteer Chromium not found. PDF generation will fail.');
      console.warn('   Run: npx puppeteer browsers install chrome');
    }
  } catch (error) {
    console.warn('⚠️  Puppeteer not available:', error.message);
  }
}

async function setupDatabase() {
  let pool;
  let adminConn;

  try {
    runDependencyPreflight();
    console.log('🔧 Setting up database...\n');

    const dbName = process.env.DB_NAME;
    if (!dbName) {
      throw new Error('DB_NAME is not set in the environment');
    }

    const baseConfig = {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true,
      enableKeepAlive: true
    };

    // Create database if it does not exist before connecting to it.
    adminConn = await mysql.createConnection({
      host: baseConfig.host,
      user: baseConfig.user,
      password: baseConfig.password,
      port: baseConfig.port
    });
    await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);

    pool = mysql.createPool({
      ...baseConfig,
      database: dbName
    });

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) DEFAULT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role ENUM('super_admin', 'admin', 'staff', 'user', 'viewer') NOT NULL DEFAULT 'user',
        active TINYINT(1) NOT NULL DEFAULT 1,
        reset_token VARCHAR(255) DEFAULT NULL,
        reset_token_expires DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role),
        INDEX idx_active (active),
        INDEX idx_reset_token (reset_token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Users table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        site_letter VARCHAR(1) NOT NULL,
        address TEXT,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_site_letter (site_letter),
        INDEX idx_name (name),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Sites table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_letters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        letter VARCHAR(1) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_letter (letter),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        INDEX idx_site_id (site_id),
        INDEX idx_letter (letter)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Site letters table created');

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
        INDEX idx_name (name),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Suppliers table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS po_stages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ PO stages table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) DEFAULT NULL,
        site_id INT NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT,
        INDEX idx_name (name),
        INDEX idx_type (type),
        INDEX idx_site_id (site_id),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Locations table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS location_spread_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        source_location_id INT NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_source_location (source_location_id),
        FOREIGN KEY (source_location_id) REFERENCES locations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Location spread rules table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS location_spread_rule_sites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rule_id INT NOT NULL,
        site_id INT NOT NULL,
        spread_all TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_rule_site (rule_id, site_id),
        FOREIGN KEY (rule_id) REFERENCES location_spread_rules(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Location spread rule sites table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS location_spread_rule_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rule_site_id INT NOT NULL,
        location_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_rule_site_location (rule_site_id, location_id),
        FOREIGN KEY (rule_site_id) REFERENCES location_spread_rule_sites(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Location spread rule locations table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        po_number VARCHAR(100) NOT NULL UNIQUE,
        po_date DATE NOT NULL,
        supplier_id INT NOT NULL,
        site_id INT NOT NULL,
        location_id INT,
        stage_id INT,
        description TEXT,
        net_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        vat_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.2300 COMMENT 'Valid rates: 0.0000, 0.1350, 0.2300',
        vat_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        created_by INT NOT NULL,
        approved_by INT,
        approved_at DATETIME,
        cancelled_by INT,
        cancelled_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT,
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
        FOREIGN KEY (stage_id) REFERENCES po_stages(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_po_number (po_number),
        INDEX idx_po_date (po_date),
        INDEX idx_supplier_id (supplier_id),
        INDEX idx_site_id (site_id),
        INDEX idx_location_id (location_id),
        INDEX idx_stage_id (stage_id),
        INDEX idx_status (status),
        INDEX idx_created_by (created_by)
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
        unit VARCHAR(50),
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
        purchase_order_id INT NOT NULL,
        invoice_number VARCHAR(100) NOT NULL UNIQUE,
        invoice_date DATE NOT NULL,
        net_amount DECIMAL(15, 2) NOT NULL,
        vat_rate DECIMAL(5, 4) NOT NULL DEFAULT 0.2300 COMMENT 'Valid rates: 0.0000, 0.1350, 0.2300',
        vat_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        total_amount DECIMAL(15, 2) NOT NULL,
        paid_amount DECIMAL(15, 2) DEFAULT 0.00,
        status ENUM('pending', 'partial', 'paid', 'overdue', 'cancelled') NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_invoice_number (invoice_number),
        INDEX idx_purchase_order_id (purchase_order_id),
        INDEX idx_status (status),
        INDEX idx_invoice_date (invoice_date)
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
        INDEX idx_action (action),
        INDEX idx_table_name (table_name),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Audit log table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Schema migrations table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ` + "`key`" + ` VARCHAR(255) NOT NULL UNIQUE,
        value LONGTEXT,
        description VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_key (` + "`key`" + `)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Site settings table created');

    await pool.query(`
      INSERT INTO site_settings (` + "`key`" + `, value, description) VALUES
      ('logo_path', '/assets/Logo.png', 'Path to company logo file - relative to public folder (matches website header)'),
      ('header_color', '#212529', 'Header background color (dark navbar from Bootstrap)'),
      ('header_logo_mode', 'image', 'Header brand display mode: image or text'),
      ('header_logo_text', 'Castlerock Homes', 'Header text shown when header_logo_mode is text'),
      ('accent_color', '#c62828', 'Accent color for highlights (primary red)'),
      ('company_name', 'Castlerock Homes', 'Company name for branding'),
      ('company_address', '', 'Company address for PO footer'),
      ('company_phone', '', 'Company phone number'),
      ('company_email', '', 'Company email address')
      ON DUPLICATE KEY UPDATE value = VALUES(value)
    `);
    console.log('✅ Site settings defaults added');

    // PO sequences table for tracking PO number generation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS po_sequences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        site_id INT NOT NULL,
        year INT NOT NULL,
        month INT NOT NULL,
        last_number INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_sequence (site_id, year, month),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ PO sequences table created');

    console.log('\n🎉 Database setup complete!\n');

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
    if (adminConn) {
      await adminConn.end();
    }
  }
}

setupDatabase();
