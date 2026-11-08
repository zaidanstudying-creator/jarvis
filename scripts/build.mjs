import { build } from "esbuild";
await build({
  entryPoints: ["src/main/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/main.cjs",
  external: ["electron", "@napi-rs/keyring"],
  sourcemap: true,
});
await build({
  entryPoints: ["src/preload/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/preload.cjs",
  external: ["electron"],
});
