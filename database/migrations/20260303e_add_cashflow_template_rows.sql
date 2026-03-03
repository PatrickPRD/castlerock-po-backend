SET @cashflow_template_rows_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cashflow_templates'
    AND column_name = 'template_rows_json'
);

SET @cashflow_template_rows_sql := IF(
  @cashflow_template_rows_exists = 0,
  'ALTER TABLE `cashflow_templates` ADD COLUMN `template_rows_json` LONGTEXT NULL AFTER `default_spread_json`',
  'SELECT 1'
);

PREPARE cashflow_template_rows_stmt FROM @cashflow_template_rows_sql;
EXECUTE cashflow_template_rows_stmt;
DEALLOCATE PREPARE cashflow_template_rows_stmt;
