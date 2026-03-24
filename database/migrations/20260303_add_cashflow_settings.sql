CREATE TABLE IF NOT EXISTS `cashflow_settings` (
  `id` TINYINT UNSIGNED NOT NULL,
  `overall_start_date` DATE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cashflow_location_settings` (
  `location_id` INT NOT NULL,
  `include_in_cashflow` TINYINT(1) NOT NULL DEFAULT 0,
  `estimated_construction_cost` DECIMAL(15,2) NULL,
  `predicted_spend_percentage` DECIMAL(5,2) NULL,
  `spend_timescale_months` INT NULL,
  `selling_price` DECIMAL(15,2) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`location_id`),
  CONSTRAINT `fk_cashflow_location_settings_location`
    FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
