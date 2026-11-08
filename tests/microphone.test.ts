import { it, expect, vi, afterEach } from "vitest";
import { Microphone } from "../src/renderer/audio";
import type { Bridge } from "../src/shared/contracts";
afterEach(() => vi.unstubAllGlobals());
it("stops tracks when permission resolves after microphone capture was disposed", async () => {
  let grant!: (value: MediaStream) => void;
  const getUserMedia = vi.fn(
    () => new Promise<MediaStream>((resolve) => (grant = resolve)),
  );
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const context = vi.fn();
  vi.stubGlobal("AudioContext", context);
  const bridge = {
    listening: vi.fn(async () => {}),
    microphone: vi.fn(async () => {}),
  } as unknown as Bridge;
  const stop = vi.fn();
  const recording = vi.fn();
  const mic = new Microphone(
    bridge,
    () => {},
    () => {},
    recording,
  );
  const pending = mic.start("");
  await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  await mic.dispose();
  grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  await pending;
  expect(stop).toHaveBeenCalledTimes(1);
  expect(context).not.toHaveBeenCalled();
  expect(recording).not.toHaveBeenCalledWith(true);
});
it("publishes real capture level over typed IPC and returns a WAV after push-to-talk release", async () => {
  const trackStop = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: trackStop }],
      })),
    },
  });
  const processor = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null as null | ((event: unknown) => void),
  };
  const close = vi.fn(async () => {});
  class Context {
    sampleRate = 16000;
    state = "running";
    destination = {};
    resume = async () => {};
    close = close;
    createMediaStreamSource = () => ({ connect: vi.fn() });
    createScriptProcessor = () => processor;
    createGain = () => ({ gain: { value: 1 }, connect: vi.fn() });
  }
  vi.stubGlobal("AudioContext", Context);
  const telemetry = vi.fn(async () => {});
  const bridge = {
    listening: vi.fn(async () => {}),
    microphone: telemetry,
  } as unknown as Bridge;
  const mic = new Microphone(
    bridge,
    () => {},
    () => {},
  );
  await mic.start("");
  processor.onaudioprocess!({
    inputBuffer: { getChannelData: () => new Float32Array(2048).fill(0.1) },
  });
  const result = await mic.stop();
  expect(result.mime).toBe("audio/wav");
  expect(result.duration).toBe(2048 / 16000);
  expect(result.bytes.length).toBe(44 + 4096);
  expect(telemetry).toHaveBeenCalledWith(
    expect.objectContaining({
      active: true,
      voiceDetected: true,
      level: expect.any(Number),
    }),
  );
  expect(telemetry).toHaveBeenLastCalledWith({
    active: false,
    voiceDetected: false,
    level: 0,
  });
  expect(trackStop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
