# Custom UI integration

Keep your final interface design and import the shared TypeScript contract. The renderer accesses `window.jarvis`; it never imports main-process modules. Replace the console in `src/renderer/index.tsx`, retaining or adapting `Microphone` and `Playback` from `audio.ts`.

Subscribe with `onEvent(callback)` and call the returned disposer on teardown. Events provide assistant phase, response deltas, final transcription, typed audio chunks with turn IDs, stop-audio, microphone telemetry, output telemetry, tool lifecycle, confirmation requests, provider status, sanitized errors, and session usage. Deltas are append-only within a turn; clear displayed response when initiating a new turn. Audio buffers must be rejected after interruption; the example uses an epoch counter.

Use `getSettings`/`updateSettings`, `setCredential` (write-only), `credentialStatus` (booleans only), `models`, and explicit opt-in `testConnection` for settings. Model enumeration is also an authenticated network request. Use `sendMessage`, `transcribe`, `cancelResponse`, `stopSpeaking`, `confirmAction`, `listening`, `microphone`, `telemetry`, and `clearHistory` for actions. See `Bridge` for exact signatures; no raw ipcRenderer or generic invoke is exposed.

Microphone capture publishes active/off status, actual input amplitude, and energy-VAD results through its local callback and validated `microphone` IPC events. Call `Microphone.dispose()` when cancelling capture, including while an OS permission prompt is pending. Late-granted streams are stopped immediately. Playback publishes amplitude and progress locally and through validated `audio-telemetry` events. Main-process assistant state transitions to speaking only after playback reports it is playing. A provider returning bytes does not itself claim audible output.

No future HUD, animations, reminders, screen data, network statistics, or fabricated telemetry is provided. Add such events only when their backing subsystem exists.
