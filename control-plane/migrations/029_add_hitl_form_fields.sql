-- Idempotent on re-run: if a previous invocation landed the columns but
-- didn't mark the migration applied, the IF NOT EXISTS guards let the
-- migration complete cleanly on the next boot.

ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS approval_form_schema TEXT;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS approval_responder    TEXT;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS approval_tags         TEXT;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS approval_priority     TEXT;

CREATE INDEX IF NOT EXISTS idx_workflow_executions_hitl_pending
  ON workflow_executions (approval_status)
  WHERE approval_form_schema IS NOT NULL;
