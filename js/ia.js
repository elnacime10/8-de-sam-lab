/* Le 8 de SAM — js/ia.js
   L'intelligence des adversaires ordinateur. */

/* ============================================================
   4 · IA
   ============================================================ */
function unseen(r, p){ return Math.max(0, 4 - countRank(G.hands[p], r) - (G.playedRanks[r] || 0)); }

function evalHand(h, relax){
  let v = -h.length * 130;
  for (const c of h){
    if (c.r === '8') v += (relax >= 1 ? 12 : 38);
    if (c.r === 'A') v += (relax >= 1 ? 8 : 26);
    if (c.r === '9') v += (relax >= 1 ? 4 : 13);
  }
  let big = 0;
  for (const s of SUITS) big = Math.max(big, countSuit(h, s));
  if (h.length && h.length <= 3 && h.every(c => isChain(c.r))) v -= 120;
  return v + big * 9;
}

function bestLine(hand, topR, suit, depth, mine, relax, me){
  let best = { score: evalHand(hand, relax) - 130, idx:-1, s8:null };
  if (depth <= 0) return best;
  for (let i = 0; i < hand.length; i++){
    const c = hand[i];
    if (topR !== null && !(c.r === '8' || c.s === suit || c.r === topR)) continue;
    const rest = hand.slice(); rest.splice(i, 1);
    let score, s8 = null;
    if (rest.length === 0){
      score = forbiddenFinish(c.r) ? 4000 : 100000;
    } else if (replayCard(c.r)){
      score = bestLine(rest, c.r, c.s, depth - 1, mine, relax, me).score + 160;
    } else if (c.r === '8'){
      const b8 = best8Suit(hand, c, 'difficile', me);
      if (!b8) continue;
      s8 = b8.s;
      /* pénalité lourde : le 8 ne passe devant une carte normale
         que s'il bloque réellement ou qu'il n'y a rien d'autre */
      score = evalHand(rest, relax) + b8.v - (relax >= 1 ? 110 : 185);
    } else {
      score = evalHand(rest, relax) + weakOf(nextSeat(me), c.s) * 16;
      if (c.r === '7' && !duel()) score += 55;
      if (c.r === 'A'){
        score += 55;
        if (mine <= 4) score += 140;
        if (unseen('A', me) <= 1) score += 120; else score -= 35;
      }
      if (c.r === '9'){
        score += 28;
        if (mine <= 3) score += 70;
        if (unseen('9', me) <= 1) score += 70; else score -= 25;
      }
    }
    if (score > best.score) best = { score, idx:i, s8 };
  }
  return best;
}

function scoreCard(c, hand, mine, relax, lv, me){
  const last = hand.length === 1;
  let s = 10;
  if (replayCard(c.r)){ s += last ? -300 : (lv === 'moyen' ? 35 : 70); }
  if (c.r === '7' && !duel()) s += 45;
  if (c.r === 'A'){
    if (lv === 'moyen'){ s -= 5; if (mine <= 2) s += 100; if (last) s += 90; }
    else { s -= 45; if (mine <= 4) s += 140; if (relax >= 1) s += 55; if (last) s += 60; if (unseen('A', me) <= 1) s += 130; }
  }
  if (c.r === '9'){
    if (lv === 'moyen'){ s -= 12; if (mine <= 2) s += 80; }
    else { s -= 30; if (mine <= 3) s += 85; if (relax >= 1) s += 40; if (unseen('9', me) <= 1) s += 80; }
  }
  if (c.r === '8'){
    const b8 = best8Suit(hand, c, lv, me);
    if (!b8) return -1e9;
    if (last) return 900;                       // finir sur un 8, toujours
    s -= 165;                                   // on le garde tant qu'on a autre chose
    s += b8.v * 0.55;
    if (countSuit(hand, G.activeSuit) === 0) s += 60;
    if (relax >= 1) s += 55;
    return s;
  }
  s += countSuit(hand, c.s) * 7;
  if (lv === 'difficile') s += weakOf(nextSeat(me), c.s) * 14;
  if (relax >= 2) s += RANKS.indexOf(c.r) * 2;
  return s;
}

/* Le 8 ne sert qu'à CHANGER de couleur : la couleur en cours est interdite.
   Valeur = ce que ça m'apporte + ce que ça bloque chez celui qui joue après. */
function best8Suit(hand, exclude, lv, me){
  const rest = hand.filter(c => c !== exclude);
  const cible = nextSeat(me);
  let best = null;
  for (const sx of SUITS){
    if (sx === G.activeSuit) continue;          // jamais redemander la couleur en cours
    const mien = countSuit(rest, sx) * 18;
    let bloc = 0;
    if (lv === 'difficile') bloc = weakOf(cible, sx) * 26;
    else if (lv === 'moyen') bloc = weakOf(cible, sx) * 8;
    const v = mien + bloc;
    if (!best || v > best.v) best = { s:sx, v, bloc };
  }
  return best;
}

