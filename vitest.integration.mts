import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests contra Postgres real (TEST_DATABASE_URL). Se corren con `pnpm test:int`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.int.test.ts"],
    environment: "node",
    globalSetup: ["./src/server/db/test-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
