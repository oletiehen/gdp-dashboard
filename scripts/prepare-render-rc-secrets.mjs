import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import webPush from "web-push";

const dataDir = path.resolve(".data");
const outputFile = path.join(dataDir, "render-rc-secrets.env");
const vapid = webPush.generateVAPIDKeys();
const randomSecret = () => crypto.randomBytes(48).toString("base64url");
const syntheticProfile = {
  profile: {
    displayName: "RC Testperson",
    careTeam: {
      doctor: "Testarzt",
      therapist: "Testtherapeut"
    }
  },
  tasks: [
    {
      id: "rc-synthetic-task",
      group: "Release Candidate",
      title: "Synthetische Testaufgabe"
    }
  ]
};
const lines = [
  `SESSION_SECRET=${randomSecret()}`,
  `DATA_ENCRYPTION_KEY=${randomSecret()}`,
  `VAPID_PUBLIC_KEY=${vapid.publicKey}`,
  `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
  `PRIVATE_PROFILE_JSON=${JSON.stringify(syntheticProfile)}`
];

await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
await fs.writeFile(outputFile, `${lines.join("\n")}\n`, { mode: 0o600 });
await fs.chmod(outputFile, 0o600);
console.log(JSON.stringify({
  event: "render_rc_secrets_prepared",
  file: ".data/render-rc-secrets.env",
  profile: "synthetic",
  valuesPrinted: false
}));
