import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

beforeAll(async () => {
    const { DB, TEST_SCHEMA } = env as unknown as {
        DB: D1Database;
        TEST_SCHEMA: string;
    };
    const statements = TEST_SCHEMA.split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => DB.prepare(s + ";"));
    await DB.batch(statements);
});
