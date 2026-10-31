const service = require('../modules/ai-scoring-jobs/jobListService');
const detailService = require('../modules/ai-scoring-jobs/jobDetailService');
const operationService = require('../modules/ai-scoring-jobs/jobOperationService');
const pipelineService = require('../modules/ai-scoring-jobs/jobPipelineService');
const { audited } = require('../modules/ai-scoring-audit/auditFailure');
const csv = value => `"${String(value ?? '').replaceAll('"','""')}"`;
const jobId = req => req.params.jobId;
module.exports = {
  async list(req,res) { res.json({ success:true, data:await service.list(req.query) }); },
  async facets(_req,res) { res.json({ success:true, data:await service.facets() }); },
  async exportCsv(req,res) {
    const result = await service.export(req.query);
    const lines = [['Job ID','Scoring ID','Keycode','Tenant','Scope','Status','Stage','Progress','Retry','Error','Accepted at'], ...result.items.map(x => [x.id,x.scoringId,x.keycode,x.tenant?.name || '',x.scope,x.status,x.stage,`${x.progress.completed}/${x.progress.total}`,x.retryCount,x.errorCode || '',x.acceptedAt])];
    res.setHeader('content-type','text/csv; charset=utf-8'); res.setHeader('content-disposition',`attachment; filename="ai-scoring-jobs-${new Date().toISOString().slice(0,10)}.csv"`); res.send(`\uFEFF${lines.map(row => row.map(csv).join(',')).join('\n')}`);
  },
  async detail(req,res) { res.json({ success:true, data:await detailService.overview(req.params.jobId) }); },
  async result(req,res) { res.json({ success:true, data:await detailService.result(req.params.jobId,req.query.runId) }); },
  async attempts(req,res) { res.json({ success:true, data:await detailService.attempts(req.params.jobId) }); },
  async plan(req,res) { res.json({ success:true, data:await detailService.plan(req.params.jobId,req.query.runId) }); },
  async questions(req,res) { res.json({ success:true, data:await detailService.questions(req.params.jobId,req.query.runId) }); },
  async question(req,res) { res.json({ success:true, data:await detailService.question(req.params.jobId,req.params.questionId) }); },
  async group(req,res) { res.json({ success:true, data:await detailService.group(req.params.jobId,req.params.groupId) }); },
  async timeline(req,res) { res.json({ success:true, data:await detailService.timeline(req.params.jobId) }); },
  async pipeline(req,res) { res.json({ success:true, data:await pipelineService.pipeline(req.params.jobId,req.query.runId,req.auth?.permissions || []) }); },
  async modelExecutions(req,res) { res.json({ success:true, data:await detailService.modelExecutions(req.params.jobId) }); },
  async availableActions(req,res) { res.json({ success:true, data:await operationService.availableActions(req.params.jobId,req.auth?.permissions || []) }); },
  retry: audited('SCORING_JOB_RETRIED', 'SCORING_JOB', { resourceId: jobId }, async (req,res) => { res.status(202).json({ success:true, data:await operationService.retry(req.params.jobId,req.body,{ actorId:req.auth?.userId,requestId:req.requestId }) }); }),
  cancel: audited('SCORING_JOB_CANCELLED', 'SCORING_JOB', { resourceId: jobId }, async (req,res) => { res.status(202).json({ success:true, data:await operationService.cancel(req.params.jobId,req.body,{ actorId:req.auth?.userId,requestId:req.requestId }) }); }),
  rescore: audited('SCORING_JOB_RESCORED', 'SCORING_JOB', { resourceId: jobId }, async (req,res) => { res.status(202).json({ success:true, data:await operationService.rescore(req.params.jobId,req.body,{ actorId:req.auth?.userId,requestId:req.requestId }) }); }),
  reconcile: audited('SCORING_JOB_RECONCILED', 'SCORING_JOB', { resourceId: jobId }, async (req,res) => { res.json({ success:true, data:await operationService.reconcile(req.params.jobId,req.body,{ actorId:req.auth?.userId,requestId:req.requestId }) }); }),
  retryStep: audited('SCORING_JOB_STEP_RETRIED', 'SCORING_JOB', { resourceId: jobId }, async (req,res) => { res.status(202).json({ success:true, data:await pipelineService.retryStep(req.params.jobId,req.params.stepId,req.body,{ actorId:req.auth?.userId,requestId:req.requestId }) }); }),
};
