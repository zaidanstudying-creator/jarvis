import { contextBridge, ipcRenderer } from "electron";
import type { Bridge, Event } from "../shared/contracts";
const api: Bridge = {
  getSettings: () => ipcRenderer.invoke("jarvis:settings:get"),
  updateSettings: (s) => ipcRenderer.invoke("jarvis:settings:set", s),
  setCredential: (p, k) => ipcRenderer.invoke("jarvis:credentials:set", p, k),
  credentialStatus: () => ipcRenderer.invoke("jarvis:credentials:status"),
  models: () => ipcRenderer.invoke("jarvis:models"),
  testConnection: (p, c) => ipcRenderer.invoke("jarvis:connection:test", p, c),
  sendMessage: (t) => ipcRenderer.invoke("jarvis:message", t),
  transcribe: (r) => ipcRenderer.invoke("jarvis:transcribe", r),
  cancelResponse: () => ipcRenderer.invoke("jarvis:cancel"),
  stopSpeaking: () => ipcRenderer.invoke("jarvis:speech:stop"),
  confirmAction: (id, a) => ipcRenderer.invoke("jarvis:confirm", id, a),
  telemetry: (t) => ipcRenderer.invoke("jarvis:telemetry", t),
  microphone: (value) => ipcRenderer.invoke("jarvis:microphone", value),
  listening: (a) => ipcRenderer.invoke("jarvis:listening", a),
  clearHistory: () => ipcRenderer.invoke("jarvis:history:clear"),
  onEvent: (callback) => {
    const listener = (_: unknown, event: Event) => callback(event);
    ipcRenderer.on("jarvis:event", listener);
    return () => ipcRenderer.removeListener("jarvis:event", listener);
  },
};
contextBridge.exposeInMainWorld("jarvis", Object.freeze(api));
