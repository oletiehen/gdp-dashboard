# Olafs Reha-Kompass 1.0.0

Geschützter persönlicher Pilot für Entzug, direkten Reha-Übergang, Reha-Vorbereitung, Aufenthalt und Nachsorge. Die Anwendung führt über einen klaren nächsten Schritt, verwaltet bearbeitbare Termine mit Notizen und Links, aufklappbare Aufgaben, Dokumente, Sitzungsnotizen und neutrale Web-Push-Erinnerungen. Ein lokaler Freizeit- und Umgebungsführer bündelt Nahversorgung, Wege, Mobilität und passende Ausflüge ab der Klinik. KI-Unterstützung und Therapieplananalyse sind optional; der regelbasierte Kern bleibt offline nutzbar.

Die Anwendung ist eine Organisations- und Dokumentationshilfe. Sie stellt keine Diagnose, ändert keine Medikamente, ersetzt keine therapeutische Entscheidung und ist keine akute Krisenversorgung.

## Architektur in Kürze

- Node.js-/Express-Server mit Passkey/WebAuthn, widerrufbaren Sitzungen und Same-Origin-Prüfung
- statische, mobile-first Web-App ohne Frontend-Framework
- Service Worker und verschlüsselte Offline-Ablage in IndexedDB
- clientseitige AES-GCM-Verschlüsselung für Zustandsdaten und Dokumente
- revisionsbasierte, verschlüsselte Synchronisierung mit Konfliktzusammenführung
- optionaler OpenAI-Endpunkt für Coach und kontrollierte Therapieplananalyse
- echte Web-Push-Subscription mit neutralem Sperrbildschirmtext
- quellengestützter, offline verfügbarer Umgebungsführer mit Filtern und Kalenderübergabe
- geschützter Entzug-Reha-Zeitplan mit getrennten Statusangaben, Mindestdauer, direktem Übergang und privaten Quellen
- persistenter Dateispeicher auf einem einzelnen Render-Datenträger

Weitere Details stehen in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Lokale Einrichtung

Voraussetzungen: Node.js 20 bis 24 und npm.

```text
npm ci
cp .env.example .env
npm run build
npm start
```

Die Werte in `.env` bleiben lokal und werden nie eingecheckt. Mindestens `APP_ACCESS_CODE` muss gesetzt sein. Er bleibt das serverseitige Schlüsselmaterial für den bestehenden Datentresor und dient während der kontrollierten Ersteinrichtung als Rückfallzugang. Persönliche Startdaten gehören nach `.data/private-profile.json` oder werden über `PRIVATE_PROFILE_JSON` beziehungsweise `PRIVATE_PROFILE_FILE` geladen. Als neutrale Vorlage dient `config/private-profile.example.json`.

### Persönlicher Zugang ohne wiederholte Codeeingabe

Der bevorzugte Zugang verwendet einen Passkey über WebAuthn. Nach der einmaligen Einrichtung bestätigt Olaf den Zugang mit Face ID, Touch ID oder Gerätecode. Anschließend hält ein zufälliges, ausschließlich als `HttpOnly`-, `SameSite=Strict`- und unter HTTPS `Secure`-Cookie übertragenes Sitzungstoken den bestätigten Zugang bis zu 30 Tage offen. Das Token ist serverseitig gespeichert, rotierbar und gemeinsam mit dem zugehörigen Passkey widerrufbar.

Die Ersteinrichtung erfolgt bewusst in zwei Stufen: Zuerst einmalig mit dem vorhandenen Zugangscode öffnen, danach unter `Mehr → Zugang` einen Passkey anlegen. Erst wenn dieser Ablauf auf den persönlichen Geräten geprüft wurde, darf `ALLOW_ACCESS_CODE_LOGIN=false` gesetzt werden. Es gibt keine öffentliche Registrierung und keinen dauerhaften Geräte- oder Tresorschlüssel in `localStorage`.

Ein bereits entsperrter Bildschirm bleibt bei einem Netzausfall nutzbar. Nach einem vollständigen Browser- oder PWA-Neustart wird der Tresor jedoch erst nach einer frischen Serversitzungsprüfung oder der bewussten Code-Rückfallanmeldung geöffnet. So kann der Service Worker keine persönlichen Inhalte selbstständig entschlüsseln.

Die App läuft standardmäßig unter `http://localhost:3000`. Für lokale HTTP-Tests kann `COOKIE_SECURE=false` gesetzt werden. In Produktion muss HTTPS verwendet werden; dort wird das sichere Cookie automatisch aktiviert.

### Getrennte lokale Nullversion

`npm run start:fresh` öffnet auf `http://127.0.0.1:4175` eine getrennte Ersteinrichtung. Dort wird ein neuer persönlicher Zugangscode zweimal eingegeben. Der bisherige Datentresor, bestehende Browserdaten und die geschützte persönliche Grundkonfiguration werden nicht übernommen oder gelöscht. Die Nullversion verwendet standardmäßig `.data/local-fresh-start`; auf dem Datenträger wird kein Klartext-Code abgelegt, sondern nur ein gesalzener Prüfwert. Nach einem Neustart muss derselbe Code erneut bestätigt werden, damit der lokale Server den verschlüsselten Tresor öffnen kann.

## Render-Konfiguration

