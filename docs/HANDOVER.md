# Reha-Kompass 1.0 Personal – Übergabe und aktueller Arbeitsstand

Stand: 23. August 2026, 17:30 Uhr Europe/Berlin

Dieses Dokument ist der kanonische Einstieg für Weiterarbeit und Notfallübergabe. Historische Release-Berichte bleiben als Nachweise erhalten, dürfen aber nicht ohne diesen aktuellen Stand als Handlungsanweisung verwendet werden.

## Kurzentscheidung

- Der lokale Feature-Stand ist technisch grün und als persönlicher Pilot praktisch testbar.
- Die bestehende Produktion bleibt unverändert auf dem Produktionsbranch.
- Es wurde weder gemergt noch deployed.
- Ein Merge des Feature-Stands ist erst nach realer iPhone-, Offline- und Push-Abnahme zu entscheiden.
- `render.yaml` verwendet `autoDeployTrigger: commit`; deshalb darf vor der Freigabe auch nichts auf den Produktionsbranch gepusht werden.
- Das formale Release-Gate bleibt bis zur realen iPhone-Push-, Ruhezeit- und Abmeldeprüfung `NO-GO`.

## Verbindliche Referenzen

| Zweck | Referenz |
| --- | --- |
| Repository | `oletiehen/gdp-dashboard` |
| lokaler Checkout | `olafs-reha-kompass-premium` |
| lokaler Arbeitsbranch | `feature/rehakompass-freizeit-mehrwert` |
| vollständig geprüfte Feature-Basis auf GitHub | `568dbc77527083eb797cd72b2b9d9de3b8581f92` |
| lokaler Arbeitsstand | Feature-Basis plus lokal geprüfter P0-Übergabecommit; nicht gepusht |
| GitHub-Produktionsbranch | `reha-kompass-premium-server` |
| GitHub-Produktionscommit | `8b5c29a15d6de011e9cdfbffad20b87407591e84` |
| Produktionsadresse | `https://gdp-dashboard-lccm.onrender.com` |
| aktuelle lokale Git-Sicherung einschließlich P0-Commit | `.data/backups/rehakompass-local-feature-p0-2026-08-23.bundle` |
| lokale Sicherung der uncommitteten P0-Änderungen | `.data/backups/rehakompass-p0-local-changes-2026-08-23.tar.gz` |

Der öffentliche Health-Endpunkt antwortete am 23. August 2026 wiederholt erfolgreich mit Version 1.0.0. Er meldete `ok: true`, Node-Laufzeit, erlaubte Code-Anmeldung sowie KI, Zugang, Passkey, Synchronisierung und Push als konfiguriert. Der Health-Endpunkt veröffentlicht keine Commit-SHA; die tatsächlich aktive Render-Deploy-SHA muss deshalb vor einem Produktionswechsel im richtigen Render-Konto rein lesend bestätigt werden.

Die rein lesende Dashboard-Prüfung am 23. August konnte diesen Nachweis nicht schließen: Im aktuell angemeldeten Render-Workspace `My Workspace` war ausschließlich der aktive Static-Dienst `olaf-projektzentrale` sichtbar. Der Reha-Kompass-Dienst war weder in der Projektübersicht noch unter den ungruppierten Diensten vorhanden. Es wurde keine Dashboard-Einstellung verändert. Für die Deploy-SHA ist daher Zugriff auf das Konto beziehungsweise den Workspace erforderlich, in dem `gdp-dashboard-lccm.onrender.com` verwaltet wird.

## Lokaler Prüfstand vom 23. August 2026

Geprüft auf `568dbc77527083eb797cd72b2b9d9de3b8581f92` mit Node.js 24.18.0 und npm 11.16.0:

