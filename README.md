# J.A.R.V.I.S.

Electron/TypeScript foundation with Groq intelligence, Groq or Fish transcription, Fish speech synthesis, and a minimal React development console. The selected GitHub repository was empty (no commits or remote refs); this is a new implementation, not a migration of an existing application. No final HUD is designed here.

## Install on your Mac

After transferring and extracting the complete project onto your Mac, run `bash "Install JARVIS.command"` from its folder. It builds a locally signed development app in `~/Applications/JARVIS.app`, with architecture detection, verified temporary Node download, and no administrator privileges. Existing apps are not overwritten. See [macOS installation](docs/macos-install.md). Installation on a physical Mac has not been tested from this Linux cloud session.

## Develop

Use Node 24.15+ (validated with 24.22.1), npm, and a desktop session:

```sh
npm ci
node node_modules/electron/install.js # if the package manager skipped its install hook
npm test
npm run build
npm run dev
```

`dev` builds the local application and launches Electron. It does not use a network development server. On managed cloud machines, set writable `npm_config_cache`, `ELECTRON_CACHE`, and `XDG_CACHE_HOME`; see the saved environment startup instructions. Native downloads retain Electron's bundled checksum verification. `NODE_USE_ENV_PROXY=1` enables proxy-aware Node downloads where needed; runtime SDK fetches honor inherited proxies using Undici.

Enter credentials in the console to store them in the OS keychain. Alternatively, inject `GROQ_API_KEY` and `FISH_API_KEY` into the main-process environment. These override stored credentials; deleting a keychain credential does not unset an environment binding. The app does not automatically load `.env`. Never put secrets in renderer/Vite variables. `.env.example` documents names only.

Load available Groq model IDs, select a chat model and a supported transcription model, and save settings. The model list is not a declaration that every model supports every endpoint or tools. Enable tools only for a documented compatible model. Set the Fish TTS model and an authorized voice reference. `s2.1-pro-free` is the requested development default, whose account availability has **not** been verified. There is no automatic model or paid-provider fallback.

Start push-to-talk, speak, then release/transcribe. Two explicit buttons make recording status clear; no continuous background listening or wake-word upload occurs. Use Stop speech to interrupt playback and synthesis, or Cancel response to cancel the entire current turn.

## Validation

```sh
npm test             # mocked provider, engine, audio and persistence checks
npm run build        # strict TypeScript + renderer and main/preload bundles
npm run test:desktop # Linux headless smoke test; test-only --no-sandbox
```

The production launch keeps Chromium's sandbox enabled. The headless cloud smoke command uses `--no-sandbox` because of nested sandbox restrictions; it verifies context isolation and renderer Node exclusion, not OS sandbox enforcement on macOS.

Live tests are explicitly opt-in, send text/audio externally, and can incur charges:

```sh
JARVIS_LIVE_TEST=1 npm run test:live
```

Supply keys and actual `GROQ_MODEL` / `GROQ_STT_MODEL` IDs in the calling environment; never paste credentials into commands committed to this repository. The live script verifies chat, TTS, and ASR independently and fails on empty responses. No live provider checks have been run during implementation.

## Current scope

Implemented: typed IPC, main-process SDK adapters, streamed chat and structured tool fragments, session history, bounded tool rounds, approval per invocation, real system metrics tool, settings persistence in SQLite, native keychain adapter, push-to-talk WAV capture and energy VAD, cancellable streamed/buffered MP3 playback, telemetry, opt-in memory audio cache, sanitized errors, usage counters, and opt-in connectivity tests.

Not yet implemented: persistent conversation/task memory, reminders, application/file automation, screen analysis, wake-word detection, signed macOS distribution, or the final UI. Physical audio, provider language accuracy, and macOS keychain/permission behavior require target-device validation. See [testing](docs/testing.md) and [roadmap](docs/roadmap.md).
