/* Le 8 de SAM — js/moteur.js
   LES RÈGLES. Ne connaît ni l'écran, ni le réseau, ni le son. */

/* ============================================================
   2 · MOTEUR
   ============================================================ */
const SUITS = ['H','S','C','D'];
const SUIT_CHAR = { H:'♥', S:'♠', C:'♣', D:'♦' };
const SUIT_NAME = { H:'cœur', S:'pique', C:'trèfle', D:'carreau' };
/* couleurs de halo : lisibles d'un coup d'œil, une par enseigne */
const SUIT_COL = { H:'#F2675C', S:'#8FB9E8', C:'#79C074', D:'#F0A24E' };
const RANKS = ['2','3','4','5','6','7','8','9','10','V','D','R','A'];
const isRed = s => s === 'H' || s === 'D';
let ME = 0;                       // mon siège (0 en local, variable en ligne)

const MATCH = {
  n:2,
  levels : ['difficile','difficile','moyen','moyen','facile'],
  chars  : ['nacime','sam','mehmet','hamza','yuns'],
  human  : [true,false,false,false,false],
  names  : ['','','','',''],          // pseudo réseau, vide = nom du personnage
  ready  : [true,false,false,false,false],
  conn   : [false,false,false,false,false],   // vu par l'invité
  world:'quartier', tours:1, tour:1,
  scores  : [0,0,0,0,0],              // points du match en cours
  session : [0,0,0,0,0],              // cumul de la soirée
  matches : 0,
  chrono:0,                           // 0 = illimité, sinon secondes
  online:false, host:false, code:'',
  nextChooser:undefined,
  dq  : [false,false,false,false,false],   // disqualifiés : ne jouent plus jusqu'à la fin du match
  tok : ['','','','','']                    // jeton de reconnexion (hôte seulement)
};
/* nombre de joueurs encore dans le match */
function activeN(){ return seats().filter(p => !MATCH.dq[p]).length; }
/* 8 cartes jusqu'à 3 joueurs, une de moins par joueur au-delà */
function handSize(n){ return n <= 3 ? 8 : (n === 4 ? 7 : 6); }
/* barème symétrique : à 4 -> +2 +1 -1 -2 ; à 5 -> +2 +1 0 -1 -2 */
function pointsFor(n){
  const k = Math.floor(n / 2), out = [];
  for (let v = k; v >= -k; v--){ if (v === 0 && n % 2 === 0) continue; out.push(v); }
  return out;
}
const isAI = p => !MATCH.human[p];
let G = null, sortMode = 'suit', selected = -1, busy = false, pending8 = -1, skipAll = false;


