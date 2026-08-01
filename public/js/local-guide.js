const CLINIC = [52.519115, 8.083688];

function osmDirections(mode, destination) {
  const engine = mode === "bike" ? "fossgis_osrm_bike" : "fossgis_osrm_foot";
  const route = `${CLINIC.join(",")};${destination.join(",")}`;
  return `https://www.openstreetmap.org/directions?engine=${engine}&route=${encodeURIComponent(route)}`;
}

export const GUIDE_CATEGORY_LABELS = Object.freeze({
  alltag: "Einkaufen & Alltag",
  mobilitaet: "Bus, Bahn & Stadt",
  ruhig: "Ruhige Auszeit",
  aktiv: "Bewegung & Natur",
  kultur: "Kultur & Begegnung"
});

export const LOCAL_GUIDE = Object.freeze({
  verifiedAt: "31.07.2026",
  origin: "Fachklinik St. Marienstift, Dammer Straße 4a, Neuenkirchen-Vörden",
  notice: "Entfernungen und Gehzeiten sind gerundete Orientierungswerte ab der Klinik auf Basis von OpenStreetMap. Öffnungszeiten, Fahrtzeiten, Klinikregeln und die persönliche Belastbarkeit bitte vor dem Losgehen aktuell prüfen.",
  resources: [
    { title: "Was ist aktuell los?", text: "Veranstaltungen der Gemeinde mit Datum und Ort", url: "https://www.neuenkirchen-voerden.de/portal/seiten/veranstaltungen-in-neuenkirchen-voerden-900000016-24210.html" },
    { title: "Radtour passend auswählen", text: "Knotenpunktnetz und regionale Touren", url: "https://www.dammer-berge.de/erlebnisse/touren/Radwandern.php" },
    { title: "Essen und Café finden", text: "Aktuelle Gastronomieübersicht der Gemeinde", url: "https://www.neuenkirchen-voerden.de/portal/seiten/gastronomie-900000184-24210.html" },
    { title: "Alle Freizeitangebote", text: "Ausflugsziele, Naturbad, Sport und Kultur", url: "https://www.neuenkirchen-voerden.de/freizeit/" }
  ],
  items: [
    {
      id: "klinik-waldpark",
      title: "Klinik-Waldpark",
      category: "ruhig",
      distance: "direkt am Klinikgelände",
      travel: "kurze Runde zu Fuß",
      energy: ["ruhig", "leicht"],
      time: ["kurz"],
      setting: ["draussen"],
      summary: "Eine ruhige, unkomplizierte Möglichkeit für frische Luft ohne längeren Hinweg.",
      note: "Ausgang und ärztliche oder therapeutische Freigabe richten sich nach den aktuellen Klinikregeln.",
      location: "Waldpark der Fachklinik St. Marienstift",
      sourceLabel: "Klinik von A bis Z",
      sourceUrl: "https://www.sucht-fachkliniken.de/marienstift/fachklinik/klinik-von-a-z/"
    },
    {
      id: "kruse-hollotal",
      title: "Restaurant Kruse zum Hollotal",
      category: "ruhig",
      distance: "ca. 1,2 km",
      travel: "etwa 15 Min. zu Fuß",
      energy: ["leicht"],
      time: ["stunde", "halbtag"],
      setting: ["drinnen", "draussen"],
      summary: "Nahes Restaurant mit Biergarten; praktisch für einen überschaubaren Ausflug mit klarer Wegstrecke.",
      note: "Öffnung und Reservierung vorab prüfen.",
      location: "Am Hollo 20, Neuenkirchen-Vörden",
      routeUrl: osmDirections("foot", [52.5204552, 8.0904155]),
      sourceLabel: "Gastronomie der Gemeinde",
      sourceUrl: "https://www.neuenkirchen-voerden.de/portal/seiten/gastronomie-900000184-24210.html"
    },
    {
      id: "aldi-baecker",
      title: "ALDI Nord und Bäckerei",
      category: "alltag",
      distance: "ca. 1,3 km",
      travel: "etwa 18 Min. zu Fuß",
      energy: ["leicht"],
      time: ["kurz", "stunde"],
      setting: ["drinnen", "draussen"],
      summary: "Die nächstgelegene gebündelte Möglichkeit für Lebensmittel und Backwaren.",
      note: "Öffnungszeiten und benötigte Erlaubnis vorab prüfen.",
      location: "Holdorfer Straße 11, Neuenkirchen-Vörden",
      routeUrl: osmDirections("foot", [52.5143685, 8.068548]),
      sourceLabel: "Route auf OpenStreetMap",
      sourceUrl: osmDirections("foot", [52.5143685, 8.068548])
    },
    {
      id: "apotheke",
      title: "Zumloh’sche Apotheke",
      category: "alltag",
      distance: "ca. 1,9 km",
      travel: "etwa 25 Min. zu Fuß",
      energy: ["leicht"],
      time: ["stunde"],
      setting: ["drinnen", "draussen"],
      summary: "Apotheke im Ortskern; hilfreich, wenn etwas nicht über die Klinikversorgung läuft.",
      note: "Medikamente und Änderungen immer zuerst mit dem Behandlungsteam abstimmen.",
      location: "Bahnhofstraße 1, Neuenkirchen-Vörden",
      routeUrl: osmDirections("foot", [52.5104987, 8.0650055]),
      sourceLabel: "Offizielle Apothekenseite",
      sourceUrl: "https://www.zumlohsche-apotheke.de/"
    },
    {
      id: "kk-markt",
      title: "K+K Markt",
      category: "alltag",
      distance: "ca. 2,0 km",
      travel: "etwa 26 Min. zu Fuß",
      energy: ["leicht"],
      time: ["stunde"],
      setting: ["drinnen", "draussen"],
      summary: "Alternative für Lebensmittel im Ortskern.",
      note: "Öffnungszeiten aktuell prüfen.",
      location: "Bergstraße 2a, Neuenkirchen-Vörden",
      routeUrl: osmDirections("foot", [52.5091552, 8.0691357]),
      sourceLabel: "Route auf OpenStreetMap",
      sourceUrl: osmDirections("foot", [52.5091552, 8.0691357])
    },
    {
      id: "lidl",
      title: "Lidl",
      category: "alltag",
      distance: "ca. 2,1 km",
      travel: "etwa 27 Min. zu Fuß",
      energy: ["leicht"],
      time: ["stunde"],
      setting: ["drinnen", "draussen"],
      summary: "Weitere Einkaufsmöglichkeit nahe dem Bahnhof.",
      note: "Öffnungszeiten aktuell prüfen.",
      location: "Hakenstraße 2, Neuenkirchen-Vörden",
      routeUrl: osmDirections("foot", [52.5080817, 8.0680082]),
      sourceLabel: "Route auf OpenStreetMap",
      sourceUrl: osmDirections("foot", [52.5080817, 8.0680082])
    },
    {
      id: "moobil-klinik",
      title: "moobil+ direkt an der Klinik",
      category: "mobilitaet",
      distance: "Bedarfshaltestelle am Klinikstandort",
      travel: "Linie 635 – Fahrt vorher buchen",
      energy: ["ruhig", "leicht"],
      time: ["stunde", "halbtag"],
      setting: ["drinnen", "draussen"],
      summary: "Die Bedarfshaltestelle „Fachklinik St. Marienstift“ bindet die Klinik unter anderem an Neuenkirchen, Steinfeld und Damme an.",
      note: "Der veröffentlichte Detailfahrplan ist älter. Verbindung und Buchung deshalb immer aktuell über moobil+ prüfen.",
      location: "Fachklinik St. Marienstift",
      sourceLabel: "moobil+ Verbindung prüfen",
      sourceUrl: "https://www.moobilplus.de/"
    },
    {
      id: "bahnhof-neuenkirchen",
      title: "Bahnhof Neuenkirchen (Oldb)",
      category: "mobilitaet",
      distance: "ca. 2,3 km",
      travel: "etwa 31 Min. zu Fuß",
      energy: ["leicht"],
      time: ["stunde", "halbtag"],
      setting: ["draussen"],
      summary: "Von hier fährt die RB 58 direkt Richtung Osnabrück und Richtung Bremen.",
      note: "Aktuelle Abfahrt und Baustellenmeldung vor jedem Weg prüfen.",
      location: "Bahnhof Neuenkirchen (Oldb)",
      routeUrl: osmDirections("foot", [52.5083548, 8.0595371]),
      sourceLabel: "Aktuelle RB-58-Seite",
      sourceUrl: "https://www.nordwestbahn.de/de/weser-ems/unsere-region/streckennetz/linie/rb-58"
    },
    {
      id: "osnabrueck",
      title: "Osnabrück",
      category: "mobilitaet",
      distance: "ca. 32 km auf der Straße",
      travel: "RB 58 ab Neuenkirchen direkt bis Osnabrück Hbf",
      energy: ["leicht", "aktiv"],
      time: ["halbtag"],
      setting: ["drinnen", "draussen"],
      summary: "Für einen Stadtbesuch ist die direkte Regionalbahn meist übersichtlicher als mehrere Busumstiege.",
      note: "Zeit, Rückfahrt und Ausgangsregel vorher festlegen; die App speichert bewusst keinen schnell veraltenden Abfahrtsplan.",
      location: "Osnabrück",
      sourceLabel: "Aktuelle RB-58-Seite",
      sourceUrl: "https://www.nordwestbahn.de/de/weser-ems/unsere-region/streckennetz/linie/rb-58"
    },
    {
      id: "cafe-wahlde",
      title: "Café Wahlde",
      category: "ruhig",
      distance: "ca. 3,5 km zu Fuß",
      travel: "für einen längeren Spaziergang oder eine kurze Radfahrt",
      energy: ["leicht", "aktiv"],
      time: ["halbtag"],
      setting: ["drinnen", "draussen"],
      summary: "Café, Restaurant und Biergarten als ruhiges Ziel außerhalb des Ortskerns.",
      note: "Öffnungszeiten vorher prüfen.",
      location: "Wahlde 4, Neuenkirchen-Vörden",
      sourceLabel: "Gastronomie der Gemeinde",
      sourceUrl: "https://www.neuenkirchen-voerden.de/portal/seiten/gastronomie-900000184-24210.html"
    },
    {
      id: "naturbad-voerden",
      title: "Naturbad Vörden",
      category: "aktiv",
      distance: "ca. 6,5 km mit dem Fahrrad",
      travel: "saisonal geöffnet",
      energy: ["aktiv"],
      time: ["halbtag"],
      setting: ["draussen"],
      summary: "Naturbad mit großer Wasserfläche und Liegewiese für einen geplanten freien Nachmittag.",
      note: "Saison, Wetter, Öffnung und persönliche Freigabe aktuell prüfen.",
      location: "Schulstraße 7, Vörden",
      routeUrl: osmDirections("bike", [52.477405, 8.0890431]),
      sourceLabel: "Offizielle Naturbadseite",
      sourceUrl: "https://naturbad-voerden.de/naturbad/"
    },
    {
      id: "ackerbuergerhaus",
      title: "Ackerbürgerhaus Vörden",
      category: "kultur",
      distance: "ca. 6,6 km mit dem Fahrrad",
      travel: "historischer Ortskern Vörden",
      energy: ["leicht", "aktiv"],
      time: ["halbtag"],
      setting: ["drinnen", "draussen"],
      summary: "Heimatmuseum und Ausgangspunkt für einen ruhigen Blick in die Ortsgeschichte.",
      note: "Besichtigungszeiten oder Führung vorher prüfen.",
      location: "Ackerbürgerhaus, Vörden",
      routeUrl: osmDirections("bike", [52.4779674, 8.0935689]),
      sourceLabel: "Heimatverein Vörden",
      sourceUrl: "https://www.heimatverein-voerden.de/"
    },
    {
      id: "alfsee",
      title: "Alfsee",
      category: "aktiv",
      distance: "ca. 9,3 km mit dem Fahrrad",
      travel: "Natur- und Freizeitziel Richtung Rieste",
      energy: ["aktiv"],
      time: ["halbtag"],
      setting: ["draussen"],
      summary: "Ein größeres Ziel für einen freien halben Tag, wenn Kondition, Wetter und Klinikplan passen.",
      note: "Hin- und Rückweg gemeinsam planen; Streckenangabe ist ein Näherungswert.",
      location: "Alfsee, Rieste",
      routeUrl: osmDirections("bike", [52.4878298, 7.9897307]),
      sourceLabel: "Route auf OpenStreetMap",
      sourceUrl: osmDirections("bike", [52.4878298, 7.9897307])
    },
    {
      id: "dammer-bergsee",
      title: "Dammer Bergsee",
      category: "aktiv",
      distance: "ca. 11,8 km mit dem Fahrrad",
      travel: "längere Tour in die Dammer Berge",
      energy: ["aktiv"],
      time: ["halbtag"],
      setting: ["draussen"],
      summary: "Naturziel für einen bewusst geplanten, aktiveren Ausflug.",
      note: "Route, Wetter, Rückweg und persönliche Belastbarkeit vorher prüfen.",
      location: "Dammer Bergsee",
      routeUrl: osmDirections("bike", [52.5419835, 8.1912576]),
      sourceLabel: "Radregion Dammer Berge",
      sourceUrl: "https://www.dammer-berge.de/erlebnisse/touren/Radwandern.php"
    }
  ]
});

export function filterLocalGuide(items, filters = {}) {
  const category = filters.category || "alle";
  const energy = filters.energy || "alle";
  const time = filters.time || "alle";
  const setting = filters.setting || "alle";
  return items.filter(item => (
    (category === "alle" || item.category === category)
    && (energy === "alle" || item.energy.includes(energy))
    && (time === "alle" || item.time.includes(time))
    && (setting === "alle" || item.setting.includes(setting))
  ));
}
