/* Le 8 de SAM — js/ecrans.js
   Menus, réglages, écrans de fin, interactions du joueur. */

/* ============================================================
   7 · INTERACTIONS
   ============================================================ */
function onCardClick(i, el){
  if (G.turn !== ME || G.over || busy || !G.in[ME]) return;
  const c = G.hands[ME][i];
  if (!playable(c)){
    el.classList.remove('no'); void el.offsetWidth; el.classList.add('no');
    SFX.no(); flash(whyNot(), true);
    return;
  }
  if (coarse && selected !== i){ selected = i; render(); return; }
  selected = -1;
  if (c.r === '8' && (G.hands[ME].length > 1 || MATCH.n > 2)){
    if (pending8 === i){ hideSuitBar(); render(); return; }
    showSuitBar(i); return;
  }
  hideSuitBar();
  doPlay(i, null);
}

async function doPlay(i, suit){
  if (busy) return;
  if (MATCH.online && !MATCH.host){          // invité : on transmet, l'hôte tranche
    const c = G.hands[ME][i];
    SFX.play(); sendMove({ a:'play', r:c.r, s:c.s, suit });
    hideSuitBar(); selected = -1;
    busy = true; render(); setTimeout(() => { busy = false; render(); }, 400);
    return;
  }
  busy = true;
  const c = G.hands[ME][i];
  const from = rectOf(handEl(i)) || rectOf($('#drawSlot'));
  hideSuitBar();
  render();
  SFX.play();
  await fly(from, $('#discardSlot'), cardHTML(c), true);
  stopChrono();
  playCard(ME, i, suit);
  busy = false;
  render();
  if (MATCH.online && MATCH.host) broadcastState();
  if (!G.over && G.turn !== ME && isAI(G.turn)) runAI(); else armChrono();
}

function showSuitBar(i){
  pending8 = i;
  const rest = G.hands[ME].filter((c,k) => k !== i);
  document.querySelectorAll('#suitBar button[data-s]').forEach(b => {
    b.querySelector('i').textContent = rest.filter(c => c.s === b.dataset.s).length;
  });
  $('#suitBar').classList.remove('hidden');
  selected = i; render();
}
function hideSuitBar(){ pending8 = -1; $('#suitBar').classList.add('hidden'); }

document.querySelectorAll('#suitBar button[data-s]').forEach(b => b.addEventListener('click', () => {
  const i = pending8; hideSuitBar();
  if (i >= 0) doPlay(i, b.dataset.s);
}));
$('#suitCancel').addEventListener('click', () => { hideSuitBar(); selected = -1; render(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && pending8 >= 0){ hideSuitBar(); selected = -1; render(); } });

$('#drawBtn').addEventListener('click', async () => {
  if (G.turn !== ME || G.over || busy || !G.in[ME]) return;
  if (MATCH.online && !MATCH.host){
    SFX.draw(); sendMove({ a:'draw' });
    busy = true; render(); setTimeout(() => { busy = false; render(); }, 400);
    return;
  }
  busy = true; selected = -1; hideSuitBar(); render();
  const n0 = G.hands[ME].length;
  const target = handTarget();
  if (G.pending){ SFX.atk(G.pending.amount); takeHit(ME); } else { SFX.draw(); drawFree(ME); }
  await flyCards(G.hands[ME].slice(n0), target, true);
  busy = false; render();
  if (MATCH.online && MATCH.host) broadcastState();
  if (!G.over && G.turn !== ME && isAI(G.turn)) runAI(); else armChrono();
});

$('#skipBtn').addEventListener('click', () => { skipAll = true; $('#skipBtn').classList.add('hidden'); });
$('#sortBtn').addEventListener('click', () => {
  sortMode = sortMode === 'suit' ? 'rank' : 'suit';
  $('#sortBtn').textContent = 'Tri : ' + (sortMode === 'suit' ? 'couleur' : 'valeur');
  selected = -1; render();
});

