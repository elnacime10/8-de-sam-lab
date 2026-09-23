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
/* Le seul endroit qui arrête le réseau et tout ce qui tourne avec. */
function minuteriesVivantes(){
  return [['signal de vie', pingT], ['délai de grâce', graceT], ['phase', phaseT],
          ['chrono hôte', chronoT], ['chrono invité', guestT]]
         .filter(x => x[1]).map(x => x[0]);
}
function closeNet(msg, prevenir){
  annuleVols();
  clearInterval(pingT); pingT = null;
  clearInterval(graceT); graceT = null;
  clearInterval(guestT); guestT = null;
  stopChrono();
  if (prevenir) conns.forEach(c => { try{ c.send({ t:'BYE', msg: msg || '' }); }catch(e){} });
  clearInterval(phaseT); phaseT = null; PHASE = null; GPHASE = null;
  conns.forEach(c => { try{ c.close(); }catch(e){} });
  conns = [];
  try{ if (hostConn) hostConn.close(); }catch(e){}
  hostConn = null;
  if (peer){ try{ peer.destroy(); }catch(e){} peer = null; }
  MATCH.online = false; MATCH.host = false; MATCH.code = '';
  MATCH.seats.forEach(s => { s.conn = false; });
  NET.state = 'off'; lastSeq = 0; lastActSeen = 0; SEQ = 0; jrnVu = 0; midVu = null;
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
    c.on('open', () => {
      /* on n'assoit personne avant de savoir à qui on parle */
      c.attente = setTimeout(() => {
        if (c.seat === undefined){
          try{ c.send({ t:'BYE', msg:"Ton jeu est dans une version trop ancienne. Ferme-le complètement et rouvre-le." }); }catch(e){}
          setTimeout(() => { try{ c.close(); }catch(e){} }, 300);
        }
      }, 4000);
    });
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
    if (!SG(p).human || p === ME || G.in[p] === false) return;
    if (conns.some(c => c.seat === p)) { SG(p).conn = true; return; }
    SG(p).conn = false;
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
  nouveauMatch('hote');                      // un seul point de départ, comme hors ligne
  for (let p = 1; p < MATCH.n; p++){ SG(p).human = true; SG(p).ready = false; }
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
    const tok = (c.metadata && c.metadata.tok) || '';
    /* d'abord la place qui porte son jeton, sinon la première place humaine vacante */
    /* après le tirage au sort, l'hôte peut être à n'importe quel siège : on les parcourt tous */
    const libre = p => p !== ME && G.in[p] && !conns.some(x => x.seat === p && x !== c);
    if (tok) for (let p = 0; p < MATCH.n; p++)
      if (SG(p).tok === tok && libre(p)){ reprise = p; break; }
    if (reprise === undefined) for (let p = 0; p < MATCH.n; p++)
      if (SG(p).human && !SG(p).tok && libre(p)){ reprise = p; break; }
    if (reprise === undefined && !tok) for (let p = 0; p < MATCH.n; p++)
      if (SG(p).human && libre(p)){ reprise = p; break; }
    if (reprise === undefined){ try{ c.send({ t:'STARTED' }); c.close(); }catch(e){} return; }
    c.seat = reprise;
    if (NET.grace) delete NET.grace[reprise];
    SG(reprise).conn = true;
    netBar(nameOf(reprise) + ' est de retour');
    try{ c.send({ t:'SEAT', seat:reprise, match:publicMatch() }); }catch(e){}
    broadcastState();
    return;
  }
  for (let p = 1; p < MATCH.n; p++)
    if (SG(p).human && !conns.some(x => x.seat === p && x !== c)){ c.seat = p; break; }
  if (c.seat === undefined)
    for (let p = 1; p < MATCH.n; p++)
      if (!conns.some(x => x.seat === p && x !== c)){ SG(p).human = true; c.seat = p; break; }
  if (c.seat === undefined){ try{ c.send({ t:'FULL' }); c.close(); }catch(e){} return; }
  if (charTaken(SG(c.seat).char) !== c.seat){
    const libre = CHAR_IDS.find(id => charTaken(id) < 0);
    if (libre) SG(c.seat).char = libre;
  }
  SG(c.seat).ready = false;
  SG(c.seat).conn = true;
  SG(c.seat).tok = (c.metadata && c.metadata.tok) || '';
  try{ c.send({ t:'SEAT', seat:c.seat, match:publicMatch() }); }catch(e){}
  renderLobby(); broadcastLobby();
}

