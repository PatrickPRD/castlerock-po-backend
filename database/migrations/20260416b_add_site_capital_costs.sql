-- Create site_capital_costs table if it doesn't exist
CREATE TABLE IF NOT EXISTS site_capital_costs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  site_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cost DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  INDEX idx_site_capital_costs_site_id (site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
