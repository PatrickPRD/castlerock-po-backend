-- ============================================================
-- Migration: Add PO Templates
-- Date: 2026-04-15
-- Description: Create po_templates and po_template_line_items
--              tables for reusable purchase order templates
-- ============================================================

-- po_templates table
SET @tbl_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_templates'
);

SET @sql_create_templates = IF(
  @tbl_exists = 0,
  'CREATE TABLE po_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    stage_id INT NULL,
    created_by INT NOT NULL,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_po_templates_active (active),
    INDEX idx_po_templates_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);

PREPARE stmt FROM @sql_create_templates;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- po_template_line_items table
SET @tbl_li_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_template_line_items'
);

SET @sql_create_template_items = IF(
  @tbl_li_exists = 0,
  'CREATE TABLE po_template_line_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL,
    line_number INT NOT NULL,
    description TEXT NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
    unit VARCHAR(50) NULL,
    unit_price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    cost_item_id INT NULL,
    cost_item_code VARCHAR(50) NULL,
    cost_item_type VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES po_templates(id) ON DELETE CASCADE,
    INDEX idx_template_line_items_template (template_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1'
);

PREPARE stmt FROM @sql_create_template_items;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
