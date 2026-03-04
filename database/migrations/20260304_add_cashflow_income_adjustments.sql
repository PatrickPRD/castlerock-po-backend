SET @house_handover_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cashflow_location_settings'
    AND column_name = 'house_handover_date'
);

SET @house_handover_sql := IF(
  @house_handover_exists = 0,
  'ALTER TABLE `cashflow_location_settings` ADD COLUMN `house_handover_date` DATE NULL AFTER `completion_date`',
  'SELECT 1'
);

PREPARE cashflow_house_handover_stmt FROM @house_handover_sql;
EXECUTE cashflow_house_handover_stmt;
DEALLOCATE PREPARE cashflow_house_handover_stmt;

SET @remove_fees_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cashflow_location_settings'
    AND column_name = 'remove_fees_percentage'
);

SET @remove_fees_sql := IF(
  @remove_fees_exists = 0,
  'ALTER TABLE `cashflow_location_settings` ADD COLUMN `remove_fees_percentage` DECIMAL(5,2) NULL AFTER `house_handover_date`',
  'SELECT 1'
);

PREPARE cashflow_remove_fees_stmt FROM @remove_fees_sql;
EXECUTE cashflow_remove_fees_stmt;
DEALLOCATE PREPARE cashflow_remove_fees_stmt;

SET @remove_vat_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'cashflow_location_settings'
    AND column_name = 'remove_vat_rate'
);

SET @remove_vat_sql := IF(
  @remove_vat_exists = 0,
  'ALTER TABLE `cashflow_location_settings` ADD COLUMN `remove_vat_rate` DECIMAL(5,3) NULL AFTER `remove_fees_percentage`',
  'SELECT 1'
);

PREPARE cashflow_remove_vat_stmt FROM @remove_vat_sql;
EXECUTE cashflow_remove_vat_stmt;
DEALLOCATE PREPARE cashflow_remove_vat_stmt;
