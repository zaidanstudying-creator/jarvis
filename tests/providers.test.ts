import { describe, it, expect, vi } from "vitest";
import { FishAudioClient } from "fish-audio";
import { GroqProvider } from "../src/main/providers/groq";
import { FishProvider } from "../src/main/providers/fish";
import { settingsSchema } from "../src/shared/contracts";
const s = settingsSchema.parse({
  model: "configured-model",
  sttModel: "configured-transcription-model",
});
const signal = () => new AbortController().signal;
const stream = (chunks: unknown[]) =>
  new Response(
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") +
      "data: [DONE]\n\n",
    { headers: { "content-type": "text/event-stream" } },
  );
describe("Groq official SDK integration", () => {
  it("assembles streamed text, tool fragments, usage and sends explicit configuration", async () => {
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      requests.push(init!);
      return stream([
        {
          choices: [
            {
              delta: {
                content: "Hello ",
                tool_calls: [
                  {
                    index: 0,
                    id: "call-1",
                    function: { name: "system_metrics", arguments: "{" },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                content: "world",
                tool_calls: [{ index: 0, function: { arguments: "}" } }],
              },
            },
          ],
          x_groq: { usage: { prompt_tokens: 5, completion_tokens: 2 } },
        },
      ]);
    });
    const provider = new GroqProvider(
      async () => "test-key",
      fetcher as typeof fetch,
    );
    const delta: string[] = [];
    const result = await provider.complete(
      [{ role: "user", content: "hello" }],
      [],
      s,
      signal(),
      (t) => delta.push(t),
    );
    expect(result).toMatchObject({
      text: "Hello world",
      calls: [{ id: "call-1", name: "system_metrics", arguments: "{}" }],
      promptTokens: 5,
      completionTokens: 2,
    });
    expect(delta).toEqual(["Hello ", "world"]);
    expect(JSON.parse(requests[0].body as string).model).toBe(
      "configured-model",
    );
  });
  it("uses a multipart transcription request with Indonesian and selected model", async () => {
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = init!.body as FormData;
      expect(body.get("model")).toBe(s.sttModel);
      expect(body.get("language")).toBe("id");
      expect(body.get("file")).toBeInstanceOf(Blob);
      return Response.json({ text: "Selamat pagi" });
    });
    const p = new GroqProvider(async () => "test-key", fetcher as typeof fetch);
    expect(
      await p.transcribe(
        new Uint8Array([1, 2]),
        "audio/wav",
        { ...s, language: "id" },
        signal(),
      ),
    ).toBe("Selamat pagi");
  });
  it("retries rate limits and fails authorization without retries", async () => {
    let count = 0;
    const retry = vi.fn(async () =>
      ++count === 1
        ? Response.json(
            { error: { message: "limited" } },
            { status: 429, headers: { "retry-after": "0.001" } },
          )
        : Response.json({ data: [{ id: "actual-id" }] }),
    );
    expect(
      await new GroqProvider(async () => "test", retry as typeof fetch).models(
        s,
      ),
    ).toEqual([{ id: "actual-id" }]);
    expect(count).toBe(2);
    const denied = vi.fn(async () =>
      Response.json({ error: { message: "denied" } }, { status: 401 }),
    );
    await expect(
      new GroqProvider(async () => "test", denied as typeof fetch).models(s),
    ).rejects.toMatchObject({ status: 401 });
    expect(denied).toHaveBeenCalledTimes(1);
  });
  it("does not request a fabricated default chat model", async () => {
    const f = vi.fn();
    await expect(
      new GroqProvider(async () => "test", f).complete(
        [],
        [],
        { ...s, model: "" },
        signal(),
        () => {},
      ),
    ).rejects.toThrow("Select");
    expect(f).not.toHaveBeenCalled();
  });
});
describe("Fish official SDK integration", () => {
  it("sends selected backend header, reference and streams audio over SDK transport", async () => {
    const transport = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        expect(String(input)).toContain("/v1/tts");
        expect(new Headers(init?.headers).get("model")).toBe("s2.1-pro-free");
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "audio/mpeg" },
        });
      });
    try {
      const p = new FishProvider(async () => "test");
      const chunks: Uint8Array[] = [];
      await p.synthesize(
        "Hello",
        { ...s, voiceReference: "authorized-voice" },
        signal(),
        (b) => chunks.push(b),
      );
      expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3]));
    } finally {
      transport.mockRestore();
    }
  });
  it("caches only with opt-in and includes model and voice in the cache key", async () => {
    const convert = vi.fn(
      async () =>
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array([1]));
            c.close();
          },
        }),
    );
    const factory = () =>
      ({ textToSpeech: { convert } }) as unknown as FishAudioClient;
    const p = new FishProvider(async () => "test", factory);
    const cfg = { ...s, cacheAudio: true };
    await p.synthesize("a", cfg, signal(), () => {});
    await p.synthesize("a", cfg, signal(), () => {});
    expect(convert).toHaveBeenCalledTimes(1);
    await p.synthesize(
      "a",
      { ...cfg, voiceReference: "other" },
      signal(),
      () => {},
    );
    expect(convert).toHaveBeenCalledTimes(2);
    p.clearCache();
    await p.synthesize("a", cfg, signal(), () => {});
    expect(convert).toHaveBeenCalledTimes(3);
  });
  it("passes ASR language and cancellation to SDK", async () => {
    const convert = vi.fn(async () => ({ text: "Hello" }));
    const p = new FishProvider(
      async () => "test",
      () => ({ speechToText: { convert } }) as unknown as FishAudioClient,
    );
    const abort = signal();
    expect(
      await p.transcribe(
        new Uint8Array([1]),
        "audio/wav",
        { ...s, language: "en" },
        abort,
      ),
    ).toBe("Hello");
    expect(convert.mock.calls[0]).toBeDefined();
    expect(convert).toHaveBeenCalledWith(
      expect.objectContaining({ language: "en" }),
      expect.objectContaining({ abortSignal: abort }),
    );
  });
  it("propagates quota errors and aborts before cached output", async () => {
    const p = new FishProvider(
      async () => "test",
      () =>
        ({
          textToSpeech: {
            convert: async () => {
              throw { statusCode: 429 };
            },
          },
        }) as unknown as FishAudioClient,
    );
    await expect(
      p.synthesize("a", s, signal(), () => {}),
    ).rejects.toMatchObject({ statusCode: 429 });
  });
});
it("cancels a Fish stream without publishing further chunks", async () => {
  const abort = new AbortController();
  let cancelled = false;
  const convert = vi.fn(
    async () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1]));
        },
        cancel() {
          cancelled = true;
        },
      }),
  );
  const p = new FishProvider(
    async () => "test",
    () => ({ textToSpeech: { convert } }) as unknown as FishAudioClient,
  );
  const chunks: Uint8Array[] = [];
  await expect(
    p.synthesize("hello", s, abort.signal, (b) => {
      chunks.push(b);
      abort.abort();
    }),
  ).rejects.toThrow();
  expect(chunks).toHaveLength(1);
  expect(cancelled).toBe(true);
});
it("rejects an empty Fish TTS response instead of reporting success", async () => {
  const p = new FishProvider(
    async () => "test",
    () =>
      ({
        textToSpeech: {
          convert: async () =>
            new ReadableStream({
              start(c) {
                c.close();
              },
            }),
        },
      }) as unknown as FishAudioClient,
  );
  await expect(p.synthesize("hello", s, signal(), () => {})).rejects.toThrow(
    "empty",
  );
});
it("does not restore cached private audio after cache clearing during an in-flight synthesis", async () => {
  let finish!: () => void;
  const convert = vi.fn(
    async () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([1]));
          finish = () => c.close();
        },
      }),
  );
  const p = new FishProvider(
    async () => "test",
    () => ({ textToSpeech: { convert } }) as unknown as FishAudioClient,
  );
  const s = settingsSchema.parse({ cacheAudio: true });
  let received!: () => void;
  const firstChunk = new Promise<void>((r) => (received = r));
  const pending = p.synthesize("private", s, new AbortController().signal, () =>
    received(),
  );
  await firstChunk;
  p.clearCache();
  finish();
  await pending;
  const next = p.synthesize(
    "private",
    s,
    new AbortController().signal,
    () => {},
  );
  await vi.waitFor(() => expect(convert).toHaveBeenCalledTimes(2));
  finish();
  await next;
});
it("times out while a Fish response body stalls after headers have arrived", async () => {
  const cancel = vi.fn();
  const p = new FishProvider(
    async () => "test",
    () =>
      ({
        textToSpeech: {
          convert: async () => new ReadableStream<Uint8Array>({ cancel }),
        },
      }) as unknown as FishAudioClient,
  );
  await expect(
    p.synthesize(
      "hello",
      { ...s, timeoutMs: 20 },
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toMatchObject({ name: "TimeoutError" });
  expect(cancel).toHaveBeenCalledOnce();
});
