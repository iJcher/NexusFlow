ALTER TABLE workspace ADD COLUMN purpose text NOT NULL DEFAULT 'PERSONAL' CHECK(purpose IN ('PERSONAL','TEST','LEGACY'));
UPDATE workspace SET purpose='LEGACY';
ALTER TABLE account ADD COLUMN home_workspace_id uuid REFERENCES workspace;
CREATE TABLE approval_decision (
    id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES workspace,
    run_id uuid NOT NULL REFERENCES run_request,
    interrupt_id text NOT NULL,
    actor_id uuid NOT NULL REFERENCES account,
    approved boolean NOT NULL,
    comment text NOT NULL,
    command_id uuid NOT NULL REFERENCES control_outbox,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(run_id,interrupt_id)
);
