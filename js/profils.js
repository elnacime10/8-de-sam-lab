/* ============================================================
   LE PROFIL : qui tu es. Il te suit d'une partie à l'autre.
   Un profil par défaut existe dès la première ouverture.
   ============================================================ */
const PROFIL = { nom:'Joueur', avatar:'nacime', couleur:'#8A4FA8', photo:'' };

function chargeProfil(){
  try { Object.assign(PROFIL, JSON.parse(localStorage.getItem('sam8_profil')) || {}); } catch(e){}
  if (!PROFIL.nom) PROFIL.nom = 'Joueur';
}
function saveProfil(){ try { localStorage.setItem('sam8_profil', JSON.stringify(PROFIL)); } catch(e){} }
function initiales(nom){
  const m = (nom || '').trim().split(/\s+/).filter(Boolean);
  return ((m[0] || 'J')[0] + (m[1] ? m[1][0] : '')).toUpperCase();
}
/* l'image du profil : un personnage, une photo, ou des initiales */
function avatarProfil(){
  if (PROFIL.avatar === 'photo' && PROFIL.photo) return PROFIL.photo;
  if (IMG[PROFIL.avatar]) return IMG[PROFIL.avatar];
  return '';
}
/* le code de sauvegarde : ton profil et tes compteurs, en une suite de caractères */
function codeProfil(){
  try {
    const paquet = { p:PROFIL, s:{ w:STATS.w, l:STATS.l, p:STATS.p, podium:STATS.podium || 0, vs:STATS.vs } };
    return 'SAM8-' + btoa(unescape(encodeURIComponent(JSON.stringify(paquet)))).replace(/=+$/, '');
  } catch(e){ return ''; }
}
function importeProfil(code){
  try {
    const brut = String(code || '').trim().replace(/^SAM8-/, '');
    const paquet = JSON.parse(decodeURIComponent(escape(atob(brut))));
    if (!paquet || !paquet.p || !paquet.p.nom) return false;
    Object.assign(PROFIL, paquet.p); saveProfil();
    if (paquet.s){ Object.assign(STATS, paquet.s); saveStats(); }
    return true;
  } catch(e){ return false; }
}

/* Le 8 de SAM — js/profils.js
   Ce qui appartient au joueur : statistiques, configuration mémorisée. */

/* Le 8 de SAM — js/profils.js
   Ce qui appartient au joueur : statistiques, configuration mémorisée. */

const STATS = { w:0, l:0, p:0, vs:{} };
function loadStats(){
  try { Object.assign(STATS, JSON.parse(localStorage.getItem('sam8_stats')) || {}); if (!STATS.vs) STATS.vs = {}; } catch(e){}
}
function saveStats(){ try{ localStorage.setItem('sam8_stats', JSON.stringify(STATS)); }catch(e){} }
/* Le résultat d'un MATCH, pas d'une manche. Et face à face par face à face :
   finir 2e sur 5 n'est pas une défaite, et on ne perd pas contre ceux
   qu'on a devancés. */
function noteResult(classement){
  if (!Array.isArray(classement) || classement.indexOf(ME) < 0) return;
  const maPlace = classement.indexOf(ME);
  STATS.p++;
  if (maPlace === 0) STATS.w++; else STATS.l++;
  if (maPlace <= 2 && classement.length > 2) STATS.podium = (STATS.podium || 0) + 1;
  classement.forEach((q, place) => {
    if (q === ME) return;
    const id = SG(q).char;
    if (!STATS.vs[id]) STATS.vs[id] = { w:0, l:0 };
    (maPlace < place) ? STATS.vs[id].w++ : STATS.vs[id].l++;   // fini devant / derrière
  });
  saveStats();
}
/* l'ordre d'arrivée du match : par points, les sortants d'abord en cas d'égalité */
function classementMatch(){
  if (MATCH.n === 2) return G && G.out.length ? G.out.slice(0, 2) : [];
  return seats().slice().sort((a, b) => (SG(a).dq - SG(b).dq) || (SG(b).score - SG(a).score));
}

function refreshHome(){
  $('#sW').textContent = STATS.w;
  $('#sL').textContent = STATS.l;
  $('#sP').textContent = STATS.p;
  if (typeof avatarDans === 'function') avatarDans($('#homeAvatar'));
  $('#homeNom').textContent = PROFIL.nom;
  $('#homeVD').textContent = STATS.w + ' V · ' + STATS.l + ' D';
}

function saveMatch(){
  try {
    localStorage.setItem('sam8_match', JSON.stringify({
      n:MATCH.n, levels:champs('level'), chars:champs('char'), world:MATCH.world, tours:MATCH.tours
    }));
  } catch(e){}
}
function loadMatch(){
  try {
    const m = JSON.parse(localStorage.getItem('sam8_match'));
    if (!m) return;
    if (m.n === 2 || m.n === 3) MATCH.n = m.n;
    if (Array.isArray(m.levels)) m.levels.forEach((v, p) => { if (MATCH.seats[p]) MATCH.seats[p].level = v; });
    if (Array.isArray(m.chars) && m.chars.every(c => CHARS[c])) m.chars.forEach((v, p) => { if (MATCH.seats[p]) MATCH.seats[p].char = v; });
    if (WORLDS[m.world]) MATCH.world = m.world;
    if ([1,3,5].includes(m.tours)) MATCH.tours = m.tours;
  } catch(e){}
}
