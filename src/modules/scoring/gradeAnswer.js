const difyClient = require('../../clients/dynamicDifyClient');
const submissionRepository = require('../submissions/submissionRepository');
const evaluationRepository = require('./evaluationRepository');
const { selectAgent } = require('./agentSelector');
const { refreshSubmissionStatus } = require('./submissionStatusService');
const { parseGradingResult } = require('./gradingResultParser');
const { calculateFinalScore } = require('./scoreCalculator');
const { prepareSpeakingGradingInput } = require('./prepareSpeakingGradingInput');
const ScoringError = require('./scoringError');
const db = require('../../config/db');
const { SubmissionRepository } = require('../submissions/submissionRepository');
const { EvaluationRepository } = require('./evaluationRepository');

async function gradeAnswer(input, dependencies = {}) {
  if (!input.answerId) throw new ScoringError('answerId is required.', 400);

  const submissions = dependencies.submissions || submissionRepository;
  const evaluations = dependencies.evaluations || evaluationRepository;
  const chooseAgent = dependencies.selectAgent || selectAgent;
  const refreshStatus = dependencies.refreshSubmissionStatus || refreshSubmissionStatus;
  const prepareSpeaking = dependencies.prepareSpeakingGradingInput || prepareSpeakingGradingInput;
  const dify = dependencies.dify || difyClient;
  const now = dependencies.now || (() => new Date());
  const transaction = dependencies.transaction || (
    dependencies.submissions || dependencies.evaluations
      ? async work => work({ submissions, evaluations })
      : async work => db.transaction(async database => work({
        submissions: new SubmissionRepository(database),
        evaluations: new EvaluationRepository(database),
        database
      }))
  );
  let answer;
  let scoringStarted = false;

  try {
    answer = await submissions.findAnswerById(input.answerId);
    if (!answer) throw new ScoringError('Không tìm thấy câu trả lời.', 404);

    const agent = await chooseAgent({ agentId: input.agentId, apiType: 'Grading', answer });
    if (!agent) {
      throw new ScoringError('Không tìm thấy Agent cấu hình chấm điểm tương ứng.', 404);
    }

    const started = submissions.tryStartScoring
      ? await submissions.tryStartScoring(input.answerId)
      : (await submissions.updateAnswerStatus(input.answerId, 'scoring'), true);
    if (!started) {
      throw new ScoringError('Câu trả lời này đang được chấm điểm.', 409);
    }
    scoringStarted = true;
    await refreshStatus(answer.submission_id);
    const requestSentAt = now();
    let result;

    if (answer.section === 'Speaking') {
      const prepared = await prepareSpeaking(answer, { publicUrl: input.publicUrl || null });
      result = await dify.evaluateSpeech(
        agent.api_endpoint,
        agent.api_key,
        prepared.audioUrl,
        answer.prompt_text,
        prepared.transcription,
        answer.image_url,
        prepared.contextText,
        prepared.questionName
      );
    } else {
      result = await dify.evaluateWriting(
        agent.api_endpoint,
        agent.api_key,
        answer.student_writing || '',
        answer.prompt_text || '',
        answer.question_name || '',
        answer.image_url || '',
        answer.keywords || answer.prompt_text || ''
      );
    }

    const responseReceivedAt = now();
    const evaluation = parseGradingResult(result.data?.outputs || {});
    evaluation.finalScore = calculateFinalScore(answer, evaluation);
    await transaction(async resources => {
      const txSubmissions = resources?.submissions || submissions;
      const txEvaluations = resources?.evaluations || evaluations;
      await txEvaluations.upsertEvaluation({
        answerId: input.answerId,
        requestSentAt,
        responseReceivedAt,
        ...evaluation
      });
      await txSubmissions.updateAnswerStatus(input.answerId, 'scored');
      await refreshStatus(answer.submission_id, resources?.database);
    });

    return {
      answerId: input.answerId,
      transcribe: evaluation.transcribe,
      finalScore: evaluation.finalScore,
      scores: {
        pronunciation_score: evaluation.pronunciationScore,
        intonation_score: evaluation.intonationScore,
        cohesion_score: evaluation.cohesionScore,
        grammar_score: evaluation.grammarScore,
        vocabulary_score: evaluation.vocabularyScore,
        completeness_score: evaluation.completenessScore,
        relevance_score: evaluation.relevanceScore
      }
    };
  } catch (error) {
    if (answer && scoringStarted) {
      try {
        await transaction(async resources => {
          const txSubmissions = resources?.submissions || submissions;
          await txSubmissions.updateAnswerStatus(input.answerId, 'error');
          await refreshStatus(answer.submission_id, resources?.database);
        });
      } catch (statusError) {
        console.error('Failed to set error status in DB:', statusError);
      }
    }
    throw error;
  }
}

module.exports = gradeAnswer;
