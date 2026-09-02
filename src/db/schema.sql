CREATE TABLE IF NOT EXISTS healthcheck (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    project_env TEXT,
    target_url TEXT,
    status_code INTEGER,
    latency_ms INTEGER,
    response_body TEXT,
    is_healthy BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_healthcheck_timestamp ON healthcheck(timestamp);
CREATE INDEX IF NOT EXISTS idx_healthcheck_target ON healthcheck(target_url);
CREATE INDEX IF NOT EXISTS idx_healthcheck_project_env ON healthcheck(project_env);
CREATE INDEX IF NOT EXISTS idx_healthcheck_env_target_timestamp ON healthcheck(project_env, target_url, timestamp);
