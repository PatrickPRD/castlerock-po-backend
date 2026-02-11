-- ========================================
-- Castlerock PO Tracker - Complete Database Schema
-- ========================================

DROP DATABASE IF EXISTS castlerock_po_dev;
CREATE DATABASE castlerock_po_dev;
USE castlerock_po_dev;

-- ========================================
-- USERS TABLE
-- ========================================
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `role` ENUM('super_admin', 'admin', 'staff', 'user', 'viewer') NOT NULL DEFAULT 'user',
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `reset_token` VARCHAR(255) DEFAULT NULL,
  `reset_token_expires` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_role` (`role`),
  INDEX `idx_active` (`active`),
  INDEX `idx_reset_token` (`reset_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- SITES TABLE
-- ========================================
CREATE TABLE `sites` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `site_letter` VARCHAR(1) NOT NULL,
  `address` TEXT,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_site_letter` (`site_letter`),
  INDEX `idx_name` (`name`),
  INDEX `idx_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- SITE LETTERS TABLE (dynamic mapping)
-- ========================================
CREATE TABLE `site_letters` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `site_id` INT NOT NULL,
  `letter` VARCHAR(1) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_letter` (`letter`),
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE CASCADE,
  INDEX `idx_site_id` (`site_id`),
  INDEX `idx_letter` (`letter`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- LOCATIONS TABLE (linked to sites)
-- ========================================
CREATE TABLE `locations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `type` VARCHAR(100) DEFAULT NULL,
  `site_id` INT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE RESTRICT,
  INDEX `idx_name` (`name`),
  INDEX `idx_type` (`type`),
  INDEX `idx_site_id` (`site_id`),
  INDEX `idx_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- LOCATION SPREAD RULES
-- ========================================
CREATE TABLE `location_spread_rules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `source_location_id` INT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_source_location` (`source_location_id`),
  FOREIGN KEY (`source_location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `idx_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `location_spread_rule_sites` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rule_id` INT NOT NULL,
  `site_id` INT NOT NULL,
  `spread_all` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_rule_site` (`rule_id`, `site_id`),
  FOREIGN KEY (`rule_id`) REFERENCES `location_spread_rules`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `location_spread_rule_locations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `rule_site_id` INT NOT NULL,
  `location_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_rule_site_location` (`rule_site_id`, `location_id`),
  FOREIGN KEY (`rule_site_id`) REFERENCES `location_spread_rule_sites`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- SUPPLIERS TABLE
-- ========================================
CREATE TABLE `suppliers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `contact_person` VARCHAR(255),
  `email` VARCHAR(255),
  `phone` VARCHAR(50),
  `address` TEXT,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_name` (`name`),
  INDEX `idx_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- WORKERS TABLE
-- ========================================
CREATE TABLE `workers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `nickname` VARCHAR(100) DEFAULT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `mobile_number` VARCHAR(20) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `bank_details` VARCHAR(255) DEFAULT NULL,
  `pps_number` VARCHAR(50),
  `weekly_take_home` DECIMAL(12, 2) DEFAULT NULL,
  `weekly_cost` DECIMAL(12, 2) DEFAULT NULL,
  `safe_pass_number` VARCHAR(100),
  `safe_pass_expiry_date` DATE DEFAULT NULL,
  `date_of_employment` DATE DEFAULT NULL,
  `employee_id` VARCHAR(100),
  `login_no` VARCHAR(20),
  `notes` TEXT,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `left_at` DATE DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_last_name` (`last_name`),
  INDEX `idx_login_no` (`login_no`),
  INDEX `idx_pps_number` (`pps_number`),
  INDEX `idx_email` (`email`),
  INDEX `idx_mobile_number` (`mobile_number`),
  INDEX `idx_active` (`active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TIMESHEETS TABLE
