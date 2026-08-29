import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env, MonitorTarget } from "./index";
import {
    getTargetsForMinute,
    isMonitorTarget,
    parseCronMinuteInterval,
    performHealthCheck,
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
            "Test-UptimeMonitor",
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
            "Test-UptimeMonitor",
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
            "Test-UptimeMonitor",
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
            "Test-UptimeMonitor",
        );
        expect(result.is_healthy).toBe(false);
        expect(result.status_code).toBe(500);
    });

    it("handles fetch throwing (network error)", async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error("network failure"));
        const result = await performHealthCheck(
            healthTarget,
            "Test-UptimeMonitor",
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
            "Test-UptimeMonitor",
        );
        expect(result.response_body.length).toBeLessThanOrEqual(500);
    });

    it("sets project_env and target_url from target", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(JSON.stringify({ healthy: true }), { status: 200 }),
        );
        const result = await performHealthCheck(
            healthTarget,
            "Test-UptimeMonitor",
        );
        expect(result.project_env).toBe("live");
        expect(result.target_url).toBe("https://example.com/health");
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
});
