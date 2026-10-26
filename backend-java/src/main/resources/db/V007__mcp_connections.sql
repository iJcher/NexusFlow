CREATE TABLE mcp_connection (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES workspace,
 name text NOT NULL,
 url text NOT NULL,
 auth_type text NOT NULL CHECK (auth_type IN ('none','bearer')),
 credential text,
 enabled boolean NOT NULL DEFAULT false,
 catalog jsonb NOT NULL DEFAULT '[]',
 read_tools jsonb NOT NULL DEFAULT '[]',
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mcp_workspace ON mcp_connection(workspace_id);
