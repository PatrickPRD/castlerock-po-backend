CREATE TABLE IF NOT EXISTS cost_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  type VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  cost_per DECIMAL(15, 2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  last_updated TIMESTAMP NULL DEFAULT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_cost_items_code (code),
  INDEX idx_cost_items_type (type),
  INDEX idx_cost_items_unit (unit),
  INDEX idx_cost_items_deleted (is_deleted),
  INDEX idx_cost_items_type_deleted (type, is_deleted),
  INDEX idx_cost_items_code_deleted (code, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @cost_item_id_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_line_items'
    AND COLUMN_NAME = 'cost_item_id'
);

SET @sql_add_cost_item_id = IF(
  @cost_item_id_exists = 0,
  'ALTER TABLE po_line_items ADD COLUMN cost_item_id INT NULL AFTER po_id',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_cost_item_id;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @cost_item_code_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_line_items'
    AND COLUMN_NAME = 'cost_item_code'
);

SET @sql_add_cost_item_code = IF(
  @cost_item_code_exists = 0,
  'ALTER TABLE po_line_items ADD COLUMN cost_item_code VARCHAR(32) NULL AFTER cost_item_id',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_cost_item_code;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @cost_item_type_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_line_items'
    AND COLUMN_NAME = 'cost_item_type'
);

SET @sql_add_cost_item_type = IF(
  @cost_item_type_exists = 0,
  'ALTER TABLE po_line_items ADD COLUMN cost_item_type VARCHAR(120) NULL AFTER cost_item_code',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_cost_item_type;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @po_line_items_cost_item_id_index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_line_items'
    AND INDEX_NAME = 'idx_po_line_items_cost_item_id'
);

SET @sql_add_po_line_items_cost_item_id_index = IF(
  @po_line_items_cost_item_id_index_exists = 0,
  'ALTER TABLE po_line_items ADD INDEX idx_po_line_items_cost_item_id (cost_item_id)',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_po_line_items_cost_item_id_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @po_line_items_cost_item_code_index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_line_items'
    AND INDEX_NAME = 'idx_po_line_items_cost_item_code'
);

SET @sql_add_po_line_items_cost_item_code_index = IF(
  @po_line_items_cost_item_code_index_exists = 0,
  'ALTER TABLE po_line_items ADD INDEX idx_po_line_items_cost_item_code (cost_item_code)',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_po_line_items_cost_item_code_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @po_line_items_cost_item_type_index_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_line_items'
    AND INDEX_NAME = 'idx_po_line_items_cost_item_type'
);

SET @sql_add_po_line_items_cost_item_type_index = IF(
  @po_line_items_cost_item_type_index_exists = 0,
  'ALTER TABLE po_line_items ADD INDEX idx_po_line_items_cost_item_type (cost_item_type)',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_po_line_items_cost_item_type_index;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @po_line_items_cost_item_fk_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_line_items'
    AND CONSTRAINT_NAME = 'fk_po_line_items_cost_item'
);

SET @sql_add_po_line_items_cost_item_fk = IF(
  @po_line_items_cost_item_fk_exists = 0,
  'ALTER TABLE po_line_items ADD CONSTRAINT fk_po_line_items_cost_item FOREIGN KEY (cost_item_id) REFERENCES cost_items(id) ON DELETE SET NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_po_line_items_cost_item_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO site_settings (`key`, `value`, `description`)
VALUES
  ('cost_warning_yellow_threshold', '3', 'Yellow warning threshold percentage for construction cost comparison'),
  ('cost_warning_red_threshold', '3', 'Red warning threshold percentage for construction cost comparison')
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`);