import { z } from "zod";
export const settingsSchema = z
  .object({
    model: z.string().max(200).default(""),
    sttModel: z.string().max(200).default(""),
    toolsEnabled: z.boolean().default(false),
    ttsModel: z.string().min(1).max(200).default("s2.1-pro-free"),
    voiceReference: z.string().max(200).default(""),
    sttProvider: z.enum(["groq", "fish"]).default("groq"),
    language: z.enum(["auto", "en", "id"]).default("auto"),
    voiceEnabled: z.boolean().default(true),
    inputDevice: z.string().max(500).default(""),
    outputDevice: z.string().max(500).default(""),
    timeoutMs: z.number().int().min(1000).max(120000).default(30000),
    retries: z.number().int().min(0).max(3).default(2),
    cacheAudio: z.boolean().default(false),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export type Provider = "groq" | "fish";
export type Phase =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "awaiting-confirmation"
  | "executing"
  | "speaking"
  | "interrupted"
  | "error";
export type Event =
  | { type: "state"; phase: Phase }
  | { type: "text"; delta: string }
  | { type: "transcription"; text: string }
  | { type: "error"; message: string }
  | {
      type: "provider";
      provider: Provider;
      status: "unconfigured" | "configured" | "verified" | "error";
      message?: string;
    }
  | {
      type: "usage";
      promptTokens: number;
      completionTokens: number;
      synthesizedCharacters: number;
      audioSeconds: number;
      cost: null;
    }
  | {
      type: "tool";
      id: string;
      name: string;
      status: "requested" | "executing" | "complete" | "denied";
    }
  | { type: "confirmation"; id: string; name: string; arguments: unknown }
  | { type: "audio"; turn: string; bytes: Uint8Array; final: boolean }
  | { type: "microphone"; value: MicrophoneTelemetry }
  | { type: "audio-telemetry"; value: AudioTelemetry }
  | { type: "stop-audio" };
export const microphoneSchema = z
  .object({
    active: z.boolean(),
    level: z.number().min(0).max(1),
    voiceDetected: z.boolean(),
  })
  .strict();
export type MicrophoneTelemetry = z.infer<typeof microphoneSchema>;
export interface AudioTelemetry {
  turn: string;
  playing: boolean;
  level: number;
  progress: number;
  error?: string;
}
export const telemetrySchema = z
  .object({
    turn: z.string().uuid(),
    playing: z.boolean(),
    level: z.number().min(0).max(1),
    progress: z.number().min(0).max(1),
    error: z.string().max(200).optional(),
  })
  .strict();
export const audioSchema = z
  .object({
    bytes: z
      .instanceof(Uint8Array)
      .refine((b) => b.byteLength > 0 && b.byteLength <= 20 * 1024 * 1024),
    mime: z.enum(["audio/webm", "audio/wav", "audio/mp4"]),
    duration: z.number().min(0).max(120),
  })
  .strict();
export type Recording = z.infer<typeof audioSchema>;
export interface Bridge {
  getSettings(): Promise<Settings>;
  updateSettings(settings: Settings): Promise<Settings>;
  setCredential(provider: Provider, key: string): Promise<void>;
  credentialStatus(): Promise<Record<Provider, boolean>>;
  models(): Promise<{ id: string; active?: boolean }[]>;
  testConnection(provider: Provider, consent: boolean): Promise<void>;
  sendMessage(text: string): Promise<void>;
  transcribe(recording: Recording): Promise<void>;
  cancelResponse(): Promise<void>;
  stopSpeaking(): Promise<void>;
  confirmAction(id: string, approved: boolean): Promise<void>;
  telemetry(value: AudioTelemetry): Promise<void>;
  listening(active: boolean): Promise<void>;
  microphone(value: MicrophoneTelemetry): Promise<void>;
  clearHistory(): Promise<void>;
  onEvent(callback: (event: Event) => void): () => void;
}
declare global {
  interface Window {
    jarvis: Bridge;
  }
}
