const db = require('../../config/db');
const crypto = require('crypto');

async function findById(id) {
  const eventResult = await db.query(
    `SELECT
       ee.id, ee.event_code, ee.name, ee.description, ee.school_name,
       ee.image_storage_key, ee.banner_storage_key, ee.start_at, ee.end_at,
       ee.status,
       e.id AS exam_id, e.title AS exam_title, e.status AS exam_status,
       e.duration_minutes, e.duration_seconds, e.score_scale,
       (SELECT COALESCE(SUM(es.configured_duration_seconds),0) FROM exam_sections es WHERE es.exam_id=e.id)::int AS configured_duration_seconds,
       COUNT(DISTINCT sq.id)::int AS total_questions
     FROM exam_events ee
     JOIN exams e ON e.id = ee.exam_id
     LEFT JOIN exam_parts ep ON ep.exam_id = e.id
     LEFT JOIN exam_part_questions epq ON epq.part_id = ep.id
     LEFT JOIN question_bank_sub_questions sq ON sq.question_id = epq.question_id
     WHERE ee.id = $1
     GROUP BY ee.id, e.id`,
    [id],
  );

  const row = eventResult.rows[0];
  if (!row) return null;

  const partResult = await db.query(
    `SELECT
       ep.id, ep.title, ep.part_label, ep.display_order,
       COUNT(DISTINCT sq.id)::int AS question_count
     FROM exam_parts ep
     LEFT JOIN exam_part_questions epq ON epq.part_id = ep.id
     LEFT JOIN question_bank_sub_questions sq ON sq.question_id = epq.question_id
     WHERE ep.exam_id = $1
     GROUP BY ep.id
     ORDER BY ep.display_order, ep.part_number, ep.created_at`,
    [row.exam_id],
  );

  return {
    id: row.id,
    eventCode: row.event_code,
    name: row.name,
    description: row.description || '',
    schoolName: row.school_name || null,
    imageStorageKey: row.image_storage_key || null,
    bannerStorageKey: row.banner_storage_key || null,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    exam: {
      id: row.exam_id,
      title: row.exam_title,
      status: row.exam_status,
      durationSeconds: Number(row.configured_duration_seconds || 0) || (Number(row.duration_minutes || 0) * 60 + Number(row.duration_seconds || 0)),
      totalQuestions: Number(row.total_questions || 0),
      scoreScale: Number(row.score_scale || 100),
      parts: partResult.rows.map(part => ({
        id: part.id,
        title: part.title,
        partLabel: part.part_label || '',
        questionCount: Number(part.question_count || 0),
      })),
    },
  };
}

async function registerCandidate(eventId, data, now = new Date()) {
  return db.transaction(async client => {
    const contextResult = await client.query(
      `SELECT ee.id, ee.school_name, ee.start_at, ee.end_at, ee.status,
              e.id AS exam_id, e.status AS exam_status
       FROM exam_events ee
       JOIN exams e ON e.id = ee.exam_id
       WHERE ee.id = $1
       FOR SHARE OF ee, e`,
      [eventId],
    );
    const context = contextResult.rows[0];
    if (!context) return { context: null, candidate: null };
    const available = context.status === 'PUBLISHED'
      && context.exam_status === 'ACTIVE'
      && new Date(context.start_at).getTime() <= now.getTime()
      && new Date(context.end_at).getTime() > now.getTime();
    if (!available) return { context, candidate: null };

    // Serialise registrations for the same event and phone so browser retries do
    // not create duplicate leads without imposing a destructive unique migration.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [`${eventId}:${data.phone}`]);
    const existing = await client.query(
      `SELECT id FROM exam_candidates
       WHERE exam_event_id = $1 AND phone = $2
       ORDER BY created_at DESC LIMIT 1`,
      [eventId, data.phone],
    );
    const values = [
      eventId, data.fullName, data.email, data.phone, context.school_name,
      data.birthYear, data.toeicExperience, data.marketingConsent,
    ];
    const candidateResult = existing.rows[0]
      ? await client.query(
        `UPDATE exam_candidates
         SET full_name=$2, email=$3, phone=$4, school_name=$5, birth_year=$6,
             toeic_experience=$7, marketing_consent=$8,
             privacy_consent_at=CURRENT_TIMESTAMP, privacy_policy_version='2026-09',
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$9 AND exam_event_id=$1
         RETURNING id, full_name, school_name`,
        [...values, existing.rows[0].id],
      )
      : await client.query(
        `INSERT INTO exam_candidates(
           exam_event_id, full_name, email, phone, school_name, birth_year,
           toeic_experience, marketing_consent, privacy_consent_at, privacy_policy_version,
           candidate_number
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,'2026-09',$9)
         RETURNING id, full_name, school_name`,
        [...values, `TS-${now.getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`],
      );
    return { context, candidate: candidateResult.rows[0] };
  });
}

