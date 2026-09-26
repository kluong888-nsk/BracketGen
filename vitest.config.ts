import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig.json's "@/*" -> "./*" path mapping, so lib modules
    // that import via the "@/" alias at runtime (not just for types) also
    // resolve correctly under vitest, not just under Next.js's own build.
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
