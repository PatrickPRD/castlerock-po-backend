-- Add weekly_cost column to workers table if it does not exist
ALTER TABLE workers ADD COLUMN weekly_cost DECIMAL(12, 2) DEFAULT NULL AFTER weekly_take_home;
