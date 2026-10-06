const gradeAnswer = require('./gradeAnswer');
const gradingJobRepository = require('./gradingJobRepository');
const HttpError = require('../../http/httpError');

const runningJobs = new Set();

async function processJob(jobId, dependencies = {}) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);
  const jobs = dependencies.jobs || gradingJobRepository;
  const grade = dependencies.gradeAnswer || gradeAnswer;
  try {
    await jobs.startJob(jobId);
    const items = await jobs.listQueuedItems(jobId);
    for (const item of items) {
      await jobs.startItem(jobId, item.answer_id);
      try {
        const result = await grade({ answerId: item.answer_id, publicUrl: process.env.PUBLIC_URL || null });
        await jobs.completeItem(jobId, item.answer_id, result.finalScore);
      } catch (error) {
        await jobs.failItem(jobId, item.answer_id, error.message);
      }
    }
    await jobs.finishJob(jobId);
  } catch (error) {
    await jobs.failJob(jobId);
    console.error(`[Bulk grading] Job ${jobId} failed:`, error);
  } finally { runningJobs.delete(jobId); }
}

async function createJob({ submissionIds, answerIds, userId }, dependencies = {}) {
  const hasSubmissions = Array.isArray(submissionIds) && submissionIds.length > 0;
  const hasAnswers = Array.isArray(answerIds) && answerIds.length > 0;
  if (!hasSubmissions && !hasAnswers) {
    throw new HttpError('Vui lòng chọn ít nhất một bài thi hoặc câu trả lời.', 400, 'VALIDATION_ERROR');
  }
  const jobs = dependencies.jobs || gradingJobRepository;
  const job = await jobs.create({
    userId,
    submissionIds: hasSubmissions ? [...new Set(submissionIds)] : undefined,
    answerIds: hasAnswers ? [...new Set(answerIds)] : undefined
  });
  if (!job.total_items) throw new HttpError('Các bài đã chọn không còn câu nào cần chấm.', 409, 'NOTHING_TO_GRADE');
  setImmediate(() => processJob(job.id, dependencies));
  return job;
}

module.exports = { createJob, processJob };
