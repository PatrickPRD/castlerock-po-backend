-- Migration: Add expected_spent column to locations table
-- Date: 2026-04-16
-- Description: Adds an expected_spent field to locations for tracking anticipated expenditure

-- Add expected_spent column to locations table (idempotent)
SET @col_exists = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'locations'
		AND COLUMN_NAME = 'expected_spent'
);

SET @sql_add_col = IF(
	@col_exists = 0,
	'ALTER TABLE locations ADD COLUMN expected_spent DECIMAL(15, 2) DEFAULT NULL AFTER floor_area',
	'SELECT 1'
);

PREPARE stmt FROM @sql_add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
