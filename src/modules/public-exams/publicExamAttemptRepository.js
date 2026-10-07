const db = require('../../config/db');
const crypto = require('crypto');
const attemptResults = require('./attemptResultRepository');

const normalizePhone = value => String(value || '').replace(/[ .-]/g, '');

async function registerCandidate(data) {
  return db.transaction(async client => {
    const phone = normalizePhone(data.phone) || null;
    const email = String(data.email || '').trim().toLowerCase() || null;
    const identityKey = email || phone || crypto.randomUUID();
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [`public-candidate:${identityKey}`]);
    const matches = (await client.query(
      `SELECT id,full_name,email,phone,school_name
       FROM exam_candidates
       WHERE ($1::text IS NOT NULL AND LOWER(BTRIM(email))=$1)
          OR ($2::text IS NOT NULL AND REGEXP_REPLACE(phone,'[ .-]','','g')=$2)
       ORDER BY updated_at DESC,id`,
      [email, phone],
    )).rows;
    const emailMatch = email ? matches.find(row => String(row.email || '').trim().toLowerCase() === email) : null;
    const phoneMatch = phone ? matches.find(row => normalizePhone(row.phone) === phone) : null;
    if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) return { conflict: true };
    const existing = emailMatch || phoneMatch;
    if (existing) {
      const candidate = (await client.query(
        `UPDATE exam_candidates SET full_name=$2,email=$3,phone=$4,birth_year=$5,
           toeic_experience=$6,marketing_consent=$7,school_name=$8,privacy_consent_at=CURRENT_TIMESTAMP,
           privacy_policy_version='2026-10',updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 RETURNING id,full_name,email,phone,school_name`,
        [existing.id, data.fullName, email, phone, data.birthYear, data.toeicExperience, data.marketingConsent, data.schoolName],
      )).rows[0];
      return { candidate, resumed: true };
    }
    const candidate = (await client.query(
      `INSERT INTO exam_candidates(
         full_name,email,phone,birth_year,toeic_experience,marketing_consent,school_name,
         privacy_consent_at,privacy_policy_version,candidate_number
       ) VALUES($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,'2026-10',$8)
       RETURNING id,full_name,email,phone,school_name`,
      [data.fullName, email, phone, data.birthYear, data.toeicExperience, data.marketingConsent, data.schoolName,
        `TS-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`],
    )).rows[0];
    return { candidate, resumed: false };
  });
}

async function startAttempt(examId, candidateId, { audioConfirmed, clientSessionId, now }) {
  return db.transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [`direct-attempt:${candidateId}:${examId}`]);
    const exam = (await client.query(
      `SELECT id,status,active_version_id,duration_minutes,duration_seconds,
        (SELECT COALESCE(SUM(configured_duration_seconds),0) FROM exam_sections WHERE exam_id=e.id)::int configured_duration_seconds
       FROM exams e WHERE id=$1 FOR SHARE`, [examId],
    )).rows[0];
    if (!exam || exam.status !== 'ACTIVE' || !exam.active_version_id) return null;
    const candidate = (await client.query('SELECT id FROM exam_candidates WHERE id=$1', [candidateId])).rows[0];
    if (!candidate) return null;
    await client.query(
      `UPDATE exam_attempts SET status='EXPIRED',updated_at=$3
       WHERE candidate_id=$1 AND exam_id=$2
         AND status='IN_PROGRESS' AND expires_at<=$3`, [candidateId, examId, now],
    );
    const existing = (await client.query(
      `SELECT id,started_at,expires_at,status,exam_id,exam_version_id,candidate_id,client_session_id
       FROM exam_attempts WHERE candidate_id=$1 AND exam_id=$2
         AND status='IN_PROGRESS' ORDER BY started_at DESC LIMIT 1`, [candidateId, examId],
    )).rows[0];
    if (existing) {
      if (existing.client_session_id && existing.client_session_id !== clientSessionId) {
        return { conflict: true, attempt: existing };
      }
      if (!existing.client_session_id) {
        existing.client_session_id = (await client.query(
          `UPDATE exam_attempts SET client_session_id=$2,updated_at=$3
           WHERE id=$1 RETURNING client_session_id`,
          [existing.id, clientSessionId, now],
        )).rows[0].client_session_id;
      }
      return { attempt: existing, resumed: true };
    }
    const version = (await client.query('SELECT id,snapshot FROM exam_versions WHERE id=$1 AND exam_id=$2', [exam.active_version_id, examId])).rows[0];
    if (!version) return null;
    const durationSeconds = Number(exam.configured_duration_seconds || 0)
      || Number(exam.duration_minutes || 0) * 60 + Number(exam.duration_seconds || 0);
    const expiresAt = new Date(now.getTime() + Math.max(1, durationSeconds) * 1000);
    const attempt = (await client.query(
      `INSERT INTO exam_attempts(exam_id,exam_version_id,candidate_id,status,
         started_at,expires_at,question_snapshot,audio_confirmed_at,last_activity_at,client_session_id)
       VALUES($1,$2,$3,'IN_PROGRESS',$4,$5,$6::jsonb,$7,$4,$8)
       RETURNING id,started_at,expires_at,status,exam_id,exam_version_id,candidate_id,client_session_id`,
      [examId, version.id, candidateId, now, expiresAt, JSON.stringify(version.snapshot), audioConfirmed ? now : null, clientSessionId],
    )).rows[0];
    return { attempt, resumed: false };
  });
}