/* Ce que l'hôte publie : les sièges entiers, plus les réglages de la table. */
function publicMatch(){
  return { n:MATCH.n, world:MATCH.world, tours:MATCH.tours, tour:MATCH.tour,
           chrono:MATCH.chrono, code:MATCH.code,
           seats: MATCH.seats.map((s, p) => Object.assign({}, s, {
             tok:'',                                        /* le jeton ne sort jamais de l'hôte */
             conn: p === ME || conns.some(c => c.seat === p)
           })) };
}
/* Côté invité : on remplace ses sièges par ceux de l'hôte. */
function appliqueMatch(m){
  if (!m) return;
  MATCH.n = m.n; MATCH.world = m.world; MATCH.tours = m.tours; MATCH.chrono = m.chrono; MATCH.code = m.code;
  if (m.tour !== undefined) MATCH.tour = m.tour;
  if (Array.isArray(m.seats)) MATCH.seats = m.seats.map(s => Object.assign(siegeNeuf('sam','moyen'), s));
}
function sendHost(o){ if (hostConn && hostConn.open) try{ hostConn.send(o); }catch(e){} }
function broadcastLobby(){ conns.forEach(c => { try{ c.send({ t:'LOBBY', match:publicMatch() }); }catch(e){} }); }
let SEQ = 0;
function broadcastState(){
  if (!G) return;
  G.seq = ++SEQ;                    // continu sur toute la session, jamais remis à zéro
  conns.forEach(c => { try{ c.send({ t:'STATE', seat:c.seat, g:viewFor(c.seat), match:publicMatch(),
    chrono: chronoEnd ? Math.max(0, Math.ceil((chronoEnd - Date.now()) / 1000)) : 0,
    phase: texteRevanche(c.seat) }); }catch(e){} });
}
/* chacun ne reçoit que sa main : les autres sont masquées */
function viewFor(seat){
  const g = JSON.parse(JSON.stringify({
    hands:G.hands, top:G.top, activeSuit:G.activeSuit, freeStart:G.freeStart, dir:G.dir,
    in:G.in, out:G.out, turn:G.turn, pending:G.pending, pendingWinner:G.pendingWinner,
    over:G.over, deckN:G.deck.length, hist:G.hist, moveNo:G.moveNo, winner:G.winner,
    seq:G.seq, actNo:G.actNo, lastAct:G.lastAct, mid:G.mid,
    jrn:(G.jrn || []).slice(-10), chain:CHAINE.slice()
  }));
  if (!G.over) g.hands = g.hands.map((h, p) => p === seat ? h : h.map(() => ({ r:'?', s:'?' })));
  return g;
}

