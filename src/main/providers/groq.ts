import Groq, { toFile } from "groq-sdk";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "groq-sdk/resources/chat/completions";
import type { Settings } from "../../shared/contracts";
export type Message = ChatCompletionMessageParam;
export interface Call {
  id: string;
  name: string;
  arguments: string;
}
export interface Completion {
  text: string;
  calls: Call[];
  promptTokens: number;
  completionTokens: number;
}
export interface LLMProvider {
  complete(
    history: Message[],
    tools: ChatCompletionTool[],
    settings: Settings,
    signal: AbortSignal,
    delta: (text: string) => void,
  ): Promise<Completion>;
}
export interface SpeechToTextProvider {
  transcribe(
    bytes: Uint8Array,
    mime: string,
    settings: Settings,
    signal: AbortSignal,
  ): Promise<string>;
}
export class GroqProvider implements LLMProvider, SpeechToTextProvider {
  constructor(
    private key: () => Promise<string>,
    private fetcher?: typeof fetch,
  ) {}
  private async client(s: Settings) {
    return new Groq({
      apiKey: await this.key(),
      timeout: s.timeoutMs,
      maxRetries: s.retries,
      fetch: this.fetcher,
    });
  }
  async models(s: Settings) {
    return (await (await this.client(s)).models.list()).data.map((m) => ({
      id: m.id,
    }));
  }
  async complete(
    history: Message[],
    tools: ChatCompletionTool[],
    s: Settings,
    signal: AbortSignal,
    delta: (text: string) => void,
  ): Promise<Completion> {
    if (!s.model)
      throw new Error("Select an available Groq chat model in settings.");
    const stream = await (
      await this.client(s)
    ).chat.completions.create(
      {
        model: s.model,
        messages: history,
        stream: true,
        ...(s.toolsEnabled && tools.length
          ? { tools, tool_choice: "auto" as const }
          : {}),
      },
      { signal },
    );
    const calls = new Map<number, Call>();
    let text = "",
      promptTokens = 0,
      completionTokens = 0;
    for await (const chunk of stream) {
      const d = chunk.choices[0]?.delta;
      if (d?.content) {
        text += d.content;
        if (text.length > 100000) throw new Error("Response exceeds limit.");
        delta(d.content);
      }
      for (const c of d?.tool_calls ?? []) {
        const current = calls.get(c.index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        if (c.id) current.id = c.id;
        if (c.function?.name) current.name += c.function.name;
        if (c.function?.arguments) current.arguments += c.function.arguments;
        if (current.arguments.length > 65536)
          throw new Error("Tool arguments exceed limit.");
        calls.set(c.index, current);
      }
      const usage = chunk.x_groq?.usage;
      if (usage) {
        promptTokens = usage.prompt_tokens ?? 0;
        completionTokens = usage.completion_tokens ?? 0;
      }
    }
    return { text, calls: [...calls.values()], promptTokens, completionTokens };
  }
  async transcribe(
    bytes: Uint8Array,
    mime: string,
    s: Settings,
    signal: AbortSignal,
  ) {
    if (!s.sttModel)
      throw new Error("Select a supported Groq transcription model.");
    const ext =
      mime === "audio/wav"
        ? "wav"
        : mime === "audio/mp4"
          ? "m4a"
          : mime === "audio/mpeg"
            ? "mp3"
            : "webm";
    const result = await (
      await this.client(s)
    ).audio.transcriptions.create(
      {
        file: await toFile(bytes, `recording.${ext}`, { type: mime }),
        model: s.sttModel,
        ...(s.language === "auto" ? {} : { language: s.language }),
        response_format: "json",
      },
      { signal },
    );
    return result.text;
  }
}
