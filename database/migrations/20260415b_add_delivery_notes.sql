-- ============================================================
-- Migration: Add delivery_notes to purchase_orders and po_templates
-- Date: 2026-04-15
-- Description: Adds a delivery_notes text column to both
--              purchase_orders and po_templates tables
-- ============================================================

-- Add delivery_notes to purchase_orders
SET @col_exists_po = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'purchase_orders'
    AND COLUMN_NAME = 'delivery_notes'
);

SET @sql_add_po = IF(
  @col_exists_po = 0,
  'ALTER TABLE purchase_orders ADD COLUMN delivery_notes TEXT NULL AFTER description',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_po;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add delivery_notes to po_templates
SET @col_exists_tpl = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_templates'
    AND COLUMN_NAME = 'delivery_notes'
);

SET @sql_add_tpl = IF(
  @col_exists_tpl = 0,
  'ALTER TABLE po_templates ADD COLUMN delivery_notes TEXT NULL AFTER name',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_tpl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
