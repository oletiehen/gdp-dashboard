# Release-Checkliste Rehakompass 1.0.0

## Code und Datenschutz

- [ ] Arbeitsbranch nach GitHub übertragen
- [ ] Pull Request oder dokumentierter direkter Branch-Abgleich erstellt
- [x] produktiven v0.8-Stand lokal als `rehakompass-v0.8.0-backup` markiert
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

- [ ] vorhandene Werte für `OPENAI_API_KEY` und `APP_ACCESS_CODE` unverändert weiterverwenden
- [ ] `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, VAPID-Schlüsselpaar und `PRIVATE_PROFILE_JSON` setzen
- [ ] Build auf `npm ci && npm run build` setzen
- [ ] Start auf `npm start` setzen
- [ ] persistenten Datenträger unter `/var/data/rehakompass` einrichten
- [ ] dauerhaft laufenden Starter-Dienst bestätigen
- [ ] geschützten Login prüfen
- [ ] KI-Erfolg und KI-Ausfallmodus prüfen
- [ ] Upload, verschlüsseltes Archiv, Synchronisierung und Löschung prüfen
- [ ] installierte iPhone-PWA und echte Hintergrund-Push-Zustellung prüfen
- [ ] Ruhezeit, neutrale Anzeige und Push-Abmeldung prüfen
- [ ] Service Worker und Offline-Neustart prüfen
- [ ] Render-Smoke-Test protokollieren

## Rollback

1. Vor der Bereitstellung eine verschlüsselte und bei Bedarf lesbare Datensicherung erzeugen.
2. Den aktuellen Render-Deploy beibehalten, bis 1.0.0 vollständig grün ist.
3. Bei Releasefehlern den Branch auf den durch `rehakompass-v0.8.0-backup` bezeichneten Commit zurückstellen oder in Render den vorherigen erfolgreichen Deploy wiederherstellen.
4. Persistent gespeicherte 1.0-Daten nicht mit 0.8 überschreiben; Code-Rollback und Datenwiederherstellung getrennt behandeln.

Die Kästchen werden erst nach tatsächlich durchgeführter Prüfung als erledigt markiert. Ein grüner Build allein bestätigt keine reale Hintergrundzustellung auf einem iPhone.
