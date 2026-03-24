CREATE TABLE IF NOT EXISTS `cashflow_capital_costs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `cost_ex_vat` DECIMAL(15,2) NOT NULL,
  `vat_rate` DECIMAL(5,3) NOT NULL,
  `total_inc_vat` DECIMAL(15,2) NOT NULL,
  `date_applied` DATE NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cashflow_capital_costs_date_applied` (`date_applied`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
