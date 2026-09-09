import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // mongodb-memory-server downloads and boots a real mongod binary on
    // first run, which can take well beyond vitest's 5s default timeout —
    // especially the very first time in a fresh environment/CI cache.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
