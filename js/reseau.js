/* Le 8 de SAM — js/reseau.js
   Multijoueur en ligne et chrono partagé. */

/* ============================================================
   RÉSEAU (PeerJS) — l'hôte fait autorité, il diffuse l'état complet.
   Ne fonctionne PAS depuis claude.ai (scripts externes bloqués) :
   il faut héberger le fichier (GitHub Pages, Netlify...).
   ============================================================ */
let peer = null, conns = [], hostConn = null;
let pingT = null, lastHostSeen = 0, graceT = null;
const NET = { state:'off' };          // off · opening · lobby · playing · dead
const netOK = () => typeof Peer !== 'undefined';
const HEARTBEAT = 2000, TIMEOUT = 8000, GRACE = 30000;

function code4(){
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '8'; for (let i = 0; i < 4; i++) c += L[Math.floor(Math.random()*L.length)];
  return c;
}
function netBar(txt, info){
  const b = $('#netBar');
  if (!txt){ b.classList.add('hidden'); return; }
  $('#netBarTxt').textContent = txt;
  b.classList.toggle('info', !!info);
  b.classList.remove('hidden');
}

/* UN SEUL point de sortie : on ferme tout, toujours, sans condition. */
function closeNet(msg, prevenir){
  clearInterval(pingT); pingT = null;
  clearInterval(graceT); graceT = null;
  stopChrono();
  if (prevenir) conns.forEach(c => { try{ c.send({ t:'BYE' }); }catch(e){} });
  conns.forEach(c => { try{ c.close(); }catch(e){} });
  conns = [];
  try{ if (hostConn) hostConn.close(); }catch(e){}
  hostConn = null;
  if (peer){ try{ peer.destroy(); }catch(e){} peer = null; }
  MATCH.online = false; MATCH.host = false; MATCH.code = '';
  MATCH.conn = [false,false,false,false,false];
  NET.state = 'off'; lastSeq = 0; lastActSeen = 0; SEQ = 0;
  ME = 0;
  netBar(msg || '', true);
  if (msg) setTimeout(() => netBar(''), 6000);
}

/* UN SEUL point d'entrée : il commence toujours par fermer. */
function openNet(essai){
  if (!essai){ closeNet('', true); MATCH.online = true; MATCH.host = true; ME = 0; }
  NET.state = 'opening';
  MATCH.code = '';
  renderLobby();
  try {
    peer = new Peer(code4());
  } catch(e){ NET.state = 'dead'; $('#netHint').textContent = 'Réseau indisponible.'; return; }
  const delai = setTimeout(() => {
    if (NET.state === 'opening'){
      NET.state = 'dead';
      $('#netHint').textContent = "Pas de réponse du réseau. Ici le multijoueur est bloqué : héberge le fichier (GitHub Pages, Netlify) pour jouer en ligne.";
      renderLobby();
    }
  }, 8000);
  peer.on('open', id => {
    clearTimeout(delai);
    MATCH.code = id; NET.state = 'lobby';
    $('#netHint').textContent = 'Salon ouvert. Partage le lien.';
    renderLobby(); startPing();
  });
  peer.on('error', e => {
    const t = e && e.type;
    if (t === 'unavailable-id' && (essai || 0) < 5){
      try{ peer.destroy(); }catch(_){}
      peer = null; openNet((essai || 0) + 1); return;
    }
    if (t === 'peer-unavailable'){ $('#joinHint').textContent = "Ce code n'existe pas ou le salon est fermé."; return; }
    NET.state = 'dead';
    $('#netHint').textContent = "Réseau indisponible (" + (t || 'erreur') + "). Réessaie.";
    renderLobby();
  });
  peer.on('disconnected', () => { try{ peer.reconnect(); }catch(e){} });
  peer.on('connection', c => {
    if (!MATCH.host){ try{ c.close(); }catch(e){} return; }
    conns.push(c);
    c.seen = Date.now();
    c.on('open', () => seatFor(c));
    c.on('data', d => { c.seen = Date.now(); onHostData(c, d); });
    c.on('close', () => onPeerGone(c));
    c.on('error', () => onPeerGone(c));
  });
}