function onHostData(c, d){
  if (!d || !MATCH.host) return;
  if (d.t === 'HELLO'){
    clearTimeout(c.attente);
    if (d.v !== VERSION_PROTO){
      try{ c.send({ t:'BYE', msg:'Versions différentes : l\'hôte est en ' + VERSION_PROTO + ', toi en '
        + (d.v || 'ancienne') + '. Fermez et rouvrez le jeu tous les deux.' }); }catch(e){}
      setTimeout(() => { try{ c.close(); }catch(e){} }, 300);
      return;
    }
    c.version = d.v;
    if (d.tok) c.metadata = Object.assign({}, c.metadata, { tok:d.tok });
    seatFor(c);                                  /* il est des nôtres : on l'assoit */
    return;
  }
  if (c.seat === undefined) return;
  if (d.t === 'PING') return;
  if (d.t === 'CHAR'){
    if (charTaken(d.id) < 0){ SG(c.seat).char = d.id; renderLobby(); broadcastLobby(); }
    else try{ c.send({ t:'CHARNO' }); }catch(e){}
    return;
  }
  if (d.t === 'NAME'){ SG(c.seat).name = String(d.name || '').slice(0, 12); renderLobby(); broadcastLobby(); return; }
  if (d.t === 'READY'){ SG(c.seat).ready = !!d.v; renderLobby(); broadcastLobby(); return; }
  if (d.t === 'NEXT'){ if (PHASE){ PHASE.ready[c.seat] = !!d.v; phaseLastRest = -1; checkPhase(); } return; }
  if (d.t === 'MOVE' && G && !G.over && G.turn === c.seat) applyRemote(c.seat, d);
}
function onPeerGone(c){
  if (!conns.includes(c)) return;
  conns = conns.filter(x => x !== c);
  try{ c.close(); }catch(e){}
  if (c.seat === undefined) return;
  const p = c.seat;
  SG(p).conn = false;
  if (G && !G.over){
    if (!NET.grace) NET.grace = {};
    NET.grace[p] = Date.now();
    netBar(nameOf(p) + ' a perdu la connexion');
    netBar(nameOf(p) + ' est déconnecté — 30 secondes pour revenir', true);
    setTimeout(() => netBar(''), 5000);
    broadcastState();
  } else {
    SG(p).ready = false;
    renderLobby();
    broadcastLobby();
    if (PHASE){ phaseLastRest = -2; checkPhase(); broadcastState(); if (PHASE) netEndScreen(); }
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
  render();
  /* le coup vient du réseau : on l'anime comme s'il était joué ici */
  anime(G.lastAct, () => {
    if (G.lastAct.k === 'play') (G.lastAct.r === 'A' || G.lastAct.r === '9') ? SFX.atk(G.pending ? G.pending.amount : 2) : SFX.play();
    else SFX.draw();
  });
  broadcastState();
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
    hostConn = peer.connect(code.toUpperCase(), { metadata:{ tok: monJeton() } });
    lastHostSeen = Date.now();
    hostConn.on('open', () => {
      NET.state = 'lobby'; lastHostSeen = Date.now(); startPing();
      $('#joinHint').textContent = 'Connecté.';
      sendHost({ t:'HELLO', v:VERSION_PROTO, tok:monJeton() });   /* on annonce sa version */
    });
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
  if (d.t === 'BYE'){ closeNet(d.msg || "L'hôte a fermé la session."); G = null;
    $('#endScreen').classList.add('hidden'); show('homeScreen'); refreshHome(); return; }
  if (d.t === 'CHARNO'){ $('#netHint').textContent = 'Personnage déjà pris.'; return; }
  if (d.t === 'SEAT'){
    ME = d.seat; appliqueMatch(d.match); MATCH.online = true; MATCH.host = false;
    if (!d.jeu){ show('lobbyScreen'); renderLobby(); }
    return;
  }
  if (d.t === 'LOBBY'){ appliqueMatch(d.match); renderLobby(); return; }
  if (d.t === 'STATE'){
    const g = d.g;
    if (g.seq && g.seq <= lastSeq) return;            // message en retard : on ignore
    lastSeq = g.seq || 0;
    appliqueMatch(d.match);
    ME = d.seat;
    const avant = G;
    const monTour = G && G.turn === ME;
    GPHASE = d.phase || null;
    if (Array.isArray(d.g.chain)) CHAINE = d.g.chain.slice();   /* le compteur vient de l'hôte */
    if (g.mid && g.mid !== midVu){ midVu = g.mid; jrnVu = 0; filVide(); }   /* nouvelle manche : on repart à blanc */
    G = Object.assign({}, g, { deck:new Array(g.deckN).fill(0), discard:G ? G.discard : [],
      weak:[{},{},{},{},{}], playedRanks:{}, turnCount:0, stagnant:0, reshuffles:0, minHand:99, totalHands:0 });
    if (G.top) G.discard = [G.top];
    ['homeScreen','joinScreen','startScreen','lobbyScreen'].forEach(x => $('#'+x).classList.add('hidden'));
    /* une nouvelle manche chasse l'écran de fin (c'était le blocage de « rejouer ») */
    if (!g.over) $('#endScreen').classList.add('hidden');
    /* les statistiques de l'invité comptent aussi, une fois par manche */
    if (g.over && g.mid && g.mid !== countedMid && (MATCH.n === 2 || MATCH.tour >= MATCH.tours)){
      countedMid = g.mid; noteResult(classementMatch());
    }
    /* le journal de l'hôte : on affiche les lignes qu'on n'a pas encore vues, dans l'ordre */
    (g.jrn || []).forEach(e => { if (e.n > jrnVu){ jrnVu = e.n; filAjoute(e.p, e.t, e.g, e.h); } });
    sizeUp(); render();
    guestFeedback(g, monTour);
    guestChrono(d.chrono);
    const nouvelleFin = g.over && !(avant && avant.over && avant.mid === g.mid);
    if (nouvelleFin) setTimeout(showEnd, 400);
    else if (g.over) netEndScreen();
    return;
  }
}

let lastSeq = 0, lastActSeen = 0, guestT = null, jrnVu = 0, midVu = null;
/* l'invité ne reçoit qu'un état : il en déduit ce qui vient de se passer */
function guestFeedback(g, monTourAvant){
  const a = g.lastAct;
  if (a && a.n > lastActSeen){
    lastActSeen = a.n;
    const son = () => {
      if (a.k === 'play') (a.r === 'A' || a.r === '9') ? SFX.atk(g.pending ? g.pending.amount : 2) : SFX.play();
      else SFX.draw();
    };
    /* le coup d'un autre joueur s'anime ici comme s'il était joué sur place */
    if (a.p !== ME && anime(a, son)) { /* le son tombera à l'impact */ }
    else son();

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
  if (!SG(p).human) return { txt:'ordinateur', cls:'bot' };
  if (p === ME) return { txt: SG(p).ready ? 'toi · prêt' : 'toi', cls: SG(p).ready ? 'ok' : 'wait' };
  const co = MATCH.host ? conns.some(c => c.seat === p) : SG(p).conn;
  if (!co) return { txt:'en attente', cls:'wait' };
  return SG(p).ready ? { txt:'prêt', cls:'ok' } : { txt:'connecté', cls:'wait' };
}
function charTaken(id){ return champs('char').findIndex((c, i) => c === id && i < MATCH.n); }

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
    if (MATCH.host){ if (charTaken(b.dataset.id) < 0){ SG(ME).char = b.dataset.id; renderLobby(); broadcastLobby(); } }
    else sendHost({ t:'CHAR', id:b.dataset.id });
  }));
  if ($('#pseudo').value !== SG(ME).name) $('#pseudo').value = SG(ME).name || '';

  let h = '';
  for (let p = 0; p < MATCH.n; p++){
    const st = seatState(p);
    const libre = SG(p).human && p !== ME && !(MATCH.host ? conns.some(c => c.seat === p) : SG(p).conn);
    h += `<div class="seatCard"><div class="seatHead">
      <img src="${IMG[SG(p).char]}" alt="">
      <div><div class="sn">${nameOf(p)}</div><div class="sd">Siège ${p+1}${SG(p).human ? '' : ' · ' + SG(p).level}</div></div>
      ${SG(p).human && p !== ME ? `<span class="dotc ${(MATCH.host ? conns.some(c => c.seat === p) : SG(p).conn) ? 'on' : 'wait'}"></span>` : ''}
      ${MATCH.host && p !== ME
        ? `<span class="mini">${libre ? `<button data-bot="${p}">Mettre un ordinateur</button>` : ''}${!SG(p).human ? `<button data-hum="${p}">Libérer</button>` : ''}</span>`
        : `<span class="st ${st.cls}">${st.txt}</span>`}
      </div></div>`;
  }
  $('#lobbySeats').innerHTML = h;
  $('#lobbySeats').querySelectorAll('[data-bot]').forEach(b => b.addEventListener('click', () => {
    SG(+b.dataset.bot).human = false; SG(+b.dataset.bot).ready = true; renderLobby(); broadcastLobby();
  }));
  $('#lobbySeats').querySelectorAll('[data-hum]').forEach(b => b.addEventListener('click', () => {
    SG(+b.dataset.hum).human = true; SG(+b.dataset.hum).ready = false; renderLobby(); broadcastLobby();
  }));

  const pret = seats().every(p => !SG(p).human || p === ME || SG(p).ready);
  $('#launchBtn').style.display = MATCH.host ? 'block' : 'none';
  $('#launchBtn').disabled = !pret || NET.state !== 'lobby';
  $('#launchBtn').textContent = pret ? 'Lancer la partie' : 'En attente des joueurs';
  $('#closeSession').style.display = MATCH.host ? 'block' : 'none';
  $('#readyBtn').style.display = MATCH.host ? 'none' : 'block';
  $('#readyBtn').textContent = SG(ME).ready ? 'Je ne suis plus prêt' : 'Je suis prêt';
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
  SG(ME).name = v;
  if (MATCH.host){ renderLobby(); broadcastLobby(); } else sendHost({ t:'NAME', name:v });
});
$('#readyBtn').addEventListener('click', () => {
  SG(ME).ready = !SG(ME).ready;
  renderLobby();
  sendHost({ t:'READY', v:SG(ME).ready });
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
  MATCH.tour = 1; MATCH.seats.forEach(s => s.score = 0);
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
  if (!MATCH.chrono || !G || G.over || !SG(G.turn).human){
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
      netBar(nameOf(p) + ' : temps écoulé');
      G.pending ? takeHit(p) : drawFree(p);
      render(); broadcastState();
      if (!G.over && isAI(G.turn)) runAI(); else armChrono();
    }
  }, 250);
}


