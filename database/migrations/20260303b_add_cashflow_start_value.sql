SET @cashflow_start_value_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cashflow_settings'
    AND column_name = 'overall_start_value'
);

SET @cashflow_start_value_sql := IF(
  @cashflow_start_value_exists = 0,
  'ALTER TABLE `cashflow_settings` ADD COLUMN `overall_start_value` DECIMAL(15,2) NULL AFTER `overall_start_date`',
  'SELECT 1'
);

PREPARE cashflow_stmt FROM @cashflow_start_value_sql;
EXECUTE cashflow_stmt;
DEALLOCATE PREPARE cashflow_stmt;