| Prüfung | Ergebnis |
| --- | --- |
| Git-Ausgangsstand vor P0-Dokumentation | sauber; keine untracked Dateien; keine Stashes |
| Lint | bestanden |
| Unit-Tests | 32 von 32 bestanden |
| Integrationstests | 13 von 13 bestanden |
| Build | bestanden |
| Produktionsabhängigkeiten | 0 gemeldete Schwachstellen bei Audit-Level high |
| Mobile Browserprüfungen | 21 von 21 bestanden |
| Desktop-Browserprüfungen | 21 von 21 bestanden |
| automatisierte Barrierefreiheit | keine ernsten oder kritischen Verstöße gemeldet |
| manuelle lokale Browserprüfung | Anmeldung, Heute und Entzug/Reha auf Desktop und 390 x 844 Pixel nutzbar |

Die Tests verwenden ausschließlich synthetische Daten. Ein grüner lokaler Test ersetzt keine reale Geräte- oder Produktionsabnahme.

Nach diesem Prüfstand wurden ausschließlich die Übergabedokumentation, die Autofill-Zuordnung des Zugangscode-Formulars und die Service-Worker-Cachekennung lokal geändert. Der vollständige Check, alle 42 Browserprüfungen, das Audit und eine abschließende Mobile-/Desktop-Barrierefreiheitsprüfung bestanden auch mit diesen Änderungen. Sie werden ausschließlich lokal auf dem bestehenden Feature-Branch gesichert und bleiben bis zu einer ausdrücklichen Produktionsfreigabe ungepusht, ungemergt und undeployed.

Die uncommitteten P0-Änderungen wurden lokal archiviert und testweise entpackt. Dieses Archiv und das Git-Bundle liegen weiterhin auf demselben Mac; der Off-Mac-Nachweis bleibt offen. Die aktuelle Prüfsumme wird im Arbeitsbericht festgehalten, damit das Archiv selbst nicht seine eigene Prüfsumme enthalten muss.

## Persönlicher Grundbestand

Die ignorierte Datei `.data/private-profile.json` wurde am 23. August nur strukturell geprüft; persönliche Inhalte wurden nicht protokolliert. Ergebnis:

- gültiges JSON und vollständiges Profil;
- Entzug und Reha mit syntaktisch gültigen zukünftigen Daten;
- Entzug als vorläufig und Reha als bestätigt gekennzeichnet;
- Quellen, Station und direkter Übergang erfasst;
- sieben priorisierte Aufgaben mit sicheren Quellenlinks;
- 39 Packpunkte, zehn Quellen, Kontakte, Klinikfragen, Ziele und Krisenplan vorhanden;
- Dateirecht auf `0600` gehärtet.

Die medizinische und organisatorische Richtigkeit muss Olaf selbst beziehungsweise gemeinsam mit Klinik, Reha und Behandlungsteam bestätigen. Der Code darf aus einem vorhandenen Datum nie selbst eine medizinische Bestätigung ableiten.

Am 23. August wurden außerdem alle 14 eindeutigen öffentlichen Links aus Quellen und priorisierten Aufgaben erneut geöffnet. Klinikseiten zu Fachabteilung, Aufnahme, Koffer-Checkliste, Wissenswertem, Wahlleistungen, Sozialdienst und Besuch sowie die hinterlegten Primär-/Fachquellen von ASAM, WHO, DHS, AWMF und gesund.bund waren erreichbar. Erreichbarkeit bestätigt weder einen persönlichen Aufnahmetermin noch eine Stationszuordnung; diese Angaben bleiben direkt mit den Einrichtungen zu bestätigen.

## Offene P0-Punkte