/* --- écran d'accueil --- */
function levelSegs(seat){
  return ['facile','moyen','difficile'].map(l =>
    `<button class="seg${MATCH.levels[seat] === l ? ' on' : ''}" data-lv="${l}" data-seat="${seat}">${l.charAt(0).toUpperCase()+l.slice(1)}</button>`).join('');
}
function faceButtons(container, seat){
  container.innerHTML = CHAR_IDS.map(id =>
    `<button class="fbtn${MATCH.chars[seat] === id ? ' on' : ''}" data-id="${id}" data-seat="${seat}">
       <img src="${IMG[id]}" alt=""><b>${CHARS[id].nom}</b></button>`).join('');
}
/* un personnage ne peut être pris qu'une fois : on échange avec celui qui l'avait */
function pickChar(seat, id){
  const used = MATCH.chars.findIndex((c, i) => c === id && i < MATCH.n);
  if (used >= 0 && used !== seat) MATCH.chars[used] = MATCH.chars[seat];
  MATCH.chars[seat] = id;
  refreshSetup();
}

function renderSeats(){
  const box = $('#seatsBlock');
  let h = '';
  for (let p = 1; p < MATCH.n; p++){
    const humain = MATCH.online && MATCH.human[p];
    h += `<div class="seatCard" data-seat="${p}">
      <div class="seatHead">
        <img src="${IMG[MATCH.chars[p]]}" alt="">
        <div><div class="sn">${CHARS[MATCH.chars[p]].nom}</div>
        <div class="sd">Siège ${p + 1}</div></div>
        ${MATCH.online ? `<span class="free">${humain ? 'joueur' : 'ordinateur'}</span>` : ''}
      </div>
      ${MATCH.online ? `<div class="row" data-kind="who"><button class="seg${humain ? ' on' : ''}" data-who="1" data-seat="${p}">Joueur</button><button class="seg${humain ? '' : ' on'}" data-who="0" data-seat="${p}">Ordinateur</button></div>` : ''}
      <div class="faces" data-faces="${p}"></div>
      ${humain ? '' : `<div class="row">${levelSegs(p)}</div>`}
    </div>`;
  }
  box.innerHTML = h;
  for (let p = 1; p < MATCH.n; p++){
    const f = box.querySelector(`[data-faces="${p}"]`);
    if (f) faceButtons(f, p);
  }
  box.querySelectorAll('.fbtn').forEach(b => b.addEventListener('click', () => pickChar(+b.dataset.seat, b.dataset.id)));
  box.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => { MATCH.levels[+b.dataset.seat] = b.dataset.lv; refreshSetup(); }));
  box.querySelectorAll('[data-who]').forEach(b => b.addEventListener('click', () => { MATCH.human[+b.dataset.seat] = b.dataset.who === '1'; refreshSetup(); }));
}

function renderSession(){
  const box = $('#sessionBlock');
  if (!MATCH.matches){ box.style.display = 'none'; return; }
  box.style.display = 'block';
  const ordre = seats().slice().sort((a, b) => MATCH.session[b] - MATCH.session[a]);
  $('#sessionList').innerHTML = ordre.map((p, i) =>
    `<div class="rank${p === ME ? ' me' : ''}"><span class="pos">${i + 1}</span>
     <span class="nm">${nameOf(p)}</span>
     <span class="pt">${MATCH.session[p] > 0 ? '+' : ''}${MATCH.session[p]}</span></div>`).join('')
    + `<p class="hint">${MATCH.matches} partie${MATCH.matches > 1 ? 's' : ''} jouée${MATCH.matches > 1 ? 's' : ''} ce soir.</p>`;
}

function refreshSetup(){
  $('#toursBlock').style.display = MATCH.n > 2 ? 'block' : 'none';
  $('#chronoBlock').style.display = MATCH.online ? 'block' : 'none';
  $('#nHint').textContent = MATCH.n === 2
    ? 'Face à face : 8 cartes, le 7 et le valet font rejouer.'
    : `Règles à plusieurs : ${handSize(MATCH.n)} cartes chacun, le 7 saute et le valet inverse le sens.`;
  document.querySelectorAll('#nRow .seg').forEach(b => b.classList.toggle('on', +b.dataset.n === MATCH.n));
  document.querySelectorAll('#toursRow .seg').forEach(b => b.classList.toggle('on', +b.dataset.t === MATCH.tours));
  document.querySelectorAll('#chronoRow .seg').forEach(b => b.classList.toggle('on', +b.dataset.c === MATCH.chrono));
  document.querySelectorAll('#worldRow .world').forEach(b => {
    b.style.backgroundImage = 'url(' + IMG[b.dataset.w] + ')';
    b.style.backgroundPosition = 'center ' + WORLDS[b.dataset.w].bgY;
    b.classList.toggle('on', MATCH.world === b.dataset.w);
  });
  paintOverlays();
  const f0 = $('#face0');
  faceButtons(f0, 0);
  f0.querySelectorAll('.fbtn').forEach(b => b.addEventListener('click', () => pickChar(0, b.dataset.id)));
  renderSeats();
  renderSession();
  $('#playBtn').textContent = MATCH.online ? 'Ouvrir le salon' : 'Distribuer';
  $('#cfgTitle').textContent = MATCH.online ? 'Créer une partie' : 'Partie hors ligne';
  $('#cfgSub').textContent = MATCH.online
    ? "Tu fixes le cadre et ton personnage. Les autres choisiront le leur en arrivant."
    : "Choisis tes adversaires et leur niveau.";
  $('#seatsBlock').style.display = MATCH.online ? 'none' : 'block';
}

