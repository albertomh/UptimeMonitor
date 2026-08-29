// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MonitorTarget {
    project_env: string;
    url: string;
    cron: string; // only checked when ScheduledEvent.cron matches
}

export interface HealthCheckResult {
    project_env: string;
    target_url: string;
    status_code: number;
    latency_ms: number;
    response_body: string;
    is_healthy: boolean;
}

interface DbHealthCheck {
    id: number;
    timestamp: string;
    project_env: string;
    target_url: string;
    status_code: number;
    latency_ms: number;
    response_body: string;
    is_healthy: number; // 0 | 1
}

export interface Env {
    DB: D1Database;
    TARGETS_JSON: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Env bindings
// Extend this interface to match wrangler.toml / OpenTofu bindings.
// ─────────────────────────────────────────────────────────────────────────────

export interface Env {
    DB: D1Database;
    // human-readable project name for emails/dashboard; injected by OpenTofu
    PROJECT_DISPLAY_NAME: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function toHealthcheckTableRow(result: HealthCheckResult): DbHealthCheck {
    return {
        id: 0,
        timestamp: new Date().toISOString(),
        project_env: result.project_env,
        target_url: result.target_url,
        status_code: result.status_code,
        latency_ms: result.latency_ms,
        response_body: result.response_body,
        is_healthy: result.is_healthy ? 1 : 0,
    };
}

async function saveResult(
    db: D1Database,
    result: HealthCheckResult,
): Promise<void> {
    const row = toHealthcheckTableRow(result);
    await db
        .prepare(
            `INSERT INTO healthcheck
             (timestamp, project_env, target_url, status_code, latency_ms, response_body, is_healthy)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
            row.timestamp,
            row.project_env,
            row.target_url,
            row.status_code,
            row.latency_ms,
            row.response_body,
            row.is_healthy,
        )
        .run();
}

async function cleanUpOldEntries(
    db: D1Database,
    daysToKeep = 30,
): Promise<void> {
    const cutoffDate = new Date(
        Date.now() - daysToKeep * 24 * 60 * 60 * 1000,
    ).toISOString();
    await db
        .prepare("DELETE FROM healthcheck WHERE timestamp < ?")
        .bind(cutoffDate)
        .run();
}

// ─────────────────────────────────────────────────────────────────────────────
// Targets
// ─────────────────────────────────────────────────────────────────────────────

function displayName(env: Env): string {
    return env.PROJECT_DISPLAY_NAME ?? "MyProject";
}

export function isMonitorTarget(value: unknown): value is MonitorTarget {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as any).project_env === "string" &&
        typeof (value as any).url === "string" &&
        typeof (value as any).cron === "string"
    );
}

// Minute-interval of a cron expression. Supports the forms used in TARGETS_JSON:
// "* * * * *" (1) and "*/N * * * *" (N). Returns null for anything else.
export function parseCronMinuteInterval(cron: string): number | null {
    const minuteField = cron.trim().split(/\s+/)[0];
    if (minuteField === "*") return 1;
    const step = minuteField?.match(/^\*\/(\d+)$/);
    if (step) return Number(step[1]);
    return null;
}

export function getTargetsForMinute(env: Env, now: Date): MonitorTarget[] {
    try {
        const parsed: unknown = JSON.parse(env.TARGETS_JSON);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isMonitorTarget).filter((t) => {
            const interval = parseCronMinuteInterval(t.cron);
            if (interval === null) {
                console.warn(
                    `Unsupported cron ${t.cron} for ${t.url}; skipping`,
                );
                return false;
            }
            return now.getMinutes() % interval === 0;
        });
    } catch {
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000;
// keep stored response bodies small as failing endpoints can return whole pages
const MAX_RESPONSE_BODY_LENGTH = 500;

export async function performHealthCheck(
    target: MonitorTarget,
    userAgent: string,
): Promise<HealthCheckResult> {
    const start = Date.now();

    let status_code = 0;
    let latency_ms = 0;
    let response_body = "";
    let is_healthy = false;

    try {
        const response = await fetch(target.url, {
            headers: { "User-Agent": userAgent },
            redirect: "follow",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        // time-to-response; body download/parse excluded
        latency_ms = Date.now() - start;
        status_code = response.status;

        const json: unknown = await response.json().catch(() => null);

        const healthy =
            typeof json === "object" &&
            json !== null &&
            (json as any).healthy === true;

        is_healthy = response.ok && healthy;
        response_body = is_healthy ? "" : JSON.stringify(json ?? {});
    } catch (err) {
        latency_ms = Date.now() - start;
        response_body = err instanceof Error ? err.message : String(err);
    }

    return {
        project_env: target.project_env,
        target_url: target.url,
        status_code,
        latency_ms,
        response_body: response_body.slice(0, MAX_RESPONSE_BODY_LENGTH),
        is_healthy,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled handler
// ─────────────────────────────────────────────────────────────────────────────

async function runChecks(event: ScheduledEvent, env: Env): Promise<void> {
    const targets = getTargetsForMinute(env, new Date(event.scheduledTime));
    if (targets.length === 0) return;

    const userAgent = `${displayName(env)}-UptimeMonitor`;
    const results = await Promise.all(
        targets.map((t) => performHealthCheck(t, userAgent)),
    );

    await Promise.all(
        results.map(async (result) => {
            await saveResult(env.DB, result);
        }),
    );

    if (Math.random() < 0.01) {
        await cleanUpOldEntries(env.DB);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch handler + HTML
// ─────────────────────────────────────────────────────────────────────────────

async function handleFetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const envFilter = url.searchParams.get("env");

    const { results: envRows } = await env.DB.prepare(
        `SELECT DISTINCT project_env FROM healthcheck ORDER BY project_env ASC`,
    ).all<{ project_env: string }>();
    const envs = envRows.map((r) => r.project_env);

    const selectedEnv = envs.includes(envFilter ?? "") ? envFilter! : envs[0];
    if (!selectedEnv) return new Response("No data yet", { status: 200 });

    const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${displayName(env)} status · ${selectedEnv.toUpperCase()}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      :root {
        --bg: #0d0d0f; --surface: #16161a; --border: #2a2a30;
        --text: #e8e8ec; --muted: #6b6b7a;
        --up: #22c55e; --down: #ef4444; --accent: #3b82f6;
        --font: "Berkeley Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace;
      }
      body { background: var(--bg); color: var(--text); font-family: var(--font); font-size: 12px; line-height: 1.5; }
      header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; z-index: 100; }
      header .logo { color: #fff; }
      header[data-nonlive] { background: #ecca3d; border-bottom-color: #af921a; }
      header[data-nonlive] .logo { color: #000; }
      .logo { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; }
  </head>

  <body>

    <header ${selectedEnv.toLowerCase() !== "live" ? "data-nonlive" : ""}>
      <span class="logo">${displayName(env)} / Status</span>
    </header>

  </body>
</html>`;

    return new Response(html, {
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export default {
    async scheduled(
        event: ScheduledEvent,
        env: Env,
        _ctx: ExecutionContext,
    ): Promise<void> {
        await runChecks(event, env);
    },

    async fetch(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
    ): Promise<Response> {
        return handleFetch(request, env);
    },
};
