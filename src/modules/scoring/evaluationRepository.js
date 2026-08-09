const db = require('../../config/db');

class EvaluationRepository {
  constructor(database = db) {
    this.db = database;
  }

  async findAudioState(answerId) {
    const result = await this.db.query(
      'SELECT cleaned_audio_url, transcribe FROM ai_evaluation_results WHERE answer_id = $1',
      [answerId]
    );
    return result.rows[0] || null;
  }

  async upsertTranscription({ answerId, transcribe, requestSentAt = null, responseReceivedAt = null }) {
    await this.db.query(
      `INSERT INTO ai_evaluation_results
         (answer_id, request_sent_at, response_received_at, transcribe, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (answer_id) DO UPDATE SET
         request_sent_at = COALESCE(EXCLUDED.request_sent_at, ai_evaluation_results.request_sent_at),
         response_received_at = COALESCE(EXCLUDED.response_received_at, ai_evaluation_results.response_received_at),
         transcribe = EXCLUDED.transcribe,
         updated_at = CURRENT_TIMESTAMP`,
      [answerId, requestSentAt, responseReceivedAt, transcribe]
    );
  }

  async upsertCleanedAudio(answerId, cleanedAudioUrl) {
    await this.db.query(
      `INSERT INTO ai_evaluation_results (answer_id, cleaned_audio_url, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (answer_id) DO UPDATE SET
         cleaned_audio_url = EXCLUDED.cleaned_audio_url,
         updated_at = CURRENT_TIMESTAMP`,
      [answerId, cleanedAudioUrl]
    );
  }

  async upsertTeacherNote(answerId, teacherNote) {
    await this.db.query(
      `INSERT INTO ai_evaluation_results (answer_id, teacher_note, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (answer_id) DO UPDATE SET
         teacher_note = EXCLUDED.teacher_note,
         updated_at = CURRENT_TIMESTAMP`,
      [answerId, teacherNote || null]
    );
  }

  async upsertEvaluation(evaluation) {
    const fields = [
      'answerId', 'requestSentAt', 'responseReceivedAt', 'transcribe', 'finalScore',
      'pronunciationScore', 'pronunciationRationale', 'intonationScore', 'intonationRationale',
      'cohesionScore', 'cohesionRationale', 'grammarScore', 'grammarRationale',
      'vocabularyScore', 'vocabularyRationale', 'completenessScore', 'completenessRationale',
      'relevanceScore', 'relevanceRationale', 'errors', 'overall1', 'overall2', 'keyErrors',
      'strength', 'weakness', 'improvement'
    ];
    const values = fields.map(field => evaluation[field] ?? null);

    await this.db.query(
      `INSERT INTO ai_evaluation_results (
        answer_id, request_sent_at, response_received_at, transcribe, final_score,
        pronunciation_score, pronunciation_rationale, intonation_score, intonation_rationale,
        cohesion_score, cohesion_rationale, grammar_score, grammar_rationale,
        vocabulary_score, vocabulary_rationale, completeness_score, completeness_rationale,
        relevance_score, relevance_rationale, errors, overall_1, overall_2, key_errors,
        strength, weakness, improvement, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,CURRENT_TIMESTAMP)
       ON CONFLICT (answer_id) DO UPDATE SET
        request_sent_at = EXCLUDED.request_sent_at,
        response_received_at = EXCLUDED.response_received_at,
        transcribe = COALESCE(EXCLUDED.transcribe, ai_evaluation_results.transcribe),
        final_score = EXCLUDED.final_score,
        pronunciation_score = EXCLUDED.pronunciation_score,
        pronunciation_rationale = EXCLUDED.pronunciation_rationale,
        intonation_score = EXCLUDED.intonation_score,
        intonation_rationale = EXCLUDED.intonation_rationale,
        cohesion_score = EXCLUDED.cohesion_score,
        cohesion_rationale = EXCLUDED.cohesion_rationale,
        grammar_score = EXCLUDED.grammar_score,
        grammar_rationale = EXCLUDED.grammar_rationale,
        vocabulary_score = EXCLUDED.vocabulary_score,
        vocabulary_rationale = EXCLUDED.vocabulary_rationale,
        completeness_score = EXCLUDED.completeness_score,
        completeness_rationale = EXCLUDED.completeness_rationale,
        relevance_score = EXCLUDED.relevance_score,
        relevance_rationale = EXCLUDED.relevance_rationale,
        errors = EXCLUDED.errors,
        overall_1 = EXCLUDED.overall_1,
        overall_2 = EXCLUDED.overall_2,
        key_errors = EXCLUDED.key_errors,
        strength = EXCLUDED.strength,
        weakness = EXCLUDED.weakness,
        improvement = EXCLUDED.improvement,
        updated_at = CURRENT_TIMESTAMP`,
      values
    );
  }
}

module.exports = new EvaluationRepository();
module.exports.EvaluationRepository = EvaluationRepository;

