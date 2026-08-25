export const CLINIC_COORDS = Object.freeze([52.6709126, 7.4831627]);

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
  return items.filter(item => Array.isArray(item.coordinates)).map(item => ({ ...item, currentDistanceKm: distanceKm(origin, item.coordinates), bearing: bearingDegrees(origin, item.coordinates) })).sort((a, b) => a.currentDistanceKm - b.currentDistanceKm).slice(0, limit);
}

export const GUIDE_CATEGORY_LABELS = Object.freeze({ alltag: "Einkaufen & Alltag", mobilitaet: "Wege & Orientierung", ruhig: "Ruhige Auszeit", aktiv: "Bewegung & Natur", kultur: "Kultur & Innenstadt" });

function guideItem(value) {
  const mode = value.mode || "foot";
  return Object.freeze({ ...value, routeUrl: value.routeUrl || osmDirections(mode, value.coordinates), googleMapsUrl: googleMapsDirections(value.coordinates, mode === "bike" ? "bicycling" : "walking"), imageUrl: mapThumbnail(value.coordinates, value.mapZoom || 14), imageAlt: `Kartenvorschau rund um ${value.title}` });
}

export const LOCAL_GUIDE = Object.freeze({
  verifiedAt: "25.08.2026",
  origin: "St. Vinzenz Hospital, Hammer Straße 9, Haselünne",
  notice: "Entfernungen sind gerundete Orientierungswerte ab dem Krankenhaus. Kartenvorschauen stammen von OpenStreetMap. Ausgang, Therapiezeiten und Rückkehr bis 21 Uhr richten sich immer nach der aktuellen Stationsabsprache.",
  resources: [
    { title: "Tourismus & Freizeit", text: "Offizieller Überblick der Stadt Haselünne", url: "https://www.haseluenne.de/tourismus-freizeit/" },
    { title: "Wacholderhain", text: "Aktuelle Beschreibung des Hasetals", url: "https://www.hasetal.de/wacholderhain-hasel%C3%BCnne/177351" },
    { title: "Freilicht- und Heimatmuseum", text: "Zielbeschreibung und weiterführende Informationen", url: "https://www.hasetal.de/freilicht--und-heimatmuseum/117631" },
    { title: "Patienten & Besucher", text: "Aktuelle Krankenhausinformationen", url: "https://www.xn--vinzenz-hospital-haselnne-0wc.de/patienten-und-besucher" }
  ],
  items: [
    guideItem({ id: "vinzenz-aussen", title: "Kurze Runde am Krankenhaus", category: "ruhig", coordinates: CLINIC_COORDS, distance: "direkt am Krankenhaus", travel: "wenige Minuten", energy: ["ruhig", "leicht"], time: ["kurz"], setting: ["draussen"], summary: "Für einen sehr kurzen Luftwechsel ohne längeren Hinweg.", note: "Nur im aktuell freigegebenen Bereich und nach Stationsabsprache.", location: "St. Vinzenz Hospital, Hammer Straße 9, Haselünne", sourceLabel: "Krankenhausinformationen", websiteUrl: "https://www.xn--vinzenz-hospital-haselnne-0wc.de/patienten-und-besucher", sourceUrl: "https://www.xn--vinzenz-hospital-haselnne-0wc.de/patienten-und-besucher", mapZoom: 16 }),
    guideItem({ id: "rathaus-innenstadt", title: "Historische Innenstadt", category: "kultur", coordinates: [52.6729488, 7.4883055], distance: "ca. 450 m", travel: "etwa 6 Min. zu Fuß", energy: ["leicht"], time: ["kurz", "stunde"], setting: ["draussen"], summary: "Rathausplatz und Altstadt als überschaubare Runde in direkter Nähe.", note: "Rückweg und Therapiezeiten im Blick behalten.", location: "Rathausplatz 1, Haselünne", sourceLabel: "Stadt Haselünne", websiteUrl: "https://www.haseluenne.de/tourismus-freizeit/", sourceUrl: "https://www.haseluenne.de/tourismus-freizeit/", mapZoom: 16 }),
    guideItem({ id: "heimatmuseum", title: "Freilicht- und Heimatmuseum", category: "kultur", coordinates: [52.6681639, 7.4833715], distance: "ca. 500 m", travel: "etwa 7 Min. zu Fuß", energy: ["leicht"], time: ["stunde"], setting: ["drinnen", "draussen"], summary: "Ruhiges Kulturziel an der Lingener Straße mit regionaler Geschichte.", note: "Öffnungs- oder Führungstermine vorher aktuell prüfen.", location: "Lingener Straße 30, Haselünne", sourceLabel: "Erholungsgebiet Hasetal", websiteUrl: "https://www.hasetal.de/freilicht--und-heimatmuseum/117631", sourceUrl: "https://www.hasetal.de/freilicht--und-heimatmuseum/117631", mapZoom: 16 }),
    guideItem({ id: "rossmann", title: "ROSSMANN", category: "alltag", coordinates: [52.6742175, 7.4865504], distance: "ca. 550 m", travel: "etwa 7 Min. zu Fuß", energy: ["leicht"], time: ["kurz", "stunde"], setting: ["drinnen", "draussen"], summary: "Nahe Möglichkeit für Hygiene- und Alltagsartikel.", note: "Öffnungszeiten vor dem Weg aktuell prüfen.", location: "Am Wasserturm 4, Haselünne", sourceLabel: "Offizielle Filialsuche", websiteUrl: "https://www.rossmann.de/de/filialen", sourceUrl: "https://www.rossmann.de/de/filialen", mapZoom: 16 }),
    guideItem({ id: "kk-haseluenne", title: "K+K Markt", category: "alltag", coordinates: [52.6730567, 7.4920662], distance: "ca. 750 m", travel: "etwa 10 Min. zu Fuß", energy: ["leicht"], time: ["kurz", "stunde"], setting: ["drinnen", "draussen"], summary: "Lebensmittelmarkt östlich der Innenstadt.", note: "Einkäufe und Ausgang nur passend zum Therapieplan.", location: "Plessestraße 6, Haselünne", sourceLabel: "K+K Markt", websiteUrl: "https://www.klaas-und-kock.de/", sourceUrl: "https://www.klaas-und-kock.de/", mapZoom: 16 }),
    guideItem({ id: "haseluenner-see", title: "Haselünner See", category: "aktiv", coordinates: [52.6680953, 7.5001506], mode: "bike", distance: "ca. 1,3 km", travel: "Spaziergang oder kurze Radfahrt", energy: ["leicht", "aktiv"], time: ["stunde", "halbtag"], setting: ["draussen"], summary: "Wasser, Wege und freie Sicht für eine bewusst geplante Auszeit.", note: "Wetter, Belastbarkeit, Freigabe und Rückkehrzeit vorher prüfen.", location: "Erholungsgebiet Haselünner See", sourceLabel: "Stadt Haselünne", websiteUrl: "https://www.haseluenne.de/tourismus-freizeit/", sourceUrl: "https://www.haseluenne.de/tourismus-freizeit/", mapZoom: 15 }),
    guideItem({ id: "wacholderhain", title: "Haselünner Wacholderhain", category: "ruhig", coordinates: [52.6595849, 7.4978111], mode: "bike", distance: "ca. 1,6 km", travel: "längerer Spaziergang oder kurze Radfahrt", energy: ["ruhig", "leicht", "aktiv"], time: ["stunde", "halbtag"], setting: ["draussen"], summary: "Naturschutzgebiet und ruhige Landschaft südlich der Stadt.", note: "Auf markierten Wegen bleiben und die persönliche Belastbarkeit beachten.", location: "Haselünner Wacholderhain", sourceLabel: "Erholungsgebiet Hasetal", websiteUrl: "https://www.hasetal.de/wacholderhain-hasel%C3%BCnne/177351", sourceUrl: "https://www.hasetal.de/wacholderhain-hasel%C3%BCnne/177351", mapZoom: 15 }),
    guideItem({ id: "lidl-haseluenne", title: "Lidl", category: "alltag", coordinates: [52.6776554, 7.4940971], distance: "ca. 1,2 km", travel: "etwa 16 Min. zu Fuß", energy: ["leicht"], time: ["stunde"], setting: ["drinnen", "draussen"], summary: "Weitere gebündelte Einkaufsmöglichkeit nördlich der Innenstadt.", note: "Öffnungszeiten und Rückweg aktuell prüfen.", location: "Lähdener Straße 10, Haselünne", sourceLabel: "Offizielle Filialsuche", websiteUrl: "https://www.lidl.de/c/filialsuche/s10007715", sourceUrl: "https://www.lidl.de/c/filialsuche/s10007715" })
  ]
});

export function filterLocalGuide(items, filters = {}) {
  const category = filters.category || "alle";
  const energy = filters.energy || "alle";
  const time = filters.time || "alle";
  const setting = filters.setting || "alle";
  return items.filter(item => (category === "alle" || item.category === category) && (energy === "alle" || item.energy.includes(energy)) && (time === "alle" || item.time.includes(time)) && (setting === "alle" || item.setting.includes(setting)));
}
