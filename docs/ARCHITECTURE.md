# Architektur und Datenschutzgrenzen

## Zweck

Rehakompass 1.0.0 ist ein geschützter persönlicher Pilot. Er organisiert und dokumentiert; er diagnostiziert nicht und trifft keine Therapie- oder Medikationsentscheidung.

## Datenfluss

1. Die öffentliche App-Schale zeigt ausschließlich die Zugangssicht. Persönliche Zustandsdaten und geschützte APIs bleiben ohne gültige Sitzung unzugänglich.
2. Zur kontrollierten Ersteinrichtung wird der bestehende Zugangscode einmalig über HTTPS gesendet und zeitkonstant mit `APP_ACCESS_CODE` verglichen. Diese Rückfallanmeldung kann nach der Passkey-Abnahme serverseitig deaktiviert werden.
3. Ein angemeldeter Eigentümer registriert einen Passkey über WebAuthn. Der Server erzeugt eine einmalige, fünf Minuten gültige Challenge und prüft Origin, RP-ID, User Presence und zwingende User Verification. Erfolgreiche Challenges werden verbraucht und können nicht wiederholt werden.
4. Eine Passkey-Anmeldung verwendet Face ID, Touch ID oder Gerätecode. Danach entsteht ein zufälliges, opakes Sitzungstoken. Im persistenten Speicher liegt nur dessen HMAC; das Cookie ist `HttpOnly`, `SameSite=Strict`, unter HTTPS `Secure`, zeitlich begrenzt, rotierbar und serverseitig widerrufbar.
5. Erst nach gültiger Passkey-Sitzung liefert der Server das aus vorhandenem Zugangscode und Tresorsalz abgeleitete AES-Schlüsselmaterial über eine `no-store`-Antwort. Der Browser importiert es nur in den Arbeitsspeicher; es wird nicht dauerhaft im Browser gespeichert.
6. Zustand und Dokumente werden im Browser verschlüsselt. Der Server speichert nur Chiffretext und eine Revisionsnummer beziehungsweise eine zufällige Dokument-ID.
7. Passkey-Metadaten, Challenges und Sitzungen liegen mit `DATA_ENCRYPTION_KEY` versiegelt in `auth.enc.json`. Der Klartext des persönlichen Profils wird nur nach erfolgreicher Anmeldung als Startkonfiguration übertragen.
8. Optional sendet der Browser eine sichtbare Coach-Nachricht mit begrenztem Kontext oder ein bewusst ausgewähltes Therapiedokument an den geschützten KI-Endpunkt.
9. Push-Subscriptions und neutrale Erinnerungszeiten werden serverseitig mit AES-GCM versiegelt. Sichtbare Benachrichtigungen enthalten keine Gesundheitsangaben.

## Komponenten

| Komponente | Verantwortung |
|---|---|
| `public/js/data-model.js` | Schema 1, Normalisierung, v0.8-Migration, Konfliktzusammenführung und Löschmarken |
| `public/js/timeline.js` | datumssichere relative Zeitachse, Routinen und Priorisierung |
| `public/js/crypto-vault.js` | Web-Crypto-PBKDF2 und AES-GCM für Zustand und Dokumente |
| `public/js/webauthn-client.js` | Browserseitige WebAuthn-Aufrufe und binäre JSON-Konvertierung ohne Tokenablage |
| `public/js/idb.js` | lokaler verschlüsselter Tresor und Offline-Dokumentwarteschlange |
| `src/server/security.js` | opake, serverseitig widerrufbare Sitzungen, Cookie-Schutz, Same-Origin-Prüfung und Versiegelung |
| `src/server/passkeys.js` | WebAuthn-Registrierung, Challenge-Prüfung, Zählerpflege und Gerätewiderruf |
| `src/server/store.js` | atomare persistente Ablage, Revisionen, Dokumente, Push- und verschlüsselte Authentifizierungsdaten |
| `src/server/ai.js` | OpenAI-Aufrufe, strukturiertes Schema, kontrollierter Retry und sichere Fehlerübersetzung |
| `src/server/push.js` | VAPID, Subscription-Lebenszyklus, neutrale Zustellung und Zeitgeber |
| `src/server/app.js` | API, Uploadgrenzen, Sicherheitsheader, Ratenbegrenzung und statische Auslieferung |

## Verschlüsselungsaussage

Synchronisierte Zustandsdaten und Dokumentinhalte sind clientseitig verschlüsselt; der Server erhält diese Inhalte nur als Chiffretext. Der Server liefert nach Anmeldung jedoch die private Startkonfiguration im Klartext aus und KI-Funktionen verarbeiten bewusst gesendete Klartextdaten. Deshalb wird das Gesamtsystem nicht pauschal als vollständige Ende-zu-Ende-Verschlüsselung bezeichnet.

Der Zugangscode bleibt serverseitiges Material für die Tresorschlüsselableitung. Eine Änderung des Zugangscodes erfordert vorher eine lesbare oder mit dem alten Schlüssel entschlüsselbare Sicherung und anschließende Neueinspielung. Es gibt keine Hintertür zur Wiederherstellung. Ein Passkey ersetzt die wiederholte Codeeingabe, ändert aber nicht rückwirkend das Verschlüsselungsformat bestehender Daten.