function bestSuit(hand, exclude, lv){
  const rest = hand.filter(c => c !== exclude);
  let best = null, n = -1;
  for (const s of SUITS){
    if (s === G.activeSuit) continue;
    const v = countSuit(rest, s);
    if (v > n){ n = v; best = s; }
  }
  return best || SUITS.find(s => s !== G.activeSuit) || SUITS[0];
}

function aiDecide(p){
  const lv = SG(p).level || 'moyen';
  const hand = G.hands[p];
  const foes = seats().filter(q => q !== p && G.in[q]);
  const mine = foes.length ? Math.min(...foes.map(q => G.hands[q].length)) : 99;
  const relax = relaxLevel();

  if (G.pending){
    const idx = hand.findIndex(c => c.r === G.pending.type);
    if (idx < 0) return { action:'take' };
    if (lv === 'difficile' && G.pending.type === 'A' && G.pending.amount === 2 &&
        hand.length <= 4 && countRank(hand,'A') === 1 && relax === 0) return { action:'take' };
    return { action:'play', idx };
  }

  const opts = hand.map((c,i) => ({ c, i })).filter(o => playable(o.c));
  if (!opts.length) return { action:'draw' };

  if (lv === 'facile'
      || (lv === 'moyen' && Math.random() < CONFIG.midErrorRate)
      || (lv === 'difficile' && relax >= 1 && Math.random() < CONFIG.hardErrorRate)){
    const o = opts[Math.floor(Math.random()*opts.length)];
    let suit;
    if (o.c.r === '8'){ const b = best8Suit(hand, o.c, lv, p); suit = b ? b.s : bestSuit(hand, o.c, lv); }
    return { action:'play', idx:o.i, suit };
  }

  if (lv === 'difficile'){
    const line = bestLine(hand, G.top ? G.top.r : null, G.activeSuit, 6, mine, relax, p);
    if (line.idx < 0) return { action:'draw' };
    const c = hand[line.idx];
    let s8 = line.s8;
    if (c.r === '8' && !s8){ const b = best8Suit(hand, c, lv, p); s8 = b ? b.s : bestSuit(hand, c, lv); }
    return { action:'play', idx:line.idx, suit: c.r === '8' ? s8 : undefined };
  }

  let best = opts[0], bestScore = -1e9;
  for (const o of opts){
    const sc = scoreCard(o.c, hand, mine, relax, lv, p);
    if (sc > bestScore){ bestScore = sc; best = o; }
  }
  let suit;
  if (best.c.r === '8'){ const b = best8Suit(hand, best.c, lv, p); suit = b ? b.s : bestSuit(hand, best.c, lv); }
  return { action:'play', idx:best.i, suit };
}

let GEN_IA = 0;                 /* toute boucle d'une génération périmée s'arrête d'elle-même */
async function runAI(){
  if (busy) return;
  const gen = ++GEN_IA;
  busy = true; render();
  let guard = 0;
  let wait = S(CONFIG.aiThinkMs);
  while (gen === GEN_IA && !G.over && G.turn !== ME && isAI(G.turn) && guard++ < 400){
    const p = G.turn;
    const fast = !G.in[ME];
    if (fast && !skipAll) wait = CONFIG.fastMs;
    if (skipAll) wait = 0;
    setTurnLine();
    if (wait) await sleep(wait);
    if (G.over) break;
    const d = aiDecide(p);
    const stack = oppStackEl(p);
    if (d.action === 'take'){
      const n0 = G.hands[p].length;
      takeHit(p);
      if (!skipAll){ await flyCards(G.hands[p].slice(n0), stack, false); }
    } else if (d.action === 'draw'){
      const n0 = G.hands[p].length;
      drawFree(p);
      if (!skipAll) await flyCards(G.hands[p].slice(n0), stack, false);
    } else {
      const c = G.hands[p][d.idx];
      if (!skipAll) await fly(stack, $('#discardSlot'), cardHTML(c), false,
        () => (c.r === 'A' || c.r === '9') ? SFX.atk(G.pending ? G.pending.amount : 2) : SFX.play());
      playCard(p, d.idx, d.suit);
      if (!skipAll){
      }
    }
    render();
    if (MATCH.online && MATCH.host) broadcastState();
    if (!skipAll) await sleep(fast ? 60 : S(CONFIG.settleMs));
    wait = fast ? CONFIG.fastMs : S(CONFIG.aiChainMs);
  }
  if (gen !== GEN_IA) return;    /* une boucle plus récente a pris la main */
  busy = false;
  render();
  if (MATCH.online && MATCH.host) broadcastState();
  if (!G.over && G.turn === ME && G.in[ME]) SFX.mine();
  armChrono();
}
