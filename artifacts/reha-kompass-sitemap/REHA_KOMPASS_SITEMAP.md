# Olafs Reha-Kompass – Funktionslandkarte und Roadmap

Stand: 25. August 2026
Grundlage: aktueller Branch `feature/rehakompass-freizeit-mehrwert`

## So ist die Darstellung zu lesen

- **APP-BEREICH**: echte Navigation oder Funktion im Reha-Kompass. In der Grafik in Elfenbein oder Gold, kräftige serifenlose Schrift.
- *ERKLÄRUNG*: erläutert Nutzen, Abhängigkeit oder Grenze. In hellem Graublau, kleiner und kursiv; niemals mit einer App-Funktion verwechseln.
- `AKTIV`: im aktuellen Stand vorhanden und automatisiert geprüft.
- `VERBINDUNG`: vorhanden, benötigt aber Internet, eine Berechtigung oder einen externen Anbieter.
- `REPARIERT`: lokal korrigiert; nach verifiziertem Render-Deploy online.
- `IOS-AUSBAU`: sinnvoller nativer Ausbau nach der Web-App-Abnahme.

## Gesamte Sitemap

```text
PERSÖNLICHER ZUGANG
├── Ersteinrichtung mit zweimaligem persönlichem Code
├── Zugangscode als kontrollierter Rückfallweg
├── Passkey mit Face ID / Touch ID / Gerätecode
├── bestätigte Zugänge verwalten und widerrufen
└── sichere Abmeldung

APP-SCHALE
├── KOMPASS-START
│   ├── animiertes Kompass-Dashboard mit acht direkten Fächern
│   ├── Entzug & Reha / Kalender / Freizeit / Aufgaben
│   ├── Therapieplan / Tagebuch / MeTime / Klinikdossier
│   ├── Schnellzugriffe: Kontakte / Profil / Coach / Erinnerungen
│   ├── persönlicher Tagesfokus
│   ├── nächster sinnvoller Schritt
│   ├── Erledigen / Verschieben / Überspringen
│   ├── Einfach-Modus
│   ├── Aufgaben-Kurzüberblick
│   └── freiwillig aufklappbare Unterstützung nach Befinden
│
├── ENTZUG & REHA
│   ├── Phasenwechsel Entzug ↔ Reha
│   ├── Aufnahme Entzug: Datum, Status, Quelle
│   ├── Aufnahme Reha: Datum, Status, Quelle
│   ├── Mindestdauer und Übergangspuffer
│   ├── Station und Herkunft der Angabe
│   ├── gemeinsame Zeitachse
│   ├── Wochenphasen und Ziele
│   ├── verknüpfte Aufgaben
│   ├── Packliste mit Prioritäten und Filtern
│   ├── Ausgänge / Heimfahrten / Körperunterstützung
│   ├── Rechte, Wahlleistungen und offene Fragen
│   ├── Krisenplan
│   └── Quellen
│
├── + SCHNELL EINTRAGEN
│   ├── Termin
│   ├── Aufgabe
│   ├── Tagebuch
│   ├── Sitzung
│   ├── Therapieplan
│   └── Dokument
│
├── KALENDER
│   ├── Tages- und Wochenansicht
│   ├── Termine und Therapien
│   ├── wiederkehrende Routinen
│   ├── ganze Serie bearbeiten / pausieren / aktivieren
│   ├── Orts-, Notiz- und Linkfelder
│   ├── Reha-Zeitachse aus bestätigtem Datum
│   └── ICS-Export
│
└── MEHR
    ├── LISTEN & AUFGABEN [AUCH DIREKT VOM KOMPASS]
    │   ├── offen / verschoben / erledigt
    │   ├── Gruppen- und Statusfilter
    │   ├── Priorität in verständlicher Sprache
    │   ├── Details, Begründung, Notiz und Link
    │   └── eigene Aufgabe anlegen und bearbeiten
    │
    ├── TAGEBUCH & FESTHALTEN [AUCH DIREKT VOM KOMPASS]
    │   ├── täglicher Check-in
    │   ├── freier Tagebucheintrag
    │   ├── strukturierte Sitzungsnachbereitung
    │   ├── Bezugsperson aus Kontakten
    │   ├── lokale Audioaufnahme nach Einwilligung
    │   ├── optionales Browser-Transkript
    │   └── Audio, Transkript und Zusammenfassung getrennt löschen
    │
    ├── DOKUMENTE [AUCH DIREKT VOM KOMPASS]
    │   ├── verschlüsseltes persönliches Archiv
    │   ├── Upload, lokale Vorschau und Download
    │   ├── Suche und Kategorien
    │   ├── kontrollierte Löschung
    │   ├── Therapieplan als Bild oder PDF auswählen
    │   ├── optionale KI-Analyse
    │   └── erkannte Termine erst nach manueller Kontrolle übernehmen
    │
    ├── COACH [AUCH DIREKT VOM KOMPASS]
    │   ├── Motivation
    │   ├── Überforderung
    │   ├── Alleinsein
    │   ├── Suchtdruck
    │   ├── nach einer Sitzung
    │   ├── nächster konkreter Schritt
    │   ├── feste Offline-Hilfe
    │   └── optionale KI-Antwort mit begrenztem Kontext
    │
    ├── METIME [AUCH DIREKT VOM KOMPASS]
    │   ├── geführte Atemübung mit Zeittakt
    │   ├── Progressive Muskelentspannung
    │   ├── geführte Schlafmeditation
    │   ├── YouTube erst nach bewusstem Klick
    │   └── externer Direktlink als Rückfallweg
    │
    ├── FREIZEIT & UMGEBUNG [AUCH DIREKT VOM KOMPASS]
    │   ├── Filter: Energie, Zeit, drinnen / draußen
    │   ├── Kategorien Alltag, Mobilität, ruhig, aktiv, Kultur
    │   ├── privater Nähe-Kompass
    │   ├── optionaler Gerätestandort
    │   ├── echte Ortsfotos für ausgewählte Ziele mit Lizenznachweis
    │   ├── stichpunktartige Zusammenfassung der statischen Kerninformationen
    │   ├── OpenStreetMap-Kartenvorschau
    │   ├── Google-Maps-Route
    │   ├── offizielle Quellenlinks
    │   └── Ziel direkt in den Kalender übernehmen
    │
    ├── REHA-KLINIKDOSSIER [DIREKTROUTE #/mehr/clinic]
    │   ├── geprüfter Faktenstand
    │   ├── praktische Vorbereitungstipps
    │   ├── offizielle Links und Downloads
    │   └── offene Fragen vormerken und abhaken
    │
    ├── KONTAKTE [DIREKTROUTE #/mehr/contacts]
    │   ├── Rolle, Name, Telefon, E-Mail, Erreichbarkeit
    │   ├── Quelle: Nutzer / Dokument / Systemvorschlag
    │   ├── Gesprächsfragen und Notizen
    │   └── Gesprächsvorbereitung exportieren
    │
    ├── PROFIL & ZIELE
    │   ├── Ansprache
    │   ├── Gewichtsverlauf rein dokumentarisch
    │   ├── persönliches Ziel
    │   └── Ziele ergänzen und abhaken
    │
    ├── ERINNERUNGEN
    │   ├── Web Push nach Einwilligung
    │   ├── neutraler Sperrbildschirmtext
    │   ├── Vorlauf
    │   ├── Ruhezeiten
    │   ├── Testnachricht
    │   └── Abmeldung
    │
    ├── SICHERUNG & NEUSTART
    │   ├── lesbare Sicherung
    │   ├── verschlüsselte Sicherung
    │   ├── Wiederherstellung
    │   ├── sicherer Planungsneustart mit automatischem Backup
    │   └── vollständige kontrollierte Löschung
    │
    └── BEDIENUNG & SYSTEMSTATUS
        ├── Einfach-Modus
        ├── Online- / Offline-Status
        ├── Synchronisierung
        ├── Push- und KI-Verfügbarkeit
        └── sichere Abmeldung
```

