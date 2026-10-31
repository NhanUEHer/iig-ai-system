-- Permission for durable-state reconciliation. No scoring schema changes.

UPDATE roles
SET permissions = permissions || '["ai_scoring.operations.reconcile"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'ai_scoring.operations.reconcile';
