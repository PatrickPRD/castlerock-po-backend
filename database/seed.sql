-- ========================================
-- Seed Super Admin User
-- ========================================
-- Password: Admin@123 (change after first login)

USE castlerock_po_dev;

-- Clean up existing data
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE purchase_orders;
TRUNCATE TABLE locations;
TRUNCATE TABLE sites;
TRUNCATE TABLE invoices;
SET FOREIGN_KEY_CHECKS=1;

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
  '$2b$12$06ipjAsIuEoUhYKjH2yk/eVkmf4ZciAByv9N9q8LKqSyrlCJvwPiO',
  'Super',
  'Admin',
  'super_admin',
  1
);

-- Insert System Upload User
INSERT INTO users (
  id,
  email,
  password_hash,
  first_name,
  last_name,
  role,
  active,
  reset_token,
  reset_token_expires,
  created_at,
  updated_at
) VALUES (
  99,
  'system@upload.local',
  '__SYSTEM__',
  'System',
  'Upload',
  'admin',
  1,
  NULL,
  NULL,
  '2026-02-04 12:45:50',
  '2026-02-04 12:45:50'
);

SELECT '✅ Database seeded successfully!' AS message;
SELECT CONCAT('📧 Admin Email: admin@castlerock.com') AS credentials;
SELECT CONCAT('🔑 Admin Password: Admin@123') AS password;
SELECT '⚠️  Please change the password after first login!' AS warning;