async function findCandidateForEvent(eventId, candidateId) {
  const result = await db.query(
    `SELECT id, full_name, school_name, exam_event_id
     FROM exam_candidates WHERE id=$1 AND exam_event_id=$2`,
    [candidateId, eventId],
  );
  return result.rows[0] || null;
}

async function startAttempt(eventId, candidateId, { audioConfirmed, now = new Date() }) {
  return db.transaction(async client => {
    const contextResult = await client.query(
      `SELECT ee.id, ee.start_at, ee.end_at, ee.status,
              e.id AS exam_id, e.status AS exam_status, e.active_version_id,
              e.duration_minutes, e.duration_seconds,
              (SELECT COALESCE(SUM(es.configured_duration_seconds),0) FROM exam_sections es WHERE es.exam_id=e.id)::int AS configured_duration_seconds,
              c.id AS candidate_id
       FROM exam_events ee
       JOIN exams e ON e.id=ee.exam_id
       JOIN exam_candidates c ON c.exam_event_id=ee.id AND c.id=$2
       WHERE ee.id=$1
       FOR UPDATE OF c`,
      [eventId, candidateId],
    );
    const context = contextResult.rows[0];
    if (!context) return { context: null, attempt: null };

    const available = context.status === 'PUBLISHED'
      && context.exam_status === 'ACTIVE'
      && context.active_version_id
      && new Date(context.start_at).getTime() <= now.getTime()
      && new Date(context.end_at).getTime() > now.getTime();
    if (!available) return { context, attempt: null };

    await client.query(
      `UPDATE exam_attempts SET status='EXPIRED', updated_at=CURRENT_TIMESTAMP
       WHERE candidate_id=$1 AND exam_event_id=$2 AND status='IN_PROGRESS' AND expires_at<=CURRENT_TIMESTAMP`,
      [candidateId, eventId],
    );
    const existing = await client.query(
      `SELECT id, started_at, expires_at, status FROM exam_attempts
       WHERE candidate_id=$1 AND exam_event_id=$2 AND status='IN_PROGRESS'
       ORDER BY started_at DESC LIMIT 1`,
      [candidateId, eventId],
    );
    if (existing.rows[0]) return { context, attempt: existing.rows[0], resumed: true };

    const versionResult = await client.query(
      'SELECT id, snapshot FROM exam_versions WHERE id=$1 AND exam_id=$2',
      [context.active_version_id, context.exam_id],
    );
    const version = versionResult.rows[0];
    if (!version) return { context: { ...context, active_version_id: null }, attempt: null };
    const durationSeconds = Number(context.configured_duration_seconds || 0)
      || (Number(context.duration_minutes || 0) * 60 + Number(context.duration_seconds || 0));
    const naturalExpiry = new Date(now.getTime() + durationSeconds * 1000);
    const expiresAt = naturalExpiry < new Date(context.end_at) ? naturalExpiry : new Date(context.end_at);
    const attemptResult = await client.query(
      `INSERT INTO exam_attempts(
         exam_event_id, exam_id, exam_version_id, candidate_id, status,
         started_at, expires_at, question_snapshot, audio_confirmed_at, last_activity_at
       ) VALUES($1,$2,$3,$4,'IN_PROGRESS',$5,$6,$7::jsonb,$8,$5)
       RETURNING id, started_at, expires_at, status`,
      [eventId, context.exam_id, version.id, candidateId, now, expiresAt, JSON.stringify(version.snapshot), audioConfirmed ? now : null],
    );
    return { context, attempt: attemptResult.rows[0], resumed: false };
  });
}

async function findAttemptQuestionDelivery(eventId, attemptId, candidateId) {
  const attemptResult = await db.query(
    `SELECT ea.id, ea.status, ea.started_at, ea.expires_at, ea.question_snapshot,
            ea.exam_id, ea.exam_version_id
     FROM exam_attempts ea
     WHERE ea.id=$1 AND ea.exam_event_id=$2 AND ea.candidate_id=$3`,
    [attemptId, eventId, candidateId],
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) return null;

  const snapshot = attempt.question_snapshot || {};
  const contentIds = [];
  const subQuestionIds = [];
  const partIds = [];
  for (const part of snapshot.parts || []) {
    if (part.id) partIds.push(part.id);
    for (const question of part.questions || []) {
      for (const content of question.contents || []) if (content.id) contentIds.push(content.id);
      for (const subQuestion of question.subQuestions || []) if (subQuestion.id) subQuestionIds.push(subQuestion.id);
    }
  }

  const mediaResult = contentIds.length || subQuestionIds.length || partIds.length
    ? await db.query(
      `SELECT id, content_id, sub_question_id, part_id, media_type, storage_key, mime_type, original_name, duration_seconds
       FROM question_bank_media
       WHERE content_id=ANY($1::uuid[]) OR sub_question_id=ANY($2::uuid[]) OR part_id=ANY($3::uuid[])
       ORDER BY created_at, id`,
      [contentIds, subQuestionIds, partIds],
    )
    : { rows: [] };

  const answersResult = await db.query(
    `SELECT question_id,sub_question_id,selected_option,is_flagged,answered_at,updated_at
     FROM exam_attempt_answers
     WHERE attempt_id=$1 AND sub_question_id IS NOT NULL`,
    [attemptId],
  );

  return { attempt, media: mediaResult.rows, answers: answersResult.rows };
}

