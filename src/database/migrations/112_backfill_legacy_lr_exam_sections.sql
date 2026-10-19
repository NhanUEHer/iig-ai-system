-- Preserve editable legacy Listening/Reading exams when introducing Sections.
-- Only exams whose Parts can be classified unambiguously are migrated.
DO $$
DECLARE
  exam_row RECORD;
  part_row RECORD;
  new_section_id UUID;
  detected_type VARCHAR(32);
  detected_mode VARCHAR(32);
  child_count INTEGER;
BEGIN
  FOR exam_row IN
    SELECT e.id
    FROM exams e
    WHERE NOT EXISTS (SELECT 1 FROM exam_sections s WHERE s.exam_id=e.id)
      AND EXISTS (SELECT 1 FROM exam_parts p WHERE p.exam_id=e.id)
      AND NOT EXISTS (
        SELECT 1 FROM exam_parts p
        WHERE p.exam_id=e.id
          AND LOWER(COALESCE(p.part_label,p.title,'')) NOT LIKE '%listening%'
          AND LOWER(COALESCE(p.part_label,p.title,'')) NOT LIKE '%reading%'
      )
  LOOP
    SELECT CASE
      WHEN BOOL_OR(LOWER(COALESCE(part_label,title,'')) LIKE '%listening%')
       AND BOOL_OR(LOWER(COALESCE(part_label,title,'')) LIKE '%reading%') THEN 'LISTENING_READING'
      WHEN BOOL_OR(LOWER(COALESCE(part_label,title,'')) LIKE '%listening%') THEN 'LISTENING'
      ELSE 'READING'
    END
    INTO detected_type
    FROM exam_parts WHERE exam_id=exam_row.id;

    UPDATE exams SET exam_type=COALESCE(exam_type,detected_type) WHERE id=exam_row.id;

    FOR part_row IN
      SELECT * FROM exam_parts
      WHERE exam_id=exam_row.id AND section_id IS NULL
      ORDER BY display_order,part_number,id
    LOOP
      detected_mode := CASE
        WHEN LOWER(COALESCE(part_row.part_label,part_row.title,'')) LIKE '%listening%' THEN 'NON_STOP'
        ELSE 'FREESTYLE'
      END;
      SELECT COUNT(*)::int INTO child_count
      FROM exam_part_questions epq
      JOIN question_bank_sub_questions sq ON sq.question_id=epq.question_id
      WHERE epq.part_id=part_row.id;

      INSERT INTO exam_sections(
        exam_id,title,exam_mode,question_count,configured_duration_seconds,sort_order
      ) VALUES (
        exam_row.id,
        part_row.title,
        detected_mode,
        GREATEST(child_count,1),
        GREATEST(COALESCE(part_row.duration_minutes,0)*60,1),
        COALESCE(part_row.display_order,part_row.part_number-1,0)
      ) RETURNING id INTO new_section_id;

      UPDATE exam_parts SET
        section_id=new_section_id,
        instruction_html=COALESCE(instruction_html,instruction),
        configured_duration_seconds=GREATEST(
          configured_duration_seconds,
          COALESCE(duration_minutes,0)*60
        ),
        sort_order=0
      WHERE id=part_row.id;
    END LOOP;
  END LOOP;
END $$;
