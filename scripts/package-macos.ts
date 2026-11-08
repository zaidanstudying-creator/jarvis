import { packager, type Options } from "@electron/packager";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function macPackageOptions(root: string, arch: string): Options {
  if (arch !== "arm64" && arch !== "x64")
    throw new Error("Only Apple Silicon and Intel Macs are supported.");
  const manifest = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  return {
    dir: root,
    out: path.join(root, "release"),
    name: "JARVIS",
    executableName: "JARVIS",
    platform: "darwin",
    arch,
    appBundleId: "com.jarvis.desktop",
    appVersion: manifest.version,
    appCategoryType: "public.app-category.productivity",
    asar: { unpack: "**/*.node" },
    prune: true,
    overwrite: false,
    extendInfo: {
      NSMicrophoneUsageDescription:
        "J.A.R.V.I.S. uses your microphone only when you start push-to-talk. Audio is sent to the speech provider you configure.",
    },
    // Local development signature; no Developer ID or notarization is claimed.
    osxSign: {
      identity: "-",
      identityValidation: false,
      optionsForFile: () => ({ hardenedRuntime: false }),
      continueOnError: false,
    },
    ignore: [
      /^\/(?:\.git|\.env(?:\..*)?|src|tests|scripts|docs|release)(?:\/|$)/,
      /^\/Install JARVIS\.command$/,
      /\.log$/,
    ],
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.platform !== "darwin")
    throw new Error(
      "Build the macOS application on your Mac; local signing requires macOS.",
    );
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputs = await packager(macPackageOptions(root, process.arch));
  for (const output of outputs)
    console.log(`macOS application: ${path.join(output, "JARVIS.app")}`);
}
