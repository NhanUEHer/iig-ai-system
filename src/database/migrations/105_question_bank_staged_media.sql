-- Allow question media to be uploaded before a content/sub-question row exists.
-- Staged rows keep question_id and have no concrete target until the bulk-save
-- transaction attaches them.
ALTER TABLE question_bank_media DROP CONSTRAINT IF EXISTS chk_qb_v3_media_target;
ALTER TABLE question_bank_media ADD CONSTRAINT chk_qb_v3_media_target CHECK (
  (content_id IS NOT NULL AND sub_question_id IS NULL AND sample_answer_id IS NULL) OR
  (content_id IS NULL AND sub_question_id IS NOT NULL AND sample_answer_id IS NULL) OR
  (content_id IS NULL AND sub_question_id IS NULL AND sample_answer_id IS NOT NULL) OR
  (content_id IS NULL AND sub_question_id IS NULL AND sample_answer_id IS NULL)
);
