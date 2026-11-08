# Provider configuration

## Groq

Official `groq-sdk` client; authenticated `/models` enumeration; streamed chat completions; multi-turn assistant/tool history; fragmented structured tool-call assembly; transcription file uploads. Chat and transcription model IDs must be explicitly selected. Tool capability is explicitly enabled by the user for the chosen documented compatible model; the application does not invent capability metadata from model names. A rejected model/tool combination surfaces an error.

SDK timeout and retries are configurable (1–120 seconds, zero–three retries). The engine also imposes a bounded turn deadline. SDK retry behavior handles transient/rate-limit responses; the application never retries a whole partially executed tool round or replays streamed output after an error. Failures are sanitized before crossing IPC.

## Fish

Official `fish-audio` SDK provides HTTP streaming TTS and multipart ASR. The published 0.1.0 SDK's backend union predates the official repository README. Its supported request-header override sends the exact configured model (`model` header); no cast to a fabricated SDK model enum is used. Development defaults to the user-requested `s2.1-pro-free`; availability is unverified, and failures never select another paid model. Reference IDs must represent voices the user is authorized to use. No voice cloning is performed.

TTS is cancellable and asynchronous. Its bounded, memory-only cache is disabled by default, keyed by text/model/reference, limited to 10 MiB total and 5 MiB per response, and cleared on credential/settings changes or history deletion. Cache invalidation also prevents an older in-flight synthesis from repopulating cleared audio. Oversized or empty audio responses fail. SDK retry/timeout/cancellation options apply to requests, and an abortable response-body deadline bounds active TTS streams after headers arrive. The engine additionally bounds the complete turn. Quota errors are distinct from authentication and invalid-model errors.

## Status and usage

Credential presence means configured, not connected. The explicit Groq connection test verifies model listing only; it does not assert chat or transcription readiness. The explicit Fish test sends a short TTS request and verifies nonempty audio. Tests require consent and may cost money. Session counters report provider-returned Groq tokens, synthesized characters, and uploaded audio duration. Monetary cost is `null`; prices and account balances are not invented.

## Sources consulted

Requested documentation: <https://console.groq.com/docs> and <https://docs.fish.audio/>. Both returned HTTP 403 under the current cloud network policy. Required domains are saved in the environment draft; the website documentation still needs rechecking after policy activation.

Official sources inspected successfully:

- <https://github.com/groq/groq-typescript> (README and installed SDK contracts)
- <https://github.com/fishaudio/fish-audio-typescript> (current README, published SDK request construction, headers, multipart fields and response types)

These are real SDK-backed integrations, with mocked transport validation. No successful live request is claimed.
