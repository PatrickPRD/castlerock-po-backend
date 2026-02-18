-- Add favicon and app icon settings
INSERT INTO `site_settings` (`key`, `value`, `description`) VALUES
('favicon_16_path', NULL, 'Path to 16x16 favicon'),
('apple_touch_icon_path', NULL, 'Path to Apple Touch Icon (180x180)'),
('android_chrome_192_path', NULL, 'Path to Android Chrome icon (192x192)'),
('android_chrome_512_path', NULL, 'Path to Android Chrome icon (512x512)')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
