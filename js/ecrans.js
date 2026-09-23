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
    if (!c) return;
    const dep = rectOf(handEl(i)) || rectOf($('#drawSlot'));
    sendMove({ a:'play', r:c.r, s:c.s, suit });
    hideSuitBar(); selected = -1;
    busy = true; render();
    /* la carte part de sa main comme hors ligne : même geste, même son */
    fly(dep, $('#discardSlot'), cardHTML(c), false, () => SFX.play());
    setTimeout(() => { busy = false; render(); }, Math.max(400, S(CONFIG.flyMs)));
    return;
  }
  const c = G.hands[ME][i];
  if (!c) return;                       /* main déjà retriée : on ignore un appui périmé */
  busy = true;
  const from = rectOf(handEl(i)) || rectOf($('#drawSlot'));
  hideSuitBar();
  render();
  await fly(from, $('#discardSlot'), cardHTML(c), false, () => SFX.play());
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
    const combien = Math.min(5, G.pending ? (G.pending.amount || 1) : 1);
    sendMove({ a:'draw' });
    /* autant de cartes qui volent que de cartes encaissées, comme hors ligne */
    for (let k = 0; k < combien; k++)
      setTimeout(() => fly($('#drawSlot'), handTarget(),
        '<div class="cardback" style="width:100%;height:100%"></div>', true,
        k === 0 ? () => (G.pending ? SFX.atk(G.pending.amount) : SFX.draw()) : null), S(160) * k);
    busy = true; render();
    setTimeout(() => { busy = false; render(); }, Math.max(400, S(CONFIG.flyMs) + S(160) * combien));
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

$('#skipBtn').addEventListener('click', () => { skipAll = true; annuleVols(); $('#skipBtn').classList.add('hidden'); });
$('#sortBtn').addEventListener('click', () => {
  sortMode = sortMode === 'suit' ? 'rank' : 'suit';
  $('#sortBtn').textContent = 'Tri : ' + (sortMode === 'suit' ? 'couleur' : 'valeur');
  selected = -1; render();
});

/* --- écran d'accueil --- */
function levelSegs(seat){
  return ['facile','moyen','difficile'].map(l =>
    `<button class="seg${SG(seat).level === l ? ' on' : ''}" data-lv="${l}" data-seat="${seat}">${l.charAt(0).toUpperCase()+l.slice(1)}</button>`).join('');
}
function faceButtons(container, seat){
  container.innerHTML = CHAR_IDS.map(id =>
    `<button class="fbtn${SG(seat).char === id ? ' on' : ''}" data-id="${id}" data-seat="${seat}">
       <img src="${IMG[id]}" alt=""><b>${CHARS[id].nom}</b></button>`).join('');
}
/* un personnage ne peut être pris qu'une fois : on échange avec celui qui l'avait */
function pickChar(seat, id){
  const used = champs('char').findIndex((c, i) => c === id && i < MATCH.n);
  if (used >= 0 && used !== seat) SG(used).char = SG(seat).char;
  SG(seat).char = id;
  refreshSetup();
}

