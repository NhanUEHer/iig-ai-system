const HttpError = require('../../http/httpError');
const repository = require('./jobDetailRepository');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireUuid = (value, label = 'ID') => {
  if (!UUID.test(String(value || ''))) throw new HttpError(`${label} không hợp lệ.`, 400, 'INVALID_ID');
  return value;
};
const required = (value, code = 'JOB_NOT_FOUND') => {
  if (!value) throw new HttpError('Không tìm thấy scoring job hoặc dữ liệu liên quan.', 404, code);
  return value;
};

class JobDetailService {
  constructor(jobRepository = repository) { this.repository = jobRepository; }
  async overview(jobId) { return required(await this.repository.overview(requireUuid(jobId, 'Job ID'))); }
  attempts(jobId) { return this.repository.attempts(requireUuid(jobId, 'Job ID')); }
  plan(jobId, runId) { return this.repository.plan(requireUuid(jobId, 'Job ID'), runId ? requireUuid(runId, 'Run ID') : null); }
  questions(jobId, runId) { return this.repository.questions(requireUuid(jobId, 'Job ID'), runId ? requireUuid(runId, 'Run ID') : null); }
  async question(jobId, questionId) { return required(await this.repository.question(requireUuid(jobId, 'Job ID'), requireUuid(questionId, 'Question ID')), 'QUESTION_NOT_FOUND'); }
  async group(jobId, groupId) { return required(await this.repository.group(requireUuid(jobId, 'Job ID'), requireUuid(groupId, 'Group ID')), 'GROUP_NOT_FOUND'); }
  timeline(jobId) { return this.repository.timeline(requireUuid(jobId, 'Job ID')); }
  modelExecutions(jobId) { return this.repository.modelExecutions(requireUuid(jobId, 'Job ID')); }
  async result(jobId, runId) {
    const overview = await this.overview(jobId);
    const terminal = ['COMPLETED','COMPLETED_WITH_ISSUES','REVIEW_REQUIRED'].includes(overview.run_status || overview.job_status);
    if (!terminal) throw new HttpError('Kết quả chấm chưa sẵn sàng.', 409, 'RESULT_NOT_READY', { status: overview.run_status || overview.job_status });
    const [plan, questions] = await Promise.all([this.plan(jobId, runId), this.questions(jobId, runId)]);
    return { runId: plan.run?.id || null, scores: plan.groups.map(group => ({ groupId: group.source_group_id || group.group_key, appliedQuestionIds: group.applied_question_ids || [], score: group.final_score, aggregationVersion: group.aggregation_version, decisionCode: group.decision_code })), details: questions.map(question => ({ questionId: question.source_question_id || question.question_key, score: question.llm_score, criteria: question.criteria_scores || {}, transcript: question.transcript || null, comment: question.error_message || null, errors: question.error_code ? [{ type: question.error_code, comment: question.error_message }] : [] })) };
  }
}

module.exports = new JobDetailService();
module.exports.JobDetailService = JobDetailService;
