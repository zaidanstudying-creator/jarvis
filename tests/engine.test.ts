import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Engine, providerError } from "../src/main/engine";
import { ToolRegistry } from "../src/main/tools";
import { settingsSchema, type Event } from "../src/shared/contracts";
import { wav } from "../src/renderer/audio";
const settings = settingsSchema.parse({
  model: "configured",
  voiceEnabled: false,
  toolsEnabled: true,
});
const complete = (text: string, calls: any[] = []) => ({
  text,
  calls,
  promptTokens: 1,
  completionTokens: 2,
});
describe("conversation pipeline and independent authorization", () => {
  it("transcribes, streams, executes authorized validated tools, and preserves multi-turn history", async () => {
    const events: Event[] = [];
    const authorize = vi.fn(async () => true);
    const registry = new ToolRegistry(authorize);
    const run = vi.fn(async () => ({ ok: true }));
    registry.register({
      name: "metric",
      description: "metric",
      schema: z.object({}).strict(),
      level: 0,
      run,
    });
    const llm = {
      complete: vi
        .fn()
        .mockResolvedValueOnce(
          complete("", [{ id: "a", name: "metric", arguments: "{}" }]),
        )
        .mockResolvedValueOnce(complete("Done"))
        .mockResolvedValueOnce(complete("Follow-up")),
    };
    const stt = { transcribe: vi.fn(async () => "Hello") };
    const tts = { synthesize: vi.fn(), clearCache: vi.fn() };
    const engine = new Engine(
      llm,
      { groq: stt, fish: stt },
      tts,
      registry,
      () => settings,
      (e) => events.push(e),
    );
    await engine.transcribe({
      bytes: new Uint8Array([1]),
      mime: "audio/wav",
      duration: 1,
    });
    await engine.send("again");
    expect(run).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(llm.complete.mock.calls[2][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "tool", tool_call_id: "a" }),
        { role: "assistant", content: "Done" },
        { role: "user", content: "again" },
      ]),
    );
    expect(events).toContainEqual({ type: "transcription", text: "Hello" });
    expect(tts.synthesize).not.toHaveBeenCalled();
  });
  it("rejects malformed, unknown, and denied tool calls without executing", async () => {
    const registry = new ToolRegistry(async () => false);
    const run = vi.fn();
    registry.register({
      name: "safe",
      description: "safe",
      level: 2,
      schema: z.object({ ok: z.boolean() }).strict(),
      run,
    });
    const signal = new AbortController().signal;
    await expect(
      registry.execute(
        { id: "a", name: "safe", arguments: '{"bad":1}' },
        signal,
      ),
    ).rejects.toThrow();
    await expect(
      registry.execute({ id: "a", name: "unknown", arguments: "{}" }, signal),
    ).rejects.toThrow("Unknown");
    await expect(
      registry.execute(
        { id: "a", name: "safe", arguments: '{"ok":true}' },
        signal,
      ),
    ).rejects.toThrow("denied");
    expect(run).not.toHaveBeenCalled();
  });
  it("suppresses late output from superseded turns", async () => {
    let resolve!: (v: ReturnType<typeof complete>) => void;
    let delta!: (s: string) => void;
    const llm = {
      complete: vi
        .fn()
        .mockImplementationOnce((_h, _t, _s, _a, d) => {
          delta = d;
          return new Promise((r) => (resolve = r));
        })
        .mockResolvedValueOnce(complete("new")),
    };
    const events: Event[] = [];
    const stt = { transcribe: vi.fn() };
    const engine = new Engine(
      llm,
      { groq: stt, fish: stt },
      { synthesize: vi.fn(), clearCache: vi.fn() },
      new ToolRegistry(async () => true),
      () => settings,
      (e) => events.push(e),
    );
    const old = engine.send("old");
    await Promise.resolve();
    await engine.send("new");
    delta("stale");
    resolve(complete("old"));
    await old;
    expect(events).not.toContainEqual({ type: "text", delta: "stale" });
  });
  it("emits synthesized chunks and matching playback controls", async () => {
    const events: Event[] = [];
    const stt = { transcribe: vi.fn() };
    const synthesize = vi.fn(async (_t, _s, _a, cb) => cb(new Uint8Array([1])));
    const engine = new Engine(
      { complete: vi.fn(async () => complete("hello")) },
      { groq: stt, fish: stt },
      { synthesize, clearCache: vi.fn() },
      new ToolRegistry(async () => true),
      () => ({ ...settings, voiceEnabled: true }),
      (e) => events.push(e),
    );
    await engine.send("hi");
    const audio = events.find((e) => e.type === "audio");
    expect(audio?.type).toBe("audio");
    if (audio?.type === "audio") {
      engine.telemetry({
        turn: audio.turn,
        playing: true,
        level: 0.5,
        progress: 0,
      });
      expect(events.at(-1)).toEqual({ type: "state", phase: "speaking" });
    }
    engine.stopSpeaking();
    expect(events).toContainEqual({ type: "stop-audio" });
  });
  it("sanitizes provider errors instead of echoing credentials or response bodies", () => {
    expect(providerError({ status: 429, message: "secret" })).toContain(
      "quota",
    );
    expect(providerError(new Error("secret"))).not.toContain("secret");
  });
  it("encodes valid mono PCM WAV with clipping", () => {
    const bytes = wav(new Float32Array([-2, 0, 2]), 16000);
    const view = new DataView(bytes.buffer);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getInt16(44, true)).toBe(-32767);
    expect(view.getInt16(48, true)).toBe(32767);
  });
});
it("a cancelled older synthesis cannot stop or reset a newer speaking turn", async () => {
  let rejectOld!: (e: Error) => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));
  const tts = {
    clearCache: vi.fn(),
    synthesize: vi
      .fn()
      .mockImplementationOnce(() => {
        started();
        return new Promise((_r, reject) => (rejectOld = reject));
      })
      .mockImplementationOnce(async (_t, _s, _a, cb) =>
        cb(new Uint8Array([2])),
      ),
  };
  const events: Event[] = [];
  const stt = { transcribe: vi.fn() };
  const engine = new Engine(
    { complete: vi.fn(async () => complete("hello")) },
    { groq: stt, fish: stt },
    tts,
    new ToolRegistry(async () => true),
    () => ({ ...settings, voiceEnabled: true }),
    (e) => events.push(e),
  );
  const old = engine.send("old");
  await ready;
  await engine.send("new");
  const count = events.length;
  rejectOld(new Error("late abort"));
  await old;
  expect(events.slice(count)).toEqual([]);
});
