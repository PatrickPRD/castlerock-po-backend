CREATE TABLE IF NOT EXISTS `cashflow_templates` (
  `template_key` VARCHAR(80) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `week_count` INT NOT NULL,
  `default_spread_json` LONGTEXT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`template_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `cashflow_templates` (`template_key`, `name`, `week_count`, `default_spread_json`, `active`)
VALUES
  ('even_8_weeks', 'Even Spread (8 Weeks)', 8, '[12.5,12.5,12.5,12.5,12.5,12.5,12.5,12.5]', 1),
  ('front_loaded_12_weeks', 'Front Loaded (12 Weeks)', 12, '[16,14,12,11,10,9,8,6,5,4,3,2]', 1),
  ('back_loaded_12_weeks', 'Back Loaded (12 Weeks)', 12, '[2,3,4,5,6,8,9,10,11,12,14,16]', 1)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `week_count` = VALUES(`week_count`),
  `default_spread_json` = VALUES(`default_spread_json`),
  `active` = VALUES(`active`);
