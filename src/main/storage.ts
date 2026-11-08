import { AsyncEntry } from "@napi-rs/keyring";
import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";
import {
  settingsSchema,
  type Provider,
  type Settings,
} from "../shared/contracts";
export interface KeyStore {
  get(provider: Provider): Promise<string>;
  set(provider: Provider, key: string): Promise<void>;
  status(): Promise<Record<Provider, boolean>>;
}
export class Credentials implements KeyStore {
  private entry(provider: Provider) {
    return new AsyncEntry("JARVIS", provider, {
      linux: { store: "secret-service" },
    });
  }
  async get(provider: Provider) {
    const value =
      process.env[provider === "groq" ? "GROQ_API_KEY" : "FISH_API_KEY"] ||
      (await this.entry(provider).getPassword());
    if (!value) throw new Error("Credential not configured.");
    return value;
  }
  async set(provider: Provider, key: string) {
    if (key) await this.entry(provider).setPassword(key);
    else await this.entry(provider).deleteCredential();
  }
  async status() {
    const result = { groq: false, fish: false };
    for (const p of ["groq", "fish"] as const) {
      try {
        result[p] = !!(await this.get(p));
      } catch {}
    }
    return result;
  }
}
export class SettingsStore {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL)",
    );
    chmodSync(path, 0o600);
  }
  get(): Settings {
    const row = this.db.prepare("SELECT json FROM settings WHERE id=1").get();
    return settingsSchema.parse(
      row
        ? JSON.parse(row.json as string)
        : {
            model: process.env.GROQ_MODEL ?? "",
            sttModel: process.env.GROQ_STT_MODEL ?? "",
            ttsModel: process.env.FISH_TTS_MODEL ?? "s2.1-pro-free",
          },
    );
  }
  set(value: unknown) {
    const s = settingsSchema.parse(value);
    this.db
      .prepare(
        "INSERT INTO settings(id,json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
      )
      .run(JSON.stringify(s));
    return s;
  }
  close() {
    this.db.close();
  }
}
