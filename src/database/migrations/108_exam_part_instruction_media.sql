-- Give Part instruction audio its own media ownership target.
ALTER TABLE question_bank_media
  ADD COLUMN IF NOT EXISTS part_id UUID REFERENCES exam_parts(id) ON DELETE CASCADE;

ALTER TABLE question_bank_media ALTER COLUMN question_id DROP NOT NULL;

ALTER TABLE question_bank_media DROP CONSTRAINT IF EXISTS chk_qb_v3_media_target;
ALTER TABLE question_bank_media ADD CONSTRAINT chk_qb_v3_media_target CHECK (
  (part_id IS NOT NULL AND question_id IS NULL AND content_id IS NULL AND sub_question_id IS NULL AND sample_answer_id IS NULL) OR
  (part_id IS NULL AND question_id IS NOT NULL AND (
    (content_id IS NOT NULL AND sub_question_id IS NULL AND sample_answer_id IS NULL) OR
    (content_id IS NULL AND sub_question_id IS NOT NULL AND sample_answer_id IS NULL) OR
    (content_id IS NULL AND sub_question_id IS NULL AND sample_answer_id IS NOT NULL) OR
    (content_id IS NULL AND sub_question_id IS NULL AND sample_answer_id IS NULL)
  ))
);

CREATE INDEX IF NOT EXISTS idx_question_bank_media_part ON question_bank_media(part_id);

ALTER TABLE question_bank_media DROP CONSTRAINT IF EXISTS chk_question_bank_media_duration;
ALTER TABLE question_bank_media ADD CONSTRAINT chk_question_bank_media_duration CHECK (
  duration_seconds IS NULL OR duration_seconds > 0
);
