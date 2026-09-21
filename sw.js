/* Le 8 de SAM — cache hors connexion.
   Change VERSION à chaque mise à jour pour forcer le rechargement. */
const VERSION = 'sam8-v4';
const FICHIERS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./data/decors.js",
  "./data/personnages.js",
  "./js/affichage.js",
  "./js/config.js",
  "./js/ecrans.js",
  "./js/ia.js",
  "./js/main.js",
  "./js/moteur.js",
  "./js/outils.js",
  "./js/profils.js",
  "./js/reseau.js",
  "./js/son.js",
  "./images/hamza.webp",
  "./images/icone-192.png",
  "./images/icone-512.png",
  "./images/mehmet.webp",
  "./images/nacime.webp",
  "./images/quartier.webp",
  "./images/sam.webp",
  "./images/studio.webp",
  "./images/sushi.webp",
  "./images/yuns.webp"
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;            /* réseau du multijoueur : on ne touche pas */
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(rep => {
      const copie = rep.clone();
      caches.open(VERSION).then(c => c.put(e.request, copie)).catch(() => {});
      return rep;
    }).catch(() => caches.match('./index.html')))
  );
});
