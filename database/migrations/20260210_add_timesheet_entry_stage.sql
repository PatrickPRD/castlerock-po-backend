-- Add stage to timesheet entries
ALTER TABLE timesheet_entries
  ADD COLUMN stage_id INT NULL AFTER location_id,
  ADD INDEX idx_stage_id (stage_id),
  ADD CONSTRAINT fk_timesheet_entries_stage
    FOREIGN KEY (stage_id) REFERENCES po_stages(id) ON DELETE SET NULL;