## Kernablauf im Alltag

```text
APP ÖFFNEN
   ↓
ZUGANG BESTÄTIGEN
   ↓
KOMPASS: Bereich wählen oder nächsten sinnvollen Schritt öffnen
   ├── erledigen → Fortschritt sichern
   ├── verschieben → später wieder vorlegen
   ├── öffnen → Kalender / Liste / Dokument / Klinikbereich
   └── + → spontan Termin, Aufgabe oder Notiz erfassen
   ↓
VERSCHLÜSSELT LOKAL SPEICHERN
   ↓
BEI VERBINDUNG: verschlüsselt synchronisieren
```

*Erklärung: Die Startseite verbindet Orientierung und Handlung: Der Kompass zeigt die wichtigsten Bereiche sofort, während der konkrete nächste Schritt weiterhin direkt darunter priorisiert wird.*

## Funktionsstatus

### Aktiv und lokal automatisiert geprüft

- Zugangscode, Ersteinrichtung, Passkey-Fluss und Widerruf
- verschlüsselter Tresor, Offline-Ablage und Synchronisierung
- animiertes Kompass-Dashboard, Heute-Cockpit und Aufgabensteuerung
- Entzug-/Reha-Planung und Phasenwechsel
- Kalender, Routinen und ICS-Export
- Aufgabenlisten, Tagebuch, Sitzungsnachbereitung und Dokumentarchiv
- kontrollierte Therapieplanübernahme
- Kontakte, Profil, Ziele, Sicherung und Neustart
- Freizeitfilter, echte Ortsfotos, statische Kurzinfos, Ortskompass und Kalenderübergabe
- MeTime-Datenschutzschritt und Offline-Atemübung
- mobile und Desktop-Barrierefreiheitsprüfung ohne ernste oder kritische automatisierte Befunde

### Verbindung oder Freigabe erforderlich

