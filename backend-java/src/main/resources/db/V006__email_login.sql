ALTER TABLE account ADD COLUMN email text UNIQUE;
CREATE TABLE email_challenge (
    id uuid PRIMARY KEY,
    email text NOT NULL,
    code_hash text NOT NULL,
    state text NOT NULL DEFAULT 'PENDING',
    attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_challenge_recent ON email_challenge(email,created_at DESC);
