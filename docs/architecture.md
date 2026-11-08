# Architecture

`src/shared/contracts.ts` defines validated settings, recording payloads, assistant events, and the typed `Bridge`. `src/preload` exposes only that bridge. `src/renderer` contains the development console, microphone capture, and playback; it cannot access provider credentials or arbitrary Node APIs.

`src/main` owns provider clients, keychain access, SQLite settings, tool authorization, and the conversation engine. Groq implements `LLMProvider` and `SpeechToTextProvider`; Fish implements `TextToSpeechProvider` and `SpeechToTextProvider`. Dependency injection permits credential-free transport tests.

Each new turn aborts its predecessor. Only the current controller may commit history or publish deltas. A turn has at most six reasoning rounds and eight tool calls per round. History is trimmed at user-turn boundaries. Conversation history is memory-only; settings are persisted. Streamed text, tool events, audio chunks and telemetry carry no keys. No arbitrary shell tool exists.

The broad master brief is a roadmap, not a claim that every subsystem exists. The repository started unborn and empty, so no pre-existing architecture or permission system was available to preserve.
