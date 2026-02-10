-- Add login_id column to workers table
ALTER TABLE workers ADD COLUMN login_id VARCHAR(100) DEFAULT NULL AFTER date_of_employment;
