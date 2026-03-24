SET @cashflow_template_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cashflow_location_settings'
    AND column_name = 'template_key'
);

SET @cashflow_template_sql := IF(
  @cashflow_template_exists = 0,
  'ALTER TABLE `cashflow_location_settings` ADD COLUMN `template_key` VARCHAR(80) NULL AFTER `selling_price`',
  'SELECT 1'
);

PREPARE cashflow_template_stmt FROM @cashflow_template_sql;
EXECUTE cashflow_template_stmt;
DEALLOCATE PREPARE cashflow_template_stmt;

SET @cashflow_weekly_spread_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cashflow_location_settings'
    AND column_name = 'weekly_spread_json'
);

SET @cashflow_weekly_spread_sql := IF(
  @cashflow_weekly_spread_exists = 0,
  'ALTER TABLE `cashflow_location_settings` ADD COLUMN `weekly_spread_json` LONGTEXT NULL AFTER `template_key`',
  'SELECT 1'
);

PREPARE cashflow_weekly_spread_stmt FROM @cashflow_weekly_spread_sql;
EXECUTE cashflow_weekly_spread_stmt;
DEALLOCATE PREPARE cashflow_weekly_spread_stmt;
