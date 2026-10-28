// Serves the normal game page with the test-pack entry instead of src/main.ts (used by the "pack" Playwright
// project). The production build never sees the test pack.
import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "../../vite.config.ts";

const testEntry: Plugin = {
  name: "test-pack-entry",
  transformIndexHtml(html) {
    if (!html.includes('src="/src/main.ts"')) throw new Error("index.html no longer loads /src/main.ts");
    return html.replace('src="/src/main.ts"', 'src="/tests/pack/main.ts"');
  },
};

export default mergeConfig(base, defineConfig({ plugins: [testEntry] }));
