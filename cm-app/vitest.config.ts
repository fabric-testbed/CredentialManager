import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * `@/` resolves the same way it does for Next.js.
 *
 * Without it a test importing a module that uses the alias fails to resolve at
 * runtime - and only for VALUE imports, since type-only ones erase. That makes
 * it look like the alias works until the first test that needs a real function
 * through one.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
