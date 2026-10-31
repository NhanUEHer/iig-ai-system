-- Emit one tenant-scoped webhook business event when an ingestion job becomes terminally failed.
CREATE OR REPLACE FUNCTION enqueue_failed_scoring_job_webhooks()
RETURNS TRIGGER AS $$
DECLARE
  webhook_event_id UUID := gen_random_uuid();
BEGIN
  IF NEW.status IN ('INVALID_REQUEST','SOURCE_FETCH_FAILED','MEDIA_FAILED','INVALID_INPUT','FAILED')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.credential_id IS NOT NULL THEN
    INSERT INTO integration_webhook_deliveries
      (endpoint_id,tenant_id,job_id,event_id,event_type,payload)
    SELECT endpoint.id,credential.tenant_id,NEW.id,webhook_event_id,'scoring.failed',
           jsonb_build_object(
             'id',webhook_event_id,'type','scoring.failed','createdAt',CURRENT_TIMESTAMP,
             'data',jsonb_build_object('jobId',NEW.id,'keycode',NEW.keycode,'status',NEW.status,
               'errorCode',NEW.error_code,'errorMessage',NEW.error_message)
           )
    FROM integration_api_credentials credential
    JOIN integration_webhook_endpoints endpoint ON endpoint.tenant_id=credential.tenant_id
      AND endpoint.status='ACTIVE' AND endpoint.event_types ? 'scoring.failed'
    WHERE credential.id=NEW.credential_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_failed_scoring_job_webhooks ON iig_scoring_jobs;
CREATE TRIGGER trg_enqueue_failed_scoring_job_webhooks
AFTER UPDATE OF status ON iig_scoring_jobs
FOR EACH ROW EXECUTE FUNCTION enqueue_failed_scoring_job_webhooks();
