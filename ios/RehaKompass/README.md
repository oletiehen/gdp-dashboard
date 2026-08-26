# Reha-Kompass – native iOS-App

Dies ist der native SwiftUI-Neubau des persönlichen Reha-Kompasses. Er ersetzt nicht einfach die Render-Webseite in einem WebView, sondern bildet die App als echte iOS-Anwendung ab.

## Architektur der ersten nativen Basis

- SwiftUI mit vier festen Tabs: Heute, Entzug/Reha, Kalender, Mehr
- zentrale Plus-Aktion zum schnellen Erfassen
- Face ID / Gerätecode über LocalAuthentication
- lokaler verschlüsselter Tresor mit CryptoKit (AES-GCM)
- Schlüssel im iOS-Keychain, gerätegebunden (`WhenUnlockedThisDeviceOnly`)
- Dateischutz mit vollständigem iOS File Protection
- keine Render-Abhängigkeit für die bisher angelegten lokalen Daten

## Projekt erzeugen

Das Repository enthält eine XcodeGen-Konfiguration, damit die Xcode-Projektdatei reproduzierbar bleibt.

```bash
cd ios/RehaKompass
brew install xcodegen
xcodegen generate
open RehaKompass.xcodeproj
```

Danach in Xcode unter Signing & Capabilities das persönliche Apple-Developer-Team auswählen und das angeschlossene iPhone als Run Destination wählen.

## Sicherheitsentscheidung

Der lokale Schlüssel ist absichtlich gerätegebunden. Für ein echtes Disaster-Recovery wird deshalb als nächster Schritt ein separat verschlüsseltes Recovery-Backup mit einem nur dem Nutzer bekannten Wiederherstellungsgeheimnis implementiert. Ohne diesen zweiten Mechanismus darf die App nicht als vollständig backupsicher gelten.

## Nächste native Ausbauschritte

1. vorhandenes Datenmodell des Web-Reha-Kompasses vollständig mappen
2. Packliste, Aufgaben, Tagebuch und Profil nativ fertigstellen
3. Dokumentimport/Scanner über PhotosUI/VisionKit
4. Kalenderintegration über EventKit
5. lokale Benachrichtigungen über UserNotifications
6. verschlüsseltes Recovery-Backup mit Import/Export
7. echte iPhone-Abnahme und Installation über Xcode
