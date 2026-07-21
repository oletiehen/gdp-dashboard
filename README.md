# Olafs Reha-Kompass 1.0.0

Geschützter persönlicher Pilot für Reha-Vorbereitung, Aufenthalt und Nachsorge. Die Anwendung führt über einen klaren nächsten Schritt, verwaltet Kalender, persönliche Checklisten, Dokumente, Sitzungsnotizen und neutrale Web-Push-Erinnerungen. KI-Unterstützung und Therapieplananalyse sind optional; der regelbasierte Kern bleibt offline nutzbar.

Die Anwendung ist eine Organisations- und Dokumentationshilfe. Sie stellt keine Diagnose, ändert keine Medikamente, ersetzt keine therapeutische Entscheidung und ist keine akute Krisenversorgung.

## Architektur in Kürze

- Node.js-/Express-Server mit geschützter Sitzung und Same-Origin-Prüfung
- statische, mobile-first Web-App ohne Frontend-Framework
- Service Worker und verschlüsselte Offline-Ablage in IndexedDB
- clientseitige AES-GCM-Verschlüsselung für Zustandsdaten und Dokumente
- revisionsbasierte, verschlüsselte Synchronisierung mit Konfliktzusammenführung
- optionaler OpenAI-Endpunkt für Coach und kontrollierte Therapieplananalyse
- echte Web-Push-Subscription mit neutralem Sperrbildschirmtext
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

Die Werte in `.env` bleiben lokal und werden nie eingecheckt. Mindestens `APP_ACCESS_CODE` muss gesetzt sein. Persönliche Startdaten gehören nach `.data/private-profile.json` oder werden über `PRIVATE_PROFILE_JSON` beziehungsweise `PRIVATE_PROFILE_FILE` geladen. Als neutrale Vorlage dient `config/private-profile.example.json`.

Die App läuft standardmäßig unter `http://localhost:3000`. Für lokale HTTP-Tests kann `COOKIE_SECURE=false` gesetzt werden. In Produktion muss HTTPS verwendet werden; dort wird das sichere Cookie automatisch aktiviert.

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
- `VAPID_CONTACT=https://gdp-dashboard-lccm.onrender.com`

`npm run prepare:render-secrets` erzeugt die neuen Sitzungs-, Speicher- und VAPID-Werte ausschließlich in `.data/render-secrets.env`. Es gibt keine Werte im Terminal aus. `OPENAI_API_KEY` und `APP_ACCESS_CODE` werden absichtlich nicht erzeugt oder überschrieben.

Zuverlässige Synchronisierung und zeitgesteuerte Push-Zustellung benötigen einen dauerhaft laufenden Dienst mit persistentem Datenträger. Das in `render.yaml` vorgesehene Starter-Setup kann kostenpflichtig sein. Ein schlafender Gratisdienst eignet sich nur für Oberflächen- und KI-Tests, nicht für garantierte Erinnerungen.

## Daten und Migration

Beim ersten Entsperren sucht die App nach den lokalen Schlüsseln der Versionen 0.5 und 0.8. Vor der Migration wird eine unveränderte Sicherung angeboten. Erst nach ausdrücklichem Klick werden Aufgaben, Termine, Tagesstruktur, Kontakte und Tagebuchdaten in das neue verschlüsselte Modell übernommen. Ein altes Aufnahmedatum bleibt dabei `erwartet` und wird niemals automatisch bestätigt.

Unter `Mehr → Daten` stehen lesbare und verschlüsselte Sicherung, Wiederherstellung und kontrollierte Gesamtlöschung bereit. Dokumente werden vor dem Upload im Browser verschlüsselt. Wer den Zugangscode verliert, kann clientseitig verschlüsselte Daten nicht wiederherstellen.

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
