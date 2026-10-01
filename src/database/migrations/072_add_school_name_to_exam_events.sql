-- Migration 072: Add school_name to exam_events
-- Adds nullable school_name column to exam_events table idempotently.

ALTER TABLE exam_events ADD COLUMN IF NOT EXISTS school_name VARCHAR(240);
