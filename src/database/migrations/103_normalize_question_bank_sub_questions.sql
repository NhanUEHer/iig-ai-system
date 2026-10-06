DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_bank_sub_questions' AND column_name='prompt_html') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_bank_sub_questions' AND column_name='prompt_text') THEN ALTER TABLE question_bank_sub_questions RENAME COLUMN prompt_html TO prompt_text; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_bank_sub_questions' AND column_name='hint') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_bank_sub_questions' AND column_name='hint_html') THEN ALTER TABLE question_bank_sub_questions RENAME COLUMN hint TO hint_html; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_bank_sub_questions' AND column_name='explanation') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='question_bank_sub_questions' AND column_name='explanation_html') THEN ALTER TABLE question_bank_sub_questions RENAME COLUMN explanation TO explanation_html; END IF;
END $$;
ALTER TABLE question_bank_sub_questions ADD COLUMN IF NOT EXISTS sub_question_number INTEGER, ADD COLUMN IF NOT EXISTS question_type VARCHAR(40), ADD COLUMN IF NOT EXISTS title VARCHAR(240), ADD COLUMN IF NOT EXISTS points INTEGER;
WITH numbered AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY question_id ORDER BY display_order,id)::int number FROM question_bank_sub_questions)
UPDATE question_bank_sub_questions s SET sub_question_number=COALESCE(s.sub_question_number,n.number),question_type=COALESCE(s.question_type,q.question_type),points=COALESCE(s.points,1) FROM numbered n,question_bank_questions q WHERE s.id=n.id AND q.id=s.question_id;
ALTER TABLE question_bank_sub_questions ALTER COLUMN sub_question_number SET NOT NULL, ALTER COLUMN question_type SET NOT NULL, ALTER COLUMN points SET DEFAULT 1, ALTER COLUMN points SET NOT NULL;