function show(id){
  $('#loadScreen').classList.add('hidden');
  ['homeScreen','joinScreen','startScreen','lobbyScreen'].forEach(x =>
    $('#'+x).classList.toggle('hidden', x !== id));
}

$('#resetStats').addEventListener('click', () => {
  STATS.w = 0; STATS.l = 0; STATS.p = 0; STATS.vs = {};
  MATCH.session = [0,0,0,0,0]; MATCH.matches = 0;
  saveStats(); refreshHome();
  $('#homeHint').textContent = 'Compteurs remis à zéro.';
});
$('#goSolo').addEventListener('click', () => { MATCH.online = false; refreshSetup(); show('startScreen'); });
$('#goCreate').addEventListener('click', () => {
  if (!netOK()){ $('#homeHint').textContent = "Le mode en ligne demande d'héberger le fichier (GitHub Pages, Netlify). Depuis claude.ai il est bloqué."; return; }
  MATCH.online = true; MATCH.host = true; refreshSetup(); show('startScreen');
});
$('#goJoin').addEventListener('click', () => {
  if (!netOK()){ $('#homeHint').textContent = "Le mode en ligne demande d'héberger le fichier (GitHub Pages, Netlify). Depuis claude.ai il est bloqué."; return; }
  show('joinScreen');
});
$('#goRules').addEventListener('click', () => $('#rulesScreen').classList.remove('hidden'));
$('#goSet').addEventListener('click', () => openSet('homeScreen'));
$('#fsHome').addEventListener('click', fsToggle);
$('#fsBtn').addEventListener('click', () => { $('#menuScreen').classList.add('hidden'); fsToggle(); });
document.addEventListener('fullscreenchange', () => { fsLabel(); sizeUp(); if (G) render(); });
document.addEventListener('webkitfullscreenchange', () => { fsLabel(); sizeUp(); if (G) render(); });
$('#cfgBack').addEventListener('click', () => show('homeScreen'));
$('#joinBack').addEventListener('click', () => show('homeScreen'));
$('#joinGo').addEventListener('click', () => {
  const c = $('#joinCode').value.trim().toUpperCase();
  if (!c){ $('#joinHint').textContent = 'Entre un code.'; return; }
  $('#joinHint').textContent = 'Connexion…';
  joinGame(c);
});
document.querySelectorAll('#nRow .seg').forEach(b => b.addEventListener('click', () => {
  MATCH.n = +b.dataset.n;
  const vus = new Set();
  for (let p = 0; p < MATCH.n; p++){
    while (vus.has(MATCH.chars[p])) MATCH.chars[p] = CHAR_IDS.find(c => !vus.has(c) && !MATCH.chars.slice(0, p).includes(c)) || MATCH.chars[p];
    vus.add(MATCH.chars[p]);
  }
  refreshSetup();
}));
document.querySelectorAll('#worldRow .world').forEach(b => b.addEventListener('click', () => {
  MATCH.world = b.dataset.w; refreshSetup();
}));
document.querySelectorAll('#toursRow .seg').forEach(b => b.addEventListener('click', () => {
  MATCH.tours = +b.dataset.t; refreshSetup();
}));
document.querySelectorAll('#chronoRow .seg').forEach(b => b.addEventListener('click', () => {
  MATCH.chrono = +b.dataset.c; refreshSetup();
}));
$('#resetSession').addEventListener('click', () => {
  MATCH.session = [0,0,0,0,0]; MATCH.matches = 0; refreshSetup();
});

