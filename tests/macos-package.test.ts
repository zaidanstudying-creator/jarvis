import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { macPackageOptions } from "../scripts/package-macos";
const root = path.resolve(import.meta.dirname, "..");
it.each(["arm64", "x64"])(
  "configures a locally signed macOS app for %s with microphone disclosure and unpacked native keychain",
  (arch) => {
    const options = macPackageOptions(root, arch);
    expect(options).toMatchObject({
      platform: "darwin",
      arch,
      name: "JARVIS",
      overwrite: false,
      prune: true,
      asar: { unpack: "**/*.node" },
      osxSign: { identity: "-", continueOnError: false },
    });
    expect(options.extendInfo).toHaveProperty("NSMicrophoneUsageDescription");
    const ignores = options.ignore as RegExp[];
    for (const name of [
      "/.env",
      "/.env.local",
      "/.env.example",
      "/.git/config",
      "/release/JARVIS.app",
      "/Install JARVIS.command",
    ])
      expect(ignores.some((pattern) => pattern.test(name))).toBe(true);
    for (const name of [
      "/dist/index.html",
      "/dist-electron/main.cjs",
      "/node_modules/@napi-rs/keyring/index.js",
    ])
      expect(ignores.some((pattern) => pattern.test(name))).toBe(false);
  },
);
it("rejects unsupported macOS architectures", () => {
  expect(() => macPackageOptions(root, "ia32")).toThrow("Only Apple Silicon");
});
it.skipIf(process.platform !== "linux")(
  "does not download or install anything when the installer is run on Linux",
  () => {
    const result = spawnSync(
      "bash",
      [path.join(root, "Install JARVIS.command")],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("hanya untuk macOS");
    expect(result.stdout).not.toContain("Mengunduh");
  },
);