/* ============================================================
   ENTRE DEUX MANCHES : prêt pour le tour suivant, ou revanche.
   Une minute pour répondre. Qui ne répond pas est disqualifié
   (tour suivant) ou laissé de côté (revanche). L'hôte décide seul
   de la fin : s'il refuse la revanche, la session se ferme.
   ============================================================ */
const VERSION_PROTO = '2.0';      /* ce numéro vit dans reseau.js : il décrit CE fichier */
let PHASE = null, GPHASE = null, phaseT = null, phaseLastRest = -1, countedMid = null;
const TOUR_MS = 6000;      // pause entre deux tours, le temps de voir le classement

function monJeton(){
  try {
    let t = localStorage.getItem('sam8_tok');
    if (!t){ t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('sam8_tok', t); }
    return t;
  } catch(e){ return ''; }
}
/* L'hôte calcule ce que CHAQUE joueur doit lire. L'invité ne décide de rien :
   il reçoit un texte de bouton et une ligne d'information, et il les affiche. */
function texteRevanche(seat){
  if (!PHASE || !G || !G.over) return null;
  const hs = seats().filter(p => SG(p).human && !SG(p).dq
                                && (p === ME || conns.some(c => c.seat === p)));
  const pret = p => !!PHASE.ready[p];
  const moi = pret(seat);
  if (PHASE.kind === 'tour'){
    const rest = Math.max(0, Math.ceil((PHASE.fin - Date.now()) / 1000));
    return { k:'tour', actif:false, ready:false, btn:'Tour suivant dans ' + rest + ' s', info:'' };
  }
  const n = hs.filter(pret).length;
  const attendus = hs.filter(p => !pret(p) && p !== seat).length;
  return { k:'revanche', actif:true, ready:moi,
    btn: moi ? (attendus ? 'Revanche acceptée ✓ — en attente' : 'Revanche acceptée ✓') : 'Revanche !',
    info: '<b>' + n + '/' + hs.length + '</b> partants<br>'
        + hs.map(p => (pret(p) ? '✓ ' : '… ') + (p === seat ? 'Toi' : nameOf(p))).join('  ·  ') };
}
function phaseKind(){
  if (MATCH.n <= 2) return 'revanche';
  const vivants = seats().filter(p => !SG(p).dq);
  const top = Math.max(...vivants.map(p => SG(p).score));
  const egalite = vivants.filter(p => SG(p).score === top).length > 1;
  return (MATCH.tour < MATCH.tours || egalite) ? 'tour' : 'revanche';
}
function startPhase(kind){
  /* entre deux tours : on enchaîne tout seul. Revanche : pas de minuteur, on attend les réponses. */
  PHASE = { kind, ready:{}, fin: kind === 'tour' ? Date.now() + TOUR_MS : Infinity };
  phaseLastRest = -1;
  clearInterval(phaseT); phaseT = setInterval(checkPhase, 500);
  checkPhase();
}
function humainsPresents(){
  return seats().filter(p => SG(p).human && !SG(p).dq && (p === ME || conns.some(c => c.seat === p)));
}
function ordisRestants(){ return seats().filter(p => !SG(p).human && !SG(p).dq).length; }
function checkPhase(){
  if (!PHASE) return;
  if (PHASE.kind === 'tour'){
    if (Date.now() >= PHASE.fin){ finishPhase(); return; }
  } else {
    const presents = humainsPresents();
    /* revanche : il faut au moins deux joueurs, ordinateurs compris */
    if (presents.length + ordisRestants() < 2){
      PHASE = null; clearInterval(phaseT); phaseT = null;
      return versAccueil("La revanche n'est plus possible : l'autre joueur est parti.");
    }
    if (presents.every(p => PHASE.ready[p])){ finishPhase(); return; }
  }
  const rest = PHASE.fin === Infinity ? 0 : Math.max(0, Math.ceil((PHASE.fin - Date.now()) / 1000));
  if (rest !== phaseLastRest){
    phaseLastRest = rest;
    broadcastState();
    if (!$('#endScreen').classList.contains('hidden')) netEndScreen();
  }
}
function dropSeat(p, msg){
  conns.filter(c => c.seat === p).forEach(c => {
    conns = conns.filter(x => x !== c);
    c.seat = undefined;                                 /* il ne compte plus nulle part */
    try{ c.send({ t:'BYE', msg }); }catch(e){}
    setTimeout(() => { try{ c.close(); }catch(e){} }, 300);
  });
}
function compactSeats(garder){
  const garde = seats().filter(garder);
  const vers = {}; garde.forEach((anc, nouv) => { vers[anc] = nouv; });
  const restants = MATCH.seats.filter((s, p) => !garde.includes(p));
  MATCH.seats = garde.map(p => MATCH.seats[p]).concat(restants).slice(0, 5);
  MATCH.n = garde.length;
  ME = vers[ME];
  conns.forEach(c => { c.seat = vers[c.seat]; });
  MATCH.seats.forEach((s, p) => { s.dq = false; if (p < MATCH.n) s.ready = true; });
  verifieSieges();
}
function versAccueil(msg){
  closeNet(msg, true); G = null;
  $('#endScreen').classList.add('hidden'); show('homeScreen'); refreshHome();
}
function finishPhase(){
  clearInterval(phaseT); phaseT = null;
  const ph = PHASE; PHASE = null; phaseLastRest = -1;
  const humains = seats().filter(p => SG(p).human && !SG(p).dq);
  const absents = humains.filter(p => !ph.ready[p]);
  $('#endScreen').classList.add('hidden');
  if (ph.kind === 'tour'){ nextStep(); return; }
  if (!ph.ready[ME]) return versAccueil('Session fermée : pas de revanche.');
  absents.forEach(p => dropSeat(p, 'La revanche se joue sans toi.'));
  compactSeats(p => !SG(p).dq && (!SG(p).human || !absents.includes(p)));
  if (MATCH.n < 2) return versAccueil('Personne pour la revanche.');
  MATCH.tour = 1; MATCH.seats.forEach(s => s.score = 0);
  conns.forEach(c => { try{ c.send({ t:'SEAT', seat:c.seat, match:publicMatch(), jeu:true }); }catch(e){} });
  startManche();
}

