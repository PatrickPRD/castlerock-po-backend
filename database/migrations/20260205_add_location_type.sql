-- Migration: Add type column to locations table
-- Date: 2026-02-05
-- Description: Adds the type field to the locations table for categorizing locations

-- Add type column to locations table
ALTER TABLE locations 
ADD COLUMN type VARCHAR(100) DEFAULT NULL AFTER name;

-- Add index for type column for better query performance
CREATE INDEX idx_type ON locations(type);
