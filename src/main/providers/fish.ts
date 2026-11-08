import { FishAudioClient } from "fish-audio";
import { createHash } from "node:crypto";
import type { Settings } from "../../shared/contracts";
import type { SpeechToTextProvider } from "./groq";
export interface TextToSpeechProvider {
  synthesize(
    text: string,
    s: Settings,
    signal: AbortSignal,
    chunk: (bytes: Uint8Array) => void,
  ): Promise<void>;
  clearCache(): void;
}
export class FishProvider
  implements TextToSpeechProvider, SpeechToTextProvider
{
  private cache = new Map<string, Uint8Array[]>();
  private cacheBytes = 0;
  private cacheGeneration = 0;
  constructor(
    private key: () => Promise<string>,
    private factory = (key: string) => new FishAudioClient({ apiKey: key }),
  ) {}
  clearCache() {
    this.cacheGeneration++;
    this.cache.clear();
    this.cacheBytes = 0;
  }
  async synthesize(
    text: string,
    s: Settings,
    signal: AbortSignal,
    chunk: (bytes: Uint8Array) => void,
  ) {
    signal = AbortSignal.any([signal, AbortSignal.timeout(s.timeoutMs)]);
    signal.throwIfAborted();
    const cacheGeneration = this.cacheGeneration;
    const key = createHash("sha256")
      .update(JSON.stringify([text, s.ttsModel, s.voiceReference]))
      .digest("hex");
    const cached = s.cacheAudio ? this.cache.get(key) : undefined;
    if (cached) {
      for (const b of cached) {
        signal.throwIfAborted();
        chunk(b);
      }
      return;
    }
    const client = this.factory(await this.key());
    // Request headers override the SDK's older backend enum, without inventing a model alias.
    const stream = await client.textToSpeech.convert(
      {
        text,
        format: "mp3",
        ...(s.voiceReference ? { reference_id: s.voiceReference } : {}),
      },
      undefined,
      {
        headers: { model: s.ttsModel },
        abortSignal: signal,
        timeoutInSeconds: s.timeoutMs / 1000,
        maxRetries: s.retries,
      },
    );
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const reader = stream.getReader();
    const abort = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 20 * 1024 * 1024)
          throw new Error("Speech output exceeds 20 MiB limit.");
        chunks.push(next.value);
        chunk(next.value);
      }
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener("abort", abort);
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (!bytes) throw new Error("Fish returned an empty audio response.");
    if (
      s.cacheAudio &&
      cacheGeneration === this.cacheGeneration &&
      bytes <= 5 * 1024 * 1024
    ) {
      while (this.cacheBytes + bytes > 10 * 1024 * 1024 && this.cache.size) {
        const first = this.cache.keys().next().value!;
        this.cacheBytes -= this.cache
          .get(first)!
          .reduce((n, b) => n + b.length, 0);
        this.cache.delete(first);
      }
      this.cache.set(key, chunks);
      this.cacheBytes += bytes;
    }
  }
  async transcribe(
    bytes: Uint8Array,
    mime: string,
    s: Settings,
    signal: AbortSignal,
  ) {
    const client = this.factory(await this.key());
    const result = await client.speechToText.convert(
      {
        audio: new File(
          [Uint8Array.from(bytes).buffer],
          "recording." +
            (mime === "audio/wav"
              ? "wav"
              : mime === "audio/mp4"
                ? "m4a"
                : mime === "audio/mpeg"
                  ? "mp3"
                  : "webm"),
          { type: mime },
        ),
        ...(s.language === "auto" ? {} : { language: s.language }),
        ignore_timestamps: true,
      },
      {
        abortSignal: signal,
        timeoutInSeconds: s.timeoutMs / 1000,
        maxRetries: s.retries,
      },
    );
    return result.text;
  }
}
