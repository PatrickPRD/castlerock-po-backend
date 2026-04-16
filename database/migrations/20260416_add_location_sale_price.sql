-- Migration: Add sale_price column to locations table
-- Date: 2026-04-16
-- Description: Adds a sale_price field to locations, defaulting to 0.00

-- Add sale_price column to locations table (idempotent)
SET @col_exists = (
	SELECT COUNT(*)
	FROM INFORMATION_SCHEMA.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE()
		AND TABLE_NAME = 'locations'
		AND COLUMN_NAME = 'sale_price'
);

SET @sql_add_col = IF(
	@col_exists = 0,
	'ALTER TABLE locations ADD COLUMN sale_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER type',
	'SELECT 1'
);

PREPARE stmt FROM @sql_add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