Die Infrastrukturdefinition liegt in `render.yaml`. Für den bestehenden manuellen Render-Service sind exakt diese Felder zu verwenden:

| Feld | Wert |
|---|---|
| Runtime | `Node` |
| Branch | `reha-kompass-premium-server` |
| Root Directory | leer lassen |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check | `/api/health` |

Erforderliche geheime Render-Variablen:

- `APP_ACCESS_CODE`
- `OPENAI_API_KEY` (optional für KI, vorhandenen Wert weiterverwenden)
- `SESSION_SECRET`
- `DATA_ENCRYPTION_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `PRIVATE_PROFILE_JSON`

Normale Variablen:

- `OPENAI_MODEL=gpt-5.4-mini`
- `NODE_ENV=production`
- `DATA_DIR=/var/data/rehakompass`
- `VAULT_SALT=<bestehender 16-Byte-Base64-Salt>` fuer eine wiederherstellbare Tresor-Identitaet; auf fluechtigem Testspeicher zwingend beibehalten
- `ALLOW_ACCESS_CODE_LOGIN=true` während der Ersteinrichtung; erst nach Passkey-Abnahme auf `false`
- `PASSKEY_RP_ID=<Hostname ohne https://>`
- `PASSKEY_ORIGIN=https://<vollständige App-Adresse>`
- `PASSKEY_RP_NAME=Olafs Reha-Kompass`
- `PASSKEY_SESSION_DAYS=30`
- `SESSION_ROTATION_HOURS=24`
- `VAPID_CONTACT=https://gdp-dashboard-lccm.onrender.com`

`PASSKEY_RP_ID` und `PASSKEY_ORIGIN` sind an die tatsächliche HTTPS-Adresse gebunden. Ein Kandidatendienst benötigt deshalb seine eigene Origin-Konfiguration. Die Produktion darf erst nach einem bestandenen Passkey-Test auf demselben Host umgestellt werden.

`npm run prepare:render-secrets` erzeugt die neuen Sitzungs-, Speicher- und VAPID-Werte ausschließlich in `.data/render-secrets.env`. Es gibt keine Werte im Terminal aus. `OPENAI_API_KEY` und `APP_ACCESS_CODE` werden absichtlich nicht erzeugt oder überschrieben.

Zuverlässige Synchronisierung und zeitgesteuerte Push-Zustellung benötigen einen dauerhaft laufenden Dienst mit persistentem Datenträger. Das in `render.yaml` vorgesehene Starter-Setup kann kostenpflichtig sein. Ein schlafender Gratisdienst eignet sich nur für Oberflächen- und KI-Tests, nicht für garantierte Erinnerungen.

## Daten und Migration

Beim ersten Entsperren sucht die App nach den lokalen Schlüsseln der Versionen 0.5 und 0.8. Vor der Migration wird eine unveränderte Sicherung angeboten. Erst nach ausdrücklichem Klick werden Aufgaben, Termine, Tagesstruktur, Kontakte und Tagebuchdaten in das neue verschlüsselte Modell übernommen. Ein altes Aufnahmedatum bleibt dabei `erwartet` und wird niemals automatisch bestätigt.

Unter `Mehr → Daten` stehen lesbare und verschlüsselte Sicherung, Wiederherstellung und kontrollierte Gesamtlöschung bereit. Der sichere Planungsneustart erstellt vorab automatisch eine verschlüsselte Sicherung, setzt aktive Planungsdaten aus der geschützten Grundkonfiguration neu auf und behält Dokumente sowie Darstellungsoptionen. Synchronisationsmarker verhindern, dass entfernte Altstände beim nächsten Abgleich zurückkehren. Dokumente werden vor dem Upload im Browser verschlüsselt. Wer den Zugangscode verliert, kann clientseitig verschlüsselte Daten nicht wiederherstellen.

## Push auf iPhone

1. Produktions-URL in Safari öffnen.
2. Über Teilen `Zum Home-Bildschirm` wählen.
3. Die installierte App öffnen und entsperren.
4. Unter `Mehr → Push` die Erklärung lesen und Push aktivieren.
5. Die iOS-Berechtigung erlauben.
6. Einen neutralen Test senden.

Der sichtbare Push-Text enthält weder Terminname noch Diagnose oder andere Gesundheitsangaben. Ruhezeiten und Vorlauf lassen sich in der App einstellen; die Subscription kann vollständig abgemeldet werden.

## Qualitätssicherung

```text
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run build
npm run audit
```

Alle Tests verwenden synthetische Daten. Der Produktions-Build bricht ab, wenn er Schlüssel-Muster oder fest definierte persönliche Marker im öffentlichen Bundle entdeckt. Die vollständige Freigabeprüfung steht in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Grenzen

- Browser-Spracherkennung kann abhängig vom Browser Daten an dessen Anbieter übertragen; die App erklärt dies vor dem bewussten Start.
- Die optional an OpenAI gesendeten Daten sind auf die sichtbare Nachricht und einen begrenzten Kontext beschränkt. Archiv und vollständiges Tagebuch werden nicht automatisch übertragen.
- Der Dateispeicher ist für einen einzelnen persönlichen Pilotnutzer ausgelegt, nicht für eine Mehrmandantenplattform.
- Ein API-Schlüssel allein bedeutet nicht automatisch verfügbares API-Guthaben.
