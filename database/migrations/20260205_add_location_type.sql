-- Migration: Add type column to locations table
-- Date: 2026-02-05
-- Description: Adds the type field to the locations table for categorizing locations

-- Add type column to locations table (idempotent for older MySQL)
SET @col_exists = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'locations'
		AND COLUMN_NAME = 'type'
);

SET @sql_add_col = IF(
	@col_exists = 0,
	'ALTER TABLE locations ADD COLUMN type VARCHAR(100) DEFAULT NULL AFTER name',
	'SELECT 1'
);

PREPARE stmt FROM @sql_add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index for type column for better query performance
SET @idx_exists = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.STATISTICS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'locations'
		AND INDEX_NAME = 'idx_type'
);

SET @sql_add_idx = IF(
	@idx_exists = 0,
	'CREATE INDEX idx_type ON locations(type)',
	'SELECT 1'
);

PREPARE stmt FROM @sql_add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
