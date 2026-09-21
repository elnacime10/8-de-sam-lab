/* Le 8 de SAM — js/main.js
   Démarrage du jeu. Chargé en dernier. */

/* ============================================================
   9 · DÉMARRAGE
   ============================================================ */
/* Les portraits s'affichent face à face avant la donne. */
function showIntro(){
  const row = $('#introRow');
  const ids = seats();
  const n = ids.length;
  /* la taille suit le nombre de joueurs, sinon ça sort de l'écran */
  const vw = window.innerWidth || 360, vh = window.innerHeight || 700;
  const colonnes = n <= 2 ? n : (n <= 4 ? 2 : 3);
  const rangees = Math.ceil(n / colonnes);
  const parLargeur = (vw - 30 - (colonnes - 1) * 6) / colonnes / 0.78;   // portrait le plus large
  const parHauteur = (vh * 0.62) / rangees - 26;
  const h = Math.max(78, Math.min(210, parLargeur, parHauteur));
  row.style.setProperty('--introH', Math.round(h) + 'px');
  row.style.setProperty('--introN', Math.round(Math.max(12, Math.min(19, h / 10))) + 'px');
  row.style.maxWidth = n <= 2 ? '100%' : Math.round(colonnes * (h * 0.78) + (colonnes - 1) * 6 + 8) + 'px';
  row.innerHTML = ids.map((p, i) =>
    `<div class="ic"><img src="${faceOf(p)}" alt=""><div class="nmx">${nameOf(p)}</div></div>`
    + (n === 2 && i === 0 ? '<div class="vs">VS</div>' : '')).join('');
  const el = $('#introScreen');
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('show'));
  return new Promise(r => setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.classList.add('hidden'); r(); }, 280);
  }, S(1500)));
}

/* La donne : les cartes partent vraiment de la pioche. */
async function dealAnim(){
  const back = '<div class="cardback" style="width:100%;height:100%"></div>';
  for (let i = 0; i < 3; i++){
    for (const p of seats()){
      const to = p === ME ? handTarget() : oppStackEl(p);
      fly($('#drawSlot'), to, back, false);
      await sleep(S(70));
    }
  }
  await sleep(S(220));
}

async function startManche(){
  if (MATCH.online && !MATCH.host) return;      // seul l'hôte distribue
  stopChrono();
  busy = true; pending8 = -1;
  $('#bubLayer').innerHTML = '';
  lastBubbleMove = -9; lastBubbleWho = -1;
  newManche();
  $('#startScreen').classList.add('hidden');
  $('#endScreen').classList.add('hidden');
  hideSuitBar();
  saveMatch();
  sizeUp();
  render();
  if (MATCH.online && MATCH.host) broadcastState();
  await showIntro();
  await dealAnim();
  busy = false;
  render();
  setTimeout(() => { openManche(); armChrono(); }, S(220));
}

function preload(){
  const urls = Object.keys(IMG).map(k => IMG[k]);
  if (typeof Image === 'undefined') return Promise.resolve();
  let n = 0;
  const maj = () => {
    const pc = Math.round(100 * n / urls.length);
    $('#loadBar').style.width = pc + '%';
    $('#loadTxt').textContent = 'Chargement… ' + pc + '%';
  };
  maj();
  return Promise.all(urls.map(u => new Promise(res => {
    const i = new Image();
    i.onload = i.onerror = () => { n++; maj(); res(); };
    i.src = u;
  })));
}

if (!fsSupported()){ $('#fsHome').style.display = 'none'; $('#fsBtn').style.display = 'none'; }
fsLabel();
loadSet();
loadStats();
loadMatch();
sizeUp();
preload().then(() => {
  $('#loadScreen').classList.add('hidden');
  const m = (location.hash || '').match(/p=([A-Z0-9]+)/i);
  if (!(m && netOK())) $('#homeScreen').classList.remove('hidden');
  refreshHome();
});
/* lien d'invitation : #p=CODE ouvre directement la connexion */
(function(){
  const m = (location.hash || '').match(/p=([A-Z0-9]+)/i);
  if (m && netOK()){
    $('#loadScreen').classList.add('hidden');
    show('joinScreen');
    $('#joinCode').value = m[1].toUpperCase();
    $('#joinHint').textContent = 'Connexion au salon…';
    setTimeout(() => joinGame(m[1].toUpperCase()), 400);
  }
})();
sortMode = SET.sort;
speedIdx = SET.speed;
refreshSet();
refreshSetup();

if ('serviceWorker' in navigator){
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
