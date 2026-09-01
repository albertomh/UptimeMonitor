import { readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const schema = readFileSync("schema.sql", "utf8");

export default defineConfig({
    plugins: [
        cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
                bindings: {
                    TEST_SCHEMA: schema,
                    FRONTEND_ALLOWED_COUNTRIES: "GB,US",
                },
            },
        }),
    ],
    test: {
        setupFiles: ["./src/_setup.ts"],
    },
});
