import fs from "node:fs/promises";
import path from "node:path";
import { createApp } from "../src/server/app.js";

const dataDir = path.resolve(".data/e2e-test");
await fs.rm(dataDir, { recursive: true, force: true });

const env = {
  NODE_ENV: "test",
  COOKIE_SECURE: "false",
  APP_ACCESS_CODE: "synthetic-access-code",
  ALLOW_ACCESS_CODE_LOGIN: "true",
  PASSKEY_RP_ID: "localhost",
  PASSKEY_ORIGIN: "http://localhost:4173",
  DATA_DIR: dataDir,
  OPENAI_API_KEY: "synthetic-key",
  AI_MOCK_MODE: "true",
  LOGIN_RATE_LIMIT: "1000",
  PRIVATE_PROFILE_JSON: JSON.stringify({
    profile: {
      displayName: "Testperson",
      weight: { current: 70, target: 80, unit: "kg", entries: [] },
      journey: {
        withdrawalAdmission: { date: "2030-05-11", status: "expected", source: "Synthetische Planung" },
        rehabAdmission: { date: "2030-06-10", status: "confirmed", source: "Synthetische Bestätigung" },
        minimumWithdrawalDays: 28,
        directTransfer: true,
        birthday: "2030-06-09",
        ward: "Synthetische Privatstation A",
        wardBasis: "Synthetische Nutzerangabe; öffentlich nicht separat dokumentiert.",
        treatmentFocus: ["Synthetischer Testbereich"]
      }
    },
    tasks: [
      { id: "synthetic-next", group: "Vorbereitung", title: "Synthetische Aufnahmeunterlagen prüfen", why: "Damit der Test einen klaren nächsten Schritt besitzt.", priority: 5, status: "open", source: "private-seed" },
      { id: "synthetic-pet", group: "Organisation", title: "Tierbetreuung für den Testzeitraum klären", why: "Synthetischer Organisationstest.", priority: 4, status: "open", source: "private-seed" }
    ],
    careGuide: {
      clinicFacts: [{ status: "Synthetisch bestätigt", title: "Synthetische Stationsangabe", text: "Nur für den automatisierten Test." }],
      phases: [{ week: "Woche 1", title: "Synthetische Phase", goal: "Darstellung prüfen", watch: "Keine medizinische Aussage", practice: "Testschritt" }],
      packing: [],
      homeLeave: [],
      bodySupport: [],
      rights: [],
      sources: [{ title: "Synthetische Quelle", note: "Nur Test", url: "https://example.invalid/source" }],
      crisis: { text: "Synthetischer Krisenhinweis", steps: ["Testteam ansprechen"], contacts: [] }
    }
  })
};

const push = {
  configured: false,
  publicKey: "",
  startScheduler: () => () => {},
  subscribe: async () => { throw Object.assign(new Error("push_not_configured"), { status: 503, code: "PUSH_NOT_CONFIGURED" }); },
  unsubscribe: async () => false,
  replaceReminders: async reminders => reminders.length,
  sendTest: async () => 0
};

const app = await createApp({ env, push });
app.listen(4173, "127.0.0.1", () => console.log(JSON.stringify({ event: "e2e_server_ready", port: 4173 })));