/* signal de vie : c'est lui qui rattrape les déconnexions silencieuses */
function startPing(){
  clearInterval(pingT);
  pingT = setInterval(() => {
    const now = Date.now();
    if (MATCH.host){
      conns.forEach(c => { try{ c.send({ t:'PING' }); }catch(e){} });
      conns.slice().forEach(c => { if (now - (c.seen || 0) > TIMEOUT) onPeerGone(c); });
      checkGrace();
    } else {
      try{ if (hostConn && hostConn.open) hostConn.send({ t:'PING' }); }catch(e){}
      if (lastHostSeen && now - lastHostSeen > TIMEOUT) hostLost();
    }
  }, HEARTBEAT);
}
function hostLost(){
  closeNet("L'hôte a quitté : la partie est terminée.");
  show('homeScreen');
  refreshHome();
}

/* délai de grâce : 30 secondes pour revenir avant d'être disqualifié */
function checkGrace(){
  if (!G || G.over) return;
  const now = Date.now();
  seats().forEach(p => {
    if (!MATCH.human[p] || p === ME || G.in[p] === false) return;
    if (conns.some(c => c.seat === p)) { MATCH.conn[p] = true; return; }
    MATCH.conn[p] = false;
    if (!NET.grace) NET.grace = {};
    if (!NET.grace[p]) NET.grace[p] = now;
    else if (now - NET.grace[p] > GRACE){
      delete NET.grace[p];
      disqualify(p, 'absent');
      broadcastState();
    } else if (G.turn === p){
      G.pending ? takeHit(p) : drawFree(p);     // on joue à sa place pour ne pas bloquer
      render(); broadcastState();
      if (!G.over && G.turn !== ME && isAI(G.turn)) runAI(); else armChrono();
    }
  });
}

function openLobby(){
  MATCH.host = true; MATCH.online = true; ME = 0;
  MATCH.ready = [true,false,false,false,false];
  for (let p = 1; p < MATCH.n; p++){ MATCH.human[p] = true; MATCH.ready[p] = false; }
  show('lobbyScreen');
  if (!netOK()){
    $('#netHint').textContent = "Le mode en ligne a besoin d'un hébergement. Depuis claude.ai il est bloqué.";
    renderLobby(); return;
  }
  openNet();
}

/* Première place libre. Si la partie est lancée, on rend sa place à celui qui revient. */
function seatFor(c){
  if (G && !G.over){
    let reprise;
    for (let p = 1; p < MATCH.n; p++)
      if (MATCH.human[p] && G.in[p] && !conns.some(x => x.seat === p && x !== c)){ reprise = p; break; }
    if (reprise === undefined){ try{ c.send({ t:'STARTED' }); c.close(); }catch(e){} return; }
    c.seat = reprise;
    if (NET.grace) delete NET.grace[reprise];
    MATCH.conn[reprise] = true;
    flash(nameOf(reprise) + ' est de retour');
    try{ c.send({ t:'SEAT', seat:reprise, match:publicMatch() }); }catch(e){}
    broadcastState();
    return;
  }
  for (let p = 1; p < MATCH.n; p++)
    if (MATCH.human[p] && !conns.some(x => x.seat === p && x !== c)){ c.seat = p; break; }
  if (c.seat === undefined)
    for (let p = 1; p < MATCH.n; p++)
      if (!conns.some(x => x.seat === p && x !== c)){ MATCH.human[p] = true; c.seat = p; break; }
  if (c.seat === undefined){ try{ c.send({ t:'FULL' }); c.close(); }catch(e){} return; }
  if (charTaken(MATCH.chars[c.seat]) !== c.seat){
    const libre = CHAR_IDS.find(id => charTaken(id) < 0);
    if (libre) MATCH.chars[c.seat] = libre;
  }
  MATCH.ready[c.seat] = false;
  MATCH.conn[c.seat] = true;
  try{ c.send({ t:'SEAT', seat:c.seat, match:publicMatch() }); }catch(e){}
  renderLobby(); broadcastLobby();
}

