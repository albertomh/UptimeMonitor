CREATE TABLE IF NOT EXISTS healthcheck (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    project_env TEXT
);

CREATE INDEX IF NOT EXISTS idx_healthcheck_timestamp ON healthcheck(timestamp);
CREATE INDEX IF NOT EXISTS idx_healthcheck_project_env ON healthcheck(project_env);