/* l'écran de fin, en ligne : bouton de prêt, compte à rebours, qui est prêt */
function netEndScreen(){
  if (MATCH.host && !PHASE && G && G.over){ startPhase(phaseKind()); return; }
  const ph = MATCH.host ? texteRevanche(ME) : GPHASE;
  const btn = $('#againBtn'), info = $('#readyInfo');
  if (!btn) return;
  if (!ph){
    btn.disabled = true; btn.style.opacity = '.35';
    btn.textContent = "En attente de l'hôte…";
    if (info) info.innerHTML = '';
    return;
  }
  btn.textContent = ph.btn;                 /* le texte d'abord : rien ne peut le laisser périmé */
  btn.disabled = !ph.actif;
  btn.style.opacity = ph.actif ? '1' : '.5';
  if (info) info.innerHTML = ph.info || '';
}
function netReadyClick(){
  if (MATCH.host){
    if (!PHASE || PHASE.kind === 'tour') return;
    
    PHASE.ready[ME] = !PHASE.ready[ME];
    phaseLastRest = -1; checkPhase();
    if (PHASE) netEndScreen();
    return;
  }
  if (!GPHASE || !GPHASE.actif) return;
  const v = !GPHASE.ready;
  GPHASE.ready = v;                          /* affichage immédiat, l'hôte confirmera */
  GPHASE.btn = v ? 'Revanche acceptée ✓ — en attente' : 'Revanche !';
  sendHost({ t:'NEXT', v });
  netEndScreen();
}
