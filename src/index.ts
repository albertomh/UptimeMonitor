// Vendored Chart.js (see vendor/), inlined as a string by esbuild/wrangler text
// loaders and served from /vendor/chart.js — no third-party CDN on the status page.
import chartJsSource from "./vendor/chart.umd.min.js.txt";

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

// ─────────────────────────────────────────────────────────────────────────────
// Env bindings
// Extend this interface to match wrangler.jsonc / OpenTofu bindings.
// ─────────────────────────────────────────────────────────────────────────────

export interface Env {
    DB: D1Database;
    // human-readable project name for emails/dashboard; injected by OpenTofu
    PROJECT_DISPLAY_NAME: string;
    TARGETS_JSON: string;

    // two-letter country codes
    // <https://developers.cloudflare.com/workers/runtime-apis/request/#:~:text=country>
    FRONTEND_ALLOWED_COUNTRIES: string; // comma-separated, e.g. "GB,US,FR"

    ALERT_TO_ADDRESSES: string; // string-encoded list of recipient addresses
    ALERT_FROM: string; // sender address (must be verified with provider)

    ALERT_PROVIDER: "mailtrap";
    ALERT_API_KEY: string;
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

// Returns the is_healthy value of the most recent prior check for this env,
// or null if none exists (first run — don't alert).
export async function getPreviousIsHealthyValue(
    db: D1Database,
    project_env: string,
): Promise<boolean | null> {
    const row = await db
        .prepare(
            `SELECT is_healthy FROM healthcheck
             WHERE project_env = ?
             ORDER BY timestamp DESC
             LIMIT 1`,
        )
        .bind(project_env)
        .first<{ is_healthy: number }>();

    return row ? row.is_healthy === 1 : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alerting
// ─────────────────────────────────────────────────────────────────────────────

export function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

export function getAlertRecipients(env: Env): string[] {
    try {
        const parsed: unknown = JSON.parse(env.ALERT_TO_ADDRESSES);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((v): v is string => typeof v === "string");
    } catch {
        return [];
    }
}

async function sendMailtrapEmail(
    apiKey: string,
    fromAddress: string,
    toAddresses: string[],
    subject: string,
    html: string,
): Promise<void> {
    const res = await fetch("https://send.api.mailtrap.io/api/send", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: { email: fromAddress },
            to: toAddresses.map((email) => ({ email })),
            subject,
            html,
        }),
    });

    if (!res.ok) {
        console.error("Mailtrap error", res.status, await res.text());
    }
}

async function sendInitialEmail(
    env: Env,
    result: HealthCheckResult,
): Promise<void> {
    const subject = `[${displayName(env)}] UptimeWorker online`;
    const htmlBody = `
<table style="border-collapse:collapse;font-family:monospace;font-size:12px;">
  <tr>
    <td style="padding:4px 8px;border:1px solid #fff;">Time</td>
    <td style="padding:4px 8px;border:1px solid #fff;">${new Date().toISOString()}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;border:1px solid #fff;">Environment</td>
    <td style="padding:4px 8px;border:1px solid #fff;">${result.project_env.toUpperCase()}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;border:1px solid #fff;">Status</td>
    <td style="padding:4px 8px;border:1px solid #fff;">online</td>
  </tr>
</table>
`.trim();

    await sendMailtrapEmail(
        env.ALERT_API_KEY,
        env.ALERT_FROM,
        getAlertRecipients(env),
        subject,
        htmlBody,
    );
    return;
}

