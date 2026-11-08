import { it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SettingsStore, Credentials } from "../src/main/storage";
const dir = mkdtempSync(path.join(tmpdir(), "jarvis-tests-"));
afterEach(() => {
  vi.unstubAllEnvs();
});
it("persists validated settings across restarts without credentials", () => {
  const file = path.join(dir, "settings.db");
  let store = new SettingsStore(file);
  const s = store.get();
  expect(() => store.set({ ...s, GROQ_API_KEY: "not-allowed" })).toThrow();
  store.set({ ...s, language: "id", voiceEnabled: false });
  store.close();
  store = new SettingsStore(file);
  expect(store.get()).toMatchObject({ language: "id", voiceEnabled: false });
  store.close();
  rmSync(dir, { recursive: true });
});
it("reuses environment credentials without reading or exposing keychain values in status", async () => {
  vi.stubEnv("GROQ_API_KEY", "test-groq");
  vi.stubEnv("FISH_API_KEY", "test-fish");
  const c = new Credentials();
  expect(await c.get("groq")).toBe("test-groq");
  expect(await c.status()).toEqual({ groq: true, fish: true });
});
