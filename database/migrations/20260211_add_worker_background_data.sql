-- Add background data fields to workers table
-- Email, Bank Details, Address, Mobile Number

ALTER TABLE workers
ADD COLUMN email VARCHAR(255) DEFAULT NULL AFTER last_name,
ADD COLUMN mobile_number VARCHAR(20) DEFAULT NULL AFTER email,
ADD COLUMN address TEXT DEFAULT NULL AFTER mobile_number,
ADD COLUMN bank_details VARCHAR(255) DEFAULT NULL AFTER address;

-- Create indexes for commonly searched fields
CREATE INDEX idx_worker_email ON workers(email);
CREATE INDEX idx_worker_mobile ON workers(mobile_number);
