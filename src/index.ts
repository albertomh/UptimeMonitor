// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DbHealthCheck {
    id: number;
    timestamp: string;
    project_env: string;
}

export interface Env {
    DB: D1Database;
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
// Targets
// ─────────────────────────────────────────────────────────────────────────────

function displayName(env: Env): string {
    return env.PROJECT_DISPLAY_NAME ?? "MyProject";
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────────────────────────────────────

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
        _event: ScheduledEvent,
        _env: Env,
        _ctx: ExecutionContext,
    ): Promise<void> {},

    async fetch(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
    ): Promise<Response> {
        return handleFetch(request, env);
    },
};
