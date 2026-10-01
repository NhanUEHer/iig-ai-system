-- Migration 070: Add question_name to Question Bank Questions
-- Adds question_name VARCHAR(240) NOT NULL DEFAULT '' column to question_bank_questions

ALTER TABLE question_bank_questions ADD COLUMN IF NOT EXISTS question_name VARCHAR(240) NOT NULL DEFAULT '';
