-- Keep taxonomy state consistent with already-active questions created before
-- active-group validation was introduced.
UPDATE question_groups g
SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
WHERE status <> 'ACTIVE'
  AND EXISTS (
    SELECT 1
    FROM question_bank_questions q
    WHERE q.group_id = g.id
      AND q.status = 'ACTIVE'
  );
