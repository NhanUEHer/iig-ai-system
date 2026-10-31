-- Cancel permission and terminal guards for late worker events.

UPDATE roles
SET permissions = permissions || '["ai_scoring.operations.cancel"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'ai_scoring.operations.cancel';

CREATE OR REPLACE FUNCTION preserve_cancelled_scoring_run()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
    NEW.status := 'CANCELLED';
    NEW.completed_at := OLD.completed_at;
    NEW.error_code := OLD.error_code;
    NEW.error_message := OLD.error_message;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preserve_cancelled_scoring_run ON iig_ai_scoring_runs;
CREATE TRIGGER trg_preserve_cancelled_scoring_run
BEFORE UPDATE ON iig_ai_scoring_runs
FOR EACH ROW EXECUTE FUNCTION preserve_cancelled_scoring_run();

CREATE OR REPLACE FUNCTION preserve_cancelled_scoring_child()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM iig_ai_scoring_runs WHERE id = NEW.scoring_run_id AND status = 'CANCELLED') THEN
    NEW.status := 'SKIPPED';
    NEW.error_code := COALESCE(OLD.error_code, 'OPERATOR_CANCELLED');
    NEW.error_message := COALESCE(OLD.error_message, 'Cancelled by an operator.');
    NEW.completed_at := COALESCE(OLD.completed_at, CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preserve_cancelled_question_run ON iig_ai_question_runs;
CREATE TRIGGER trg_preserve_cancelled_question_run
BEFORE UPDATE ON iig_ai_question_runs
FOR EACH ROW EXECUTE FUNCTION preserve_cancelled_scoring_child();

DROP TRIGGER IF EXISTS trg_preserve_cancelled_group_result ON iig_ai_group_results;
CREATE TRIGGER trg_preserve_cancelled_group_result
BEFORE UPDATE ON iig_ai_group_results
FOR EACH ROW EXECUTE FUNCTION preserve_cancelled_scoring_child();

CREATE OR REPLACE FUNCTION preserve_cancelled_scoring_outbox()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM iig_ai_scoring_runs WHERE id = NEW.scoring_run_id AND status = 'CANCELLED')
     AND OLD.status = 'DEAD_LETTER' THEN
    NEW.status := 'DEAD_LETTER';
    NEW.published_at := NULL;
    NEW.locked_at := NULL;
    NEW.locked_by := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preserve_cancelled_scoring_outbox ON iig_ai_scoring_outbox;
CREATE TRIGGER trg_preserve_cancelled_scoring_outbox
BEFORE UPDATE ON iig_ai_scoring_outbox
FOR EACH ROW EXECUTE FUNCTION preserve_cancelled_scoring_outbox();
