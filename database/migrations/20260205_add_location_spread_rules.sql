-- Add location spread rule tables

CREATE TABLE IF NOT EXISTS location_spread_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  source_location_id INT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_source_location (source_location_id),
  FOREIGN KEY (source_location_id) REFERENCES locations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS location_spread_rule_sites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id INT NOT NULL,
  site_id INT NOT NULL,
  spread_all TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_rule_site (rule_id, site_id),
  FOREIGN KEY (rule_id) REFERENCES location_spread_rules(id) ON DELETE CASCADE,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS location_spread_rule_locations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_site_id INT NOT NULL,
  location_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_rule_site_location (rule_site_id, location_id),
  FOREIGN KEY (rule_site_id) REFERENCES location_spread_rule_sites(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