1. **Getrennte Sicherung:** Das vollständige Git-Bundle ist lokal verifiziert. Eine Kopie außerhalb dieses Macs ist noch nicht bestätigt. Persönliche Reha-Daten dürfen nicht unverschlüsselt in einen Cloud-Ordner kopiert werden.
2. **Echtes iPhone:** Produktions-PWA vom Home-Bildschirm öffnen, Passkey/Face ID, kompletter Neustart, Offline-Start und Rückkehr online prüfen.
3. **Echter Push:** Hintergrundzustellung auf gesperrtem iPhone, Ruhezeit, neutrale Anzeige, Abmeldung und ausbleibende Folgezustellung nachweisen.
4. **Render-Zugriff und SHA:** Das aktuell angemeldete Render-Konto zeigt den Reha-Dienst nicht. Richtigen Workspace beziehungsweise richtiges Konto öffnen und danach aktive Deploy-SHA, Branch, Starter-Instanz und Datenträger rein lesend bestätigen.
5. **Persönliche Bestätigung:** Aufnahmeangaben, Station, Übergang, Kontakte, Unterlagen und Packliste gemeinsam mit den zuständigen Stellen kontrollieren.

## Sichere Arbeitsreihenfolge

1. Lokale Änderungen vollständig testen und dokumentieren.
2. Getrennte Sicherung bestätigen.
3. Persönliche Angaben fachlich bestätigen.
4. Reale iPhone-/Face-ID-/Offline-Abnahme durchführen.
5. Reale Push-Abnahme durchführen und Nachweis ergänzen.
6. Aktive Render-SHA rein lesend bestätigen.
7. Feature-Delta gegen `8b5c29a...` reviewen.
8. Erst danach Merge- und Deployment-Vorschlag vorlegen.
9. Merge oder Deployment nur nach ausdrücklicher Freigabe ausführen.

## Datenschutz- und Notfallgrenzen

- Keine Zugangscodes, Schlüssel, Push-Endpunkte oder privaten Profildaten in Git, Chat, Screenshots oder Berichte aufnehmen.
- `APP_ACCESS_CODE`, `DATA_ENCRYPTION_KEY`, `VAULT_SALT`, `SESSION_SECRET` und VAPID-Werte nicht rotieren, solange Wiederherstellung und Gerätezugang nicht gesichert sind.
- Safari-/PWA-Daten nicht löschen, bevor eine lesbare oder erfolgreich wiederhergestellte verschlüsselte Sicherung bestätigt ist.
- Code-Rollback und Datenwiederherstellung immer getrennt behandeln.
- Wegen `autoDeployTrigger: commit` keinen Commit auf den Produktionsbranch pushen, solange das Release-Gate nicht freigegeben ist.
- Die App organisiert und dokumentiert; sie diagnostiziert nicht und ersetzt weder Klinikteam noch Akuthilfe.

## Bekannte nicht blockierende Diagnosepunkte

- Der erwartete anonyme Aufruf von `/api/session` liefert HTTP 401 und erscheint dadurch in Chromium als Konsolenfehler, obwohl die Sperrlogik korrekt funktioniert.
- Das Zugangscode-Formular wurde um ein echtes technisches Hidden-Besitzerfeld ergänzt, damit Passwortmanager den Code eindeutig zuordnen können, ohne den Barrierefreiheitsbaum zu belasten.
- Der lokale Remote-Fetch war historisch nur auf den Passkey-Branch begrenzt. Die Konfiguration wurde am 23. August auf alle Remote-Branches korrigiert und erfolgreich aktualisiert; Feature- und Produktionsreferenz wichen danach jeweils um 0 Commits von den bestätigten SHA-Werten ab.

## Historische Dokumente richtig lesen

- `docs/release/1.0.0-passkey-auth-report.md` beschreibt den Stand vom 31. Juli und enthält eine damalige NO-GO-Entscheidung.
- `docs/release/1.0.0-render-smoke-test.md` enthält sowohl historische Kandidatenblöcke als auch spätere Produktionsnachweise.
- `docs/release/1.0.0-production-baseline.md` dokumentiert den belegten Produktionsstand; aktuelle Live-Beobachtungen müssen mit Datum ergänzt werden.
- `docs/release/1.0.0-release-gate.md` bleibt die formale Freigabeentscheidung.
