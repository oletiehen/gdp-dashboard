export const CLINIC_COORDS = Object.freeze([52.519115, 8.083688]);

function osmDirections(mode, destination) {
  const engine = mode === "bike" ? "fossgis_osrm_bike" : "fossgis_osrm_foot";
  const route = `${CLINIC_COORDS.join(",")};${destination.join(",")}`;
  return `https://www.openstreetmap.org/directions?engine=${engine}&route=${encodeURIComponent(route)}`;
}

export function googleMapsDirections(destination, mode = "walking") {
  const params = new URLSearchParams({ api: "1", origin: CLINIC_COORDS.join(","), destination: destination.join(","), travelmode: mode });
  return `https://www.google.com/maps/dir/?${params}`;
}

function mapThumbnail(destination, zoom = 14) {
  const [lat, lon] = destination;
  const params = new URLSearchParams({ center: `${lat},${lon}`, zoom: String(zoom), size: "640x320", maptype: "mapnik", markers: `${lat},${lon},red-pushpin` });
  return `https://staticmap.openstreetmap.de/staticmap.php?${params}`;
}

export function distanceKm(from, to) {
  const radians = value => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const deltaLat = radians(to[0] - from[0]);
  const deltaLon = radians(to[1] - from[1]);
  const lat1 = radians(from[0]);
  const lat2 = radians(to[0]);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDegrees(from, to) {
  const radians = value => value * Math.PI / 180;
  const degrees = value => value * 180 / Math.PI;
  const lat1 = radians(from[0]);
  const lat2 = radians(to[0]);
  const deltaLon = radians(to[1] - from[1]);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

export function nearestLocalGuide(items, origin = CLINIC_COORDS, limit = 6) {
  return items
    .filter(item => Array.isArray(item.coordinates))
    .map(item => ({ ...item, currentDistanceKm: distanceKm(origin, item.coordinates), bearing: bearingDegrees(origin, item.coordinates) }))
    .sort((a, b) => a.currentDistanceKm - b.currentDistanceKm)
    .slice(0, limit);
}

export const GUIDE_CATEGORY_LABELS = Object.freeze({
  alltag: "Einkaufen & Alltag",
  mobilitaet: "Bus, Bahn & Stadt",
  ruhig: "Ruhige Auszeit",
  aktiv: "Bewegung & Natur",
  kultur: "Kultur & Begegnung"
});

function guideItem(value) {
  const mode = value.mode || "foot";
  const googleMode = mode === "bike" ? "bicycling" : mode === "transit" ? "transit" : "walking";
  return Object.freeze({
    ...value,
    routeUrl: value.routeUrl || osmDirections(mode, value.coordinates),
    googleMapsUrl: googleMapsDirections(value.coordinates, googleMode),
    imageUrl: mapThumbnail(value.coordinates, value.mapZoom || 14),
    imageAlt: `Kartenausschnitt rund um ${value.title}`
  });
}

export const LOCAL_GUIDE = Object.freeze({
  verifiedAt: "16.08.2026",
  origin: "Fachklinik St. Marienstift, Dammer Straße 4a, Neuenkirchen-Vörden",
  notice: "Entfernungen und Wege sind gerundete Orientierungswerte ab der Klinik. Kartenvorschauen stammen von OpenStreetMap; Öffnungszeiten, Verbindungen, Klinikregeln und persönliche Belastbarkeit bitte unmittelbar vor dem Losgehen aktuell prüfen.",
  resources: [
    { title: "Was ist aktuell los?", text: "Veranstaltungen der Gemeinde mit Datum und Ort", url: "https://www.neuenkirchen-voerden.de/portal/seiten/veranstaltungen-in-neuenkirchen-voerden-900000016-24210.html" },
    { title: "Aktuelle RB 58", text: "Abfahrten, Baustellen und Sonderfahrpläne", url: "https://www.nordwestbahn.de/de/weser-ems/unsere-region/streckennetz/linie/rb-58" },
    { title: "Radtour passend auswählen", text: "Knotenpunktnetz und regionale Touren", url: "https://www.dammer-berge.de/erlebnisse/touren/Radwandern.php" },
    { title: "Essen und Café finden", text: "Aktuelle Gastronomieübersicht der Gemeinde", url: "https://www.neuenkirchen-voerden.de/portal/seiten/gastronomie-900000184-24210.html" },
    { title: "Alle Freizeitangebote", text: "Ausflugsziele, Naturbad, Sport und Kultur", url: "https://www.neuenkirchen-voerden.de/freizeit/" }
  ],
  items: [
    guideItem({
      id: "klinik-waldpark", title: "Klinik-Waldpark", category: "ruhig", coordinates: CLINIC_COORDS,
      distance: "direkt am Klinikgelände", travel: "kurze Runde zu Fuß", energy: ["ruhig", "leicht"], time: ["kurz"], setting: ["draussen"],
      summary: "Eine ruhige Möglichkeit für frische Luft ohne längeren Hinweg.", note: "Ausgang und Freigabe richten sich nach den aktuellen Klinikregeln.",
      location: "Waldpark der Fachklinik St. Marienstift", sourceLabel: "Klinik von A bis Z", websiteUrl: "https://www.sucht-fachkliniken.de/marienstift/fachklinik/klinik-von-a-z/", sourceUrl: "https://www.sucht-fachkliniken.de/marienstift/fachklinik/klinik-von-a-z/", mapZoom: 16
    }),
    guideItem({
      id: "kruse-hollotal", title: "Restaurant Kruse zum Hollotal", category: "ruhig", coordinates: [52.5204552, 8.0904155],
      distance: "ca. 1,2 km", travel: "etwa 15 Min. zu Fuß", energy: ["leicht"], time: ["stunde", "halbtag"], setting: ["drinnen", "draussen"],
      summary: "Nahes Restaurant mit Biergarten für einen überschaubaren Ausflug.", note: "Öffnung und Reservierung vorab prüfen.",
      location: "Am Hollo 20, Neuenkirchen-Vörden", sourceLabel: "Gastronomie der Gemeinde", websiteUrl: "https://www.neuenkirchen-voerden.de/portal/seiten/gastronomie-900000184-24210.html", sourceUrl: "https://www.neuenkirchen-voerden.de/portal/seiten/gastronomie-900000184-24210.html"
    }),
    guideItem({
      id: "aldi-baecker", title: "ALDI Nord mit Backstation", category: "alltag", coordinates: [52.5143685, 8.068548],
      distance: "ca. 1,3 km", travel: "etwa 18 Min. zu Fuß", energy: ["leicht"], time: ["kurz", "stunde"], setting: ["drinnen", "draussen"],
      summary: "Die nächstgelegene gebündelte Möglichkeit für Lebensmittel, Hygieneartikel und Backwaren.", note: "Öffnungszeiten und Ausgangsregel aktuell prüfen.",
      location: "Holdorfer Straße 11, Neuenkirchen-Vörden", sourceLabel: "Offizielle Filialseite", websiteUrl: "https://www.aldi-nord.de/filialen-und-oeffnungszeiten/neuenkirchen-voerden/holdorfer-strasse-11/3182459.html", sourceUrl: "https://www.aldi-nord.de/filialen-und-oeffnungszeiten/neuenkirchen-voerden/holdorfer-strasse-11/3182459.html"
    }),
    guideItem({
      id: "apotheke", title: "Zumlohsche Apotheke", category: "alltag", coordinates: [52.5104987, 8.0650055],
      distance: "ca. 1,9 km", travel: "etwa 25 Min. zu Fuß", energy: ["leicht"], time: ["stunde"], setting: ["drinnen", "draussen"],
      summary: "Apotheke im Ortskern, falls etwas nicht über die Klinikversorgung läuft.", note: "Medikamente und Änderungen immer zuerst mit dem Behandlungsteam abstimmen.",
      location: "Bahnhofstraße 1, Neuenkirchen-Vörden", sourceLabel: "Offizielle Apothekenseite", websiteUrl: "https://www.zumlohsche-apotheke.de/kontakt", sourceUrl: "https://www.zumlohsche-apotheke.de/kontakt"
    }),
    guideItem({
      id: "kk-markt", title: "K+K Markt", category: "alltag", coordinates: [52.5091552, 8.0691357],
      distance: "ca. 2,0 km", travel: "etwa 26 Min. zu Fuß", energy: ["leicht"], time: ["stunde"], setting: ["drinnen", "draussen"],
      summary: "Alternative für Lebensmittel im Ortskern.", note: "Öffnungszeiten aktuell prüfen.",
      location: "Bergstraße 2a, Neuenkirchen-Vörden", sourceLabel: "Gemeindliches Branchenbuch", websiteUrl: "https://www.neuenkirchen-voerden.de/regional/branchenbuch/gesamt/uebersicht.html", sourceUrl: "https://www.neuenkirchen-voerden.de/regional/branchenbuch/gesamt/uebersicht.html"
    }),
    guideItem({
      id: "lidl", title: "Lidl", category: "alltag", coordinates: [52.5080817, 8.0680082],
      distance: "ca. 2,1 km", travel: "etwa 27 Min. zu Fuß", energy: ["leicht"], time: ["stunde"], setting: ["drinnen", "draussen"],
      summary: "Weitere Einkaufsmöglichkeit nahe dem Bahnhof.", note: "Öffnungszeiten aktuell prüfen.",
      location: "Hakenstraße 2, Neuenkirchen-Vörden", sourceLabel: "Offizielle Filialseite", websiteUrl: "https://www.lidl.de/f/neuenkirchen/voerden-hakenstr-2.html", sourceUrl: "https://www.lidl.de/f/neuenkirchen/voerden-hakenstr-2.html"
    }),
    guideItem({
      id: "moobil-klinik", title: "moobil+ direkt an der Klinik", category: "mobilitaet", coordinates: CLINIC_COORDS,
      distance: "Bedarfshaltestelle am Klinikstandort", travel: "Linie 635 – Fahrt vorher buchen", energy: ["ruhig", "leicht"], time: ["stunde", "halbtag"], setting: ["drinnen", "draussen"],
      summary: "Die Bedarfshaltestelle verbindet die Klinik unter anderem mit Neuenkirchen, Steinfeld und Damme.", note: "Verbindung und Buchung immer aktuell über moobil+ prüfen.",
      location: "Fachklinik St. Marienstift", sourceLabel: "moobil+", websiteUrl: "https://www.moobilplus.de/", sourceUrl: "https://www.moobilplus.de/", mapZoom: 16
    }),
    guideItem({
      id: "bahnhof-neuenkirchen", title: "Bahnhof Neuenkirchen (Oldb)", category: "mobilitaet", coordinates: [52.5083548, 8.0595371],
      distance: "ca. 2,3 km", travel: "etwa 31 Min. zu Fuß", energy: ["leicht"], time: ["stunde", "halbtag"], setting: ["draussen"],
      summary: "Von hier fährt die RB 58 direkt Richtung Osnabrück und Bremen.", note: "Aktuelle Abfahrt und Baustellenmeldung vor jedem Weg prüfen.",
      location: "Bahnhof Neuenkirchen (Oldb)", sourceLabel: "Aktuelle RB 58", websiteUrl: "https://www.nordwestbahn.de/de/weser-ems/unsere-region/streckennetz/linie/rb-58", sourceUrl: "https://www.nordwestbahn.de/de/weser-ems/unsere-region/streckennetz/linie/rb-58"
    }),
    guideItem({
      id: "osnabrueck", title: "Osnabrück", category: "mobilitaet", coordinates: [52.27291, 8.06179], mode: "transit", mapZoom: 12,
      distance: "ca. 32 km auf der Straße", travel: "RB 58 ab Neuenkirchen direkt bis Osnabrück Hbf", energy: ["leicht", "aktiv"], time: ["halbtag"], setting: ["drinnen", "draussen"],
      summary: "Für einen Stadtbesuch ist die direkte Regionalbahn meist übersichtlicher als mehrere Busumstiege.", note: "Zeit, Rückfahrt und Ausgangsregel vorher festlegen.",
      location: "Osnabrück Hauptbahnhof", sourceLabel: "Aktuelle RB 58", websiteUrl: "https://www.nordwestbahn.de/de/weser-ems/unsere-region/streckennetz/linie/rb-58", sourceUrl: "https://www.nordwestbahn.de/de/weser-ems/unsere-region/streckennetz/linie/rb-58"
    }),
    guideItem({
      id: "cafe-wahlde", title: "Café Wahlde", category: "ruhig", coordinates: [52.5089929, 8.104259],
      distance: "ca. 3,5 km", travel: "längerer Spaziergang oder kurze Radfahrt", energy: ["leicht", "aktiv"], time: ["halbtag"], setting: ["drinnen", "draussen"],
      summary: "Café, Restaurant und Biergarten als ruhiges Ziel außerhalb des Ortskerns.", note: "Öffnungszeiten vorher prüfen.",
      location: "Wahlde 4, Neuenkirchen-Vörden", sourceLabel: "Gastronomie der Gemeinde", websiteUrl: "https://www.neuenkirchen-voerden.de/portal/seiten/gastronomie-900000184-24210.html", sourceUrl: "https://www.neuenkirchen-voerden.de/portal/seiten/gastronomie-900000184-24210.html"
    }),
    guideItem({
      id: "naturbad-voerden", title: "Naturbad Vörden", category: "aktiv", coordinates: [52.477405, 8.0890431], mode: "bike",
      distance: "ca. 6,5 km mit dem Fahrrad", travel: "saisonal geöffnet", energy: ["aktiv"], time: ["halbtag"], setting: ["draussen"],
      summary: "Naturbad mit Wasserfläche und Liegewiese für einen geplanten freien Nachmittag.", note: "Saison, Wetter, Öffnung und persönliche Freigabe aktuell prüfen.",
      location: "Schulstraße 7, Vörden", sourceLabel: "Offizielle Naturbadseite", websiteUrl: "https://naturbad-voerden.de/naturbad/", sourceUrl: "https://naturbad-voerden.de/naturbad/"
    }),
    guideItem({
      id: "ackerbuergerhaus", title: "Ackerbürgerhaus Vörden", category: "kultur", coordinates: [52.4779674, 8.0935689], mode: "bike",
      distance: "ca. 6,6 km mit dem Fahrrad", travel: "historischer Ortskern Vörden", energy: ["leicht", "aktiv"], time: ["halbtag"], setting: ["drinnen", "draussen"],
      summary: "Heimatmuseum und ruhiger Einstieg in die Ortsgeschichte.", note: "Besichtigungszeiten oder Führung vorher prüfen.",
      location: "Ackerbürgerhaus, Vörden", sourceLabel: "Heimatverein Vörden", websiteUrl: "https://www.heimatverein-voerden.de/", sourceUrl: "https://www.heimatverein-voerden.de/"
    }),
    guideItem({
      id: "alfsee", title: "Alfsee", category: "aktiv", coordinates: [52.4878298, 7.9897307], mode: "bike", mapZoom: 13,
      distance: "ca. 9,3 km mit dem Fahrrad", travel: "Natur- und Freizeitziel Richtung Rieste", energy: ["aktiv"], time: ["halbtag"], setting: ["draussen"],
      summary: "Ein größeres Ziel für einen freien halben Tag, wenn Kondition, Wetter und Klinikplan passen.", note: "Hin- und Rückweg gemeinsam planen; Streckenangabe ist ein Näherungswert.",
      location: "Alfsee, Rieste", sourceLabel: "Tourismusinformation", websiteUrl: "https://www.dammer-berge.de/alfsee-%E2%80%93-ferien--und-erholungspark/19925", sourceUrl: "https://www.dammer-berge.de/alfsee-%E2%80%93-ferien--und-erholungspark/19925"
    }),
    guideItem({
      id: "dammer-bergsee", title: "Dammer Bergsee", category: "aktiv", coordinates: [52.5419835, 8.1912576], mode: "bike", mapZoom: 13,
      distance: "ca. 11,8 km mit dem Fahrrad", travel: "längere Tour in die Dammer Berge", energy: ["aktiv"], time: ["halbtag"], setting: ["draussen"],
      summary: "Naturpfad an einem geschützten Naturziel für einen bewusst geplanten, aktiveren Ausflug.", note: "Route, Wetter, Rückweg und persönliche Belastbarkeit vorher prüfen.",
      location: "Naturpfad Dammer Bergsee", sourceLabel: "Tourismusinformation", websiteUrl: "https://www.dammer-berge.de/ausflugsziele/naturpfad-dammer-bergsee/7234", sourceUrl: "https://www.dammer-berge.de/ausflugsziele/naturpfad-dammer-bergsee/7234"
    })
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
