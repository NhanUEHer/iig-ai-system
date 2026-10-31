-- Prevent repeated terminal reconciliation from emitting duplicate business deliveries.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_webhook_delivery_job_event
  ON integration_webhook_deliveries(endpoint_id, job_id, event_type)
  WHERE job_id IS NOT NULL AND replay_of_id IS NULL;
