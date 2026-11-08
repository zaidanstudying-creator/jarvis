import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  systemPreferences,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  settingsSchema,
  audioSchema,
  telemetrySchema,
  microphoneSchema,
  type Event,
  type Provider,
} from "../shared/contracts";
import { Credentials, SettingsStore } from "./storage";
import { GroqProvider } from "./providers/groq";
import { FishProvider } from "./providers/fish";
import { Engine, providerError } from "./engine";
import { ToolRegistry } from "./tools";
import { allowMicrophoneCheck, allowMicrophoneRequest } from "./permissions";
import { configureNetwork } from "./network";
configureNetwork();
const providerSchema = z.enum(["groq", "fish"]);
const smoke = process.argv.includes("--smoke-test");
if (smoke)
  app.setPath("userData", path.join("/tmp", `jarvis-smoke-${process.pid}`));
awaitReady();
async function awaitReady() {
  await app.whenReady();
  const credentials = new Credentials();
  const store = new SettingsStore(
    path.join(app.getPath("userData"), "settings.sqlite"),
  );
  const page = pathToFileURL(
    path.resolve(__dirname, "../dist/index.html"),
  ).href;
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    show: !smoke,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  const trusted = (url: string) => url === page;
  session.defaultSession.setPermissionCheckHandler(
    (wc, permission, _origin, details) =>
      allowMicrophoneCheck(wc === win.webContents, permission, page, details),
  );
  session.defaultSession.setPermissionRequestHandler(
    (wc, permission, callback, details) =>
      callback(
        allowMicrophoneRequest(wc === win.webContents, permission, page, {
          isMainFrame: details.isMainFrame,
          requestingUrl: details.requestingUrl,
          mediaTypes: "mediaTypes" in details ? details.mediaTypes : undefined,
        }),
      ),
  );
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  const emit = (event: Event) => {
    if (!win.isDestroyed()) win.webContents.send("jarvis:event", event);
  };
  const groq = new GroqProvider(() => credentials.get("groq"));
  const fish = new FishProvider(() => credentials.get("fish"));
  const approvals = new Map<
    string,
    { resolve: (v: boolean) => void; cleanup: () => void }
  >();
  const registry = new ToolRegistry(async (call, level, args, signal) => {
    emit({ type: "state", phase: "awaiting-confirmation" });
    const id = randomUUID();
    const approved = await new Promise<boolean>((resolve) => {
      const finish = (v: boolean) => {
        const pending = approvals.get(id);
        if (pending) {
          pending.cleanup();
          approvals.delete(id);
          resolve(v);
        }
      };
      const abort = () => finish(false);
      const timer = setTimeout(() => finish(false), 60000);
      approvals.set(id, {
        resolve: finish,
        cleanup: () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
        },
      });
      signal.addEventListener("abort", abort, { once: true });
      emit({ type: "confirmation", id, name: call.name, arguments: args });
    });
    if (approved) {
      emit({ type: "state", phase: "executing" });
      emit({ type: "tool", id: call.id, name: call.name, status: "executing" });
    }
    return approved;
  });
  registry.register({
    name: "system_metrics",
    description:
      "Read real memory, CPU load, and system uptime. Requires user approval.",
    schema: z.object({}).strict(),
    level: 0,
    run: async () => ({
      platform: os.platform(),
      memory: { total: os.totalmem(), free: os.freemem() },
      loadAverage: os.loadavg(),
      uptimeSeconds: os.uptime(),
    }),
  });
  const engine = new Engine(
    groq,
    { groq, fish },
    fish,
    registry,
    () => store.get(),
    emit,
  );
  function handle(name: string, fn: (...args: any[]) => unknown) {
    ipcMain.handle(`jarvis:${name}`, async (event, ...args) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame ||
        !trusted(event.senderFrame.url)
      )
        throw new Error("Untrusted IPC sender.");
      try {
        return await fn(...args);
      } catch {
        throw new Error(
          "Operation failed. Check input, credentials, keychain access, and provider settings.",
        );
      }
    });
  }
  handle("settings:get", () => store.get());
  handle("settings:set", (value) => {
    const s = settingsSchema.parse(value);
    engine.cancel();
    fish.clearCache();
    return store.set(s);
  });
  handle("credentials:status", () => credentials.status());
  handle("credentials:set", async (provider, key) => {
    const p = providerSchema.parse(provider);
    await credentials.set(
      p,
      z
        .string()
        .max(4096)
        .refine((s) => !/[\r\n]/.test(s))
        .parse(key),
    );
    engine.cancel();
    fish.clearCache();
    const configured = (await credentials.status())[p];
    emit({
      type: "provider",
      provider: p,
      status: configured ? "configured" : "unconfigured",
    });
  });
  handle("models", () => groq.models(store.get()));
  handle("connection:test", async (provider, consent) => {
    const p = providerSchema.parse(provider);
    if (consent !== true) throw new Error("Explicit consent required.");
    try {
      if (p === "groq") await groq.models(store.get());
      else
        await fish.synthesize(
          "Connection test.",
          { ...store.get(), cacheAudio: false },
          AbortSignal.timeout(store.get().timeoutMs),
          () => {},
        );
      emit({
        type: "provider",
        provider: p,
        status: "verified",
        message:
          p === "groq"
            ? "Model-list request succeeded; chat and STT are not yet verified."
            : "Speech synthesis request succeeded.",
      });
    } catch (e) {
      emit({
        type: "provider",
        provider: p,
        status: "error",
        message: providerError(e),
      });
      throw e;
    }
  });
  handle("message", (text) =>
    engine.send(z.string().trim().min(1).max(16000).parse(text)),
  );
  handle("transcribe", (r) => engine.transcribe(audioSchema.parse(r)));
  handle("cancel", () => engine.cancel());
  handle("speech:stop", () => engine.stopSpeaking());
  handle("confirm", (id, approved) => {
    const pending = approvals.get(z.string().uuid().parse(id));
    if (!pending) throw new Error("Expired confirmation.");
    pending.resolve(z.boolean().parse(approved));
  });
  handle("telemetry", (value) =>
    engine.telemetry(telemetrySchema.parse(value)),
  );
  handle("microphone", (value) =>
    emit({ type: "microphone", value: microphoneSchema.parse(value) }),
  );
  handle("listening", async (active) => {
    z.boolean().parse(active);
    if (
      active &&
      process.platform === "darwin" &&
      !(await systemPreferences.askForMediaAccess("microphone"))
    )
      throw new Error("Microphone permission denied.");
    engine.listening(active);
  });
  handle("history:clear", () => engine.clear());
  app.on("before-quit", () => {
    engine.cancel();
    store.close();
  });
  await win.loadURL(page);
  if (smoke) {
    try {
      const result = await win.webContents.executeJavaScript(
        `(async()=>{const s=await window.jarvis.getSettings();const c=await window.jarvis.credentialStatus();let rejected=false;try{await window.jarvis.updateSettings({...s,injected:'invalid'})}catch{rejected=true}const updated=await window.jarvis.updateSettings({...s,language:'id'});const reread=await window.jarvis.getSettings();await window.jarvis.updateSettings(s);return {settings:typeof s.ttsModel==='string',credentials:typeof c.groq==='boolean',node:typeof window.require,ui:document.body.textContent.includes('Provider settings'),invalidRejected:rejected,persistence:reread.language==='id',noKeys:!JSON.stringify(s).includes('API_KEY')}})()`,
      );
      console.log("DESKTOP_SMOKE", JSON.stringify(result));
      app.exit(
        result.settings &&
          result.credentials &&
          result.node === "undefined" &&
          result.ui &&
          result.invalidRejected &&
          result.persistence &&
          result.noKeys
          ? 0
          : 1,
      );
    } catch {
      console.error("DESKTOP_SMOKE failed");
      app.exit(1);
    }
  }
}
app.on("window-all-closed", () => app.quit());
