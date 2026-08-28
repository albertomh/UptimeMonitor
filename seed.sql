-- Timestamps use the same ISO-8601 format the worker writes (1970-01-01T00:00:00.000Z):
-- the dashboard and cleanup compare timestamps as strings, so formats must not mix.

INSERT INTO healthcheck (
    timestamp,
    project_env
) VALUES
-- healthy streak
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes'), 'live'),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-9 minutes'), 'live'),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 minutes'), 'live'),

-- failure spike
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 minutes'), 'live'),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 minutes'), 'live'),

-- recovery
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes'), 'live');
