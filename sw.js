/* Le 8 de SAM — mémoire hors connexion.
   Règle : on va TOUJOURS chercher la version en ligne d'abord. La mémoire ne sert
   que si le réseau ne répond pas. Les mises à jour arrivent donc toutes seules.
   Change VERSION à chaque livraison. */
const VERSION = 'sam8-2.3';
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
  "./images/decors/quartier.webp",
  "./images/decors/studio.webp",
  "./images/decors/sushi.webp",
  "./images/fonds/fond-accueil.webp",
  "./images/fonds/fond-en-ligne.webp",
  "./images/fonds/fond-solo.webp",
  "./images/interface/dos-carte.webp",
  "./images/interface/icone-192.png",
  "./images/interface/icone-512.png",
  "./images/personnages/hamza.webp",
  "./images/personnages/mehmet.webp",
  "./images/personnages/nacime.webp",
  "./images/personnages/sam.webp",
  "./images/personnages/yuns.webp"
];
const ATTENTE_MS = 4000;          /* réseau trop lent : on sert la mémoire, et on met à jour derrière */

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FICHIERS.map(u => new Request(u, { cache:'reload' }))))
    .catch(() => {}));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

/* GitHub demande de garder les fichiers 10 minutes : « no-cache » force une
   vérification à chaque fois (réponse très courte si rien n'a changé). */
function frais(req){
  return req.mode === 'navigate' ? new Request(req.url, { cache:'no-cache' })
                                 : new Request(req, { cache:'no-cache' });
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;            /* multijoueur et polices : on ne touche pas */
  e.respondWith((async () => {
    const reseau = fetch(frais(req)).then(async rep => {
      if (rep && rep.ok){ const c = await caches.open(VERSION); c.put(req, rep.clone()).catch(() => {}); }
      return rep;
    });
    const memoire = await caches.match(req, { ignoreSearch:true })
                 || (req.mode === 'navigate' ? await caches.match('./index.html') : undefined);
    if (!memoire) return reseau.catch(() => Response.error());
    const lent = new Promise(res => setTimeout(() => res(memoire), ATTENTE_MS));
    return Promise.race([reseau.catch(() => memoire), lent]);
  })());
});
