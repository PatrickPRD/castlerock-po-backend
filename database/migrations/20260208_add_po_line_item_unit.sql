-- Add unit column to PO line items (idempotent for older MySQL)
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_line_items'
    AND COLUMN_NAME = 'unit'
);

SET @sql_add_col = IF(
  @col_exists = 0,
  'ALTER TABLE po_line_items ADD COLUMN unit VARCHAR(50) AFTER quantity',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
