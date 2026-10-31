# AI Scoring dark release runbook

## Objective

Deploy the AI Scoring schema, admin APIs and admin frontend without processing
ingestion, scoring or webhook work. Runtime activation is a separate release.

## Release scope

- PostgreSQL migrations `121` through `146` (migration `147` belongs to the
  learning-material release and is excluded).
- Integration tenant, credential, webhook, audit and job administration APIs.
- IIG ingestion and AI Scoring runtime code, installed but inactive.
- Admin frontend pages for tenants and scoring jobs.

## Required dark-release flags

All of the following must be explicitly `false` in the target environment:

- `IIG_INGESTION_SOURCE_WORKER_ENABLED`
- `IIG_INGESTION_SYNC_WORKER_ENABLED`
- `IIG_INGESTION_MEDIA_WORKER_ENABLED`
- `IIG_INGESTION_QUESTION_STT_WORKER_ENABLED`
- `IIG_INGESTION_VALIDATION_WORKER_ENABLED`
- `IIG_AI_RUN_CREATION_WORKER_ENABLED`
- `IIG_AI_ORCHESTRATOR_WORKER_ENABLED`
- `IIG_AI_ANSWER_STT_WORKER_ENABLED`
- `IIG_AI_FEATURE_WORKER_ENABLED`
- every `IIG_AI_*_SCORING_WORKER_ENABLED` flag
- every `IIG_AI_*_EVIDENCE_WORKER_ENABLED` flag
- `AI_SCORING_WEBHOOK_WORKER_ENABLED`

The application defaults these new workers to off when a flag is absent.

## Pre-release gate

1. Back up the target database and record the immutable application image SHA.
2. Confirm migrations `121`-`146` have not already failed or been modified.
3. Confirm every flag above resolves to `false` in the deployed process.
4. Run the AI Scoring contract suite and frontend production build.
5. Confirm no pending AI Scoring outbox or webhook delivery will be consumed.

## Post-release verification

- Application health endpoints remain healthy.
- Existing non-AI administration screens remain available.
- Tenant and scoring-job pages load with the expected permissions.
- Tenant/credential/webhook CRUD and audit writes succeed.
- No ingestion, scoring, model or webhook worker acquires a lease.
- No Dify, Gemini, Azure, IIG source or tenant webhook outbound call occurs.

## Rollback

Keep all workers disabled. Roll back only the application image to the recorded
previous SHA. Do not reverse applied migrations; they are additive and remain
dormant while the new routes are absent and workers are disabled.

## Activation boundary

Worker activation is release 2. It requires provider/storage secrets, a single
controlled end-to-end job, webhook verification and queue/error monitoring
before increasing concurrency or accepting normal traffic.
