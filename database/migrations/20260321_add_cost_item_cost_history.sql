CREATE TABLE IF NOT EXISTS cost_item_cost_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cost_item_id INT NOT NULL,
  old_cost_per DECIMAL(15, 2) NOT NULL,
  new_cost_per DECIMAL(15, 2) NOT NULL,
  changed_by INT NULL,
  change_source VARCHAR(30) NOT NULL DEFAULT 'manual',
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cost_history_cost_item (cost_item_id),
  INDEX idx_cost_history_changed_at (changed_at),
  CONSTRAINT fk_cost_history_cost_item FOREIGN KEY (cost_item_id) REFERENCES cost_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;