function renderSeats(){
  const box = $('#seatsBlock');
  let h = '';
  for (let p = 1; p < MATCH.n; p++){
    const humain = MATCH.online && SG(p).human;
    h += `<div class="seatCard" data-seat="${p}">
      <div class="seatHead">
        <img src="${IMG[SG(p).char]}" alt="">
        <div><div class="sn">${CHARS[SG(p).char].nom}</div>
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
  box.querySelectorAll('[data-lv]').forEach(b => b.addEventListener('click', () => { SG(+b.dataset.seat).level = b.dataset.lv; refreshSetup(); }));
  box.querySelectorAll('[data-who]').forEach(b => b.addEventListener('click', () => { SG(+b.dataset.seat).human = b.dataset.who === '1'; refreshSetup(); }));
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
    while (vus.has(SG(p).char)) SG(p).char = CHAR_IDS.find(c => !vus.has(c) && !champs('char').slice(0, p).includes(c)) || SG(p).char;
    vus.add(SG(p).char);
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
$('#resetSessionSupprime').addEventListener('click', () => {
  refreshSetup();
});

$('#playBtn').addEventListener('click', () => {
  if (MATCH.online){ openLobby(); return; }
  nouveauMatch('solo');          // un seul point de départ : plus rien ne traîne du match précédent
  shuffleSeats();
  startManche();
});
/* Tirage au sort des places : l'ordre autour de la table change à chaque partie. */
/* Tirage au sort des places : idx[nouveau] = ancien siège */
function shuffleSeats(){
  /* on déplace les sièges entiers : aucun champ ne peut être oublié */
  const idx = seats();
  for (let i = idx.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [idx[i],idx[j]]=[idx[j],idx[i]]; }
  const vers = [];                                   // ancien -> nouveau
  idx.forEach((anc, nouv) => { vers[anc] = nouv; });
  const copie = idx.map(anc => MATCH.seats[anc]);
  copie.forEach((s, i) => { MATCH.seats[i] = s; });
  conns.forEach(c => { if (c.seat !== undefined) c.seat = vers[c.seat]; });
  ME = vers[ME];
  verifieSieges();
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
  bornerVitesse(); speedIdx = SET.speed;
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
    G.out.forEach((p, i) => { SG(p).score += (pts[i] !== undefined ? pts[i] : 0); });
  }
  /* le résultat ne compte qu'à la fin du match, pas à chaque manche */
  if (MATCH.n === 2 || MATCH.tour >= MATCH.tours) noteResult(classementMatch());
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
      ? seats().slice().sort((a,b) => (SG(a).dq - SG(b).dq) || (SG(b).score - SG(a).score))
      : G.out;
    $('#rankList').innerHTML = classement.map((p, i) =>
      `<div class="rank${p === ME ? ' me' : ''}"><span class="pos">${i+1}</span>
       <span class="nm">${nameOf(p)}</span>
       <span class="pt">${fin ? (SG(p).score > 0 ? '+' : '') + SG(p).score : pts[i]}</span>
       ${fin ? '' : `<span class="tot">total ${SG(p).score > 0 ? '+' : ''}${SG(p).score}</span>`}</div>`).join('');
    if (fin){
      const top = Math.max(...champs('score').slice(0, MATCH.n));
      const exaequo = seats().filter(p => SG(p).score === top);
      if (exaequo.length > 1){
        $('#endSub').textContent = 'Égalité à ' + (top > 0 ? '+' : '') + top + ' — un tour de départage.';
        $('#againBtn').textContent = 'Tour de départage';
      } else {
        $('#endSub').textContent = exaequo[0] === ME ? 'Tu remportes la partie.' : nameOf(exaequo[0]) + ' remporte la partie.';
        $('#againBtn').textContent = 'Nouvelle partie';
      }
    } else $('#againBtn').textContent = 'Tour suivant';
  }
  /* à plusieurs, le premier encadré c'est TOI : ta place, ton résultat.
     Le champion vient ensuite. En face à face, rien ne change. */
  const vainqueur = MATCH.n === 2 ? G.out[0]
    : (MATCH.tour >= MATCH.tours && !$('#againBtn').textContent.includes('départage')
       ? seats().slice().sort((a,b) => (SG(a).dq - SG(b).dq) || (SG(b).score - SG(a).score))[0] : G.out[0]);
  const champ = (MATCH.n > 2 && G.out.indexOf(ME) >= 0) ? ME : vainqueur;
  if (champ === undefined || champ === null){ $('#winBox').style.display = 'none'; }
  else {
  $('#winBox').style.display = 'flex';
  $('#winFace').src = faceOf(champ);
  $('#winName').textContent = nameOf(champ);
  const maPl = G.out.indexOf(ME);
  const rangs = ['1er', '2e', '3e', '4e', '5e'];
  $('#winLine').textContent = champ === ME
    ? (MATCH.n > 2 && maPl >= 0 ? rangs[maPl] + ' de la manche' : 'Bien joué.')
    : (lineFor(champ, 'out') || 'Voilà.');
  }
  const second = (MATCH.n > 2 && champ === ME && vainqueur !== ME) ? vainqueur : last;
  if (second !== undefined && second !== champ){
    $('#loseBox').style.display = 'flex';
    $('#loseFace').src = faceOf(second);
    $('#loseName').textContent = nameOf(second);
    $('#loseLine').textContent = second === vainqueur && second !== last
      ? 'Remporte la partie.'
      : (second === ME ? 'Ça arrive.' : (lineFor(second, 'lose') || '...'));
  } else $('#loseBox').style.display = 'none';
  $('#endLabel').textContent = rest.length
    ? 'La main de ' + nameOf(last) + ' — ' + rest.length + ' carte' + (rest.length > 1 ? 's' : '')
    : '';
  const order = (a,b) => (SUITS.indexOf(a.s)-SUITS.indexOf(b.s)) || (RANKS.indexOf(a.r)-RANKS.indexOf(b.r));
  $('#endHand').innerHTML = rest.slice().sort(order).map(c => cardHTML(c)).join('');
  $('#againBtn').disabled = false; $('#againBtn').style.opacity = '1';
  $('#readyInfo').innerHTML = '';
  $('#backBtn').textContent = MATCH.online ? 'Quitter la session' : 'Quitter';
  $('#endScreen').classList.remove('hidden');
  if (MATCH.online) netEndScreen();          // en ligne : système de prêt / revanche
}

function nextStep(){
  if (MATCH.online && !MATCH.host) return;
  if (MATCH.n > 2){
    const fin = MATCH.tour >= MATCH.tours;
    if (fin){
      const top = Math.max(...champs('score').slice(0, MATCH.n));
      const exaequo = seats().filter(p => SG(p).score === top);
      if (exaequo.length > 1){ MATCH.tours++; MATCH.tour++; startManche(); return; }
      if (MATCH.online) return;                  // en ligne, la suite passe par la revanche
      MATCH.tour = 1; MATCH.seats.forEach(s => s.score = 0);
      $('#startScreen').classList.remove('hidden');
      refreshSetup();
      return;
    }
    MATCH.tour++;
  }
  startManche();
}