async function findAttempt(examId, attemptId, candidateId, withSnapshot = false) {
  const fields = withSnapshot ? ',question_snapshot' : '';
  return (await db.query(
    `SELECT id,status,started_at,expires_at,exam_id,exam_version_id,candidate_id${fields}
     FROM exam_attempts WHERE id=$1 AND exam_id=$2 AND candidate_id=$3`,
    [attemptId, examId, candidateId],
  )).rows[0] || null;
}

async function findDelivery(examId, attemptId, candidateId) {
  const attempt = await findAttempt(examId, attemptId, candidateId, true);
  if (!attempt) return null;
  const snapshot = attempt.question_snapshot || {};
  const contentIds = [], subQuestionIds = [], partIds = [];
  for (const part of snapshot.parts || []) {
    if (part.id) partIds.push(part.id);
    for (const question of part.questions || []) {
      for (const content of question.contents || []) if (content.id) contentIds.push(content.id);
      for (const sub of question.subQuestions || []) if (sub.id) subQuestionIds.push(sub.id);
    }
  }
  const media = contentIds.length || subQuestionIds.length || partIds.length ? (await db.query(
    `SELECT id,content_id,sub_question_id,part_id,media_type,storage_key,mime_type,original_name,duration_seconds
     FROM question_bank_media WHERE content_id=ANY($1::uuid[]) OR sub_question_id=ANY($2::uuid[]) OR part_id=ANY($3::uuid[])
     ORDER BY created_at,id`, [contentIds, subQuestionIds, partIds],
  )).rows : [];
  return { attempt, snapshot, media };
}

async function saveAnswer({ examId, attemptId, candidateId, parentQuestionId, subQuestionId, selectedOption, flagged, now }) {
  return db.transaction(async client => {
    const attempt = (await client.query(
      `SELECT id,status,expires_at FROM exam_attempts
       WHERE id=$1 AND exam_id=$2 AND candidate_id=$3 FOR UPDATE`,
      [attemptId, examId, candidateId],
    )).rows[0];
    if (!attempt || attempt.status !== 'IN_PROGRESS' || new Date(attempt.expires_at) <= now) return null;
    const answer = (await client.query(
      `INSERT INTO exam_attempt_answers(attempt_id,question_id,sub_question_id,selected_option,is_flagged,answered_at,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$6,$6)
       ON CONFLICT(attempt_id,sub_question_id) WHERE sub_question_id IS NOT NULL
       DO UPDATE SET selected_option=EXCLUDED.selected_option,is_flagged=EXCLUDED.is_flagged,answered_at=EXCLUDED.answered_at,updated_at=EXCLUDED.updated_at
       RETURNING sub_question_id,selected_option,is_flagged,updated_at`,
      [attemptId, parentQuestionId, subQuestionId, selectedOption, flagged, now],
    )).rows[0];
    await client.query('UPDATE exam_attempts SET last_activity_at=$2,updated_at=$2 WHERE id=$1', [attemptId, now]);
    return answer;
  });
}

async function findAnswers(attemptId) {
  return (await db.query(
    `SELECT sub_question_id,selected_option,is_flagged,answered_at
     FROM exam_attempt_answers
     WHERE attempt_id=$1 AND sub_question_id IS NOT NULL`,
    [attemptId],
  )).rows;
}

