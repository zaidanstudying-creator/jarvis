import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Settings, Event } from "../shared/contracts";
import { Microphone, Playback } from "./audio";
const bridge = window.jarvis;
function App() {
  const [settings, setSettings] = useState<Settings | undefined>(undefined);
  const saved = useRef<Settings | undefined>(undefined);
  const [text, setText] = useState("");
  const [output, setOutput] = useState("");
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [keys, setKeys] = useState({ groq: "", fish: "" });
  const [present, setPresent] = useState({ groq: false, fish: false });
  const [models, setModels] = useState<string[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [speech, setSpeech] = useState(false);
  const [progress, setProgress] = useState(0);
  const [usage, setUsage] = useState("No usage yet");
  const [confirmation, setConfirmation] =
    useState<Extract<Event, { type: "confirmation" }>>();
  const [tools, setTools] = useState("");
  const playback = useRef<Playback>(null);
  const mic = useRef<Microphone>(null);
  const audioQueue = useRef(Promise.resolve());
  const audioEpoch = useRef(0);
  const act = (fn: () => Promise<unknown>) => {
    setError("");
    void fn().catch((e) => setError(String(e)));
  };
  useEffect(() => {
    playback.current = new Playback(
      bridge,
      () => saved.current?.outputDevice ?? "",
      (t) => {
        setLevel(t.level);
        setProgress(t.progress);
      },
    );
    mic.current = new Microphone(
      bridge,
      (v, voice) => {
        setLevel(v);
        setSpeech(voice);
      },
      setError,
      setRecording,
    );
    act(async () => {
      const s = await bridge.getSettings();
      setSettings(s);
      saved.current = s;
      setPresent(await bridge.credentialStatus());
      setDevices(await navigator.mediaDevices.enumerateDevices());
    });
    const off = bridge.onEvent((e) => {
      if (e.type === "state") {
        setPhase(e.phase);
        if (e.phase !== "awaiting-confirmation") setConfirmation(undefined);
      }
      if (e.type === "text") setOutput((t) => t + e.delta);
      if (e.type === "transcription") setText(e.text);
      if (e.type === "error") setError(e.message);
      if (e.type === "provider")
        setStatus(`${e.provider}: ${e.status}. ${e.message ?? ""}`);
      if (e.type === "confirmation") setConfirmation(e);
      if (e.type === "tool") setTools(`${e.name}: ${e.status}`);
      if (e.type === "usage")
        setUsage(
          `Session: ${e.promptTokens} input / ${e.completionTokens} output tokens; ${e.synthesizedCharacters} TTS characters; ${e.audioSeconds.toFixed(1)} audio seconds. Cost unavailable.`,
        );
      if (e.type === "audio") {
        const epoch = audioEpoch.current;
        audioQueue.current = audioQueue.current
          .then(async () => {
            if (epoch === audioEpoch.current)
              await playback.current?.consume(e);
          })
          .catch((err) => setError(String(err)));
      }
      if (e.type === "stop-audio") {
        audioEpoch.current++;
        playback.current?.stop();
      }
    });
    return () => {
      off();
      playback.current?.stop();
      void mic.current?.dispose();
    };
  }, []);
  async function save() {
    if (!settings) return;
    saved.current = await bridge.updateSettings(settings);
    setSettings(saved.current);
    setStatus("Settings saved.");
  }
  function patch<K extends keyof Settings>(k: K, v: Settings[K]) {
    setSettings((s) => (s ? { ...s, [k]: v } : s));
  }
  async function start() {
    if (recording) return;
    setOutput("");
    await mic.current!.start(saved.current?.inputDevice ?? "");
    setDevices(await navigator.mediaDevices.enumerateDevices());
  }
  async function stop() {
    setRecording(false);
    const r = await mic.current!.stop();
    await bridge.transcribe(r);
  }
  if (!settings) return <main>Loading… {error}</main>;
  return (
    <main
      style={{
        fontFamily: "system-ui",
        maxWidth: 900,
        margin: "2rem auto",
        padding: "1rem",
      }}
    >
      <h1>J.A.R.V.I.S. development console</h1>
      <p>
        Functional controls for integration testing. Your final interface
        remains separate.
      </p>
      <p role="status">
        State: {phase} · {status}
      </p>
      <p role="alert">{error}</p>
      <section>
        <h2>Provider settings</h2>
        {(["groq", "fish"] as const).map((p) => (
          <div key={p}>
            <label>
              {p} API key ({present[p] ? "configured" : "not configured"}){" "}
              <input
                type="password"
                autoComplete="off"
                value={keys[p]}
                onChange={(e) => setKeys({ ...keys, [p]: e.target.value })}
              />
            </label>
            <button
              onClick={() =>
                act(async () => {
                  await bridge.setCredential(p, keys[p]);
                  setKeys((k) => ({ ...k, [p]: "" }));
                  setPresent(await bridge.credentialStatus());
                })
              }
            >
              Store in OS keychain
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `Send a live ${p === "fish" ? "billable TTS" : "model-list"} request to ${p}?`,
                  )
                )
                  act(() => bridge.testConnection(p, true));
              }}
            >
              Test connection (opt-in)
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            act(async () => setModels((await bridge.models()).map((m) => m.id)))
          }
        >
          Load available Groq models (network request)
        </button>
        <datalist id="models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <p>
          <label>
            Groq chat model{" "}
            <input
              list="models"
              value={settings.model}
              onChange={(e) => patch("model", e.target.value)}
            />
          </label>{" "}
          <label>
            Groq transcription model{" "}
            <input
              list="models"
              value={settings.sttModel}
              onChange={(e) => patch("sttModel", e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            Fish TTS model{" "}
            <input
              value={settings.ttsModel}
              onChange={(e) => patch("ttsModel", e.target.value)}
            />
          </label>{" "}
          <label>
            Voice reference ID{" "}
            <input
              value={settings.voiceReference}
              onChange={(e) => patch("voiceReference", e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            Speech recognition{" "}
            <select
              value={settings.sttProvider}
              onChange={(e) =>
                patch("sttProvider", e.target.value as "groq" | "fish")
              }
            >
              <option>groq</option>
              <option>fish</option>
            </select>
          </label>{" "}
          <label>
            Language{" "}
            <select
              value={settings.language}
              onChange={(e) =>
                patch("language", e.target.value as Settings["language"])
              }
            >
              <option value="auto">Auto</option>
              <option value="en">English</option>
              <option value="id">Indonesian</option>
            </select>
          </label>
        </p>
        <p>
          {(["voiceEnabled", "toolsEnabled", "cacheAudio"] as const).map(
            (k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={settings[k]}
                  onChange={(e) => patch(k, e.target.checked)}
                />
                {k}{" "}
              </label>
            ),
          )}
        </p>
        <p>
          Enable tools only for a model documented to support structured tool
          calls. All tool invocations require approval. Audio cache is
          memory-only and opt-in.
        </p>
        <p>
          {(["inputDevice", "outputDevice"] as const).map((k) => (
            <label key={k}>
              {k}{" "}
              <select
                value={settings[k]}
                onChange={(e) => patch(k, e.target.value)}
              >
                <option value="">System default</option>
                {devices
                  .filter(
                    (d) =>
                      d.kind ===
                      (k === "inputDevice" ? "audioinput" : "audiooutput"),
                  )
                  .map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Device ${i + 1}`}
                    </option>
                  ))}
              </select>{" "}
            </label>
          ))}
        </p>
        <label>
          Request timeout (ms){" "}
          <input
            type="number"
            min="1000"
            max="120000"
            value={settings.timeoutMs}
            onChange={(e) => patch("timeoutMs", Number(e.target.value))}
          />
        </label>{" "}
        <label>
          Retries{" "}
          <input
            type="number"
            min="0"
            max="3"
            value={settings.retries}
            onChange={(e) => patch("retries", Number(e.target.value))}
          />
        </label>{" "}
        <button onClick={() => act(save)}>Save settings</button>
      </section>
      <section>
        <h2>Conversation</h2>
        <textarea
          aria-label="Message or transcription"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          cols={70}
        />
        <p>
          <button
            onClick={() =>
              act(async () => {
                setOutput("");
                await bridge.sendMessage(text);
              })
            }
          >
            Send
          </button>{" "}
          <button disabled={recording} onClick={() => act(start)}>
            Start push-to-talk
          </button>{" "}
          <button disabled={!recording} onClick={() => act(stop)}>
            Release / transcribe
          </button>{" "}
          <button
            onClick={() =>
              act(async () => {
                await mic.current?.dispose();
                await bridge.cancelResponse();
              })
            }
          >
            Cancel response
          </button>{" "}
          <button
            onClick={() => {
              playback.current?.stop();
              act(() => bridge.stopSpeaking());
            }}
          >
            Stop speech
          </button>{" "}
          <button
            onClick={() =>
              act(async () => {
                await bridge.clearHistory();
                setOutput("");
                setText("");
              })
            }
          >
            Clear conversation and audio cache
          </button>
        </p>
        <p>
          Microphone: {recording ? "recording" : "off"} · Voice activity:{" "}
          {speech ? "detected" : "silent"} · Audio level{" "}
          <meter min={0} max={1} value={level} /> · Playback{" "}
          <progress max={1} value={progress} />
        </p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{output}</pre>
        <p>{tools}</p>
        <p>{usage}</p>
        {confirmation && (
          <aside>
            <p>
              Approve {confirmation.name} with arguments{" "}
              {JSON.stringify(confirmation.arguments)}?
            </p>
            <button
              onClick={() =>
                act(async () => {
                  await bridge.confirmAction(confirmation.id, true);
                  setConfirmation(undefined);
                })
              }
            >
              Approve this invocation
            </button>
            <button
              onClick={() =>
                act(async () => {
                  await bridge.confirmAction(confirmation.id, false);
                  setConfirmation(undefined);
                })
              }
            >
              Reject
            </button>
          </aside>
        )}
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
