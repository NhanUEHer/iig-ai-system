const db = require('../../config/db');

async function findById(id) {
  const eventResult = await db.query(
    `SELECT
       ee.id, ee.event_code, ee.name, ee.description, ee.school_name,
       ee.image_storage_key, ee.banner_storage_key, ee.start_at, ee.end_at,
       ee.status,
       e.id AS exam_id, e.title AS exam_title, e.status AS exam_status,
       e.duration_minutes, e.duration_seconds, e.score_scale,
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
      durationSeconds: Number(row.duration_minutes || 0) * 60 + Number(row.duration_seconds || 0),
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
           toeic_experience, marketing_consent, privacy_consent_at, privacy_policy_version
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,'2026-09')
         RETURNING id, full_name, school_name`,
        values,
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
    const durationSeconds = Number(context.duration_minutes || 0) * 60 + Number(context.duration_seconds || 0);
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
  for (const part of snapshot.parts || []) {
    for (const question of part.questions || []) {
      for (const content of question.contents || []) if (content.id) contentIds.push(content.id);
      for (const subQuestion of question.subQuestions || []) if (subQuestion.id) subQuestionIds.push(subQuestion.id);
    }
  }

  const mediaResult = contentIds.length || subQuestionIds.length
    ? await db.query(
      `SELECT id, content_id, sub_question_id, media_type, storage_key, mime_type, original_name
       FROM question_bank_media
       WHERE content_id=ANY($1::uuid[]) OR sub_question_id=ANY($2::uuid[])
       ORDER BY created_at, id`,
      [contentIds, subQuestionIds],
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

async function finalizeAttempt({ eventId, attemptId, candidateId, now, evaluate }) {
  return db.transaction(async client => {
    const attempt = (await client.query(
      `SELECT id,status,started_at,expires_at,submitted_at,total_score,question_snapshot
       FROM exam_attempts WHERE id=$1 AND exam_event_id=$2 AND candidate_id=$3 FOR UPDATE`,
      [attemptId, eventId, candidateId],
    )).rows[0];
    if (!attempt) return { attempt: null };
    const answers = (await client.query(
      `SELECT id,question_id,sub_question_id,selected_option,is_flagged
       FROM exam_attempt_answers WHERE attempt_id=$1 AND sub_question_id IS NOT NULL`,
      [attemptId],
    )).rows;
    const resultMeta = async currentAttempt => {
      const candidate = (await client.query(
        `SELECT full_name,email,school_name FROM exam_candidates WHERE id=$1 AND exam_event_id=$2`,
        [candidateId, eventId],
      )).rows[0] || null;
      const ranking = (await client.query(
        `WITH ranked AS (
           SELECT id,
                  RANK() OVER (ORDER BY total_score DESC, (submitted_at-started_at) ASC, submitted_at ASC) AS rank,
                  COUNT(*) OVER () AS total
           FROM exam_attempts
           WHERE exam_event_id=$1 AND status='SUBMITTED'
         ) SELECT rank::int,total::int FROM ranked WHERE id=$2`,
        [eventId, currentAttempt.id],
      )).rows[0] || null;
      const leaderboard = (await client.query(
        `SELECT ea.id AS attempt_id,ec.full_name,ea.total_score,
                EXTRACT(EPOCH FROM (ea.submitted_at-ea.started_at))::int AS duration_seconds
         FROM exam_attempts ea
         JOIN exam_candidates ec ON ec.id=ea.candidate_id
         WHERE ea.exam_event_id=$1 AND ea.status='SUBMITTED'
         ORDER BY ea.total_score DESC,(ea.submitted_at-ea.started_at) ASC,ea.submitted_at ASC
         LIMIT 3`,
        [eventId],
      )).rows;
      return { candidate, ranking, leaderboard };
    };
    if (attempt.status === 'SUBMITTED') return { attempt, answers, ...(await resultMeta(attempt)), alreadySubmitted: true };
    // Submission is still allowed after the deadline so saved answers can be
    // finalized by the automatic timer. Answer writes remain blocked at expiry.
    if (attempt.status !== 'IN_PROGRESS') return { attempt, answers, expired: true };
    const evaluation = evaluate(attempt.question_snapshot || {}, answers);
    for (const item of evaluation.items) {
      await client.query('UPDATE exam_attempt_answers SET score=$3,updated_at=$4 WHERE attempt_id=$1 AND sub_question_id=$2', [attemptId, item.subQuestionId, item.score, now]);
    }
    const submitted = (await client.query(
      `UPDATE exam_attempts SET status='SUBMITTED',submitted_at=$2,total_score=$3,last_activity_at=$2,updated_at=$2
       WHERE id=$1 RETURNING id,status,started_at,submitted_at,total_score`,
      [attemptId, now, evaluation.totalScore],
    )).rows[0];
    return { attempt: submitted, answers, evaluation, ...(await resultMeta(submitted)), alreadySubmitted: false };
  });
}

module.exports = { findById, registerCandidate, findCandidateForEvent, startAttempt, findAttemptQuestionDelivery, saveAttemptAnswer, finalizeAttempt };