async function finalize({ examId, attemptId, candidateId, evaluation, now }) {
  return db.transaction(async client => {
    const attempt = (await client.query(
      `SELECT id,status,started_at,expires_at,submitted_at,total_score,duration_seconds,
         total_questions,answered_count,unanswered_count,correct_count,incorrect_count,
         score_range_min,score_range_max,max_score,scoring_version,part_breakdown
       FROM exam_attempts WHERE id=$1 AND exam_id=$2 AND candidate_id=$3 FOR UPDATE`,
      [attemptId, examId, candidateId],
    )).rows[0];
    if (!attempt) return null;
    if (attempt.status === 'SUBMITTED') {
      const sections = await attemptResults.loadSections(client, attemptId);
      return { attempt, evaluation: attemptResults.summary(attempt, sections), alreadySubmitted: true };
    }
    if (!['IN_PROGRESS', 'EXPIRED'].includes(attempt.status)) return { attempt, unavailable: true };
    const submitted = await attemptResults.persist(client, attemptId, evaluation, now, { capDurationAtExpiry: true });
    return { attempt: submitted, evaluation, alreadySubmitted: false };
  });
}

async function findStoredResult(examId, attemptId, candidateId) {
  return db.transaction(async client => {
    const attempt = (await client.query(
      `SELECT id,exam_id,status,started_at,expires_at,submitted_at,total_score,duration_seconds,
         total_questions,answered_count,unanswered_count,correct_count,incorrect_count,
         score_range_min,score_range_max,max_score,scoring_version,part_breakdown
       FROM exam_attempts WHERE id=$1 AND exam_id=$2 AND candidate_id=$3`,
      [attemptId, examId, candidateId],
    )).rows[0];
    if (!attempt || attempt.status !== 'SUBMITTED') return null;
    const sections = await attemptResults.loadSections(client, attemptId);
    return { attempt, evaluation: attemptResults.summary(attempt, sections) };
  });
}

async function findResultPresentation(examId, attemptId, candidateId) {
  const [metaResult, leaderboardResult] = await Promise.all([
    db.query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (
                  ORDER BY total_score DESC NULLS LAST,duration_seconds ASC NULLS LAST,submitted_at ASC,id ASC
                )::int AS rank,
                COUNT(*) OVER ()::int AS total_candidates
         FROM exam_attempts
         WHERE exam_id=$1 AND status='SUBMITTED'
       )
       SELECT e.id AS exam_id,e.exam_code,e.title AS exam_title,e.exam_type,
              COALESCE((SELECT SUM(es.configured_duration_seconds) FROM exam_sections es WHERE es.exam_id=e.id),
                       e.duration_minutes*60+e.duration_seconds,0)::int AS allowed_duration_seconds,
              c.id AS candidate_id,c.candidate_number,c.full_name,c.email,c.phone,c.school_name,
              r.rank,r.total_candidates
       FROM exam_attempts ea
       JOIN exams e ON e.id=ea.exam_id
       JOIN exam_candidates c ON c.id=ea.candidate_id
       JOIN ranked r ON r.id=ea.id
       WHERE ea.id=$2 AND ea.exam_id=$1 AND ea.candidate_id=$3
         AND ea.status='SUBMITTED'`,
      [examId, attemptId, candidateId],
    ),
    db.query(
      `SELECT ea.id AS attempt_id,ea.candidate_id,ec.full_name,ea.total_score,ea.max_score,
              ea.duration_seconds,ea.correct_count,ea.answered_count
       FROM exam_attempts ea
       JOIN exam_candidates ec ON ec.id=ea.candidate_id
       WHERE ea.exam_id=$1 AND ea.status='SUBMITTED'
       ORDER BY ea.total_score DESC NULLS LAST,ea.duration_seconds ASC NULLS LAST,ea.submitted_at ASC,ea.id ASC
       LIMIT 3`,
      [examId],
    ),
  ]);
  return { meta: metaResult.rows[0] || null, leaderboard: leaderboardResult.rows };
}

module.exports = {
  registerCandidate,
  startAttempt,
  findAttempt,
  findDelivery,
  saveAnswer,
  findAnswers,
  finalize,
  findStoredResult,
  findResultPresentation,
};
