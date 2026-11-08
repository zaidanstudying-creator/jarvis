import { configureNetwork } from "../src/main/network";
configureNetwork();
import { GroqProvider } from "../src/main/providers/groq";
import { FishProvider } from "../src/main/providers/fish";
import { settingsSchema } from "../src/shared/contracts";
// No request unless the user explicitly opts in. No credentials are logged.
if (process.env.JARVIS_LIVE_TEST !== "1")
  throw new Error("Opt in with JARVIS_LIVE_TEST=1. Requests may incur costs.");
const s = settingsSchema.parse({
  model: process.env.GROQ_MODEL,
  sttModel: process.env.GROQ_STT_MODEL,
  ttsModel: process.env.FISH_TTS_MODEL ?? "s2.1-pro-free",
  voiceEnabled: false,
});
const key = (name: string) => async () => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const groq = new GroqProvider(key("GROQ_API_KEY"));
const fish = new FishProvider(key("FISH_API_KEY"));
const models = await groq.models(s);
if (!models.some((m) => m.id === s.model))
  throw new Error("GROQ_MODEL must be an available model ID.");
const result = await groq.complete(
  [{ role: "user", content: "Reply with a short greeting." }],
  [],
  s,
  AbortSignal.timeout(s.timeoutMs),
  () => {},
);
if (!result.text.trim()) throw new Error("Empty chat response.");
console.log("Groq chat: passed");
const chunks: Uint8Array[] = [];
await fish.synthesize(
  "Hello. Selamat pagi.",
  s,
  AbortSignal.timeout(s.timeoutMs),
  (b) => chunks.push(b),
);
const audio = Buffer.concat(chunks);
if (!audio.length) throw new Error("Empty synthesized audio");
console.log("Fish TTS: passed");
if (s.sttModel) {
  const t = await groq.transcribe(
    audio,
    "audio/mpeg",
    s,
    AbortSignal.timeout(s.timeoutMs),
  );
  if (!t.trim()) throw new Error("Empty transcription");
  console.log("Groq STT: passed");
}
const t = await fish.transcribe(
  audio,
  "audio/mpeg",
  s,
  AbortSignal.timeout(s.timeoutMs),
);
if (!t.trim()) throw new Error("Empty transcription");
console.log("Fish ASR: passed");
