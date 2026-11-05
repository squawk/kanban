import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { dirname, resolve } from "node:path";

/**
 * The Anthropic SDK lazily imports `internal/node.mjs` (node:fs, node:child_process, ...)
 * only to load credentials from files. We always pass `apiKey`, so that path never runs,
 * but bundling it into the Worker produced a chunk that references an import Rollup
 * dropped (`fssync is not defined`) and Cloudflare rejected the upload. Swap in the
 * SDK's own browser stub, the same substitution its package.json `browser` field makes.
 */
function anthropicSdkWorkerStub(): Plugin {
  return {
    name: "anthropic-sdk-worker-stub",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !/[\\/]@anthropic-ai[\\/]sdk[\\/]/.test(importer)) return null;
      if (!/(^|\/)internal\/node\.mjs$/.test(source)) return null;
      return resolve(dirname(importer), source).replace(/node\.mjs$/, "node.browser.mjs");
    },
  };
}

export default defineConfig({
  plugins: [
    anthropicSdkWorkerStub(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
    tsconfigPaths(),
  ],
  optimizeDeps: {
    // Scan every route and component for client dependencies at startup. Otherwise the
    // dev server discovers some only on the first page load, re-optimizes, and the
    // browser ends up mixing chunks from both builds (two Reacts: "Cannot read
    // properties of null (reading 'useContext')").
    entries: ["app/**/*.tsx", "!app/**/*.test.tsx"],
  },
});
