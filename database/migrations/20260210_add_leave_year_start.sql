-- Add leave year start setting
INSERT INTO `site_settings` (`key`, `value`, `description`) VALUES
('leave_year_start', '01-01', 'Leave year start date (MM-DD)')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
