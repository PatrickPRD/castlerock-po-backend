-- Add nickname to workers
ALTER TABLE workers
  ADD COLUMN nickname VARCHAR(100) DEFAULT NULL AFTER last_name;
