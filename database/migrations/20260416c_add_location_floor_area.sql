-- Migration: Add floor_area column to locations table
-- Date: 2026-04-16
-- Description: Adds a floor_area field (sqm) to locations, defaulting to NULL

-- Add floor_area column to locations table (idempotent)
SET @col_exists = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'locations'
		AND COLUMN_NAME = 'floor_area'
);

SET @sql_add_col = IF(
	@col_exists = 0,
	'ALTER TABLE locations ADD COLUMN floor_area DECIMAL(12, 2) DEFAULT NULL AFTER sale_price',
	'SELECT 1'
);

PREPARE stmt FROM @sql_add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
