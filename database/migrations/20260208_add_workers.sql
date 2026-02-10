-- Add workers table

CREATE TABLE IF NOT EXISTS workers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  pps_number VARCHAR(50),
  weekly_take_home DECIMAL(12, 2) DEFAULT NULL,
  weekly_cost DECIMAL(12, 2) DEFAULT NULL,
  date_of_employment DATE DEFAULT NULL,
  employee_id VARCHAR(100),
  notes TEXT,
  active TINYINT(1) NOT NULL DEFAULT 1,
  left_at DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_last_name (last_name),
  INDEX idx_employee_id (employee_id),
  INDEX idx_pps_number (pps_number),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