async function sendAlertEmail(
    env: Env,
    result: HealthCheckResult,
): Promise<void> {
    const status = result.is_healthy ? "RECOVERED ✅" : "DOWN ❌";
    const subject = `[${displayName(env)}] ${result.project_env.toUpperCase()} is ${status}`;

    const httpCode =
        result.status_code === 0 ? "NETWORK ERROR" : String(result.status_code);
    const htmlBody = `
<table style="border-collapse:collapse;font-family:monospace;font-size:12px;">
  <tr>
    <td style="padding:4px 8px;border:1px solid #fff;">Time</td>
    <td style="padding:4px 8px;border:1px solid #fff;">${new Date().toISOString()}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;border:1px solid #fff;">Environment</td>
    <td style="padding:4px 8px;border:1px solid #fff;">${result.project_env.toUpperCase()}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;border:1px solid #fff;">URL</td>
    <td style="padding:4px 8px;border:1px solid #fff;">${result.target_url}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;border:1px solid #fff;">Status</td>
    <td style="padding:4px 8px;border:1px solid #fff;">${status}</td>
  </tr>
  <tr>
    <td style="padding:4px 8px;border:1px solid #fff;">HTTP code</td>
    <td style="padding:4px 8px;border:1px solid #fff;">${httpCode}</td>
  </tr>
  ${
      result.response_body
          ? `<tr>
               <td style="padding:4px 8px;border:1px solid #fff;">Response</td>
               <td style="padding:4px 8px;border:1px solid #fff;">${escapeHtml(result.response_body)}</td>
             </tr>`
          : ""
}
  <tr>
    <td style="padding:4px 8px;border:1px solid #fff;">Latency</td>
    <td style="padding:4px 8px;border:1px solid #fff;">${result.latency_ms} ms</td>
  </tr>
</table>
`.trim();

    if (env.ALERT_PROVIDER === "mailtrap") {
        await sendMailtrapEmail(
            env.ALERT_API_KEY,
            env.ALERT_FROM,
            getAlertRecipients(env),
            subject,
            htmlBody,
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled handler
// ─────────────────────────────────────────────────────────────────────────────

async function runChecks(event: ScheduledEvent, env: Env): Promise<void> {
    const targets = getTargetsForMinute(env, new Date(event.scheduledTime));
    if (targets.length === 0) return;

    const userAgent = `${displayName(env)}-UptimeWorker`;
    const results = await Promise.all(
        targets.map((t) => performHealthCheck(t, userAgent)),
    );

    await Promise.all(
        results.map(async (result) => {
            const previousIsHealthyValue = await getPreviousIsHealthyValue(
                env.DB,
                result.project_env,
            );

            await saveResult(env.DB, result);

            // Null on first run. Send email, but also don't fire a spurious
            // DOWN/RECOVERED transition alert.
            if (previousIsHealthyValue === null) {
                await sendInitialEmail(env, result);
                return;
            }

            if (previousIsHealthyValue !== result.is_healthy) {
                await sendAlertEmail(env, result);
            }
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
    const allowed = env.FRONTEND_ALLOWED_COUNTRIES.split(",").map((s) =>
        s.trim(),
    );
    const requestCountry = (request.cf as IncomingRequestCfProperties)?.country;
    if (requestCountry && !allowed.includes(requestCountry)) {
        return new Response(null, { status: 404 });
    }

    const url = new URL(request.url);

    if (url.pathname === "/vendor/chart.js") {
        return new Response(chartJsSource, {
            headers: {
                "Content-Type": "application/javascript",
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    }

    const envFilter = url.searchParams.get("env");

    const { results: envRows } = await env.DB.prepare(
        `SELECT DISTINCT project_env FROM healthcheck ORDER BY project_env ASC`,
    ).all<{ project_env: string }>();
    const envs = envRows.map((r) => r.project_env);

    const selectedEnv = envs.includes(envFilter ?? "") ? envFilter! : envs[0];
    if (!selectedEnv) return new Response("No data yet", { status: 200 });

    const [{ results }, statsRow] = await Promise.all([
        // LIMIT is 1000 to ensure we cover the 'last 12h' window
        env.DB.prepare(
            `SELECT * FROM healthcheck WHERE project_env = ? ORDER BY timestamp DESC LIMIT 1000`,
        )
            .bind(selectedEnv)
            .all<DbHealthCheck>(),

        env.DB.prepare(
            `SELECT COUNT(*) as total, MIN(timestamp) as earliest FROM healthcheck WHERE project_env = ?`,
        )
            .bind(selectedEnv)
            .first<{ total: number; earliest: string }>(),
    ]);

    const totalCount = statsRow?.total ?? 0;
    const earliestTs = statsRow?.earliest
        ? statsRow.earliest.replace("T", " ").slice(0, 19)
        : "—";

    const lastTransitionRow = await env.DB.prepare(
        `SELECT timestamp, is_healthy FROM healthcheck
        WHERE project_env = ?
        AND is_healthy != (
            SELECT is_healthy FROM healthcheck
            WHERE project_env = ?
            ORDER BY timestamp DESC LIMIT 1
        )
        ORDER BY timestamp DESC LIMIT 1`,
    )
        .bind(selectedEnv, selectedEnv)
        .first<{ timestamp: string; is_healthy: number }>();

    const lastTransition = lastTransitionRow
        ? (() => {
              const ts = lastTransitionRow.timestamp;
              const diffMs = Date.now() - new Date(ts).getTime();
              const diffMins = Math.floor(diffMs / 60_000);
              const diffHours = Math.floor(diffMs / 3_600_000);
              const diffDays = Math.floor(diffMs / 86_400_000);
              const ago =
                  diffMins < 1
                      ? "just now"
                      : diffMins < 60
                        ? `${diffMins}m ago`
                        : diffHours < 24
                          ? `${diffHours}h ago`
                          : `${diffDays}d ago`;
              return `${ts.replace("T", " ").slice(0, 19)} UTC (${ago})`;
          })()
        : "no transitions recorded";

    const staleRows = await env.DB.prepare(
        `SELECT project_env, MAX(timestamp) as last_check
        FROM healthcheck
        GROUP BY project_env`,
    ).all<{ project_env: string; last_check: string }>();

    // An env is stale when its last check is older than 2.5x its own cadence —
    // a fixed threshold would permanently flag any env checked less often than it.
    const staleThresholdMs = new Map<string, number>();
    try {
        const parsed: unknown = JSON.parse(env.TARGETS_JSON);
        if (Array.isArray(parsed)) {
            for (const t of parsed.filter(isMonitorTarget)) {
                const interval = parseCronMinuteInterval(t.cron) ?? 5;
                staleThresholdMs.set(t.project_env, interval * 2.5 * 60 * 1000);
            }
        }
    } catch {
        // unparsable TARGETS_JSON: fall through to the default threshold below
    }

    const staleEnvs = staleRows.results
        .filter(
            (r) =>
                Date.now() - new Date(r.last_check).getTime() >
                (staleThresholdMs.get(r.project_env) ?? 5 * 60 * 1000),
        )
        .map((r) => r.project_env.toUpperCase());

    const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${displayName(env)} status · ${selectedEnv.toUpperCase()}</title>
    <script src="/vendor/chart.js"></script>
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
      .env-toggle { margin-left: auto; display: flex; border: 1px solid var(--border); border-radius: 3px; overflow: hidden; }
      .env-toggle a { padding: 0.2rem 0.6rem; font-size: 11px; font-family: var(--font); font-weight: 700; letter-spacing: 0.08em; text-decoration: none; color: var(--muted); background: var(--bg); border-right: 1px solid var(--border); transition: background 0.1s, color 0.1s; }
      .env-toggle a:last-child { border-right: none; }
      .env-toggle a:hover { background: var(--surface); color: var(--text); }
      .env-toggle a.active { background: var(--surface); color: var(--text); }
      .stale-warning-banner { background: var(--down); color: #fff; font-family: var(--font); font-size: 11px; font-weight: 700; padding: 0.4rem 1rem; letter-spacing: 0.05em; }
      .summary { display: flex; gap: 2px; padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); align-items: center; }
      .summary-stat { margin-left: 1.5rem; color: var(--muted); }
      .summary-stat span { color: var(--text); }
      #lastTransition { padding-top: 0; }
      #lastTransition span { margin: 0; }
      .pill { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.15rem 0.5rem; border-radius: 2px; }
      .pill-up   { background: color-mix(in srgb, var(--up)   20%, transparent); color: var(--up); }
      .pill-down { background: color-mix(in srgb, var(--down) 20%, transparent); color: var(--down); }
      .blocks-wrap { padding: 0.75rem 1rem 0; overflow: hidden; }
      .blocks { display: flex; gap: 3px; overflow: hidden; }
      .block { flex: 0 0 14px; width: 14px; height: 28px; border-radius: 2px; cursor: default; }
      .block-up   { background: var(--up);   opacity: 0.75; }
      .block-down { background: var(--down); opacity: 0.9; }
      .block:hover, .block.active { opacity: 1; }
      .block-tooltip { height: 1.6rem; display: flex; align-items: center; padding: 0.2rem 0; font-size: 10px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .charts { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
      .chart-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.25rem; }
      canvas#latencyChart { width: 100% !important; height: 120px !important; }
      .table-wrap { overflow-x: auto; padding: 0 1rem 1rem; }
      table { width: 100%; border-collapse: collapse; }
      thead th { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--border); padding: 0.4rem 0.5rem; text-align: left; white-space: nowrap; }
      tbody tr { border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent); }
      tbody tr:hover { background: var(--surface); }
      td { padding: 0.35rem 0.5rem; white-space: nowrap; color: var(--muted); }
      td.ts   { color: var(--text); font-variant-numeric: tabular-nums; }
      td.env  { color: var(--accent); }
      td.lat  { font-variant-numeric: tabular-nums; }
      td.up   { color: var(--up);   font-weight: 700; }
      td.down { color: var(--down); font-weight: 700; }
    </style>
  </head>

  <body>

    <header ${selectedEnv.toLowerCase() !== "live" ? "data-nonlive" : ""}>
      <span class="logo">${displayName(env)} / Status</span>
      <nav class="env-toggle">
        ${envs.map((e) => `<a href="?env=${e}" class="${e === selectedEnv ? "active" : ""}">${e.toUpperCase()}</a>`).join("")}
      </nav>
    </header>

    ${
        staleEnvs.length > 0
            ? `
    <div class="stale-warning-banner">
    ❕ No recent checks recorded: ${staleEnvs.join(", ")}
    </div>`
            : ""
    }

    <div class="summary" id="summary"></div>

    <div class="blocks-wrap">
      <div class="blocks" id="blocks"></div>
      <div class="block-tooltip" id="block-tooltip">&nbsp;</div>
    </div>

    <div class="summary" id="lastTransition"></div>

    <div class="charts">
      <div class="chart-label">Latency (ms)</div>
      <canvas id="latencyChart"></canvas>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>Time (UTC)</th><th>Status</th><th>Latency</th><th>Env</th></tr></thead>
        <tbody>
          ${results
              .slice(0, 15)
              .map(
                  (r) => `
            <tr>
              <td class="ts">${new Date(r.timestamp).toISOString().replace("T", " ").slice(0, 19)}</td>
              <td class="${r.is_healthy ? "up" : "down"}">${r.status_code} ${r.is_healthy ? "OK" : "FAIL"}</td>
              <td class="lat">${r.latency_ms}ms</td>
              <td class="env">${r.project_env}</td>
            </tr>`,
              )
              .join("")}
        </tbody>
      </table>
      <div style="margin-top:0.5rem;font-size:10px;color:var(--muted);">
        showing ${Math.min(15, totalCount)}/${totalCount} entries since ${earliestTs} UTC
        (${Math.floor((Date.now() - new Date(statsRow?.earliest ?? Date.now()).getTime()) / 86_400_000)} days ago)
      </div>
    </div>


  <script>
  (function () {
    // Escape < so a stored response_body containing a 'script' tag can't break out.
    const data = ${JSON.stringify(results).replaceAll("<", "\\u003c")}.reverse();
    const recent12h = data.filter(r => Date.now() - new Date(r.timestamp).getTime() < 43_200_000);

    // Summary bar
    const total = recent12h.length;
    const upCount = recent12h.filter(r => r.is_healthy).length;
    const uptimePct = total ? ((upCount / total) * 100).toFixed(1) : "—";
    const avgLatency = total ? Math.round(recent12h.reduce((s, r) => s + r.latency_ms, 0) / total) : "—";
    const lastHealthy = recent12h.at(-1)?.is_healthy;

    document.getElementById("summary").innerHTML = \`
      <span class="pill \${lastHealthy ? "pill-up" : "pill-down"}">\${lastHealthy ? "OPERATIONAL" : "DEGRADED"}</span>
      <span class="summary-stat">Last 12h:</span>
      <span class="summary-stat"><span>\${uptimePct}%</span> uptime</span>
      <span class="summary-stat"><span>\${avgLatency}ms</span> μ latency</span>
      <span class="summary-stat"><span>\${total}</span> checks</span>
    \`;

    document.getElementById("lastTransition").innerHTML = \`
      <span class="summary-stat">Last change <span>${lastTransition}</span></span>
    \`;

    const blocksEl = document.getElementById("blocks");
    const tooltipEl = document.getElementById("block-tooltip");

    // Status blocks
    const blockWidth = 16; // 14px + 2px gap
    const availableWidth = blocksEl.parentElement.clientWidth - 32; // minus 1rem each side
    const maxBlocks = Math.floor(availableWidth / blockWidth);
    const blockData = recent12h.slice(-maxBlocks);
    blocksEl.innerHTML = blockData.map(r => {
      const t = new Date(r.timestamp).toISOString().replace("T"," ").slice(0,19);
      return \`<div class="block \${r.is_healthy ? "block-up" : "block-down"}" data-tip="\${t} · \${r.latency_ms}ms"></div>\`;
    }).join("");

    let activeBlock = null;
    function showTip(el) {
      if (activeBlock) activeBlock.classList.remove("active");
      activeBlock = el; el.classList.add("active");
      tooltipEl.textContent = el.dataset.tip;
    }
    function clearTip(el) {
      el.classList.remove("active");
      tooltipEl.innerHTML = "&nbsp;";
      activeBlock = null;
    }
    blocksEl.querySelectorAll(".block").forEach(el => {
      el.addEventListener("mouseenter", () => showTip(el));
      el.addEventListener("mouseleave", () => clearTip(el));
      el.addEventListener("touchstart", e => { e.preventDefault(); showTip(el); }, { passive: false });
      el.addEventListener("touchend", () => setTimeout(() => clearTip(el), 1500));
    });

    const chartData = recent12h
    .slice()
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() -
        new Date(b.timestamp).getTime(),
    );

    const labels = [];
    const values = [];

    const now = Date.now();
    for (let i = 12 * 60 - 1; i >= 0; i--) {
      const t = new Date(now - i * 60 * 1000);
      labels.push(t.toISOString().slice(11, 16));
      values.push(null);
    }

    // Put actual measurements into their minute slots.
    for (const r of chartData) {
      const ageMinutes = Math.floor(
        (now - new Date(r.timestamp).getTime()) / 60_000,
      );

      const index = 12 * 60 - 1 - ageMinutes;
      if (index >= 0 && index < values.length) {
        values[index] = r.latency_ms;
      }
    }

    const maxLatency = Math.max(...values.filter(v => v !== null));
    const step = Math.pow(10, Math.floor(Math.log10(maxLatency))) / 2;
    const yMax = Math.ceil(maxLatency / step) * step + step;

    new Chart(document.getElementById("latencyChart").getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "${selectedEnv.toUpperCase()}",
          data: values,
          yAxisID: "y",
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.08)",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.3,
          spanGaps: true,
        }]
      },
      options: {
        animation: false, maintainAspectRatio: false, responsive: true,
        scales: {
          x: { ticks: { color: "#6b6b7a", font: { size: 10 }, maxTicksLimit: 12, autoSkip: true }, grid: { color: "#2a2a30" } },
          y: { beginAtZero: true, ticks: { color: "#6b6b7a", font: { size: 10 } }, grid: { color: "#2a2a30" } },
          y2: {
              position: "right",
              beginAtZero: true,
              min: 0,
              ticks: { color: "#6b6b7a", font: { size: 10 } },
              grid: { drawOnChartArea: false },
              display: window.innerWidth >= 640,
              afterDataLimits(scale) {
                const y = scale.chart.scales.y;
                scale.min = y.min;
                scale.max = y.max;
              },
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: { mode: "index", intersect: false, backgroundColor: "#16161a", titleColor: "#e8e8ec", bodyColor: "#6b6b7a", borderColor: "#2a2a30", borderWidth: 1 }
        }
      }
    });
  })();
  </script>

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
