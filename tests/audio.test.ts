import { it, expect, vi, afterEach } from "vitest";
import { Playback } from "../src/renderer/audio";
import type { Bridge } from "../src/shared/contracts";
afterEach(() => vi.unstubAllGlobals());
it("streams MP3 into MSE without waiting for playback before accepting chunks, and releases resources on interrupt", async () => {
  const appended: ArrayBuffer[] = [];
  let update: (() => void) | undefined;
  let open: (() => void) | undefined;
  const play = vi.fn(() => new Promise<void>(() => {}));
  const pause = vi.fn();
  const close = vi.fn(async () => {});
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  class Source {
    static isTypeSupported = () => true;
    readyState = "open";
    endOfStream = vi.fn();
    addEventListener(_e: string, cb: () => void) {
      open = cb;
    }
    addSourceBuffer() {
      return {
        updating: false,
        addEventListener: (event: string, cb: () => void) => {
          if (event === "updateend") update = cb;
        },
        appendBuffer: (b: ArrayBuffer) => {
          appended.push(b);
        },
      };
    }
  }
  class Audio {
    play = play;
    pause = pause;
    removeAttribute = vi.fn();
    load = vi.fn();
    constructor(_url: string) {}
  }
  class Context {
    createAnalyser = () => ({ fftSize: 256, connect: vi.fn() });
    createMediaElementSource = () => ({ connect: vi.fn() });
    destination = {};
    resume = async () => {};
    close = close;
  }
  vi.stubGlobal("MediaSource", Source);
  vi.stubGlobal("Audio", Audio);
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const playback = new Playback(
    { telemetry: vi.fn(async () => {}) } as unknown as Bridge,
    () => "",
    () => {},
  );
  await playback.consume({
    type: "audio",
    turn: "turn",
    bytes: new Uint8Array([1, 2]),
    final: false,
  });
  open!();
  expect(appended).toHaveLength(1);
  await playback.consume({
    type: "audio",
    turn: "turn",
    bytes: new Uint8Array([3]),
    final: false,
  });
  update!();
  expect(appended).toHaveLength(2);
  playback.stop();
  expect(pause).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
  expect(revoke).toHaveBeenCalledWith("blob:test");
  revoke.mockRestore();
  create.mockRestore();
});
