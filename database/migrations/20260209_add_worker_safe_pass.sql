-- Add safe pass fields to workers
ALTER TABLE workers
  ADD COLUMN safe_pass_number VARCHAR(100) DEFAULT NULL AFTER weekly_cost,
  ADD COLUMN safe_pass_expiry_date DATE DEFAULT NULL AFTER safe_pass_number;