$('#playBtn').addEventListener('click', () => {
  MATCH.tour = 1; MATCH.scores = [0,0,0,0,0];
  if (MATCH.online){ openLobby(); return; }
  MATCH.human = [true,false,false,false,false];
  shuffleSeats();
  startManche();
});
/* Tirage au sort des places : l'ordre autour de la table change à chaque partie. */
/* Tirage au sort des places : idx[nouveau] = ancien siège */
function shuffleSeats(){
  const idx = seats();
  for (let i = idx.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [idx[i],idx[j]]=[idx[j],idx[i]]; }
  const ch = idx.map(i => MATCH.chars[i]), lv = idx.map(i => MATCH.levels[i]), hu = idx.map(i => MATCH.human[i]);
  const nm = idx.map(i => MATCH.names[i]), sc = idx.map(i => MATCH.session[i]), rd = idx.map(i => MATCH.ready[i]);
  const tk = idx.map(i => MATCH.tok[i]), dq = idx.map(i => MATCH.dq[i]);
  const vers = [];                                   // ancien -> nouveau
  idx.forEach((anc, nouv) => { vers[anc] = nouv; });
  for (let i = 0; i < idx.length; i++){
    MATCH.chars[i]=ch[i]; MATCH.levels[i]=lv[i]; MATCH.human[i]=hu[i];
    MATCH.names[i]=nm[i]; MATCH.session[i]=sc[i]; MATCH.ready[i]=rd[i];
    MATCH.tok[i]=tk[i]; MATCH.dq[i]=dq[i];
  }
  conns.forEach(c => { if (c.seat !== undefined) c.seat = vers[c.seat]; });
  ME = vers[ME];
}
$('#againBtn').addEventListener('click', () => {
  if (MATCH.online){ netReadyClick(); return; }
  $('#endScreen').classList.add('hidden');
  nextStep();
});
$('#backBtn').addEventListener('click', () => {
  $('#endScreen').classList.add('hidden');
  if (MATCH.online) closeNet(MATCH.host ? 'Session fermée.' : 'Tu as quitté la session.', MATCH.host);
  G = null; show('homeScreen'); refreshHome();
});
$('#menuBtn').addEventListener('click', () => {
  paintOverlays();
  const invite = MATCH.online && !MATCH.host;
  $('#restartBtn').disabled = invite;
  $('#restartBtn').style.opacity = invite ? '.35' : '1';
  $('#menuScreen').classList.remove('hidden');
});
$('#resumeBtn').addEventListener('click', () => $('#menuScreen').classList.add('hidden'));
function refreshSet(){
  $('#tSound').classList.toggle('on', SET.sound);
  $('#tVibe').classList.toggle('on', SET.vibe);
  document.querySelectorAll('#trashRow .seg').forEach(b => b.classList.toggle('on', (b.dataset.k === '1') === !!SET.trash));
  $('#trashEx').textContent = SET.trash
    ? 'Exemple : Mehmet — « Mange ça enfoiré ! »'
    : 'Exemple : Mehmet — « Mange ça, tiens ! »';
  document.querySelectorAll('#speedRow .seg').forEach(b => b.classList.toggle('on', +b.dataset.k === SET.speed));
  document.querySelectorAll('#sortRow .seg').forEach(b => b.classList.toggle('on', b.dataset.k === SET.sort));
  speedIdx = SET.speed;
  $('#sortBtn').textContent = 'Tri : ' + (sortMode === 'suit' ? 'couleur' : 'valeur');
}
$('#tSound').addEventListener('click', () => { SET.sound = !SET.sound; saveSet(); refreshSet(); if (SET.sound) SFX.mine(); });
$('#tVibe').addEventListener('click', () => { SET.vibe = !SET.vibe; saveSet(); refreshSet(); if (SET.vibe) vibe(40); });
document.querySelectorAll('#trashRow .seg').forEach(b => b.addEventListener('click', () => {
  SET.trash = b.dataset.k === '1'; saveSet(); refreshSet();
}));
document.querySelectorAll('#speedRow .seg').forEach(b => b.addEventListener('click', () => { SET.speed = +b.dataset.k; saveSet(); refreshSet(); }));
document.querySelectorAll('#sortRow .seg').forEach(b => b.addEventListener('click', () => {
  SET.sort = b.dataset.k; sortMode = SET.sort; saveSet(); refreshSet(); if (G) render();
}));
let setFrom = 'menuScreen';
function openSet(from){ setFrom = from; $('#'+from).classList.add('hidden'); refreshSet(); $('#setScreen').classList.remove('hidden'); }
$('#menuSet').addEventListener('click', () => openSet('menuScreen'));
$('#setBack').addEventListener('click', () => { $('#setScreen').classList.add('hidden'); $('#'+setFrom).classList.remove('hidden'); });
$('#menuRules').addEventListener('click', () => { $('#menuScreen').classList.add('hidden'); $('#rulesScreen').classList.remove('hidden'); });
$('#restartBtn').addEventListener('click', () => {
  if (MATCH.online && !MATCH.host) return;
  $('#menuScreen').classList.add('hidden'); startManche();
});
let quitArmed = false;
$('#quitBtn').addEventListener('click', () => {
  const risque = MATCH.n > 2 && G && !G.over && (MATCH.tour > 1 || G.moveNo > 4);
  if (risque && !quitArmed){
    quitArmed = true;
    $('#quitBtn').textContent = 'Confirmer : la partie sera perdue';
    setTimeout(() => { quitArmed = false; $('#quitBtn').textContent = 'Quitter la partie'; }, 3500);
    return;
  }
  quitArmed = false; $('#quitBtn').textContent = 'Quitter la partie';
  $('#menuScreen').classList.add('hidden');
  if (MATCH.online) closeNet(MATCH.host ? 'Session fermée.' : 'Tu as quitté la partie.', MATCH.host);
  G = null;
  show('homeScreen'); refreshHome();
});
/* Plein écran : un seul bouton qui bascule. Non supporté sur iPhone, on le cache alors. */
function fsOn(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function fsSupported(){
  const e = document.documentElement;
  return !!(e.requestFullscreen || e.webkitRequestFullscreen);
}
function fsToggle(){
  try {
    if (fsOn()){
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const e = document.documentElement;
      (e.requestFullscreen || e.webkitRequestFullscreen).call(e);
    }
  } catch(err){}
  setTimeout(() => { fsLabel(); sizeUp(); if (G) render(); }, 350);
}
function fsLabel(){
  const t = fsOn() ? 'Quitter le plein écran' : 'Plein écran';
  $('#fsHome').textContent = t;
  const b = $('#fsBtn');
  if (b && b.querySelector) b.innerHTML = '<b>⛶</b>' + (fsOn() ? 'Réduire' : 'Plein écran');
}

function paintOverlays(){
  document.documentElement.style.setProperty('--ovbg', 'url(' + IMG[MATCH.world] + ')');
}
$('#rulesBack').addEventListener('click', () => {
  $('#rulesScreen').classList.add('hidden');
  if (G && !G.over && $('#startScreen').classList.contains('hidden')) $('#menuScreen').classList.remove('hidden');
});
let resizeT = null;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { sizeUp(); if (G) render(); }, 120); });

