-- Add PO traceability columns to cost_item_cost_history
-- Allows history rows created from PO line items to reference back to the originating PO and line

SET @po_id_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cost_item_cost_history'
    AND COLUMN_NAME = 'po_id'
);

SET @sql_add_po_id = IF(
  @po_id_exists = 0,
  'ALTER TABLE cost_item_cost_history ADD COLUMN po_id INT NULL DEFAULT NULL AFTER change_source',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_po_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @po_line_number_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cost_item_cost_history'
    AND COLUMN_NAME = 'po_line_number'
);

SET @sql_add_po_line_number = IF(
  @po_line_number_exists = 0,
  'ALTER TABLE cost_item_cost_history ADD COLUMN po_line_number SMALLINT UNSIGNED NULL DEFAULT NULL AFTER po_id',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_po_line_number;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @po_id_idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cost_item_cost_history'
    AND INDEX_NAME = 'idx_cost_history_po_id'
);

SET @sql_add_po_id_idx = IF(
  @po_id_idx_exists = 0,
  'ALTER TABLE cost_item_cost_history ADD INDEX idx_cost_history_po_id (po_id)',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_po_id_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
