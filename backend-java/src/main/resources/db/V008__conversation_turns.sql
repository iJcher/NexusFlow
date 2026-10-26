-- Conversation ownership/version metadata only. Messages remain in LangGraph checkpoints.
ALTER TABLE run_request ADD COLUMN conversation_id uuid;
ALTER TABLE run_request ADD COLUMN previous_run_id uuid REFERENCES run_request(id);
CREATE INDEX conversation_turns ON run_request(workspace_id,account_id,conversation_id,created_at);
