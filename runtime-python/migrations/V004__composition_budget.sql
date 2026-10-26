-- Charges are business intents, not graph tasks. Root command scheduling stays unchanged.
CREATE TABLE budget_charge (
    run_id uuid NOT NULL REFERENCES run_root,
    charge_key text NOT NULL,
    field text NOT NULL CHECK (field IN ('model_calls','tool_calls','tokens')),
    amount bigint NOT NULL CHECK (amount > 0),
    PRIMARY KEY (run_id, charge_key, field)
);
