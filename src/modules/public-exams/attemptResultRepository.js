function mapSection(row) {
  return {
    sectionId: row.section_id, sectionTitle: row.section_title, examMode: row.exam_mode,
    scoreScaleId: row.score_scale_id, scoreScaleCode: row.score_scale_code,
    scoreScaleVersion: Number(row.score_scale_version || 1), totalQuestions: Number(row.total_questions || 0),
    answeredCount: Number(row.answered_count || 0), unansweredCount: Number(row.unanswered_count || 0),
    correctCount: Number(row.correct_count || 0), incorrectCount: Number(row.incorrect_count || 0),
    exactScore: Number(row.exact_score || 0), scoreRangeMin: Number(row.score_range_min || 0),
    scoreRangeMax: Number(row.score_range_max || 0), minPossibleScore: Number(row.min_possible_score || 0),
    maxPossibleScore: Number(row.max_possible_score || 0), scoringSnapshot: row.scoring_snapshot,
  };
}

async function persist(client, attemptId, evaluation, now, { capDurationAtExpiry = false } = {}) {
  const answers = evaluation.items.map(item => ({
    question_id: item.parentQuestionId, sub_question_id: item.subQuestionId,
    selected_option: item.selectedOption || null, is_flagged: item.flagged === true,
    is_correct: item.isCorrect, score: item.score, answered_at: item.savedAt || now,
  }));
  if (answers.length) await client.query(
    `INSERT INTO exam_attempt_answers(
       attempt_id,question_id,sub_question_id,selected_option,is_flagged,is_correct,score,answered_at,created_at,updated_at
     ) SELECT $1,x.question_id,x.sub_question_id,x.selected_option,x.is_flagged,x.is_correct,x.score,x.answered_at,$2,$2
     FROM jsonb_to_recordset($3::jsonb) AS x(
       question_id uuid,sub_question_id uuid,selected_option text,is_flagged boolean,is_correct boolean,score numeric,answered_at timestamptz
     ) ON CONFLICT(attempt_id,sub_question_id) WHERE sub_question_id IS NOT NULL
     DO UPDATE SET selected_option=EXCLUDED.selected_option,is_flagged=EXCLUDED.is_flagged,
       is_correct=EXCLUDED.is_correct,score=EXCLUDED.score,answered_at=EXCLUDED.answered_at,updated_at=EXCLUDED.updated_at`,
    [attemptId, now, JSON.stringify(answers)],
  );

  if (evaluation.sectionResults.length) await client.query(
    `INSERT INTO exam_attempt_section_scores(
       attempt_id,section_id,section_title,exam_mode,score_scale_id,score_scale_code,score_scale_version,
       total_questions,answered_count,unanswered_count,correct_count,incorrect_count,exact_score,
       score_range_min,score_range_max,min_possible_score,max_possible_score,scoring_snapshot,created_at,updated_at
     ) SELECT $1,x.section_id,x.section_title,x.exam_mode,x.score_scale_id,x.score_scale_code,x.score_scale_version,
       x.total_questions,x.answered_count,x.unanswered_count,x.correct_count,x.incorrect_count,x.exact_score,
       x.score_range_min,x.score_range_max,x.min_possible_score,x.max_possible_score,x.scoring_snapshot,$2,$2
     FROM jsonb_to_recordset($3::jsonb) AS x(
       section_id uuid,section_title text,exam_mode text,score_scale_id uuid,score_scale_code text,score_scale_version integer,
       total_questions integer,answered_count integer,unanswered_count integer,correct_count integer,incorrect_count integer,
       exact_score numeric,score_range_min numeric,score_range_max numeric,min_possible_score numeric,max_possible_score numeric,scoring_snapshot jsonb
     ) ON CONFLICT(attempt_id,section_id) DO UPDATE SET
       section_title=EXCLUDED.section_title,exam_mode=EXCLUDED.exam_mode,score_scale_id=EXCLUDED.score_scale_id,
       score_scale_code=EXCLUDED.score_scale_code,score_scale_version=EXCLUDED.score_scale_version,
       total_questions=EXCLUDED.total_questions,answered_count=EXCLUDED.answered_count,
       unanswered_count=EXCLUDED.unanswered_count,correct_count=EXCLUDED.correct_count,
       incorrect_count=EXCLUDED.incorrect_count,exact_score=EXCLUDED.exact_score,
       score_range_min=EXCLUDED.score_range_min,score_range_max=EXCLUDED.score_range_max,
       min_possible_score=EXCLUDED.min_possible_score,max_possible_score=EXCLUDED.max_possible_score,
       scoring_snapshot=EXCLUDED.scoring_snapshot,updated_at=EXCLUDED.updated_at`,
    [attemptId, now, JSON.stringify(evaluation.sectionResults.map(section => ({
      section_id: section.sectionId, section_title: section.sectionTitle, exam_mode: section.examMode,
      score_scale_id: section.scoreScaleId, score_scale_code: section.scoreScaleCode, score_scale_version: section.scoreScaleVersion,
      total_questions: section.totalQuestions, answered_count: section.answeredCount, unanswered_count: section.unansweredCount,
      correct_count: section.correctCount, incorrect_count: section.incorrectCount, exact_score: section.exactScore,
      score_range_min: section.scoreRangeMin, score_range_max: section.scoreRangeMax,
      min_possible_score: section.minPossibleScore, max_possible_score: section.maxPossibleScore,
      scoring_snapshot: section.scoringSnapshot,
    })))],
  );

  const submittedAt = capDurationAtExpiry ? 'LEAST($2,expires_at)' : '$2';
  return (await client.query(
    `UPDATE exam_attempts SET status='SUBMITTED',submitted_at=$2,total_score=$3,
       total_questions=$4,answered_count=$5,unanswered_count=$6,correct_count=$7,incorrect_count=$8,
       score_range_min=$9,score_range_max=$10,max_score=$11,scored_at=$2,scoring_version=$12,
       part_breakdown=$13::jsonb,
       duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM (${submittedAt}-started_at))::int),last_activity_at=$2,updated_at=$2
     WHERE id=$1 RETURNING *`,
    [attemptId, now, evaluation.totalScore, evaluation.totalQuestions, evaluation.answeredCount,
      evaluation.unansweredCount, evaluation.correctCount, evaluation.incorrectCount,
      evaluation.scoreRangeMin, evaluation.scoreRangeMax, evaluation.maxScore, evaluation.scoringVersion,
      JSON.stringify(evaluation.partBreakdown || [])],
  )).rows[0];
}

async function loadSections(client, attemptId) {
  const result = await client.query('SELECT * FROM exam_attempt_section_scores WHERE attempt_id=$1 ORDER BY created_at,id', [attemptId]);
  return result.rows.map(mapSection);
}

function summary(attempt, sections) {
  return {
    totalQuestions: Number(attempt.total_questions || 0), answeredCount: Number(attempt.answered_count || 0),
    unansweredCount: Number(attempt.unanswered_count || 0), correctCount: Number(attempt.correct_count || 0),
    incorrectCount: Number(attempt.incorrect_count || 0), totalScore: Number(attempt.total_score || 0),
    scoreRangeMin: Number(attempt.score_range_min || 0), scoreRangeMax: Number(attempt.score_range_max || 0),
    maxScore: Number(attempt.max_score || 0), scoringVersion: attempt.scoring_version || null,
    sectionResults: sections,
    partBreakdown: Array.isArray(attempt.part_breakdown) ? attempt.part_breakdown : [],
  };
}

module.exports = { persist, loadSections, summary };