-- ========================================
CREATE TABLE `timesheets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `week_start` DATE NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_week_start` (`week_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- TIMESHEET ENTRIES TABLE
-- ========================================
CREATE TABLE `timesheet_entries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `timesheet_id` INT NOT NULL,
  `worker_id` INT NOT NULL,
  `work_date` DATE NOT NULL,
  `site_id` INT NOT NULL,
  `location_id` INT NOT NULL,
  `stage_id` INT DEFAULT NULL,
  `leave_type` VARCHAR(40) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_timesheet_worker_date` (`timesheet_id`, `worker_id`, `work_date`),
  FOREIGN KEY (`timesheet_id`) REFERENCES `timesheets`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`stage_id`) REFERENCES `po_stages`(`id`) ON DELETE SET NULL,
  INDEX `idx_worker_id` (`worker_id`),
  INDEX `idx_work_date` (`work_date`),
  INDEX `idx_stage_id` (`stage_id`),
  INDEX `idx_leave_type` (`leave_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- PO STAGES TABLE (lookup table)
-- ========================================
CREATE TABLE `po_stages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- PURCHASE ORDERS TABLE
-- ========================================
CREATE TABLE `purchase_orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `po_number` VARCHAR(100) NOT NULL UNIQUE,
  `po_date` DATE NOT NULL,
  `supplier_id` INT NOT NULL,
  `site_id` INT NOT NULL,
  `location_id` INT,
  `stage_id` INT,
  `description` TEXT,
  `net_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `vat_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0.2300 COMMENT 'Valid rates: 0.0000, 0.1350, 0.2300',
  `vat_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
  `created_by` INT NOT NULL,
  `approved_by` INT,
  `approved_at` DATETIME,
  `cancelled_by` INT,
  `cancelled_at` DATETIME,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`stage_id`) REFERENCES `po_stages`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`cancelled_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_po_number` (`po_number`),
  INDEX `idx_supplier_id` (`supplier_id`),
  INDEX `idx_site_id` (`site_id`),
  INDEX `idx_location_id` (`location_id`),
  INDEX `idx_stage_id` (`stage_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_po_date` (`po_date`),
  INDEX `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- PO LINE ITEMS TABLE
-- ========================================
CREATE TABLE `po_line_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `po_id` INT NOT NULL,
  `line_number` INT NOT NULL,
  `description` TEXT NOT NULL,
  `quantity` DECIMAL(10, 2) NOT NULL,
  `unit` VARCHAR(50),
  `unit_price` DECIMAL(15, 2) NOT NULL,
  `line_total` DECIMAL(15, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  `received_quantity` DECIMAL(10, 2) DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
  INDEX `idx_po_id` (`po_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- INVOICES TABLE
-- ========================================
CREATE TABLE `invoices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `purchase_order_id` INT NOT NULL,
  `invoice_number` VARCHAR(100) NOT NULL UNIQUE,
  `invoice_date` DATE NOT NULL,
  `net_amount` DECIMAL(15, 2) NOT NULL,
  `vat_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0.2300 COMMENT 'Valid rates: 0.0000, 0.1350, 0.2300',
  `vat_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(15, 2) NOT NULL,
  `paid_amount` DECIMAL(15, 2) DEFAULT 0.00,
  `status` ENUM('pending', 'partial', 'paid', 'overdue', 'cancelled') NOT NULL DEFAULT 'pending',
  `notes` TEXT,
  `created_by` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `idx_invoice_number` (`invoice_number`),
  INDEX `idx_purchase_order_id` (`purchase_order_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_invoice_date` (`invoice_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- AUDIT LOG TABLE
-- ========================================
CREATE TABLE `audit_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT,
  `action` VARCHAR(100) NOT NULL,
  `table_name` VARCHAR(100),
  `record_id` INT,
  `old_values` JSON,
  `new_values` JSON,
  `ip_address` VARCHAR(45),
  `user_agent` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_action` (`action`),
  INDEX `idx_table_name` (`table_name`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- SCHEMA MIGRATIONS TABLE
-- ========================================
CREATE TABLE `schema_migrations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `filename` VARCHAR(255) NOT NULL UNIQUE,
  `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- SITE SETTINGS TABLE
-- ========================================
CREATE TABLE `site_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(255) NOT NULL UNIQUE,
  `value` LONGTEXT,
  `description` VARCHAR(500),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- PO SEQUENCES TABLE
-- ========================================
CREATE TABLE `po_sequences` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `site_id` INT NOT NULL,
  `year` INT NOT NULL,
  `month` INT NOT NULL,
  `last_number` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_sequence` (`site_id`, `year`, `month`),
  FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- DEFAULT DATA
-- ========================================

-- Insert default PO stages
INSERT INTO `po_stages` (`id`, `name`) VALUES
(1, 'Site'),
(3, 'Roads & Services'),
(4, 'Boundary'),
(5, 'Setup & Admin'),
(6, 'Sub-Structure & Drainage'),
(7, 'Superstructure & Insulation'),
(8, 'Plumbing'),
(9, 'House Related Groundworks & Gardens'),
(10, '1st Fix Carpentry'),
(11, 'Windows'),
(12, '2nd Fix Carpentry'),
(13, 'Preliminaries & Scaffolding'),
(14, 'Ventilation'),
(15, 'Plastering Int & Ext'),
(16, 'Electrical'),
(17, 'Package'),
(18, 'Water Connections'),
(19, 'Painting'),
(20, 'PVC Fascia & Soffit'),
(22, 'ESB Connections'),
(23, 'Design Supervision (Incl add design & Eng works)'),
(24, 'Air/Sound/Ber Testing & Certification');

-- Insert system user for data imports
INSERT INTO `users` (`id`, `email`, `password_hash`, `first_name`, `last_name`, `role`, `active`) VALUES
(99, 'system@upload.local', '__SYSTEM__', 'System', 'Upload', 'admin', 1);

-- Insert default site settings
INSERT INTO `site_settings` (`key`, `value`, `description`) VALUES
('logo_path', '/assets/Logo.png', 'Path to company logo file - relative to public folder (matches website header)'),
('header_color', '#212529', 'Header background color (dark navbar from Bootstrap)'),
('header_logo_mode', 'image', 'Header brand display mode: image or text'),
('header_logo_text', 'Castlerock Homes', 'Header text shown when header_logo_mode is text'),
('accent_color', '#1e40af', 'Accent color for highlights'),
('currency_code', 'EUR', 'Default currency code'),
('vat_rates', '[0,13.5,23]', 'Default VAT rates (percent)'),
('sick_days_per_year', '3', 'Default sick days per worker per year'),
('annual_leave_days_per_year', '20', 'Default annual leave days per worker per year'),
('bank_holidays_per_year', '10', 'Default bank holidays per worker per year'),
('leave_year_start', '01-01', 'Leave year start date (MM-DD)'),
('company_name', 'Castlerock Homes', 'Company name for branding'),
('company_trading_name', '', 'Trading as name for branding'),
('company_address', '', 'Company address for PO footer'),
('company_vat_number', '', 'Company VAT number'),
('company_cro_number', '', 'Company CRO number'),
('company_phone', '', 'Company phone number'),
('company_email', '', 'Company email address')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

SELECT '✅ Database schema created successfully!' AS message;
SELECT 'Run the seed data file to import existing data' AS next_step;
