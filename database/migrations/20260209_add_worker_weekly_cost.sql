-- Add weekly_cost to workers
ALTER TABLE workers
  ADD COLUMN weekly_cost DECIMAL(12, 2) DEFAULT NULL AFTER weekly_take_home;
