-- Create site settings table for logo and styling
CREATE TABLE IF NOT EXISTS `site_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(255) NOT NULL UNIQUE,
  `value` LONGTEXT,
  `description` VARCHAR(500),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default settings
INSERT INTO `site_settings` (`key`, `value`, `description`) VALUES
('logo_path', 'assets/Logo.png', 'Path to company logo file - relative to public folder (matches website header)'),
('header_color', '#212529', 'Header background color (dark navbar from Bootstrap)'),
('accent_color', '#c62828', 'Accent color for highlights (primary red)'),
('company_name', 'Castlerock Homes', 'Company name for branding'),
('company_address', '', 'Company address for PO footer'),
('company_phone', '', 'Company phone number'),
('company_email', '', 'Company email address')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
