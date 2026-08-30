-- Seed data for the dashboard.
-- Uses SQLite's current time so all rows remain inside the dashboard's 12h window.

INSERT INTO healthcheck (
    timestamp,
    project_env,
    target_url,
    status_code,
    latency_ms,
    response_body,
    is_healthy
) VALUES
-- live: healthy → failure spike → recovery
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 minutes'), 'live', 'https://example.com/-/health/', 200, 120, '', 1),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-9 minutes'),  'live', 'https://example.com/-/health/', 200, 110, '', 1),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 minutes'),  'live', 'https://example.com/-/health/', 200, 130, '', 1),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 minutes'),  'live', 'https://example.com/-/health/', 500, 900, '{"error":"timeout"}', 0),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 minutes'),  'live', 'https://example.com/-/health/', 500, 850, '{"error":"timeout"}', 0),
(strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 minutes'),  'live', 'https://example.com/-/health/', 200, 140, '', 1);

-- test: one check every 5 minutes for the last ~2 hours,
-- with varying latency and one failure.
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
    SELECT n + 5 FROM cnt WHERE n < 120
  )
SELECT
    strftime(
        '%Y-%m-%dT%H:%M:%fZ',
        'now',
        '-' || (120 - n) || ' minutes'
    ),
    'test',
    'http://127.0.0.1:8000/-/health/',
    CASE WHEN n = 90 THEN 500 ELSE 200 END,
    CASE
        WHEN n = 90 THEN 400
        WHEN n = 85 THEN 250
        WHEN n = 80 THEN 180
        WHEN n = 75 THEN 140
        WHEN n = 70 THEN 110
        ELSE 80 + (n % 7) * 5
    END,
    CASE WHEN n = 90 THEN '{"error":"db"}' ELSE '' END,
    CASE WHEN n = 90 THEN 0 ELSE 1 END
FROM cnt;
