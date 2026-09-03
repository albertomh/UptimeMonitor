import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env, MonitorTarget } from "./index";
import {
    getScheduledDate,
    getTargetsForMinute,
    isMonitorTarget,
    parseCronMinuteInterval,
    performHealthCheck,
    sendAlertEmail,
} from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// isMonitorTarget
// ─────────────────────────────────────────────────────────────────────────────

describe("isMonitorTarget", () => {
    it("accepts a valid target", () => {
        expect(
            isMonitorTarget({
                project_env: "live",
                url: "https://x.com",
                cron: "* * * * *",
            }),
        ).toBe(true);
    });

    it.each([null, 42, "string", [], {}])("rejects %s", (v) =>
        expect(isMonitorTarget(v)).toBe(false),
    );

    it("rejects object missing fields", () => {
        expect(
            isMonitorTarget({ project_env: "live", url: "https://x.com" }),
        ).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCronMinuteInterval
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCronMinuteInterval", () => {
    it.each([
        ["* * * * *", 1],
        ["*/5 * * * *", 5],
        ["*/15 * * * *", 15],
        ["*/30 * * * *", 30],
    ])("%s → %i", (cron, expected) => {
        expect(parseCronMinuteInterval(cron)).toBe(expected);
    });

    it.each(["0 * * * *", "5 * * * *", "bad"])("returns null for %s", (cron) =>
        expect(parseCronMinuteInterval(cron)).toBeNull(),
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// getScheduledDate
// ─────────────────────────────────────────────────────────────────────────────

describe("getScheduledDate", () => {
    it("uses scheduledTime from the scheduled controller", () => {
        const controller = {
            scheduledTime: Date.parse("2024-01-01T00:05:00Z"),
        } as ScheduledController;

        expect(getScheduledDate(controller).toISOString()).toBe(
            "2024-01-01T00:05:00.000Z",
        );
    });

    it("falls back to Date.now when scheduledTime is missing", () => {
        vi.setSystemTime(new Date("2024-01-01T00:07:00Z"));

        const controller = {} as ScheduledController;

        expect(getScheduledDate(controller).toISOString()).toBe(
            "2024-01-01T00:07:00.000Z",
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTargetsForMinute
// ─────────────────────────────────────────────────────────────────────────────

function makeEnv(targets: unknown[]): Env {
    return {
        TARGETS_JSON: JSON.stringify(targets),
        PROJECT_DISPLAY_NAME: "Test",
    } as unknown as Env;
}

const target = (cron: string): MonitorTarget => ({
    project_env: "live",
    url: "https://example.com/health",
    cron,
});

describe("getTargetsForMinute", () => {
    it("includes every-minute target at any minute", () => {
        const env = makeEnv([target("* * * * *")]);
        expect(
            getTargetsForMinute(env, new Date("2024-01-01T00:07:00Z")),
        ).toHaveLength(1);
    });

    it("includes */5 target at minute 0", () => {
        const env = makeEnv([target("*/5 * * * *")]);
        expect(
            getTargetsForMinute(env, new Date("2024-01-01T00:00:00Z")),
        ).toHaveLength(1);
    });

    it("includes */5 target at minute 15", () => {
        const env = makeEnv([target("*/5 * * * *")]);
        expect(
            getTargetsForMinute(env, new Date("2024-01-01T00:15:00Z")),
        ).toHaveLength(1);
    });

    it("excludes */5 target at minute 7", () => {
        const env = makeEnv([target("*/5 * * * *")]);
        expect(
            getTargetsForMinute(env, new Date("2024-01-01T00:07:00Z")),
        ).toHaveLength(0);
    });

    it("skips targets with unsupported cron", () => {
        const env = makeEnv([target("0 * * * *")]);
        expect(
            getTargetsForMinute(env, new Date("2024-01-01T00:00:00Z")),
        ).toHaveLength(0);
    });

    it("returns [] for invalid JSON", () => {
        const env = {
            TARGETS_JSON: "not-json",
            PROJECT_DISPLAY_NAME: "Test",
        } as unknown as Env;
        expect(getTargetsForMinute(env, new Date())).toEqual([]);
    });

    it("returns [] when TARGETS_JSON is not an array", () => {
        const env = makeEnv({} as any);
        expect(getTargetsForMinute(env, new Date())).toEqual([]);
    });

    it("filters out non-target entries mixed with valid ones", () => {
        const env = makeEnv([target("* * * * *"), { bad: true }, null]);
        expect(
            getTargetsForMinute(env, new Date("2024-01-01T00:00:00Z")),
        ).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// performHealthCheck
// ─────────────────────────────────────────────────────────────────────────────

const healthTarget: MonitorTarget = {
    project_env: "live",
    url: "https://example.com/health",
    cron: "* * * * *",
};

describe("performHealthCheck", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns is_healthy=true for 200 with {healthy:true}", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ healthy: true }), { status: 200 }),
        );
        const result = await performHealthCheck(
            healthTarget,
            "Test-UptimeWorker",
        );
        expect(result.is_healthy).toBe(true);
        expect(result.status_code).toBe(200);
        expect(result.response_body).toBe("");
    });

    it("returns is_healthy=false for 200 with {healthy:false}", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ healthy: false }), { status: 200 }),
        );
        const result = await performHealthCheck(
            healthTarget,
            "Test-UptimeWorker",
        );
        expect(result.is_healthy).toBe(false);
        expect(result.response_body).not.toBe("");
    });

    it("returns is_healthy=false for non-2xx", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ healthy: true }), { status: 503 }),
        );
        const result = await performHealthCheck(
            healthTarget,
            "Test-UptimeWorker",
        );
        expect(result.is_healthy).toBe(false);
        expect(result.status_code).toBe(503);
    });

    it("handles non-JSON response body", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response("<html>Error</html>", { status: 500 }),
        );
        const result = await performHealthCheck(
            healthTarget,
            "Test-UptimeWorker",
        );
        expect(result.is_healthy).toBe(false);
        expect(result.status_code).toBe(500);
    });

    it("handles fetch throwing (network error)", async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error("network failure"));
        const result = await performHealthCheck(
            healthTarget,
            "Test-UptimeWorker",
        );
        expect(result.is_healthy).toBe(false);
        expect(result.status_code).toBe(0);
        expect(result.response_body).toContain("network failure");
    });

    it("truncates response_body to MAX_RESPONSE_BODY_LENGTH", async () => {
        const big = JSON.stringify({
            healthy: false,
            detail: "x".repeat(1000),
        });
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(big, { status: 500 }),
        );
        const result = await performHealthCheck(
            healthTarget,
            "Test-UptimeWorker",
        );
        expect(result.response_body.length).toBeLessThanOrEqual(500);
    });

    it("sets project_env and target_url from target", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ healthy: true }), { status: 200 }),
        );
        const result = await performHealthCheck(
            healthTarget,
            "Test-UptimeWorker",
        );
        expect(result.project_env).toBe("live");
        expect(result.target_url).toBe("https://example.com/health");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// escapeHtml
