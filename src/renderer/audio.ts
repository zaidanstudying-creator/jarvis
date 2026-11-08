import type {
  AudioTelemetry,
  Bridge,
  Event,
  Recording,
} from "../shared/contracts";
export function wav(
  samples: Float32Array,
  rate: number,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2),
    v = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++)
    v.setInt16(
      44 + i * 2,
      Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767),
      true,
    );
  return Uint8Array.from(bytes);
}
export class Microphone {
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: ScriptProcessorNode;
  private frames: Float32Array[] = [];
  private count = 0;
  private voiced = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private starting = false;
  private generation = 0;
  constructor(
    private bridge: Bridge,
    private level: (value: number, voice: boolean) => void,
    private failure: (message: string) => void,
    private recording: (active: boolean) => void = () => {},
  ) {}
  async start(device: string) {
    if (this.stream || this.starting) return;
    const generation = ++this.generation;
    this.starting = true;
    try {
      await this.bridge.listening(true);
      if (generation !== this.generation) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: device ? { exact: device } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
        video: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.context = new AudioContext({ sampleRate: 16000 });
      await this.context.resume();
      if (generation !== this.generation) return;
      this.recording(true);
      this.publishLevel(0, false, true);
      this.frames = [];
      this.count = 0;
      this.voiced = 0;
      const source = this.context.createMediaStreamSource(this.stream);
      this.node = this.context.createScriptProcessor(2048, 1, 1);
      const gain = this.context.createGain();
      gain.gain.value = 0;
      source.connect(this.node);
      this.node.connect(gain);
      gain.connect(this.context.destination);
      this.node.onaudioprocess = (e) => {
        const data = new Float32Array(e.inputBuffer.getChannelData(0));
        this.frames.push(data);
        this.count += data.length;
        const rms = Math.sqrt(
          data.reduce((s, v) => s + v * v, 0) / data.length,
        );
        const voice = rms > 0.012;
        if (voice) this.voiced += data.length;
        this.publishLevel(Math.min(1, rms * 5), voice, true);
      };
      this.timer = setTimeout(() => {
        void this.stop()
          .then((r) => this.bridge.transcribe(r))
          .catch((e) => this.failure(String(e)));
      }, 120000);
    } catch (e) {
      if (generation !== this.generation) return;
      await this.dispose();
      throw e;
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }
  private publishLevel(level: number, voiceDetected: boolean, active: boolean) {
    this.level(level, voiceDetected);
    void this.bridge
      .microphone({ active, level, voiceDetected })
      .catch(() => {});
  }
  async stop(): Promise<Recording> {
    if (this.starting) throw new Error("Microphone is still starting.");
    if (!this.context) throw new Error("Microphone is not recording.");
    const rate = this.context.sampleRate;
    const samples = new Float32Array(this.count);
    let offset = 0;
    for (const f of this.frames) {
      samples.set(f, offset);
      offset += f.length;
    }
    const voiced = this.voiced;
    const generation = this.generation + 1;
    await this.dispose();
    if (generation !== this.generation)
      throw new Error("Recording was interrupted.");
    if (voiced / rate < 0.12)
      throw new Error(
        "No speech detected. Hold push-to-talk and speak clearly.",
      );
    return {
      bytes: wav(samples, rate),
      mime: "audio/wav",
      duration: samples.length / rate,
    };
  }
  async dispose() {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.node?.disconnect();
    if (this.node) this.node.onaudioprocess = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    const context = this.context;
    this.context = undefined;
    this.stream = undefined;
    this.node = undefined;
    this.frames = [];
    this.starting = false;
    this.recording(false);
    this.publishLevel(0, false, false);
    if (context && context.state !== "closed")
      await context.close().catch(() => {});
    if (generation === this.generation) await this.bridge.listening(false);
  }
}
export class Playback {
  private audio?: HTMLAudioElement;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private url?: string;
  private turn?: string;
  private chunks: Uint8Array[] = [];
  private queue: Uint8Array[] = [];
  private buffer?: SourceBuffer;
  private source?: MediaSource;
  private final = false;
  private raf = 0;
  private last = 0;
  private generation = 0;
  constructor(
    private bridge: Bridge,
    private device: () => string,
    private telemetry: (value: AudioTelemetry) => void,
  ) {}
  private report(playing: boolean, error?: string) {
    if (!this.turn) return;
    const data = new Uint8Array(this.analyser?.fftSize ?? 256);
    this.analyser?.getByteTimeDomainData(data);
    const rms = this.analyser
      ? Math.sqrt(
          data.reduce((s, v) => s + ((v - 128) / 128) ** 2, 0) / data.length,
        )
      : 0;
    const value = {
      turn: this.turn,
      playing,
      level: Math.min(1, rms * 4),
      progress:
        this.audio &&
        Number.isFinite(this.audio.duration) &&
        this.audio.duration > 0
          ? Math.min(1, this.audio.currentTime / this.audio.duration)
          : 0,
      ...(error ? { error } : {}),
    };
    this.telemetry(value);
    void this.bridge.telemetry(value).catch(() => {});
  }
  async consume(event: Extract<Event, { type: "audio" }>) {
    if (event.turn !== this.turn) {
      this.stop();
      this.turn = event.turn;
      this.final = false;
      this.chunks = [];
      // MSE streams MP3 where Chromium supports it; otherwise buffer the same response.
      if (
        typeof MediaSource !== "undefined" &&
        MediaSource.isTypeSupported("audio/mpeg")
      ) {
        this.source = new MediaSource();
        this.url = URL.createObjectURL(this.source);
        const generation = this.generation;
        this.source.addEventListener(
          "sourceopen",
          () => {
            if (generation !== this.generation) return;
            try {
              this.buffer = this.source!.addSourceBuffer("audio/mpeg");
              this.buffer.addEventListener("updateend", () => this.pump());
              this.buffer.addEventListener("error", () =>
                this.report(false, "Audio decoding failed"),
              );
              this.pump();
            } catch {
              this.report(false, "Streaming playback unavailable");
            }
          },
          { once: true },
        );
        void this.setup(this.url);
      }
    }
    if (event.turn !== this.turn) return;
    if (event.bytes.length) {
      if (this.source) {
        this.queue.push(event.bytes);
        this.pump();
      } else this.chunks.push(event.bytes);
    }
    if (event.final) {
      this.final = true;
      if (this.source) this.pump();
      else {
        this.url = URL.createObjectURL(
          new Blob(
            this.chunks.map((c) => Uint8Array.from(c).buffer),
            { type: "audio/mpeg" },
          ),
        );
        void this.setup(this.url);
        this.chunks = [];
      }
    }
  }
  private pump() {
    if (
      !this.buffer ||
      this.buffer.updating ||
      this.source?.readyState !== "open"
    )
      return;
    try {
      const next = this.queue.shift();
      if (next) this.buffer.appendBuffer(Uint8Array.from(next).buffer);
      else if (this.final) this.source.endOfStream();
    } catch {
      this.report(false, "Audio stream failed");
    }
  }
  private async setup(url: string) {
    const generation = this.generation;
    this.audio = new Audio(url);
    this.context = new AudioContext();
    const context = this.context;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 256;
    context.createMediaElementSource(this.audio).connect(this.analyser);
    this.analyser.connect(context.destination);
    this.audio.onended = () => {
      this.report(false);
      this.stop();
    };
    this.audio.onerror = () => {
      this.report(false, "Audio decoding failed");
      this.stop();
    };
    try {
      if (this.device()) {
        const sink = context as AudioContext & {
          setSinkId?: (id: string) => Promise<void>;
        };
        if (!sink.setSinkId)
          throw new Error("Output device selection unavailable");
        await sink.setSinkId(this.device());
      }
      await context.resume();
      if (generation !== this.generation) return;
      await this.audio.play();
      if (generation !== this.generation) return;
      const tick = (now: number) => {
        if (now - this.last > 100) {
          this.report(!this.audio!.paused);
          this.last = now;
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    } catch {
      if (generation === this.generation) {
        this.report(false, "Playback blocked or device unavailable");
        this.stop();
      }
    }
  }
  stop() {
    this.generation++;
    cancelAnimationFrame(this.raf);
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    void this.context?.close().catch(() => {});
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio = undefined;
    this.context = undefined;
    this.analyser = undefined;
    this.url = undefined;
    this.turn = undefined;
    this.source = undefined;
    this.buffer = undefined;
    this.queue = [];
    this.chunks = [];
    this.final = false;
  }
}