async function findAttemptQuestionState(eventId, attemptId, candidateId) {
  const attemptResult = await db.query(
    `SELECT ea.id,ea.status,ea.started_at,ea.expires_at,ea.exam_id,ea.exam_version_id
     FROM exam_attempts ea
     WHERE ea.id=$1 AND ea.exam_event_id=$2 AND ea.candidate_id=$3`,
    [attemptId, eventId, candidateId],
  );
  const attempt = attemptResult.rows[0];
  if (!attempt) return null;
  const answers = (await db.query(
    `SELECT question_id,sub_question_id,selected_option,is_flagged,answered_at,updated_at
     FROM exam_attempt_answers WHERE attempt_id=$1 AND sub_question_id IS NOT NULL`,
    [attemptId],
  )).rows;
  return { attempt, answers };
}

async function findAttemptState(eventId, attemptId, candidateId) {
  const result = await db.query(
    `SELECT id,status,started_at,expires_at,exam_event_id,exam_id,exam_version_id,candidate_id
     FROM exam_attempts WHERE id=$1 AND exam_event_id=$2 AND candidate_id=$3`,
    [attemptId, eventId, candidateId],
  );
  return result.rows[0] || null;
}

async function findVersionQuestionDelivery(versionId) {
  const version = (await db.query(
    'SELECT id,exam_id,snapshot FROM exam_versions WHERE id=$1',
    [versionId],
  )).rows[0];
  if (!version) return null;
  const snapshot = version.snapshot || {};
  const contentIds = [];
  const subQuestionIds = [];
  const partIds = [];
  for (const part of snapshot.parts || []) {
    if (part.id) partIds.push(part.id);
    for (const question of part.questions || []) {
    for (const content of question.contents || []) if (content.id) contentIds.push(content.id);
    for (const subQuestion of question.subQuestions || []) if (subQuestion.id) subQuestionIds.push(subQuestion.id);
    }
  }
  const mediaRows = contentIds.length || subQuestionIds.length || partIds.length ? (await db.query(
    `SELECT id,content_id,sub_question_id,part_id,media_type,storage_key,mime_type,original_name,duration_seconds
     FROM question_bank_media
     WHERE content_id=ANY($1::uuid[]) OR sub_question_id=ANY($2::uuid[]) OR part_id=ANY($3::uuid[])
     ORDER BY created_at,id`,
    [contentIds, subQuestionIds, partIds],
  )).rows : [];
  return { version, snapshot, media: mediaRows };
}

async function saveAttemptAnswer({ eventId, attemptId, candidateId, parentQuestionId, subQuestionId, selectedOption, flagged, now }) {
  return db.transaction(async client => {
    const attemptResult = await client.query(
      `SELECT id,status,expires_at,question_snapshot
       FROM exam_attempts
       WHERE id=$1 AND exam_event_id=$2 AND candidate_id=$3
       FOR UPDATE`,
      [attemptId, eventId, candidateId],
    );
    const attempt = attemptResult.rows[0];
    if (!attempt) return { attempt: null, answer: null };
    if (attempt.status !== 'IN_PROGRESS' || new Date(attempt.expires_at).getTime() <= now.getTime()) return { attempt, answer: null };
    const answer = (await client.query(
      `INSERT INTO exam_attempt_answers(
         attempt_id,question_id,sub_question_id,selected_option,is_flagged,answered_at,created_at,updated_at
       ) VALUES($1,$2,$3,$4,$5,$6,$6,$6)
       ON CONFLICT(attempt_id,sub_question_id) WHERE sub_question_id IS NOT NULL
       DO UPDATE SET selected_option=EXCLUDED.selected_option,is_flagged=EXCLUDED.is_flagged,
                     answered_at=EXCLUDED.answered_at,updated_at=EXCLUDED.updated_at
       RETURNING question_id,sub_question_id,selected_option,is_flagged,answered_at,updated_at`,
      [attemptId, parentQuestionId, subQuestionId, selectedOption, flagged, now],
    )).rows[0];
    await client.query('UPDATE exam_attempts SET last_activity_at=$2,updated_at=$2 WHERE id=$1', [attemptId, now]);
    return { attempt, answer };
  });
}

