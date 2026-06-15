import { defineConfig, configDefaults } from "vitest/config";

// The frontend/ is an ISOLATED Next app with its own package.json + toolchain.
// Keep it out of the core's `npm test` so a judge's local run stays light and
// frontend-free, and so a future frontend test never leaks into this suite.
// (The root tsconfig already scopes typecheck/build to src + tests.)
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "frontend/**"],
  },
});