/* ============================================================
   8 · FIN DE MANCHE
   ============================================================ */
function endManche(){
  G.over = true;
  stopChrono();
  if (MATCH.n > 2){
    const pts = pointsFor(activeN());
    G.out.forEach((p, i) => { MATCH.scores[p] += (pts[i] !== undefined ? pts[i] : 0); });
  }
  noteResult(G.out[0] === ME);
  if (MATCH.n > 2 && MATCH.tour >= MATCH.tours){
    seats().forEach(p => { MATCH.session[p] += MATCH.scores[p]; });
    MATCH.matches++;
  }
  if (MATCH.online && MATCH.host) broadcastState();
  SFX.end();
  setTimeout(showEnd, S(1400));
}

function showEnd(){
  const won = G.out[0] === ME;
  const last = G.out[G.out.length - 1];
  const rest = G.hands[last] || [];
  if (MATCH.n === 2){
    $('#endTitle').textContent = won ? 'Gagné' : 'Perdu';
    $('#endSub').textContent = won ? 'Tu as vidé ta main le premier.' : nameOf(G.out[0]) + ' a fini avant toi.';
    $('#rankList').innerHTML = '';
    $('#againBtn').textContent = 'Rejouer';
  } else {
    const fin = MATCH.tour >= MATCH.tours;
    $('#endTitle').textContent = fin ? 'Résultat final' : 'Tour ' + MATCH.tour + ' terminé';
    const bar = pointsFor(activeN());
    const sgn = v => (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v);
    const maPlace = G.out.indexOf(ME);
    const monGain = bar[maPlace];
    const rang = ['premier', 'deuxième', 'troisième', 'quatrième', 'dernier'];
    $('#endSub').textContent = maPlace < 0 ? ''
      : (maPlace === 0 ? 'Tu sors le premier' : 'Tu finis ' + (maPlace === MATCH.n - 1 ? 'dernier' : rang[maPlace]))
        + ' : ' + (monGain === 0 ? 'aucun point' : sgn(monGain) + ' point' + (Math.abs(monGain) > 1 ? 's' : '')) + '.';
    const pts = bar.map(sgn);
    const classement = fin
      ? seats().slice().sort((a,b) => (MATCH.dq[a] - MATCH.dq[b]) || (MATCH.scores[b] - MATCH.scores[a]))
      : G.out;
    $('#rankList').innerHTML = classement.map((p, i) =>
      `<div class="rank${p === ME ? ' me' : ''}"><span class="pos">${i+1}</span>
       <span class="nm">${nameOf(p)}</span>
       <span class="pt">${fin ? (MATCH.scores[p] > 0 ? '+' : '') + MATCH.scores[p] : pts[i]}</span>
       ${fin ? '' : `<span class="tot">total ${MATCH.scores[p] > 0 ? '+' : ''}${MATCH.scores[p]}</span>`}</div>`).join('');
    if (fin){
      const top = Math.max(...MATCH.scores.slice(0, MATCH.n));
      const exaequo = seats().filter(p => MATCH.scores[p] === top);
      if (exaequo.length > 1){
        $('#endSub').textContent = 'Égalité à ' + (top > 0 ? '+' : '') + top + ' — un tour de départage.';
        $('#againBtn').textContent = 'Tour de départage';
      } else {
        $('#endSub').textContent = exaequo[0] === ME ? 'Tu remportes la partie.' : nameOf(exaequo[0]) + ' remporte la partie.';
        $('#againBtn').textContent = 'Nouvelle partie';
      }
    } else $('#againBtn').textContent = 'Tour suivant';
  }
  const champ = MATCH.n === 2 ? G.out[0]
    : (MATCH.tour >= MATCH.tours && !$('#againBtn').textContent.includes('départage')
       ? seats().slice().sort((a,b) => (MATCH.dq[a] - MATCH.dq[b]) || (MATCH.scores[b] - MATCH.scores[a]))[0] : G.out[0]);
  if (champ === undefined || champ === null){ $('#winBox').style.display = 'none'; }
  else {
  $('#winBox').style.display = 'flex';
  $('#winFace').src = faceOf(champ);
  $('#winName').textContent = champ === ME ? 'Toi' : nameOf(champ);
  $('#winLine').textContent = champ === ME
    ? 'Bien joué.'
    : (lineFor(champ, 'out') || 'Voilà.');
  }
  if (last !== undefined && last !== champ){
    $('#loseBox').style.display = 'flex';
    $('#loseFace').src = faceOf(last);
    $('#loseName').textContent = last === ME ? 'Toi' : nameOf(last);
    $('#loseLine').textContent = last === ME ? 'Ça arrive.' : (lineFor(last, 'lose') || '...');
  } else $('#loseBox').style.display = 'none';
  $('#endLabel').textContent = rest.length
    ? 'La main de ' + nameOf(last) + ' — ' + rest.length + ' carte' + (rest.length > 1 ? 's' : '')
    : '';
  const order = (a,b) => (SUITS.indexOf(a.s)-SUITS.indexOf(b.s)) || (RANKS.indexOf(a.r)-RANKS.indexOf(b.r));
  $('#endHand').innerHTML = rest.slice().sort(order).map(c => cardHTML(c)).join('');
  $('#againBtn').disabled = false; $('#againBtn').style.opacity = '1';
  $('#readyInfo').innerHTML = '';
  if (MATCH.online) netEndScreen();          // en ligne : système de prêt / revanche
  $('#backBtn').textContent = MATCH.online ? 'Quitter la session' : 'Quitter';
  $('#endScreen').classList.remove('hidden');
}

function nextStep(){
  if (MATCH.online && !MATCH.host) return;
  if (MATCH.n > 2){
    const fin = MATCH.tour >= MATCH.tours;
    if (fin){
      const top = Math.max(...MATCH.scores.slice(0, MATCH.n));
      const exaequo = seats().filter(p => MATCH.scores[p] === top);
      if (exaequo.length > 1){ MATCH.tours++; MATCH.tour++; startManche(); return; }
      if (MATCH.online) return;                  // en ligne, la suite passe par la revanche
      MATCH.tour = 1; MATCH.scores = [0,0,0,0,0];
      $('#startScreen').classList.remove('hidden');
      refreshSetup();
      return;
    }
    MATCH.tour++;
  }
  startManche();
}
