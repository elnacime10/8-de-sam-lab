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
  const ids = CHAR_IDS.filter(id => STATS.vs[id]);
  $('#vsList').innerHTML = ids.map(id => {
    const v = STATS.vs[id];
    return `<div class="vsRow"><img src="${IMG[id]}" alt=""><span class="n">${CHARS[id].nom}</span>
      <span class="s">${v.w} – ${v.l}</span></div>`;
  }).join('');
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
