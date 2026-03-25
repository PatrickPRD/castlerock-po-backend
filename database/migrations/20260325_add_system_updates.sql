CREATE TABLE IF NOT EXISTS system_updates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  description TEXT,
  file_count INT NOT NULL DEFAULT 0,
  migration_count INT NOT NULL DEFAULT 0,
  status ENUM('pending', 'previewed', 'applied', 'failed') NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMP NULL DEFAULT NULL,
  applied_by INT NULL,
  error_message TEXT,
  files_summary JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_system_updates_status (status),
  INDEX idx_system_updates_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