function publicMatch(){
  return { n:MATCH.n, chars:MATCH.chars.slice(), levels:MATCH.levels.slice(), human:MATCH.human.slice(),
           names:MATCH.names.slice(), ready:MATCH.ready.slice(),
           conn: seats().map(p => p === 0 || conns.some(c => c.seat === p)),
           world:MATCH.world, tours:MATCH.tours, chrono:MATCH.chrono, code:MATCH.code };
}
function sendHost(o){ if (hostConn && hostConn.open) try{ hostConn.send(o); }catch(e){} }
function broadcastLobby(){ conns.forEach(c => { try{ c.send({ t:'LOBBY', match:publicMatch() }); }catch(e){} }); }
let SEQ = 0;
function broadcastState(){
  if (!G) return;
  G.seq = ++SEQ;                    // continu sur toute la session, jamais remis à zéro
  conns.forEach(c => { try{ c.send({ t:'STATE', seat:c.seat, g:viewFor(c.seat), match:publicMatch(),
    scores:MATCH.scores, session:MATCH.session, tour:MATCH.tour, matches:MATCH.matches,
    chrono: chronoEnd ? Math.max(0, Math.ceil((chronoEnd - Date.now()) / 1000)) : 0 }); }catch(e){} });
}
/* chacun ne reçoit que sa main : les autres sont masquées */
function viewFor(seat){
  const g = JSON.parse(JSON.stringify({
    hands:G.hands, top:G.top, activeSuit:G.activeSuit, freeStart:G.freeStart, dir:G.dir,
    in:G.in, out:G.out, turn:G.turn, pending:G.pending, pendingWinner:G.pendingWinner,
    over:G.over, deckN:G.deck.length, hist:G.hist, moveNo:G.moveNo, winner:G.winner,
    seq:G.seq, actNo:G.actNo, lastAct:G.lastAct
  }));
  g.hands = g.hands.map((h, p) => p === seat ? h : h.map(() => ({ r:'?', s:'?' })));
  return g;
}

function onHostData(c, d){
  if (!d || !MATCH.host || c.seat === undefined) return;
  if (d.t === 'PING') return;
  if (d.t === 'CHAR'){
    if (charTaken(d.id) < 0){ MATCH.chars[c.seat] = d.id; renderLobby(); broadcastLobby(); }
    else try{ c.send({ t:'CHARNO' }); }catch(e){}
    return;
  }
  if (d.t === 'NAME'){ MATCH.names[c.seat] = String(d.name || '').slice(0, 12); renderLobby(); broadcastLobby(); return; }
  if (d.t === 'READY'){ MATCH.ready[c.seat] = !!d.v; renderLobby(); broadcastLobby(); return; }
  if (d.t === 'MOVE' && G && !G.over && G.turn === c.seat) applyRemote(c.seat, d);
}
function onPeerGone(c){
  if (!conns.includes(c)) return;
  conns = conns.filter(x => x !== c);
  try{ c.close(); }catch(e){}
  if (c.seat === undefined) return;
  const p = c.seat;
  MATCH.conn[p] = false;
  if (G && !G.over){
    if (!NET.grace) NET.grace = {};
    NET.grace[p] = Date.now();
    flash(nameOf(p) + ' a perdu la connexion', true);
    netBar(nameOf(p) + ' est déconnecté — 30 secondes pour revenir', true);
    setTimeout(() => netBar(''), 5000);
    broadcastState();
  } else {
    MATCH.ready[p] = false;
    renderLobby();
    broadcastLobby();
  }
}

/* un coup reçu d'un joueur distant, rejoué par l'hôte qui fait autorité */
function applyRemote(seat, d){
  stopChrono();
  if (d.a === 'draw'){ G.pending ? takeHit(seat) : drawFree(seat); }
  else if (d.a === 'play'){
    const i = G.hands[seat].findIndex(c => c.r === d.r && c.s === d.s);
    if (i < 0) return;
    if (!playable(G.hands[seat][i])) return;
    playCard(seat, i, d.suit);
  }
  render(); broadcastState();
  if (!G.over && G.turn !== ME && isAI(G.turn)) runAI(); else armChrono();
}

