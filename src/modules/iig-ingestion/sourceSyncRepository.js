const db = require('../../config/db');

function mapOutbox(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload || {},
    publishAttempts: Number(row.publish_attempts || 0),
    lockedBy: row.locked_by,
  };
}

async function createExamVersion(executor, catalog, canonical, jobId) {
  const nextVersion = await executor.query(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number
     FROM iig_exam_versions WHERE exam_id = $1`,
    [catalog.id]
  );
  const version = await executor.query(
    `INSERT INTO iig_exam_versions
       (exam_id, version_number, structure_hash, canonical_schema_version,
        source_status, source_metadata, created_by_job_id)
     VALUES ($1, $2, $3, 1, $4, $5::jsonb, $6)
     RETURNING id, version_number`,
    [
      catalog.id,
      Number(nextVersion.rows[0].version_number),
      canonical.exam.structureHash,
      canonical.exam.sourceStatus,
      JSON.stringify({ structure: canonical.exam.structure }),
      jobId,
    ]
  );
  const versionId = version.rows[0].id;
  const sectionIds = new Map();
  for (const section of canonical.sections) {
    const result = await executor.query(
      `INSERT INTO iig_exam_sections
         (exam_version_id, source_section_id, section_key, name, section_type, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [versionId, section.sourceSectionId, section.sectionKey, section.name, section.sectionType, section.sortOrder]
    );
    sectionIds.set(section.sectionKey, result.rows[0].id);
  }

  const groupIds = new Map();
  for (const group of canonical.groups) {
    const result = await executor.query(
      `INSERT INTO iig_exam_score_groups
         (exam_version_id, source_group_id, group_key, name, min_score, max_score,
          scoring_config, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING id`,
      [
        versionId, group.sourceGroupId, group.groupKey, group.name, group.minScore, group.maxScore,
        JSON.stringify({
          fromQuestion: group.fromQuestion,
          toQuestion: group.toQuestion,
          sourceSectionId: group.sourceSectionId,
        }),
        group.sortOrder,
      ]
    );
    groupIds.set(group.groupKey, result.rows[0].id);
  }

  const questionIds = new Map();
  for (const question of canonical.questions) {
    const result = await executor.query(
      `INSERT INTO iig_exam_questions
         (exam_version_id, section_id, source_question_id, question_key, question_number,
          scorer_type, questionnaire_type, title, question_text, prompt_text, context_text,
          prompt_html, asset_manifest, source_payload, content_hash, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13::jsonb, $14::jsonb, $15, $16)
       RETURNING id`,
      [
        versionId, sectionIds.get(question.sectionKey), question.sourceQuestionId,
        question.questionKey, question.questionNumber, question.scorerType,
        question.questionnaireType, question.title, question.questionText,
        question.promptText, question.contextText, question.promptHtml,
        JSON.stringify(question.assets), JSON.stringify(question.sourcePayload),
        question.contentHash, question.globalNumber - 1,
      ]
    );
    const questionId = result.rows[0].id;
    questionIds.set(question.questionKey, questionId);
    for (const groupKey of question.scoreGroupKeys) {
      await executor.query(
        `INSERT INTO iig_exam_question_score_groups
           (exam_version_id, question_id, score_group_id)
         VALUES ($1, $2, $3)`,
        [versionId, questionId, groupIds.get(groupKey)]
      );
    }
    for (const asset of question.assets) {
      await executor.query(
        `INSERT INTO iig_media_assets
           (exam_question_id, asset_role, asset_index, is_required, source_file_id, source_locator, status)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'DISCOVERED')`,
        [
          questionId, asset.role, asset.index, asset.isRequired, asset.sourceFileId,
          JSON.stringify(asset.sourceFileId ? { fileId: asset.sourceFileId } : { url: asset.url }),
        ]
      );
    }
  }
  await executor.query(
    `UPDATE iig_exam_catalog
     SET current_version_id = $2, title = $3, source_status = $4,
         last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [catalog.id, versionId, canonical.exam.title, canonical.exam.sourceStatus]
  );
  return { id: versionId, versionNumber: Number(version.rows[0].version_number), questionIds, created: true };
}

async function resolveExamVersion(executor, canonical, jobId) {
  await executor.query(
    `INSERT INTO iig_exam_catalog
       (partner, source_mock_test_id, title, source_status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (partner, source_mock_test_id) DO UPDATE
       SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
    [canonical.exam.partner, canonical.exam.sourceMockTestId, canonical.exam.title, canonical.exam.sourceStatus]
  );
  const catalogResult = await executor.query(
    `SELECT * FROM iig_exam_catalog
     WHERE partner = $1 AND source_mock_test_id = $2
     FOR UPDATE`,
    [canonical.exam.partner, canonical.exam.sourceMockTestId]
  );
  const catalog = catalogResult.rows[0];
  const existing = await executor.query(
    `SELECT id, version_number FROM iig_exam_versions
     WHERE exam_id = $1 AND structure_hash = $2`,
    [catalog.id, canonical.exam.structureHash]
  );
  if (!existing.rows[0]) return createExamVersion(executor, catalog, canonical, jobId);

  const versionId = existing.rows[0].id;
  const questionRows = await executor.query(
    `SELECT id, question_key FROM iig_exam_questions WHERE exam_version_id = $1`,
    [versionId]
  );
  const questionIds = new Map(questionRows.rows.map(row => [row.question_key, row.id]));
  if (canonical.questions.some(question => !questionIds.has(question.questionKey))) {
    throw Object.assign(new Error('Stored exam version is missing canonical questions.'), {
      code: 'IIG_EXAM_VERSION_CORRUPT', retryable: false,
    });
  }
  await executor.query(
    `UPDATE iig_exam_catalog
     SET current_version_id = $2, title = $3, source_status = $4,
         last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [catalog.id, versionId, canonical.exam.title, canonical.exam.sourceStatus]
  );
  return {
    id: versionId,
    versionNumber: Number(existing.rows[0].version_number),
    questionIds,
    created: false,
  };
}

class SourceSyncRepository {
  constructor(database = db) {
    this.db = database;
  }

  async recoverStale(staleMs) {
    const result = await this.db.query(
      `UPDATE iig_ingestion_outbox
       SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
           available_at = CURRENT_TIMESTAMP, last_error = 'Worker lease expired.',
           updated_at = CURRENT_TIMESTAMP
       WHERE event_type = 'SOURCE_SYNC_REQUESTED' AND status = 'PROCESSING'
         AND locked_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
       RETURNING id`,
      [staleMs]
    );
    return result.rowCount || result.rows.length;
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT id FROM iig_ingestion_outbox
           WHERE event_type = 'SOURCE_SYNC_REQUESTED'
             AND status IN ('PENDING', 'FAILED') AND available_at <= CURRENT_TIMESTAMP
           ORDER BY available_at, created_at
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE iig_ingestion_outbox event
         SET status = 'PROCESSING', publish_attempts = publish_attempts + 1,
             locked_at = CURRENT_TIMESTAMP, locked_by = $1,
             last_error = NULL, updated_at = CURRENT_TIMESTAMP
         FROM candidate WHERE event.id = candidate.id
         RETURNING event.*`,
        [workerId]
      );
      return mapOutbox(result.rows[0]);
    });
  }

  async loadSnapshot(jobId, snapshotHash) {
    const result = await this.db.query(
      `SELECT payload FROM iig_source_snapshots
       WHERE scoring_job_id = $1 AND snapshot_type = 'BATCH_DETAIL' AND payload_hash = $2
       ORDER BY captured_at DESC LIMIT 1`,
      [jobId, snapshotHash]
    );
    return result.rows[0]?.payload || null;
  }

  async completeSync({ event, canonical }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;

      const jobResult = await executor.query(
        `SELECT id, source_scoring_id, keycode, status FROM iig_scoring_jobs WHERE id = $1 FOR UPDATE`,
        [event.jobId]
      );
      const job = jobResult.rows[0];
      if (!job) throw Object.assign(new Error('The ingestion job no longer exists.'), { code: 'SCORING_JOB_NOT_FOUND' });
      const examVersion = await resolveExamVersion(executor, canonical, job.id);
      const submissionResult = await executor.query(
        `INSERT INTO iig_submissions
           (scoring_job_id, partner, source_scoring_id, keycode, exam_version_id,
            candidate_name, candidate_email, candidate_phone, source_status, status,
            submitted_at, source_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SYNCING', $10, $11::jsonb)
         ON CONFLICT (scoring_job_id) DO UPDATE SET
           candidate_name = EXCLUDED.candidate_name,
           candidate_email = EXCLUDED.candidate_email,
           candidate_phone = EXCLUDED.candidate_phone,
           source_status = EXCLUDED.source_status,
           submitted_at = EXCLUDED.submitted_at,
           source_metadata = EXCLUDED.source_metadata,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [
          job.id, canonical.submission.partner, canonical.submission.sourceScoringId,
          canonical.submission.keycode, examVersion.id, canonical.submission.candidateName,
          canonical.submission.candidateEmail, canonical.submission.candidatePhone,
          canonical.submission.sourceStatus, canonical.submission.submittedAt,
          JSON.stringify(canonical.submission.sourceMetadata),
        ]
      );
      const submissionId = submissionResult.rows[0].id;
      let mediaCount = 0;
      for (const question of canonical.questions) {
        const examQuestionId = examVersion.questionIds.get(question.questionKey);
        const requiredAssetCount = question.assets.filter(asset => asset.isRequired).length +
          (question.studentAudioFileId ? 1 : 0);
        mediaCount += question.assets.length + (question.studentAudioFileId ? 1 : 0);
        const readiness = requiredAssetCount ? 'PENDING_MEDIA' : 'VALIDATING';
        const attemptResult = await executor.query(
          `INSERT INTO iig_question_attempts
             (submission_id, exam_version_id, exam_question_id, source_choose_id,
              answer_text, source_answer, readiness_status, required_asset_count)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           ON CONFLICT (submission_id, exam_question_id) DO UPDATE SET
             source_choose_id = EXCLUDED.source_choose_id,
             answer_text = EXCLUDED.answer_text,
             source_answer = EXCLUDED.source_answer,
             readiness_status = EXCLUDED.readiness_status,
             required_asset_count = EXCLUDED.required_asset_count,
             scoring_disposition = 'NORMAL', zero_reason = NULL, zero_origin = NULL,
             resolution_metadata = '{}'::jsonb, resolved_at = NULL,
             updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [
            submissionId, examVersion.id, examQuestionId, question.sourceChooseId,
            question.answerText, JSON.stringify(question.sourceAnswer), readiness,
            requiredAssetCount,
          ]
        );
        if (question.studentAudioFileId) {
          await executor.query(
            `INSERT INTO iig_media_assets
               (question_attempt_id, asset_role, asset_index, is_required, source_file_id, source_locator, status)
             VALUES ($1, 'STUDENT_AUDIO', 0, TRUE, $2, $3::jsonb, 'DISCOVERED')
             ON CONFLICT (question_attempt_id, asset_role, asset_index) WHERE question_attempt_id IS NOT NULL
             DO UPDATE SET source_file_id = EXCLUDED.source_file_id,
               source_locator = EXCLUDED.source_locator, status = 'DISCOVERED',
               canonical_storage_provider = NULL, canonical_storage_bucket = NULL,
               canonical_storage_key = NULL, canonical_mime_type = NULL,
               checksum_sha256 = NULL, file_size_bytes = NULL, duration_seconds = NULL,
               quality_metrics = '{}'::jsonb, processing_version = NULL,
               error_code = NULL, error_message = NULL,
               failure_origin = NULL, failure_class = NULL,
               attempt_count = 0, retry_exhausted = FALSE, last_attempt_at = NULL,
               processed_at = NULL, updated_at = CURRENT_TIMESTAMP`,
            [
              attemptResult.rows[0].id,
              question.studentAudioFileId,
              JSON.stringify({ fileId: question.studentAudioFileId }),
            ]
          );
        }
      }

      const nextStatus = mediaCount ? 'PREPARING_MEDIA' : 'VALIDATING';
      const nextEvent = mediaCount ? 'MEDIA_PREPARATION_REQUESTED' : 'INPUT_VALIDATION_REQUESTED';
      await executor.query(
        `UPDATE iig_submissions SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [submissionId, nextStatus]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs
         SET status = $2, total_questions = $3, pending_questions = $3,
             ready_questions = 0, invalid_questions = 0, next_retry_at = NULL,
             error_code = NULL, error_message = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [job.id, nextStatus, canonical.questions.length]
      );
      await executor.query(
        `INSERT INTO iig_ingestion_outbox
           (aggregate_type, aggregate_id, event_type, deduplication_key, payload)
         VALUES ('IIG_SCORING_JOB', $1, $2, $3, $4::jsonb)
         ON CONFLICT (deduplication_key) DO NOTHING`,
        [
          job.id,
          nextEvent,
          `iig-scoring-job:${job.id}:${nextEvent.toLowerCase()}:${canonical.exam.structureHash}:v1`,
          JSON.stringify({ jobId: job.id, submissionId, examVersionId: examVersion.id }),
        ]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, submission_id, event_type, from_status, to_status, details)
         VALUES ($1, $2, 'SOURCE_SYNC_COMPLETED', 'SYNCING_EXAM', $3, $4::jsonb)`,
        [job.id, submissionId, nextStatus, JSON.stringify({
          examVersionId: examVersion.id,
          examVersionNumber: examVersion.versionNumber,
          examVersionCreated: examVersion.created,
          structureHash: canonical.exam.structureHash,
          questionCount: canonical.questions.length,
          mediaCount,
        })]
      );
      await executor.query(
        `UPDATE iig_ingestion_outbox
         SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP,
             locked_at = NULL, locked_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.id]
      );
      return { submissionId, examVersionId: examVersion.id, examVersionCreated: examVersion.created, mediaCount };
    });
  }

  async markRetry({ event, error, delayMs }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      await executor.query(
        `UPDATE iig_ingestion_outbox
         SET status = 'FAILED', available_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
             locked_at = NULL, locked_by = NULL, last_error = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id, delayMs, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs SET retry_count = retry_count + 1,
           next_retry_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
           error_code = $3, error_message = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.jobId, delayMs, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, event_type, from_status, to_status, details)
         VALUES ($1, 'SOURCE_SYNC_RETRY_SCHEDULED', 'SYNCING_EXAM', 'SYNCING_EXAM', $2::jsonb)`,
        [event.jobId, JSON.stringify({ code: error.code, attempt: event.publishAttempts, delayMs })]
      );
      return true;
    });
  }

  async markDeadLetter({ event, error }) {
    return this.db.transaction(async executor => {
      const lease = await executor.query(
        `SELECT id FROM iig_ingestion_outbox
         WHERE id = $1 AND status = 'PROCESSING' AND locked_by = $2 FOR UPDATE`,
        [event.id, event.lockedBy]
      );
      if (!lease.rows[0]) return false;
      await executor.query(
        `UPDATE iig_ingestion_outbox SET status = 'DEAD_LETTER', locked_at = NULL,
           locked_by = NULL, last_error = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `UPDATE iig_scoring_jobs SET status = 'FAILED', completed_at = CURRENT_TIMESTAMP,
           next_retry_at = NULL, error_code = $2, error_message = $3,
           updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [event.jobId, error.code, String(error.message).slice(0, 2000)]
      );
      await executor.query(
        `INSERT INTO iig_processing_events
           (scoring_job_id, event_type, from_status, to_status, details)
         VALUES ($1, 'SOURCE_SYNC_DEAD_LETTERED', 'SYNCING_EXAM', 'FAILED', $2::jsonb)`,
        [event.jobId, JSON.stringify({ code: error.code, attempt: event.publishAttempts })]
      );
      return true;
    });
  }
}

const repository = new SourceSyncRepository();
repository.SourceSyncRepository = SourceSyncRepository;
repository.mapOutbox = mapOutbox;
repository.resolveExamVersion = resolveExamVersion;

module.exports = repository;
