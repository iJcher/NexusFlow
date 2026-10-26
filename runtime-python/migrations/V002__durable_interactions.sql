ALTER TABLE run_root ADD COLUMN cancel_requested boolean NOT NULL DEFAULT false;
ALTER TABLE run_root ADD COLUMN interrupts jsonb NOT NULL DEFAULT '[]';
CREATE TABLE resume_application (
    command_id uuid PRIMARY KEY REFERENCES runtime_command,
    run_id uuid NOT NULL REFERENCES run_root,
    before_checkpoint text NOT NULL,
    decisions jsonb NOT NULL,
    state text NOT NULL DEFAULT 'PREPARED',
    after_checkpoint text,
    attempt_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resume_run ON resume_application(run_id);