/* côté invité : on n'exécute aucune règle, on affiche ce que l'hôte envoie */
function joinGame(code){
  if (!netOK()) return;
  closeNet('', false);
  MATCH.host = false; MATCH.online = true; NET.state = 'opening';
  try { peer = new Peer(); } catch(e){ $('#joinHint').textContent = 'Réseau indisponible.'; return; }
  let fait = false;
  const go = () => {
    if (fait) return; fait = true;
    hostConn = peer.connect(code.toUpperCase());
    lastHostSeen = Date.now();
    hostConn.on('open', () => { NET.state = 'lobby'; lastHostSeen = Date.now(); startPing(); $('#joinHint').textContent = 'Connecté.'; });
    hostConn.on('data', d => onGuestData(d));
    hostConn.on('close', () => { if (MATCH.online && !MATCH.host) hostLost(); });
    hostConn.on('error', () => { if (MATCH.online && !MATCH.host) hostLost(); });
  };
  peer.on('open', go);
  peer.on('error', e => {
    const t = e && e.type;
    $('#joinHint').textContent = t === 'peer-unavailable'
      ? "Ce code n'existe pas ou le salon est fermé." : 'Réseau : ' + (t || 'erreur') + '.';
  });
  setTimeout(() => { if (!hostConn) $('#joinHint').textContent = 'Pas de réponse. Vérifie le code.'; }, 9000);
}

function onGuestData(d){
  if (!d) return;
  lastHostSeen = Date.now();
  if (d.t === 'PING') return;
  if (d.t === 'FULL'){ $('#joinHint').textContent = 'Salon complet.'; return; }
  if (d.t === 'STARTED'){ $('#joinHint').textContent = 'La partie a déjà commencé.'; return; }
  if (d.t === 'BYE'){ closeNet("L'hôte a fermé la session."); show('homeScreen'); refreshHome(); return; }
  if (d.t === 'CHARNO'){ $('#netHint').textContent = 'Personnage déjà pris.'; return; }
  if (d.t === 'SEAT'){
    ME = d.seat; Object.assign(MATCH, d.match); MATCH.online = true; MATCH.host = false;
    show('lobbyScreen'); renderLobby(); return;
  }
  if (d.t === 'LOBBY'){ Object.assign(MATCH, d.match); renderLobby(); return; }
  if (d.t === 'STATE'){
    const g = d.g;
    if (g.seq && g.seq <= lastSeq) return;            // message en retard : on ignore
    lastSeq = g.seq || 0;
    Object.assign(MATCH, d.match);
    MATCH.scores = d.scores; MATCH.session = d.session; MATCH.tour = d.tour;
    if (d.matches !== undefined) MATCH.matches = d.matches;
    ME = d.seat;
    const monTour = G && G.turn === ME;
    G = Object.assign({}, g, { deck:new Array(g.deckN).fill(0), discard:G ? G.discard : [],
      weak:[{},{},{},{},{}], playedRanks:{}, turnCount:0, stagnant:0, reshuffles:0, minHand:99, totalHands:0 });
    if (G.top) G.discard = [G.top];
    ['homeScreen','joinScreen','startScreen','lobbyScreen'].forEach(x => $('#'+x).classList.add('hidden'));
    sizeUp(); render();
    guestFeedback(g, monTour);
    guestChrono(d.chrono);
    if (g.over) setTimeout(showEnd, 400);
    return;
  }
}

let lastSeq = 0, lastActSeen = 0, guestT = null;
/* l'invité ne reçoit qu'un état : il en déduit ce qui vient de se passer */
function guestFeedback(g, monTourAvant){
  const a = g.lastAct;
  if (a && a.n > lastActSeen){
    lastActSeen = a.n;
    if (a.k === 'play'){
      (a.r === 'A' || a.r === '9') ? SFX.atk(g.pending ? g.pending.amount : 2) : SFX.play();
      if (a.p !== ME){
        if (a.r === 'A' || a.r === '9') bubble(a.p, 'atk');
        else if (G.hands[ME].length === 1) bubble(a.p, 'low');
      }
    } else { SFX.draw(); if (a.p !== ME && a.k === 'take') bubble(a.p, 'hit'); }
  }
  if (G.turn === ME && !monTourAvant && !G.over) SFX.mine();
}
function guestChrono(n){
  clearInterval(guestT); guestT = null;
  const el = $('#chrono');
  if (!n || !G || G.over){ el.classList.add('hidden'); return; }
  /* on ne compare jamais deux horloges, seulement des durées */
  const fin = Date.now() + n * 1000;
  let vu = -1;
  const maj = () => {
    const reste = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    if (reste !== vu){
      vu = reste;
      el.textContent = reste;
      el.classList.toggle('hot', reste <= 10);
    }
    if (reste <= 0){ clearInterval(guestT); guestT = null; }
  };
  el.classList.remove('hidden');
  maj();
  guestT = setInterval(maj, 250);
}

