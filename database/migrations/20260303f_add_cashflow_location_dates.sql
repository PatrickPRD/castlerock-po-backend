SET @start_on_site_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cashflow_location_settings'
    AND column_name = 'start_on_site_date'
);

SET @start_on_site_sql := IF(
  @start_on_site_exists = 0,
  'ALTER TABLE `cashflow_location_settings` ADD COLUMN `start_on_site_date` DATE NULL AFTER `selling_price`',
  'SELECT 1'
);

PREPARE cashflow_start_site_stmt FROM @start_on_site_sql;
EXECUTE cashflow_start_site_stmt;
DEALLOCATE PREPARE cashflow_start_site_stmt;

SET @completion_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cashflow_location_settings'
    AND column_name = 'completion_date'
);

SET @completion_sql := IF(
  @completion_exists = 0,
  'ALTER TABLE `cashflow_location_settings` ADD COLUMN `completion_date` DATE NULL AFTER `start_on_site_date`',
  'SELECT 1'
);

PREPARE cashflow_completion_stmt FROM @completion_sql;
EXECUTE cashflow_completion_stmt;
DEALLOCATE PREPARE cashflow_completion_stmt;