function newDeck(){
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  return shuffle(d);
}
function shuffle(d){
  for (let i = d.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
  return d;
}
function countIn(){ return seats().filter(p => G.in[p]).length; }
function nextSeat(p){
  let q = p;
  for (let k = 0; k < MATCH.n; k++){
    q = (q + G.dir + MATCH.n) % MATCH.n;
    if (G.in[q]) return q;
  }
  return p;
}
/* le mode duel : 2 joueurs encore en lice -> le 7 et le valet font rejouer */
const duel = () => countIn() <= 2;

function newManche(){
  G = {
    deck:newDeck(), discard:[], hands:[], top:null, activeSuit:null, freeStart:false,
    dir:1, in:[], out:[], turn:ME, pending:null, pendingWinner:null, openingExtra:null,
    over:false, fast:false, autoAll:false,
    turnCount:0, minHand:99, totalHands:0, stagnant:0, reshuffles:0,
    weak:[], playedRanks:{}, hist:[], moveNo:0, seq:0, actNo:0, lastAct:null
  };
  for (const p of seats()){ G.hands[p] = []; G.in[p] = !MATCH.dq[p]; G.weak[p] = {H:0,S:0,C:0,D:0}; }
  G.mid = Date.now() + Math.random();         // identifiant unique de la manche
  const nc = handSize(activeN());
  for (let i = 0; i < nc; i++) for (const p of seats()) if (G.in[p]) G.hands[p].push(G.deck.pop());
  G.minHand = nc;
  G.totalHands = nc * activeN();
  selected = -1; skipAll = false;
}

function refill(){
  if (G.deck.length || !G.discard.length) return;
  G.deck = shuffle(G.discard.slice());
  G.discard = [];
  G.reshuffles++;
  flash('Pioche remélangée');
}
function draw(p, n){
  let got = 0;
  for (let i = 0; i < n; i++){
    refill();
    if (!G.deck.length) break;
    G.hands[p].push(G.deck.pop());
    got++;
  }
  return got;
}

function playable(c){
  if (G.pending) return c.r === G.pending.type;
  if (G.freeStart) return true;
  if (!G.top) return false;
  return c.r === '8' || c.s === G.activeSuit || c.r === G.top.r;
}
const hasPlayable = p => G.hands[p].some(playable);

/* pourquoi une carte est refusée */
function whyNot(){
  if (G.pending) return 'Sous attaque : il faut ' + (G.pending.type === 'A' ? 'un as' : 'un 9') + ' ou encaisser.';
  if (!G.top) return '';
  return 'Il faut du ' + SUIT_CHAR[G.activeSuit] + ', un ' + G.top.r + ' ou un 8.';
}

function forbiddenFinish(r){ return duel() ? isChain(r) : r === '10'; }
function replayCard(r){ return duel() ? isChain(r) : r === '10'; }

function playCard(p, idx, suitChoice){
  const c = G.hands[p].splice(idx, 1)[0];
  G.actNo++; G.lastAct = { n:G.actNo, p, k:'play', r:c.r, s:c.s };
  G.discard.push(c);
  G.top = c; G.activeSuit = c.s; G.freeStart = false;
  G.playedRanks[c.r] = (G.playedRanks[c.r] || 0) + 1;
  if (G.weak[p]) G.weak[p][c.s] = Math.max(0, G.weak[p][c.s] - 2);
  G.moveNo++;
  G.hist.unshift({ n:G.moveNo, r:c.r, s:c.s, p });
  if (G.hist.length > CONFIG.histMax) G.hist.pop();

  const counter = !!G.pending;
  let replay = false, skip = false;

  if (counter){
    if (c.r === 'A') G.pending.amount += 2; else G.pending.amount = 1;
    G.pending.type = c.r; G.pending.by = p;
    G.pending.target = nextSeat(p);
  } else {
    switch (c.r){
      case 'A': G.pending = { type:'A', amount:2, by:p, target:nextSeat(p) }; break;
      case '9': G.pending = { type:'9', amount:1, by:p, target:nextSeat(p) }; break;
      case 'V': if (duel()) replay = true; else { G.dir *= -1; G.lastAct.rev = true; } break;
      case '7': if (duel()) replay = true; else { skip = true; G.lastAct.skip = nextSeat(p); } break;
      case '10': replay = true; break;
      case '8': if (G.hands[p].length || MATCH.n > 2) G.activeSuit = suitChoice || c.s; break;
    }
  }

  if (c.r === '8') G.lastAct.suit = G.activeSuit;     // pour l'annonce : couleur demandée
  if (G.pending) G.lastAct.amt = G.pending.amount;     // et montant de l'attaque

  /* fin de main */
  if (G.hands[p].length === 0){
    if (forbiddenFinish(c.r)){
      draw(p, 1);
      flash(nameOf(p) + ' finit sur un ' + c.r + ' : repioche', true);
      advance(p, false);
      return;
    }
    if (G.pending){ G.pendingWinner = p; G.turn = G.pending.target; return; }
    goOut(p);
    if (!G.over) advance(p, skip);   // la main passe au suivant, le sortant est sauté
    return;
  }

  if (G.pending){ G.turn = G.pending.target; return; }
  if (!replay && G.openingExtra === p){ replay = true; G.openingExtra = null; }
  if (!replay) advance(p, skip);
}

function advance(p, skip){
  G.openingExtra = null;
  let q = nextSeat(p);
  if (skip) q = nextSeat(q);
  G.turn = q;
  if (q === ME) tick();
}

/* Lecture publique du jeu des autres : il pioche sur une couleur -> il ne l'a pas.
   Il en pose une -> le doute retombe. */
function noteDraw(p){ if (G.activeSuit && G.weak[p]) G.weak[p][G.activeSuit] = Math.min(6, G.weak[p][G.activeSuit] + 1); }
function weakOf(p, s){ return (G.weak[p] && G.weak[p][s]) || 0; }

function takeHit(q){
  const amt = G.pending ? G.pending.amount : 1;
  G.actNo++; G.lastAct = { n:G.actNo, p:q, k:'take', amt };
  const got = draw(q, amt);
  noteDraw(q);
  const w = G.pendingWinner;
  G.pending = null; G.pendingWinner = null;
  flash(nameOf(q) + ' encaisse ' + got, true);
  if (w !== null && w !== q) goOut(w);
  if (G.over) return got;
  G.turn = nextSeat(q);
  if (G.turn === ME) tick();
  return got;
}

function drawFree(p){
  G.actNo++; G.lastAct = { n:G.actNo, p, k:'draw' };
  draw(p, 1);
  noteDraw(p);
  flash(nameOf(p) + ' pioche');
  advance(p, false);
}

function goOut(p){
  G.in[p] = false;
  G.out.push(p);
  const left = countIn();
  if (left <= 1){
    for (const q of seats()) if (G.in[q]) G.out.push(q);
    endManche();
    return;
  }
  SFX.out();
  bubble(p, G.out.length === 1 ? 'out' : 'lose');
  flash(nameOf(p) + ' sort — place ' + G.out.length, true);
  if (left === 2 && MATCH.n > 2) flash('Passage en face à face', true);
}

/* Un joueur qui quitte est disqualifié : il sort en dernière position et la partie continue. */
function disqualify(p, raison){
  if (!G || G.over || !G.in[p]) return;
  G.in[p] = false;
  G.hands[p] = [];
  flash(nameOf(p) + ' quitte la partie', true);
  if (G.pending && G.pending.target === p){ G.pending = null; G.pendingWinner = null; }
  const reste = seats().filter(q => G.in[q]);
  if (reste.length <= 1){ for (const q of reste) G.out.push(q); G.out.push(p); endManche(); return; }
  G.out.push(p);
  if (G.turn === p) G.turn = nextSeat(p);
  render();
  if (!G.over && G.turn !== ME && isAI(G.turn)) runAI();
}

function tick(){
  G.turnCount++;
  const live = seats().filter(p => G.in[p]).map(p => G.hands[p].length);
  const mn = Math.min(...live), tot = live.reduce((a,b)=>a+b,0);
  if (mn < G.minHand || tot > G.totalHands) G.stagnant = 0; else G.stagnant++;
  G.minHand = Math.min(G.minHand, mn);
  G.totalHands = tot;
}
function relaxLevel(){
  if (G.reshuffles >= CONFIG.stagnation.reshuffleForce) return 2;
  if (G.turnCount < CONFIG.stagnation.startTurn) return 0;
  if (G.stagnant >= CONFIG.stagnation.pushAt) return 2;
  if (G.stagnant >= CONFIG.stagnation.relaxAt) return 1;
  return 0;
}

/* ============================================================
   3 · OUVERTURE
   ============================================================ */
function openManche(){
  const order = [['D','H'],['D','S'],['D','C'],['D','D'],['R','H'],['R','S'],['R','C'],['R','D']];
  for (const [r, s] of order){
    for (const p of seats()){
      const i = G.hands[p].findIndex(c => c.r === r && c.s === s);
      if (i >= 0){
        const c = G.hands[p][i];
        G.hands[p].splice(i, 1);
        G.discard.push(c); G.top = c; G.activeSuit = c.s;
        G.moveNo++; G.hist.unshift({ n:G.moveNo, r:c.r, s:c.s, p });
        G.playedRanks[c.r] = 1;
        G.turn = p;
        if (activeN() > 2) advance(p, false);        // à 3 : pas de seconde carte
        flash(nameOf(p) + ' ouvre avec ' + c.r + SUIT_CHAR[c.s]);
        render();
        if (G.turn !== ME) runAI();
        return;
      }
    }
  }
  departage();
}

/* Personne n'a de dame ni de roi : la carte tirée retourne dans la pioche. */
function departage(){
  let starter;
  if (MATCH.n === 2){
    const chooser = MATCH.nextChooser !== undefined ? MATCH.nextChooser : Math.floor(Math.random()*2);
    const pick = (chooser === ME) ? (Math.random() < .5 ? 'r' : 'b') : (Math.random() < .5 ? 'r' : 'b');
    refill();
    const c = G.deck.pop();
    const right = (pick === 'r') === isRed(c.s);
    starter = right ? chooser : (chooser === 0 ? 1 : 0);
    G.deck.push(c); shuffle(G.deck);
    MATCH.nextChooser = chooser === 0 ? 1 : 0;
    flash((chooser === ME ? 'Tu annonces ' : nameOf(chooser) + ' annonce ') + (pick === 'r' ? 'rouge' : 'noir') + ' — ' + c.r + SUIT_CHAR[c.s]);
  } else {
    const tirs = seats().filter(p => G.in[p]).map(p => { refill(); return { p, c:G.deck.pop() }; });
    tirs.sort((a,b) => (RANKS.indexOf(b.c.r) - RANKS.indexOf(a.c.r)) || (SUITS.indexOf(a.c.s) - SUITS.indexOf(b.c.s)));
    starter = tirs[0].p;
    for (const t of tirs) G.deck.push(t.c);
    shuffle(G.deck);
    flash(nameOf(starter) + ' tire ' + tirs[0].c.r + SUIT_CHAR[tirs[0].c.s] + ' et ouvre');
  }
  G.turn = starter;
  G.freeStart = true;
  G.top = null; G.activeSuit = null;
  if (activeN() === 2) G.openingExtra = starter;     // face à face : il rejoue une fois
  render();
  if (starter !== ME) runAI();
}
