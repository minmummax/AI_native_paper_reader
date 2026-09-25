-- Usage metadata only: never store keys, paper content, prompts or responses.
CREATE TABLE ai_usage (
    request_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','cancelled')),
    input_tokens INTEGER CHECK(input_tokens >= 0),
    output_tokens INTEGER CHECK(output_tokens >= 0)
);
CREATE INDEX idx_ai_usage_started ON ai_usage(started_at);
