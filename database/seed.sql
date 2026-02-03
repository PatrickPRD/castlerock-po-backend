-- ========================================
-- Seed Super Admin User
-- ========================================
-- Password: Admin@123 (change after first login)

USE castlerock_dev;

-- Insert Super Admin User
-- Password hash for: Admin@123
INSERT INTO users (
  email,
  password_hash,
  first_name,
  last_name,
  role,
  active
) VALUES (
  'admin@castlerock.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWeCrHuG',
  'Super',
  'Admin',
  'super_admin',
  1
);

-- Insert sample locations
INSERT INTO locations (name, code, address, active) VALUES
('Main Warehouse', 'MAIN', '123 Main St, City, State 12345', 1),
('Branch Office', 'BRANCH', '456 Branch Ave, City, State 12345', 1),
('Store Location 1', 'STORE01', '789 Store Blvd, City, State 12345', 1);

-- Insert sample suppliers
INSERT INTO suppliers (name, contact_person, email, phone, active) VALUES
('ABC Supplies Inc', 'John Doe', 'john@abcsupplies.com', '555-0100', 1),
('XYZ Trading Co', 'Jane Smith', 'jane@xyztrading.com', '555-0200', 1),
('Global Parts Ltd', 'Mike Johnson', 'mike@globalparts.com', '555-0300', 1);

SELECT '✅ Database seeded successfully!' AS message;
SELECT CONCAT('📧 Admin Email: admin@castlerock.com') AS credentials;
SELECT CONCAT('🔑 Admin Password: Admin@123') AS password;
SELECT '⚠️  Please change the password after first login!' AS warning;
