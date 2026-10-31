import api from './api';
const unwrap = response => response.data.data;
export async function listScoringJobs(params) { return unwrap(await api.get('/ai-scoring/jobs', { params })); }
export async function getScoringJobFacets() { return unwrap(await api.get('/ai-scoring/jobs/facets')); }
export async function exportScoringJobs(params) { return api.get('/ai-scoring/jobs/export', { params, responseType: 'blob' }); }
export async function getScoringJob(jobId) { return unwrap(await api.get(`/ai-scoring/jobs/${jobId}`)); }
export async function getScoringJobAttempts(jobId) { return unwrap(await api.get(`/ai-scoring/jobs/${jobId}/attempts`)); }
export async function getScoringJobPlan(jobId, runId) { return unwrap(await api.get(`/ai-scoring/jobs/${jobId}/plan`, { params: { runId } })); }
export async function getScoringJobQuestions(jobId, runId) { return unwrap(await api.get(`/ai-scoring/jobs/${jobId}/questions`, { params: { runId } })); }
export async function getScoringJobQuestion(jobId, questionId) { return unwrap(await api.get(`/ai-scoring/jobs/${jobId}/questions/${questionId}`)); }
export async function getScoringJobTimeline(jobId) { return unwrap(await api.get(`/ai-scoring/jobs/${jobId}/timeline`)); }
export async function getScoringJobPipeline(jobId, runId) { return unwrap(await api.get(`/ai-scoring/jobs/${jobId}/pipeline`, { params: { runId } })); }
export async function getScoringJobModelExecutions(jobId) { return unwrap(await api.get(`/ai-scoring/jobs/${jobId}/model-executions`)); }
export async function getScoringJobAvailableActions(jobId) { return unwrap(await api.get(`/ai-scoring/jobs/${jobId}/available-actions`)); }
export async function retryScoringJob(jobId, payload) { return unwrap(await api.post(`/ai-scoring/jobs/${jobId}/retry`, payload)); }
export async function cancelScoringJob(jobId, payload) { return unwrap(await api.post(`/ai-scoring/jobs/${jobId}/cancel`, payload)); }
export async function rescoreScoringJob(jobId, payload) { return unwrap(await api.post(`/ai-scoring/jobs/${jobId}/rescore`, payload)); }
export async function reconcileScoringJob(jobId, payload) { return unwrap(await api.post(`/ai-scoring/jobs/${jobId}/reconcile`, payload)); }
export async function retryScoringStep(jobId, stepId, payload) { return unwrap(await api.post(`/ai-scoring/jobs/${jobId}/pipeline/${encodeURIComponent(stepId)}/retry`, payload)); }