## Eigentümerzugang und Gerätesitzungen

Es gibt keine öffentliche Registrierung. Der erste Passkey kann nur aus einer gültigen Code-Sitzung heraus angelegt werden. Weitere Passkeys erfordern eine bereits gültige Sitzung. Nach bestätigter Geräteabnahme kann `ALLOW_ACCESS_CODE_LOGIN=false` die Code-Anmeldung sperren; eine administrative Rücksetzung besteht dann aus der bewussten Reaktivierung dieser Render-Variable, nicht aus einem öffentlich erreichbaren Setup-Endpunkt.

Passkey-Sitzungen gelten standardmäßig 30 Tage und rotieren bei aktiver Nutzung nach 24 Stunden. Abmeldung, Ablauf, Cookie-Löschung, Passkey-Widerruf oder Rotation von `SESSION_SECRET` machen die Sitzung ungültig. Die Geräteansicht listet Passkey-Zugänge, nicht garantiert einzelne physische Geräte: Ein über den Apple-Schlüsselbund synchronisierter Passkey kann auf mehreren persönlichen Apple-Geräten verfügbar sein.

Der Browser speichert weder Sitzungstoken noch Tresorschlüssel in `localStorage`. Nach einem vollständigen Offline-Neustart kann ein Passkey nicht serverseitig geprüft werden; deshalb bleibt der Tresor gesperrt, bis wieder eine Verbindung besteht oder der Code-Rückfallweg bewusst verwendet wird. Eine bereits entsperrte Seite kann ihre im Arbeitsspeicher vorhandene Sitzung während eines Netzausfalls weiter nutzen.

Kann ein älterer lokaler Tresor nicht mit dem aktuellen Schlüssel geöffnet werden, wird seine verschlüsselte Hülle zunächst in einem separaten IndexedDB-Recovery-Speicher archiviert. Eine funktionierende Serverkopie darf anschließend den lokalen Arbeitsstand wiederherstellen. Sind weder lokale noch serverseitige Daten entschlüsselbar, wird nichts überschrieben und eine verständliche Fehlermeldung angezeigt.

## Persistenz und Skalierungsgrenze

Der Dateispeicher verwendet atomare Schreibvorgänge und Dateirechte `0600`. Auf Render muss `DATA_DIR` auf einen persistenten Datenträger zeigen. Der Zeitgeber für Push läuft im einzigen Web-Prozess. Deshalb ist `numInstances: 1` verbindlich. Diese Architektur ist für einen persönlichen Piloten geeignet; für mehrere Benutzer wäre eine mandantenfähige Datenbank mit eigener Schlüssel- und Identitätsverwaltung erforderlich.

## Logging

Serverlogs enthalten Ereignisname, Statuscode, Fehlercode und Pfad, aber keine Nachrichtentexte, Dokumentnamen, Dokumentinhalte, Check-ins, Gesundheitsdaten oder Push-Endpunkte. Tests und Build verwenden ausschließlich synthetische Daten.

## Backups und Wiederherstellung

- lesbare Sicherung: vollständig, sensibel, nur geschützt aufbewahren
- verschlüsselte Sicherung: AES-GCM, nur mit dem Zugangscode wiederherstellbar
- Dokumentdateien: separat verschlüsselt im persistenten Speicher; Metadaten liegen im verschlüsselten Zustand
- v0.8-Migration: unveränderte Alt-Sicherung vor der ausdrücklichen Übernahme
- Rollback des Codes: Tag `rehakompass-v0.8.0-backup`

Ein Render-Datenträger braucht zusätzlich ein betriebliches Backup außerhalb des Dienstes. Das ist ein externer Betriebsprozess und nicht durch den Browserexport der Zustandsdaten allein ersetzt.

## Bedrohungs- und Grenzfälle

- Brute Force: Ratenbegrenzung für Code-, Registrierungs- und Passkey-Versuche sowie zeitkonstanter Codevergleich
- Replay und Phishing: einmalig verbrauchte Challenge, exakte Origin/RP-ID, Zählerprüfung und erforderliche lokale Benutzerverifikation
- Session Fixation: zufällige opake Tokens, Rotation nach Anmeldung und periodisch während aktiver Passkey-Nutzung
- verlorenes Gerät: Passkey und alle zugehörigen Sitzungen sind serverseitig widerrufbar
- CSRF: SameSite-Cookie plus Same-Origin-Prüfung schreibender API-Aufrufe
- XSS: strenge Content-Security-Policy und escaped dynamische Inhalte
- Dateiupload: Größen-, Typ- und Signaturprüfung für KI-Scans; Archiv wird vor dem Upload verschlüsselt
- Provider-Ausfall: lokale Funktionen, feste Hilfetexte und lokale Warteschlange bleiben nutzbar
- Offline-Neustart: App-Schale kann aus dem Cache laden, persönliche Daten bleiben ohne frische Sitzung oder bewusste Code-Authentifizierung verschlüsselt
- akute Krise: sichtbarer separater Hilfebereich mit realen Notfallwegen, keine KI-basierte Krisenversorgung