// ─────────────────────────────────────────────────────────────────────────────

import { escapeHtml } from "./index";

describe("escapeHtml", () => {
    it("passes through plain text unchanged", () => {
        expect(escapeHtml("hello world")).toBe("hello world");
    });

    it.each([
        ["&", "&amp;"],
        ["<", "&lt;"],
        [">", "&gt;"],
        ['"', "&quot;"],
    ])("escapes %s", (input, expected) => {
        expect(escapeHtml(input)).toBe(expected);
    });

    it("escapes multiple special chars in one string", () => {
        expect(escapeHtml('<a href="x">hi & bye</a>')).toBe(
            "&lt;a href=&quot;x&quot;&gt;hi &amp; bye&lt;/a&gt;",
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAlertRecipients (via makeEnv)
// ─────────────────────────────────────────────────────────────────────────────
// getAlertRecipients is not exported, so exercise it through sendAlertEmail
// by verifying what gets POSTed to Mailtrap. Alternatively, export it and
// import directly — the tests below assume it's exported.

import { getAlertRecipients } from "./index";

function makeAlertEnv(alertToAddresses: string): Env {
    return {
        TARGETS_JSON: "[]",
        PROJECT_DISPLAY_NAME: "Test",
        ALERT_TO_ADDRESSES: alertToAddresses,
        ALERT_FROM: "from@example.com",
        ALERT_PROVIDER: "mailtrap",
        ALERT_API_KEY: "key",
    } as unknown as Env;
}

describe("getAlertRecipients", () => {
    it("returns list of addresses from valid JSON array", () => {
        const env = makeAlertEnv('["a@b.com","c@d.com"]');
        expect(getAlertRecipients(env)).toEqual(["a@b.com", "c@d.com"]);
    });

    it("returns [] for invalid JSON", () => {
        expect(getAlertRecipients(makeAlertEnv("not-json"))).toEqual([]);
    });

    it("returns [] when value is not an array", () => {
        expect(getAlertRecipients(makeAlertEnv('"a@b.com"'))).toEqual([]);
        expect(getAlertRecipients(makeAlertEnv("{}"))).toEqual([]);
    });

    it("filters out non-string entries", () => {
        const env = makeAlertEnv('["a@b.com", 42, null, "c@d.com"]');
        expect(getAlertRecipients(env)).toEqual(["a@b.com", "c@d.com"]);
    });

    it("returns [] for empty array", () => {
        expect(getAlertRecipients(makeAlertEnv("[]"))).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getPreviousIsHealthyValue
// ─────────────────────────────────────────────────────────────────────────────
// Tested indirectly via the scheduled handler's alerting behaviour — stubbing
// the D1 first() call. If getPreviousIsHealthyValue is exported, prefer direct
// tests.

import { getPreviousIsHealthyValue } from "./index";

function makeDb(
    row: { is_healthy: number } | null,
    onBind?: (...args: unknown[]) => void,
): D1Database {
    return {
        prepare: () => ({
            bind: (...args: unknown[]) => {
                onBind?.(...args);
                return {
                    first: vi.fn().mockResolvedValue(row),
                };
            },
        }),
    } as unknown as D1Database;
}

describe("getPreviousIsHealthyValue", () => {
    it("returns null when no prior row exists", async () => {
        expect(
            await getPreviousIsHealthyValue(
                makeDb(null),
                "dev",
                "https://example.com/health",
            ),
        ).toBeNull();
    });

    it("returns true when prior row has is_healthy=1", async () => {
        expect(
            await getPreviousIsHealthyValue(
                makeDb({ is_healthy: 1 }),
                "dev",
                "https://example.com/health",
            ),
        ).toBe(true);
    });

    it("returns false when prior row has is_healthy=0", async () => {
        expect(
            await getPreviousIsHealthyValue(
                makeDb({ is_healthy: 0 }),
                "dev",
                "https://example.com/health",
            ),
        ).toBe(false);
    });

    it("looks up prior health by environment and URL", async () => {
        const bind = vi.fn();
        await getPreviousIsHealthyValue(
            makeDb({ is_healthy: 1 }, bind),
            "dev",
            "https://example.com/health",
        );
        expect(bind).toHaveBeenCalledWith("dev", "https://example.com/health");
    });
});

describe("sendAlertEmail", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(new Response("{}", { status: 200 })),
        );
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("escapes environment and URL in the email body", async () => {
        await sendAlertEmail(makeAlertEnv('["a@b.com"]'), {
            project_env: '<script>alert("env")</script>',
            target_url: 'https://example.com/?q=<script>alert("url")</script>',
            status_code: 503,
            latency_ms: 123,
            response_body: "",
            is_healthy: false,
        });

        const [, init] = vi.mocked(fetch).mock.calls[0];
        const body = JSON.parse(String(init?.body)) as { html: string };
        expect(body.html).not.toContain("<script>");
        expect(body.html).toContain("&lt;SCRIPT&gt;ALERT(&quot;ENV&quot;)");
        expect(body.html).toContain("&lt;script&gt;alert(&quot;url&quot;)");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetch handler
// ─────────────────────────────────────────────────────────────────────────────

import { env } from "cloudflare:workers";
import worker from "./index";

describe("fetch handler", () => {
    it("returns 200 with no data", async () => {
        const request = new Request("http://localhost/");
        const ctx = {
            waitUntil: () => {},
            passThroughOnException: () => {},
        } as ExecutionContext;
        const response = await worker.fetch(request, env as Env, ctx);
        expect(response.status).toBe(200);
    });

    it("escapes stored environment names in status page HTML", async () => {
        const maliciousEnv = '<script>alert("dash")</script>';
        await env.DB.prepare(
            `INSERT INTO healthcheck
             (timestamp, project_env, target_url, status_code, latency_ms, response_body, is_healthy)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
            .bind(
                new Date().toISOString(),
                maliciousEnv,
                "https://example.com/health",
                200,
                42,
                "",
                1,
            )
            .run();

        const request = new Request(
            `http://localhost/?env=${encodeURIComponent(maliciousEnv)}`,
        );
        const ctx = {
            waitUntil: () => {},
            passThroughOnException: () => {},
        } as ExecutionContext;
        const response = await worker.fetch(request, env as Env, ctx);
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(text).not.toContain("<script>alert");
        expect(text).toContain("&lt;SCRIPT&gt;ALERT(&quot;DASH&quot;)");
        expect(text).toContain(`?env=${encodeURIComponent(maliciousEnv)}`);
    });
});

describe("fetch handler /vendor/chart.js", () => {
    it("returns JS with long-lived cache headers", async () => {
        const request = new Request("http://localhost/vendor/chart.js");
        const ctx = {
            waitUntil: () => {},
            passThroughOnException: () => {},
        } as ExecutionContext;
        const response = await worker.fetch(request, env as Env, ctx);
        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe(
            "application/javascript",
        );
        expect(response.headers.get("Cache-Control")).toContain("immutable");
    });
});
