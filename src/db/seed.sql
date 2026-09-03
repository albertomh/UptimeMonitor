-- Seed data for the status page.
-- Uses SQLite's current time so all rows remain inside the status page's 12h window.

-- live: one check per minute for the last 12 hours, with several failure spikes.
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
    SELECT n + 1 FROM cnt WHERE n < 720
  )
SELECT
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || (720 - n) || ' minutes'),
    'live',
    'https://example.com/-/health/',
    CASE WHEN n IN (85, 86, 87, 210, 211, 212, 213, 450, 601, 602, 708, 709, 710) THEN 500 ELSE 200 END,
    CAST(
        100 + 35 * ((sin(n * 0.03) + 1) / 2)
        + 800 * max(0.0, 1.0 - abs(n - 86)  / 3.0)   -- sharp spike
        + 500 * max(0.0, 1.0 - abs(n - 211) / 6.0)   -- broad hump
        + 650 * max(0.0, 1.0 - abs(n - 450) / 2.0)   -- very sharp
        + 420 * max(0.0, 1.0 - abs(n - 601) / 5.0)   -- moderate
        + 700 * max(0.0, 1.0 - abs(n - 709) / 4.0)   -- recent spike
    AS INTEGER),
    CASE WHEN n IN (85, 86, 87, 210, 211, 212, 213, 450, 601, 602, 708, 709, 710) THEN '{"error":"timeout"}' ELSE '' END,
    CASE WHEN n IN (85, 86, 87, 210, 211, 212, 213, 450, 601, 602, 708, 709, 710) THEN 0 ELSE 1 END
FROM cnt;

-- test: one check every 5 minutes for the last 6 hours, with several failures.
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
    SELECT n + 5 FROM cnt WHERE n < 360
  )
SELECT
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || (360 - n) || ' minutes'),
    'test',
    'http://127.0.0.1:8000/-/health/',
    CASE WHEN n IN (90, 270, 275) THEN 500 ELSE 200 END,
    CAST(
        80 + 40 * ((sin(n * 0.05) + 1) / 2)
        + 350 * max(
            max(0.0, 1.0 - abs(n - 90)  / 15.0),
            max(0.0, 1.0 - abs(n - 270) / 15.0),
            max(0.0, 1.0 - abs(n - 275) / 15.0)
        )
    AS INTEGER),
    CASE WHEN n IN (90, 270, 275) THEN '{"error":"db"}' ELSE '' END,
    CASE WHEN n IN (90, 270, 275) THEN 0 ELSE 1 END
FROM cnt;