function sendMove(o){ if (hostConn && hostConn.open) try{ hostConn.send(Object.assign({ t:'MOVE' }, o)); }catch(e){} }

function seatState(p){
  if (!MATCH.human[p]) return { txt:'ordinateur', cls:'bot' };
  if (p === ME) return { txt: MATCH.ready[p] ? 'toi · prêt' : 'toi', cls: MATCH.ready[p] ? 'ok' : 'wait' };
  const co = MATCH.host ? conns.some(c => c.seat === p) : MATCH.conn[p];
  if (!co) return { txt:'en attente', cls:'wait' };
  return MATCH.ready[p] ? { txt:'prêt', cls:'ok' } : { txt:'connecté', cls:'wait' };
}
function charTaken(id){ return MATCH.chars.findIndex((c, i) => c === id && i < MATCH.n); }

function renderLobby(){
  $('#codeVal').textContent = MATCH.code || (NET.state === 'opening' ? '…' : '----');
  $('#codeBox').style.display = MATCH.host ? 'flex' : 'none';
  $('#lobbySub').textContent = MATCH.host
    ? "Partage le lien. Tu lances quand toutes les places sont prises."
    : "Choisis ton personnage puis mets-toi prêt.";

  // mon personnage : ceux déjà pris sont grisés
  const f = $('#lobbyFaces');
  f.innerHTML = CHAR_IDS.map(id => {
    const pris = charTaken(id);
    const moi = pris === ME;
    return `<button class="fbtn${moi ? ' on' : ''}" data-id="${id}"${pris >= 0 && !moi ? ' disabled' : ''}>
      <img src="${IMG[id]}" alt=""><b>${CHARS[id].nom}</b></button>`;
  }).join('');
  f.querySelectorAll('.fbtn:not([disabled])').forEach(b => b.addEventListener('click', () => {
    if (MATCH.host){ if (charTaken(b.dataset.id) < 0){ MATCH.chars[ME] = b.dataset.id; renderLobby(); broadcastLobby(); } }
    else sendHost({ t:'CHAR', id:b.dataset.id });
  }));
  if ($('#pseudo').value !== MATCH.names[ME]) $('#pseudo').value = MATCH.names[ME] || '';

  let h = '';
  for (let p = 0; p < MATCH.n; p++){
    const st = seatState(p);
    const libre = MATCH.human[p] && p !== ME && !(MATCH.host ? conns.some(c => c.seat === p) : MATCH.conn[p]);
    h += `<div class="seatCard"><div class="seatHead">
      <img src="${IMG[MATCH.chars[p]]}" alt="">
      <div><div class="sn">${nameOf(p)}</div><div class="sd">Siège ${p+1}${MATCH.human[p] ? '' : ' · ' + MATCH.levels[p]}</div></div>
      ${MATCH.human[p] && p !== ME ? `<span class="dotc ${(MATCH.host ? conns.some(c => c.seat === p) : MATCH.conn[p]) ? 'on' : 'wait'}"></span>` : ''}
      ${MATCH.host && p !== ME
        ? `<span class="mini">${libre ? `<button data-bot="${p}">Mettre un ordinateur</button>` : ''}${!MATCH.human[p] ? `<button data-hum="${p}">Libérer</button>` : ''}</span>`
        : `<span class="st ${st.cls}">${st.txt}</span>`}
      </div></div>`;
  }
  $('#lobbySeats').innerHTML = h;
  $('#lobbySeats').querySelectorAll('[data-bot]').forEach(b => b.addEventListener('click', () => {
    MATCH.human[+b.dataset.bot] = false; MATCH.ready[+b.dataset.bot] = true; renderLobby(); broadcastLobby();
  }));
  $('#lobbySeats').querySelectorAll('[data-hum]').forEach(b => b.addEventListener('click', () => {
    MATCH.human[+b.dataset.hum] = true; MATCH.ready[+b.dataset.hum] = false; renderLobby(); broadcastLobby();
  }));

  const pret = seats().every(p => !MATCH.human[p] || p === ME || MATCH.ready[p]);
  $('#launchBtn').style.display = MATCH.host ? 'block' : 'none';
  $('#launchBtn').disabled = !pret || NET.state !== 'lobby';
  $('#launchBtn').textContent = pret ? 'Lancer la partie' : 'En attente des joueurs';
  $('#closeSession').style.display = MATCH.host ? 'block' : 'none';
  $('#readyBtn').style.display = MATCH.host ? 'none' : 'block';
  $('#readyBtn').textContent = MATCH.ready[ME] ? 'Je ne suis plus prêt' : 'Je suis prêt';
}

