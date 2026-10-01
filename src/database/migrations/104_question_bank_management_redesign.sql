-- Question Bank management redesign (docs/question-bank-management-spec.md).
--
-- Goals of this migration, all idempotent and non-destructive:
--   1. Give question_bank_questions a backend-generated business code.
--   2. Standardise ordering on sort_order across contents, sub-questions and
--      options while keeping the legacy display_order columns intact for any
--      consumer (e.g. exam snapshotting) that still reads them.
--   3. Store content media (audio/image/video) and sub-question audio as direct
--      ID columns instead of resolving through question_bank_media.
--   4. Migrate existing media rows into the new direct ID columns.
--
-- Legacy columns (display_order, content_id, points, option_key, prompt_text,
-- tag tables, sample answers) are intentionally left in place. Dropping them is
-- out of scope for this migration because other modules and older snapshots may
-- still reference them; the new question-bank code simply stops using them.

-- 1. Business code for parent questions --------------------------------------
CREATE SEQUENCE IF NOT EXISTS question_code_seq START 1;

ALTER TABLE question_bank_questions
  ADD COLUMN IF NOT EXISTS code VARCHAR(80);

-- Backfill codes for existing rows in a deterministic order. Only rows without
-- a code are touched, so re-running is a no-op.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM question_bank_questions WHERE code IS NULL ORDER BY created_at, id
  LOOP
    UPDATE question_bank_questions
      SET code = 'QB-' || LPAD(nextval('question_code_seq')::text, 6, '0')
      WHERE id = rec.id;
  END LOOP;
END $$;

-- Keep the sequence ahead of any codes that already follow the QB-###### shape
-- (including codes created by earlier runs of this migration).
SELECT setval(
  'question_code_seq',
  GREATEST(
    (SELECT COALESCE(MAX(((regexp_match(code, '^QB-([0-9]+)$'))[1])::int), 0) FROM question_bank_questions),
    1
  ),
  (SELECT EXISTS (SELECT 1 FROM question_bank_questions WHERE code ~ '^QB-[0-9]+$'))
);

ALTER TABLE question_bank_questions ALTER COLUMN code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_question_bank_questions_code'
  ) THEN
    ALTER TABLE question_bank_questions
      ADD CONSTRAINT uq_question_bank_questions_code UNIQUE (code);
  END IF;
END $$;

-- 2. sort_order standardisation ----------------------------------------------
ALTER TABLE question_bank_contents
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE question_bank_sub_questions
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE question_bank_sub_question_options
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Normalise sort_order from the legacy display_order sequence, contiguous from 0.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY display_order, id) - 1 AS n
  FROM question_bank_contents
)
UPDATE question_bank_contents c SET sort_order = o.n FROM ordered o WHERE c.id = o.id;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY display_order, id) - 1 AS n
  FROM question_bank_sub_questions
)
UPDATE question_bank_sub_questions s SET sort_order = o.n FROM ordered o WHERE s.id = o.id;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY sub_question_id ORDER BY display_order, id) - 1 AS n
  FROM question_bank_sub_question_options
)
UPDATE question_bank_sub_question_options x SET sort_order = o.n FROM ordered o WHERE x.id = o.id;

-- 3. Direct media ID columns -------------------------------------------------
ALTER TABLE question_bank_contents
  ADD COLUMN IF NOT EXISTS audio_media_id UUID REFERENCES question_bank_media(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_media_id UUID REFERENCES question_bank_media(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS video_media_id UUID REFERENCES question_bank_media(id) ON DELETE SET NULL;

ALTER TABLE question_bank_sub_questions
  ADD COLUMN IF NOT EXISTS audio_media_id UUID REFERENCES question_bank_media(id) ON DELETE SET NULL;

-- 4. Migrate existing media rows into direct ID columns ----------------------
-- Data audit confirmed at most one media of each type per content and audio-only
-- media on sub-questions, so DISTINCT ON is a lossless projection. If future
-- data violates that assumption, the newest row per (target, type) wins and the
-- older links remain queryable through question_bank_media for manual repair.
UPDATE question_bank_contents c
SET audio_media_id = m.id
FROM (
  SELECT DISTINCT ON (content_id) id, content_id
  FROM question_bank_media
  WHERE content_id IS NOT NULL AND media_type = 'AUDIO'
  ORDER BY content_id, created_at DESC
) m
WHERE c.id = m.content_id AND c.audio_media_id IS NULL;

UPDATE question_bank_contents c
SET image_media_id = m.id
FROM (
  SELECT DISTINCT ON (content_id) id, content_id
  FROM question_bank_media
  WHERE content_id IS NOT NULL AND media_type = 'IMAGE'
  ORDER BY content_id, created_at DESC
) m
WHERE c.id = m.content_id AND c.image_media_id IS NULL;

UPDATE question_bank_contents c
SET video_media_id = m.id
FROM (
  SELECT DISTINCT ON (content_id) id, content_id
  FROM question_bank_media
  WHERE content_id IS NOT NULL AND media_type = 'VIDEO'
  ORDER BY content_id, created_at DESC
) m
WHERE c.id = m.content_id AND c.video_media_id IS NULL;

UPDATE question_bank_sub_questions s
SET audio_media_id = m.id
FROM (
  SELECT DISTINCT ON (sub_question_id) id, sub_question_id
  FROM question_bank_media
  WHERE sub_question_id IS NOT NULL AND media_type = 'AUDIO'
  ORDER BY sub_question_id, created_at DESC
) m
WHERE s.id = m.sub_question_id AND s.audio_media_id IS NULL;

-- 5. Supporting indexes ------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_qb_contents_sort ON question_bank_contents(question_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_qb_sub_questions_sort ON question_bank_sub_questions(question_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_qb_sub_question_options_sort ON question_bank_sub_question_options(sub_question_id, sort_order);
