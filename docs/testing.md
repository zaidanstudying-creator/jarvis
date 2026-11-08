# Testing

`npm test` runs Vitest with mocked SDK transports and injected providers. Tests cover streamed Groq text/tool fragments/usage, multipart transcription language/model, rate-limit retry versus authorization failure, missing models, Fish model headers and audio transport, ASR options, cache isolation, stream cancellation/empty output, tool argument/approval enforcement, multi-turn history, superseded turns, TTS lifecycle, sanitized errors, WAV encoding, MSE chunk ingestion/interruption, SQLite settings restart, permission denial for camera/subframes, late microphone permission cancellation, real PCM capture telemetry with mocked browser devices, in-flight audio cache invalidation, and Fish response-body timeout.

`npm run build` performs strict TypeScript checking and bundles the renderer, main process and sandbox-compatible CJS preload. Native keyring remains an external Node-API dependency.

`npm run test:desktop` launches actual Electron with Linux headless Ozone and test-only `--no-sandbox`, loads the local UI, invokes typed settings/status IPC, verifies unknown settings are rejected, verifies a settings update can be reread, and verifies the renderer lacks Node require and key-bearing settings. It uses a disposable /tmp profile. Missing system D-Bus and GPU/display warnings in a headless runner do not establish a macOS defect.

`npm run test:live` refuses to send requests unless `JARVIS_LIVE_TEST=1`. Supply existing credentials securely in the main-process environment, plus actual available model IDs. It makes chat, Fish synthesis, and transcription requests and checks nonempty outputs. Real requests have not been run here. Mock identifiers in test fixtures are never used as production defaults.

Manual target-device acceptance remains required: both languages, microphone grant/deny/revocation, input/output device changes, actual audible streamed/buffered playback, interruption latency, keychain persistence/lock/unlock, macOS sandbox/privacy prompts, provider quotas, and selected-model tool compatibility. Recognition accuracy and live connectivity cannot be inferred from passing mocks.

macOS package tests check Apple Silicon/Intel target configuration, microphone Info.plist disclosure, native keychain unpacking, local signing requirements, secret/source exclusions, and the installer’s Linux rejection. Shell syntax is checked with `bash -n "Install JARVIS.command"`. These checks do not establish successful installation or signing on a Mac.
