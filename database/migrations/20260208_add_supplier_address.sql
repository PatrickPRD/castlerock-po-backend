-- Add address column to suppliers table if missing
ALTER TABLE `suppliers`
  ADD COLUMN IF NOT EXISTS `address` TEXT AFTER `phone`;
