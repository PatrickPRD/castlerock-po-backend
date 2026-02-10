-- Add leave_type to timesheet entries
ALTER TABLE timesheet_entries
  ADD COLUMN leave_type VARCHAR(40) DEFAULT NULL AFTER stage_id;
