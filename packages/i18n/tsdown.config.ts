import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  platform: "neutral",
  exports: true,
  // Translations are loaded lazily via `./locales/<lang>/<ns>.json` (see src/load-locale.ts).
  copy: [{ from: "src/locales", to: "dist/locales" }],
});