- `VERBINDUNG` Passkey-Neuanmeldung: HTTPS und Server erreichbar
- `VERBINDUNG` Web Push: Home-Bildschirm-App, iOS-Berechtigung und konfigurierte Push-Infrastruktur
- `VERBINDUNG` KI-Coach und Therapieplananalyse: OpenAI-Verfügbarkeit und vorhandenes API-Guthaben
- `VERBINDUNG` YouTube-MeTime: bewusster Klick und YouTube erreichbar
- `VERBINDUNG` OpenStreetMap / Google Maps / offizielle Quellen: Internetverbindung
- `VERBINDUNG` Gerätestandort: ausdrückliche Standortfreigabe
- `VERBINDUNG` Browser-Spracherkennung: Geräte- und Browserunterstützung; mögliche Verarbeitung durch den Anbieter

### Am 25. August 2026 repariert

- `REPARIERT` Kartenvorschau: nicht erreichbarer statischer Kartenhost durch offizielle OpenStreetMap-Einbettung ersetzt
- `REPARIERT` YouTube-Fehler 153: nur die notwendige Ursprungsangabe für den Player ergänzt
- `REPARIERT` App-Cache: Cachekennung angehoben, damit installierte iPhone-Versionen die Korrekturen erhalten
- `REPARIERT` Ortsvorschau: echte lokal ausgelieferte Bilder mit sichtbarer Lizenzangabe statt nicht erreichbarer Drittanbieterbilder
- `REPARIERT` Aufgabenwege: Quellenlink bleibt erhalten; passende Funktion öffnet zusätzlich direkt den zugehörigen App-Bereich

## Technischer Datenfluss – bewusst vereinfacht

```text
iPhone / Mac
├── App-Schale und Oberfläche
├── entschlüsselter Schlüssel nur im Arbeitsspeicher
├── verschlüsselter lokaler Tresor
├── Offline-Warteschlange
└── bewusste Freigaben für Kamera, Mikrofon, Standort, Push
           │
           │ HTTPS + verschlüsselter Inhalt
           ▼
Render RC / später Produktion
├── Eigentümer-Sitzung
├── Passkey-Prüfung
├── verschlüsselte Zustandsdatei
├── verschlüsselte Dokumentdateien
├── neutrale Push-Zeitplanung
└── optionale, bewusst ausgelöste KI-Anfragen
```

*Erklärung: „Nur intern als iOS-App installiert“ und „Daten ausschließlich auf dem iPhone“ sind zwei verschiedene Entscheidungen. Die erste iOS-Fassung übernimmt zunächst den bewährten, verschlüsselten Render-Datenfluss.*

## Roadmap bis zur privaten iOS-App

### Phase 1 – Web-RC stabilisieren

- Karten und MeTime auf echtem iPhone erneut prüfen
- Zugangscode-Ersteinrichtung und Passkey auf demselben RC-Host abnehmen
- Push-Berechtigung und neutrale Testnachricht auf dem iPhone abnehmen
- Startdaten und Kliniktermine gemeinsam final kontrollieren
- Testdaten mit sicherem Neustart entfernen

### Phase 2 – Informationsarchitektur für iOS festlegen

- vier feste Tabs: **Heute**, **Entzug/Reha**, **Kalender**, **Mehr**
- mittlere **+**-Aktion als eigener Composer statt normaler Tab
- pro Tab eigener Navigationsverlauf
- Funktionen aus „Mehr“ als klar getrennte Unterseiten
- gleiche Begriffe wie in der Web-App, damit kein Umlernen nötig ist

### Phase 3 – Private iOS-Hülle

- eigenes Xcode-Projekt und Bundle-ID
- persönliches App-Icon und Startbildschirm
- zunächst sichere Einbettung der geprüften Online-Fassung
- Keychain-/Face-ID-Anbindung vorbereiten
- Kamera, Dokumentauswahl, Teilen und Benachrichtigungen nativ anbinden
- Simulator- und echtes iPhone-Testing

### Phase 4 – Stufenweise native Bereiche

- native Tab-Navigation und Schnellaktion
- native Dokumentauswahl und Scanner
- native lokale Benachrichtigungen
- Keychain-gesicherte Sitzung
- optional später: lokal gebündelte Oberfläche und stärkerer Offlinebetrieb

### Phase 5 – Private Verteilung

- zuerst Installation über Xcode auf Olafs iPhone
- anschließend bei Bedarf Ad-hoc-Verteilung für das registrierte Gerät
- keine öffentliche App-Store-Veröffentlichung

## Visuelle Vorgabe für Gamma

- 16:9-Präsentation, ruhige Premium-Optik, keine generische Business-Vorlage
- Hintergrund: sehr dunkles Marineblau bis Anthrazit
- Hauptlinien und Rahmen: warmes Gold
- App-Bereiche: Elfenbein, kräftige moderne Sans-Serif-Schrift
- Erklärungen: Graublau, kleinere kursive Serifenschrift, immer mit „Erklärung:“ beginnen
- Statuschips: Aktiv = gedecktes Grün, Verbindung = Graublau, Repariert = warmes Orange, iOS-Ausbau = kühles Blau
- feine Linien, großzügige Abstände, keine schweren Verläufe oder überladenen Effekte
- echte Hierarchie: Gesamtkarte zuerst, danach je Funktionsfamilie eine eigene Karte
- keine persönlichen medizinischen Daten, keine Zugangsdaten und keine Testnamen zeigen
