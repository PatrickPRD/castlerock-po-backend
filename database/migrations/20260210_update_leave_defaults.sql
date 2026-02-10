-- Update leave defaults
UPDATE site_settings
SET value = '3'
WHERE `key` = 'sick_days_per_year';

UPDATE site_settings
SET value = '20'
WHERE `key` = 'annual_leave_days_per_year';

UPDATE site_settings
SET value = '10'
WHERE `key` = 'bank_holidays_per_year';