function shareLink(){
  const base = location.href.split('#')[0].split('?')[0];
  return base + '#p=' + MATCH.code;
}
$('#copyCode').addEventListener('click', async () => {
  const lien = shareLink();
  try {
    if (navigator.share) { await navigator.share({ title:'Le 8 de SAM', text:'Rejoins la partie', url:lien }); return; }
    await navigator.clipboard.writeText(lien);
    $('#netHint').textContent = 'Lien copié.';
  } catch(e){ $('#netHint').textContent = lien; }
});
$('#pseudo').addEventListener('change', () => {
  const v = $('#pseudo').value.trim().slice(0, 12);
  MATCH.names[ME] = v;
  if (MATCH.host){ renderLobby(); broadcastLobby(); } else sendHost({ t:'NAME', name:v });
});
$('#readyBtn').addEventListener('click', () => {
  MATCH.ready[ME] = !MATCH.ready[ME];
  renderLobby();
  sendHost({ t:'READY', v:MATCH.ready[ME] });
});
$('#netBarBtn').addEventListener('click', () => {
  closeNet('', MATCH.host); G = null; netBar(''); show('homeScreen'); refreshHome();
});
$('#lobbyBack').addEventListener('click', () => {
  closeNet(MATCH.host ? 'Session fermée.' : 'Tu as quitté le salon.', MATCH.host);
  show('homeScreen'); refreshHome();
});
$('#closeSession').addEventListener('click', () => {
  closeNet('Session fermée.', true);
  show('homeScreen'); refreshHome();
});
$('#launchBtn').addEventListener('click', () => {
  if (!MATCH.host) return;
  shuffleSeats();
  conns.forEach(c => { try{ c.send({ t:'SEAT', seat:c.seat, match:publicMatch() }); }catch(e){} });
  $('#lobbyScreen').classList.add('hidden');
  MATCH.tour = 1; MATCH.scores = [0,0,0,0,0];
  startManche();
});

/* ============================================================
   CHRONO
   ============================================================ */
let chronoT = null, chronoLeft = 0, chronoEnd = 0, chronoSync = 0;

function stopChrono(){
  clearInterval(chronoT); chronoT = null;
  chronoLeft = 0; chronoEnd = 0;
  $('#chrono').classList.add('hidden');
}

/* On mémorise l'instant de fin et on recalcule à chaque battement.
   Un téléphone mis en veille rattrape donc son retard d'un coup
   au lieu de dériver : c'est ce qui désynchronisait les écrans. */
function armChrono(){
  stopChrono();
  if (!MATCH.online || !MATCH.host){ return; }
  if (!MATCH.chrono || !G || G.over || !MATCH.human[G.turn]){
    broadcastState();                         // on annonce aussi l'absence de chrono
    return;
  }
  chronoEnd = Date.now() + MATCH.chrono * 1000;
  chronoLeft = MATCH.chrono;
  const el = $('#chrono');
  el.classList.remove('hidden');
  el.textContent = chronoLeft;
  el.classList.remove('hot');
  broadcastState();                           // la bonne valeur part MAINTENANT
  chronoSync = Date.now();
  chronoT = setInterval(() => {
    const reste = Math.max(0, Math.ceil((chronoEnd - Date.now()) / 1000));
    if (reste !== chronoLeft){
      chronoLeft = reste;
      el.textContent = reste;
      el.classList.toggle('hot', reste <= 10);
    }
    if (Date.now() - chronoSync > 5000){      // recalage régulier des invités
      chronoSync = Date.now();
      broadcastState();
    }
    if (reste <= 0){
      const p = G.turn;
      stopChrono();
      flash(nameOf(p) + ' : temps écoulé, pioche', true);
      G.pending ? takeHit(p) : drawFree(p);
      render(); broadcastState();
      if (!G.over && isAI(G.turn)) runAI(); else armChrono();
    }
  }, 250);
}
