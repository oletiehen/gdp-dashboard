# Architektur und Datenschutzgrenzen

## Zweck

Rehakompass 1.0.0 ist ein geschützter persönlicher Pilot. Er organisiert und dokumentiert; er diagnostiziert nicht und trifft keine Therapie- oder Medikationsentscheidung.

## Datenfluss

1. Der Zugangscode wird über HTTPS an den Server gesendet und dort zeitkonstant mit `APP_ACCESS_CODE` verglichen.
2. Eine erfolgreiche Anmeldung setzt ein signiertes, `HttpOnly`, `SameSite=Strict` und in Produktion `Secure` markiertes Sitzungscookie.
3. Der Browser leitet aus Zugangscode und serverseitig gespeichertem Zufallssalz per PBKDF2 einen nicht exportierbaren AES-GCM-Schlüssel ab.
4. Zustand und Dokumente werden im Browser verschlüsselt. Der Server speichert nur Chiffretext und eine Revisionsnummer beziehungsweise eine zufällige Dokument-ID.
5. Der Klartext des persönlichen Profils wird nur nach erfolgreicher Anmeldung einmalig als Startkonfiguration übertragen. Er ist nicht Teil des öffentlichen Bundles.
6. Optional sendet der Browser eine sichtbare Coach-Nachricht mit begrenztem Kontext oder ein bewusst ausgewähltes Therapiedokument an den geschützten KI-Endpunkt.
7. Push-Subscriptions und neutrale Erinnerungszeiten werden serverseitig mit AES-GCM versiegelt. Sichtbare Benachrichtigungen enthalten keine Gesundheitsangaben.

## Komponenten

| Komponente | Verantwortung |
|---|---|
| `public/js/data-model.js` | Schema 1, Normalisierung, v0.8-Migration, Konfliktzusammenführung und Löschmarken |
| `public/js/timeline.js` | datumssichere relative Zeitachse, Routinen und Priorisierung |
| `public/js/crypto-vault.js` | Web-Crypto-PBKDF2 und AES-GCM für Zustand und Dokumente |
| `public/js/idb.js` | lokaler verschlüsselter Tresor und Offline-Dokumentwarteschlange |
| `src/server/security.js` | Sitzungssignatur, Zugriffskontrolle, Same-Origin-Prüfung und serverseitige Versiegelung |
| `src/server/store.js` | atomare persistente Ablage, Revisionen, Dokumente und Push-Daten |
| `src/server/ai.js` | OpenAI-Aufrufe, strukturiertes Schema, kontrollierter Retry und sichere Fehlerübersetzung |
| `src/server/push.js` | VAPID, Subscription-Lebenszyklus, neutrale Zustellung und Zeitgeber |
| `src/server/app.js` | API, Uploadgrenzen, Sicherheitsheader, Ratenbegrenzung und statische Auslieferung |

## Verschlüsselungsaussage

Synchronisierte Zustandsdaten und Dokumentinhalte sind clientseitig verschlüsselt; der Server erhält diese Inhalte nur als Chiffretext. Der Server liefert nach Anmeldung jedoch die private Startkonfiguration im Klartext aus und KI-Funktionen verarbeiten bewusst gesendete Klartextdaten. Deshalb wird das Gesamtsystem nicht pauschal als vollständige Ende-zu-Ende-Verschlüsselung bezeichnet.

Der Zugangscode ist zugleich Material für die lokale Schlüsselableitung. Eine Änderung des Zugangscodes erfordert vorher eine lesbare oder mit dem alten Code entschlüsselbare Sicherung und anschließende Neueinspielung. Es gibt keine Hintertür zur Wiederherstellung.

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

- Brute Force: Login-Ratenbegrenzung und zeitkonstanter Vergleich
- CSRF: SameSite-Cookie plus Same-Origin-Prüfung schreibender API-Aufrufe
- XSS: strenge Content-Security-Policy und escaped dynamische Inhalte
- Dateiupload: Größen-, Typ- und Signaturprüfung für KI-Scans; Archiv wird vor dem Upload verschlüsselt
- Provider-Ausfall: lokale Funktionen, feste Hilfetexte und lokale Warteschlange bleiben nutzbar
- verlorenes Gerät: Zugriffscode und Gerätesperre schützen den lokalen Chiffretext; Remote-Löschung ist nicht implementiert
- akute Krise: sichtbarer separater Hilfebereich mit realen Notfallwegen, keine KI-basierte Krisenversorgung
