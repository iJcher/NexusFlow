CREATE TABLE connection_use_grant (workspace_id uuid REFERENCES workspace, connection_ref text NOT NULL, PRIMARY KEY(workspace_id,connection_ref));
-- Upgrade the already-provisioned local development owner once; not rerun on service startup.
INSERT INTO connection_use_grant(workspace_id,connection_ref)
SELECT m.workspace_id,'validation-model' FROM membership m JOIN account a ON a.id=m.account_id
WHERE a.username='developer' AND m.role='owner';
