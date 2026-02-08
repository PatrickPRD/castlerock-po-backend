-- Add address column to sites table if missing (idempotent for older MySQL)
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sites'
    AND COLUMN_NAME = 'address'
);

SET @sql_add_col = IF(
  @col_exists = 0,
  'ALTER TABLE sites ADD COLUMN address TEXT AFTER site_letter',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
