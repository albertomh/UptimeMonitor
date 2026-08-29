import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
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
