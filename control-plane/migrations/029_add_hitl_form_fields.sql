ALTER TABLE workflow_executions ADD COLUMN approval_form_schema TEXT;
ALTER TABLE workflow_executions ADD COLUMN approval_responder    TEXT;
ALTER TABLE workflow_executions ADD COLUMN approval_tags         TEXT;
ALTER TABLE workflow_executions ADD COLUMN approval_priority     TEXT;

CREATE INDEX IF NOT EXISTS idx_workflow_executions_hitl_pending
  ON workflow_executions (approval_status)
  WHERE approval_form_schema IS NOT NULL;
