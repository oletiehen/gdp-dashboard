# Changelog

## 2026-08-25

- Die Startansicht ist jetzt ein ruhiges, animiertes Kompass-Dashboard mit acht direkten Bereichs-Fächern und zusätzlichen Schnellzugriffen; reduzierte Bewegung wird respektiert.
- Klinikdossier, Kontakte, Profil und Verwaltung sind über direkte Hash-Routen erreichbar; passende Aufgaben zeigen neben ihrer Quelle einen internen App-Direktlink.
- Freizeitkarten enthalten für Innenstadt, Heimatmuseum, Haselünner See und Wacholderhain echte lokal ausgelieferte Ortsfotos mit Lizenznachweis.
- Jede Freizeitkarte fasst die wichtigsten statischen Angaben stichpunktartig zusammen; veränderliche Routen und Öffnungszeiten bleiben verlinkt.
- Defekte statische Kartenvorschaubilder wurden durch direkt eingebettete OpenStreetMap-Karten mit weiterhin separater Google-Maps-Verknüpfung ersetzt.
- MeTime-Einbettungen senden nur die für den YouTube-Player erforderliche Herkunft und vermeiden damit den Playerfehler 153 auf dem iPhone.
- App-Shell und Service-Worker verwenden eine neue Cache-Version, damit die Reparaturen auf bereits installierten Home-Bildschirm-Versionen sicher ankommen.

## 2026-08-05

- Die transitive Produktionsabhaengigkeit `ip-address` wurde auf `10.4.0` aktualisiert; der Produktions-Audit meldet danach keine bekannten Schwachstellen mehr.

## 2026-08-01

- Der bestehende Tresor-Salt kann geschuetzt ueber `VAULT_SALT` wiederhergestellt werden, damit verschluesselte Sicherungen auch nach einem Neustart des kostenlosen, fluechtigen Render-Speichers lesbar bleiben.
- Ein abweichender konfigurierter Salt stoppt den Server bewusst, statt eine nicht mehr entschluesselbare Datenlage zu erzeugen.

## 1.0.0 – 2026-07-21

### Hinzugefügt

- persönliche Passkey-Anmeldung über WebAuthn mit Face ID, Touch ID oder Gerätecode
- langlebige, serverseitig widerrufbare und regelmäßig rotierende Passkey-Sitzungen
- geschützte Verwaltung bestätigter Passkeys sowie sichere Abmeldung und Zugriffsentzug
- verschlüsselte Ablage von Passkey-Metadaten, Sitzungshashes und kurzlebigen Challenges
- geführtes Cockpit mit nächstem Schritt, Begründung, Verschieben, Überspringen und Einfach-Modus
- erwarteter und bestätigter Aufnahmetermin mit automatisch neu berechneter Reha-Zeitachse
- geschützte persönliche Checklisten und filterbare, bearbeitbare eigene Aufgaben
- Tages-, Wochen- und Terminansicht, wiederkehrende Routinen und ICS-Export
- kontrollierte KI-Therapieplananalyse mit editierbarer Vorschau und zwingender Bestätigung
- Tagebuch, täglicher Check-in, strukturierte Sitzungsnachbereitung und bewusste Spracherfassung
- getrennte Löschung von Audio, Transkript und Zusammenfassung
- feste Offline-Coaching-Inhalte mit mindestens 30 Varianten je Bereich
- editierbare Kontakte, Gesprächsvorbereitung und Klinikdossier mit Quellenstatus
- Freizeit- und Umgebungsbereich mit Nahversorgung, Bus, Bahn, Rad- und Ausflugszielen ab der Klinik
- Filter nach Energie, Zeit und drinnen oder draußen sowie direkte Übernahme in den Kalender
- übersichtliche „Mehr für dich“-Startseite für Zugang, Sicherung, Klinik, Kontakte und Einstellungen
- clientseitig verschlüsseltes Dokumentenarchiv mit Vorschau, Suche, Export und Löschung
- verschlüsselte Offline-Ablage, revisionsbasierte Synchronisierung und Konfliktzusammenführung
- kontrollierte Migration lokaler Daten aus Version 0.8.0
- echte Web-Push-Infrastruktur mit neutralen Texten, Ruhezeiten und Abmeldung
- mobile und Desktop-E2E-Tests sowie automatisierte Barrierefreiheitsprüfung

### Geändert

- Zugangssicht auf einmalige Eigentümerbestätigung mit kontrolliertem Code-Rückfallweg umgestellt
- Oberfläche vollständig auf ein ruhiges, kontrastreiches Blau-Gold-System umgestellt
- mobile Startseite verdichtet, damit der nächste sinnvolle Schritt früher sichtbar wird
- KI-Fehler werden ohne Rohfehlermeldungen abgefangen; Eingaben bleiben erhalten
- Server in Sicherheits-, Speicher-, KI- und Push-Module aufgeteilt

### Entfernt

- ungenutzte Streamlit-/GDP-Demodateien aus dem dedizierten Rehakompass-Branch

### Migration

- Der produktive Stand 0.8.0 wurde vor der Umstellung als `rehakompass-v0.8.0-backup` markiert.
- Das alte lokale Datenformat bleibt bis zur ausdrücklichen Sicherung und Migration unangetastet.
