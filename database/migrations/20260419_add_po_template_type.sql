-- ============================================================
-- Migration: Add template_type to po_templates
-- Date: 2026-04-19
-- Description: Adds a required template_type column to po_templates
--              and backfills existing rows to Materials
-- ============================================================

SET @col_exists_tpl_type = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'po_templates'
    AND COLUMN_NAME = 'template_type'
);

SET @sql_add_tpl_type = IF(
  @col_exists_tpl_type = 0,
  'ALTER TABLE po_templates ADD COLUMN template_type VARCHAR(50) NOT NULL DEFAULT ''Materials'' AFTER name',
  'SELECT 1'
);

PREPARE stmt FROM @sql_add_tpl_type;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE po_templates
SET template_type = 'Materials'
WHERE template_type IS NULL OR TRIM(template_type) = '';
