export const METIME_LIBRARY = Object.freeze([
  Object.freeze({
    id: "aok-pmr",
    category: "Körper entspannen",
    title: "Progressive Muskelentspannung",
    description: "Eine angeleitete PMR-Einheit vom AOK-Gesundheitskanal. Gut für einen ruhigen Übergang nach Anwendungen oder vor der Nachtruhe.",
    source: "AOK – Der Gesundheitskanal",
    videoId: "vsJ01LxdAi4",
    url: "https://www.youtube.com/watch?v=vsJ01LxdAi4"
  }),
  Object.freeze({
    id: "aok-sleep",
    category: "Abends zur Ruhe kommen",
    title: "Geführte Meditation für erholsamen Schlaf",
    description: "Eine längere, ruhige Schlafmeditation. Autoplay bleibt aus, damit nach dem Video nichts ungefragt weiterläuft.",
    source: "AOK – Der Gesundheitskanal",
    videoId: "7g_qY9XB68k",
    url: "https://www.youtube.com/watch?v=7g_qY9XB68k"
  })
]);

export function youtubeNoCookieUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1&autoplay=1`;
}