async function finalizeAttempt({ eventId, attemptId, candidateId, now, answers: submittedAnswers, evaluation }) {
  return db.transaction(async client => {
    const attempt = (await client.query(
      `SELECT id,status,started_at,expires_at,submitted_at,total_score,duration_seconds
       FROM exam_attempts WHERE id=$1 AND exam_event_id=$2 AND candidate_id=$3 FOR UPDATE`,
      [attemptId, eventId, candidateId],
    )).rows[0];
    if (!attempt) return { attempt: null };
    if (attempt.status === 'SUBMITTED') return { attempt, alreadySubmitted: true };
    // Submission is still allowed after the deadline so saved answers can be
    // finalized by the automatic timer. Answer writes remain blocked at expiry.
    if (attempt.status !== 'IN_PROGRESS') return { attempt, expired: true };
    const answers = submittedAnswers || [];
    const scoredAnswers = evaluation.items.map(item => ({
      question_id: item.parentQuestionId,
      sub_question_id: item.subQuestionId,
      selected_option: item.selectedOption || null,
      is_flagged: item.flagged === true,
      score: item.score,
      answered_at: item.savedAt || now,
    }));
    if (scoredAnswers.length) await client.query(
      `INSERT INTO exam_attempt_answers(
         attempt_id,question_id,sub_question_id,selected_option,is_flagged,score,answered_at,created_at,updated_at
       ) SELECT $1,x.question_id,x.sub_question_id,x.selected_option,x.is_flagged,x.score,x.answered_at,$2,$2
       FROM jsonb_to_recordset($3::jsonb) AS x(
         question_id uuid,sub_question_id uuid,selected_option text,is_flagged boolean,score numeric,answered_at timestamptz
       ) ON CONFLICT(attempt_id,sub_question_id) WHERE sub_question_id IS NOT NULL
       DO UPDATE SET selected_option=EXCLUDED.selected_option,is_flagged=EXCLUDED.is_flagged,
                     score=EXCLUDED.score,answered_at=EXCLUDED.answered_at,updated_at=EXCLUDED.updated_at`,
      [attemptId, now, JSON.stringify(scoredAnswers)],
    );
    const submitted = (await client.query(
      `UPDATE exam_attempts SET status='SUBMITTED',submitted_at=$2,total_score=$3,
          duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM ($2-started_at))::int),last_activity_at=$2,updated_at=$2
       WHERE id=$1 RETURNING id,status,started_at,submitted_at,total_score,duration_seconds`,
      [attemptId, now, evaluation.totalScore],
    )).rows[0];
    return { attempt: submitted, answers, evaluation, alreadySubmitted: false };
  });
}

async function getAttemptResultMeta(eventId, attemptId, candidateId) {
  const [candidateResult, rankingResult, leaderboardResult] = await Promise.all([
    db.query('SELECT full_name,email,school_name FROM exam_candidates WHERE id=$1 AND exam_event_id=$2', [candidateId, eventId]),
    db.query(
      `SELECT 1 + COUNT(*)::int AS rank,
              (SELECT COUNT(*)::int FROM exam_attempts WHERE exam_event_id=$1 AND status='SUBMITTED') AS total
       FROM exam_attempts current_attempt
       JOIN exam_attempts other ON other.exam_event_id=current_attempt.exam_event_id AND other.status='SUBMITTED'
       WHERE current_attempt.id=$2 AND (
         other.total_score>current_attempt.total_score OR
         (other.total_score=current_attempt.total_score AND other.duration_seconds<current_attempt.duration_seconds) OR
         (other.total_score=current_attempt.total_score AND other.duration_seconds=current_attempt.duration_seconds AND other.submitted_at<current_attempt.submitted_at)
       )`,
      [eventId, attemptId],
    ),
    db.query(
      `SELECT ea.id AS attempt_id,ec.full_name,ea.total_score,ea.duration_seconds
       FROM exam_attempts ea JOIN exam_candidates ec ON ec.id=ea.candidate_id
       WHERE ea.exam_event_id=$1 AND ea.status='SUBMITTED'
       ORDER BY ea.total_score DESC,ea.duration_seconds ASC,ea.submitted_at ASC LIMIT 3`,
      [eventId],
    ),
  ]);
  return { candidate: candidateResult.rows[0] || null, ranking: rankingResult.rows[0] || null, leaderboard: leaderboardResult.rows };
}

module.exports = { findById, registerCandidate, findCandidateForEvent, startAttempt, findAttemptQuestionDelivery, findAttemptQuestionState, findAttemptState, findVersionQuestionDelivery, saveAttemptAnswer, finalizeAttempt, getAttemptResultMeta };
