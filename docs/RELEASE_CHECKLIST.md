# Release-Checkliste Rehakompass 1.0.0

## Code und Datenschutz

- [x] Arbeitsbranch nach GitHub übertragen
- [x] Pull Request oder dokumentierter direkter Branch-Abgleich erstellt
- [x] produktiven v0.8-Stand lokal und remote als `rehakompass-v0.8.0-backup` markiert
- [x] keine Schlüssel oder Tokens im Repository
- [x] persönliche Startkonfiguration liegt ausschließlich unter `.data/` und ist ignoriert
- [x] öffentlicher Build auf Schlüssel- und persönliche Marker geprüft
- [x] Originalquellen nicht verändert

## Automatisierte Prüfung

- [x] Installation mit reproduzierbarer Lockdatei
- [x] Lint
- [x] Unit-Tests
- [x] Integrations-Tests
- [x] vollständiger E2E-Lauf mobil und Desktop
- [x] PWA-/Offline-Test im vollständigen Lauf
- [x] automatisierte Barrierefreiheitsprüfung im vollständigen Lauf
- [x] Produktions-Build nach letzter Änderung
- [x] Produktionsabhängigkeiten ohne bekannte hohe oder kritische Schwachstelle

## Render Staging/Produktion

- [x] vorhandene Werte für `OPENAI_API_KEY` und `APP_ACCESS_CODE` unverändert weiterverwenden
- [x] `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, VAPID-Schlüsselpaar und `PRIVATE_PROFILE_JSON` setzen
- [x] Build auf `npm ci && npm run build` setzen
- [x] Start auf `npm start` setzen
- [x] persistenten Datenträger unter `/var/data/rehakompass` einrichten
- [x] dauerhaft laufenden Starter-Dienst bestätigen
- [ ] geschützten Login prüfen
- [ ] KI-Erfolg und KI-Ausfallmodus prüfen
- [ ] Upload, verschlüsseltes Archiv, Synchronisierung und Löschung prüfen
- [ ] installierte iPhone-PWA und echte Hintergrund-Push-Zustellung prüfen
- [ ] Ruhezeit, neutrale Anzeige und Push-Abmeldung prüfen
- [ ] Service Worker und Offline-Neustart prüfen
- [x] Render-Smoke-Test protokollieren

## Rollback

1. Vor der Bereitstellung eine verschlüsselte und bei Bedarf lesbare Datensicherung erzeugen.
2. Den aktuellen Render-Deploy beibehalten, bis 1.0.0 vollständig grün ist.
3. Bei Releasefehlern den Branch auf den durch `rehakompass-v0.8.0-backup` bezeichneten Commit zurückstellen oder in Render den vorherigen erfolgreichen Deploy wiederherstellen.
4. Persistent gespeicherte 1.0-Daten nicht mit 0.8 überschreiben; Code-Rollback und Datenwiederherstellung getrennt behandeln.

Die Kästchen werden erst nach tatsächlich durchgeführter Prüfung als erledigt markiert. Ein grüner Build allein bestätigt keine reale Hintergrundzustellung auf einem iPhone.

## Betriebsnachweis vom 5. August 2026

- Arbeits- und Produktionsbranch zeigen beide auf Commit `8b5c29a15d6de011e9cdfbffad20b87407591e84`; der direkte Branch-Abgleich ergibt `0/0` abweichende Commits.
- Render-Deploy `dep-d9plas3m8hqs73fq37ng` ist live.
- Der Dienst läuft auf `Starter`; der 1-GB-Datenträger ist unter `/var/data/rehakompass` eingebunden.
- Die laufende Instanz bestätigt `DATA_DIR=/var/data/rehakompass`.
- Buildbefehl `npm ci && npm run build` und Startbefehl `npm start` wurden im Render-Dashboard gelesen.
- Die vor der Umstellung gesicherten verschlüsselten Serverdateien wurden anhand der SHA-256-Prüfsummen übernommen und nach einem echten Dienstneustart erfolgreich entschlüsselt.
- `/api/health` antwortet mit HTTP 200, Version 1.0.0 sowie aktiver KI-, Zugangs-, Synchronisierungs- und Push-Konfiguration.
- Noch offen bleiben die Kästchen, die einen korrekten Login, reale KI-/Upload-Abläufe oder einen echten iPhone-Hintergrund-Push erfordern.
