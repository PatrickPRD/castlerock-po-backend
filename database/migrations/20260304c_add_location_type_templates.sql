-- Add template_key to cashflow_location_settings to link locations to templates
ALTER TABLE `cashflow_location_settings` 
ADD COLUMN `template_key` VARCHAR(80) NULL AFTER `selling_price`,
ADD FOREIGN KEY (`template_key`) REFERENCES `cashflow_templates`(`template_key`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Create mapping table for location types to templates
CREATE TABLE IF NOT EXISTS `cashflow_location_type_templates` (
  `location_type` VARCHAR(100) NOT NULL,
  `template_key` VARCHAR(80) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`location_type`),
  FOREIGN KEY (`template_key`) REFERENCES `cashflow_templates`(`template_key`) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX `idx_template_key` (`template_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
