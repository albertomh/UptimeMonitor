-- Timestamps use the same ISO-8601 format the worker writes (2026-01-01T00:00:00.000Z):
-- the dashboard and cleanup compare timestamps as strings, so formats must not mix.

INSERT INTO healthcheck (
    timestamp,
    project_env,
    target_url,
    status_code,
    latency_ms,
    response_body,
    is_healthy
) VALUES
-- healthy streak
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes'), 'live', 'https://example.com/-/health/', 200, 120, '', 1),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-9 minutes'),  'live', 'https://example.com/-/health/', 200, 110, '', 1),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 minutes'),  'live', 'https://example.com/-/health/', 200, 130, '', 1),

-- failure spike
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 minutes'),  'live', 'https://example.com/-/health/', 500, 900, '{"error":"timeout"}', 0),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 minutes'),  'live', 'https://example.com/-/health/', 500, 850, '{"error":"timeout"}', 0),

-- recovery
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes'),  'live', 'https://example.com/-/health/', 200, 140, '', 1);

INSERT INTO healthcheck (
    timestamp,
    project_env,
    target_url,
    status_code,
    latency_ms,
    response_body,
    is_healthy
)
WITH RECURSIVE
  cnt(n) AS (
     SELECT 0
     UNION ALL
     SELECT n + 5 FROM cnt WHERE n < 100
  )
SELECT
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || (100 - n) || ' minutes'),
  'test',
  'http://127.0.0.1:8000/-/health/',
  -- a single failing "blip" 10 minutes ago (n = 90)
  CASE WHEN n = 90 THEN 500 ELSE 200 END,
  CASE WHEN n = 90 THEN 400 WHEN n = 75 THEN 75 ELSE 80 END,
  CASE WHEN n = 90 THEN '{"error":"db"}' ELSE '' END,
  CASE WHEN n = 90 THEN 0 ELSE 1 END
FROM cnt;
