-- Add leave allowance defaults to site settings
INSERT INTO `site_settings` (`key`, `value`, `description`) VALUES
('sick_days_per_year', '0', 'Default sick days per worker per year'),
('annual_leave_days_per_year', '0', 'Default annual leave days per worker per year'),
('bank_holidays_per_year', '0', 'Default bank holidays per worker per year')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
