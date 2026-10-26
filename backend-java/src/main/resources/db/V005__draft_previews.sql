ALTER TABLE definition_version ADD COLUMN stage text NOT NULL DEFAULT 'PUBLISHED' CHECK(stage IN ('PUBLISHED','PREVIEW'));
ALTER TABLE definition_version DROP CONSTRAINT definition_version_definition_id_hash_key;
ALTER TABLE definition_version ADD CONSTRAINT version_stage_hash UNIQUE(definition_id,hash,stage);
