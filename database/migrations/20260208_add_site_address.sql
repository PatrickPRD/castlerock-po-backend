-- Add address column to sites table if missing
ALTER TABLE `sites`
  ADD COLUMN IF NOT EXISTS `address` TEXT AFTER `site_letter`;
