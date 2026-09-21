/* Le 8 de SAM — js/profils.js
   Ce qui appartient au joueur : statistiques, configuration mémorisée. */

const STATS = { w:0, l:0, p:0, vs:{} };
function loadStats(){
  try { Object.assign(STATS, JSON.parse(localStorage.getItem('sam8_stats')) || {}); if (!STATS.vs) STATS.vs = {}; } catch(e){}
}
function saveStats(){ try{ localStorage.setItem('sam8_stats', JSON.stringify(STATS)); }catch(e){} }
function noteResult(gagne){
  STATS.p++;
  if (gagne) STATS.w++; else STATS.l++;
  seats().forEach(q => {
    if (q === ME) return;
    const id = MATCH.chars[q];
    if (!STATS.vs[id]) STATS.vs[id] = { w:0, l:0 };
    gagne ? STATS.vs[id].w++ : STATS.vs[id].l++;
  });
  saveStats();
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
  const box = $('#homeSession');
  if (!MATCH.matches){ box.innerHTML = ''; return; }
  const ordre = seats().slice().sort((a, b) => MATCH.session[b] - MATCH.session[a]);
  box.innerHTML = '<p class="sect">Soirée en cours</p>' + ordre.map((q, i) =>
    `<div class="rank${q === ME ? ' me' : ''}"><span class="pos">${i+1}</span>
     <span class="nm">${nameOf(q)}</span>
     <span class="pt">${MATCH.session[q] > 0 ? '+' : ''}${MATCH.session[q]}</span></div>`).join('');
}

function saveMatch(){
  try {
    localStorage.setItem('sam8_match', JSON.stringify({
      n:MATCH.n, levels:MATCH.levels, chars:MATCH.chars, world:MATCH.world, tours:MATCH.tours
    }));
  } catch(e){}
}
function loadMatch(){
  try {
    const m = JSON.parse(localStorage.getItem('sam8_match'));
    if (!m) return;
    if (m.n === 2 || m.n === 3) MATCH.n = m.n;
    if (Array.isArray(m.levels) && m.levels.length === 3) MATCH.levels = m.levels;
    if (Array.isArray(m.chars) && m.chars.length === 3 && m.chars.every(c => CHARS[c])) MATCH.chars = m.chars;
    if (WORLDS[m.world]) MATCH.world = m.world;
    if ([1,3,5].includes(m.tours)) MATCH.tours = m.tours;
  } catch(e){}
}
