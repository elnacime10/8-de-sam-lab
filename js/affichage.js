/* Le 8 de SAM — js/affichage.js
   Animations et dessin de la table. */

/* ============================================================
   5 · ANIMATIONS
   ============================================================ */
function rectOf(x){
  if (!x) return null;
  if (typeof x.getBoundingClientRect === 'function'){ const r = x.getBoundingClientRect(); return r.width ? r : null; }
  return x.width ? x : null;
}
function handTarget(){
  const h = $('#hand').getBoundingClientRect();
  const w = CW, ht = CH;
  return { left:h.left + h.width/2 - w/2, top:h.top + Math.max(0,(h.height-ht)/2), width:w, height:ht };
}
function fly(from, to, html, flip){
  return new Promise(resolve => {
    const layer = $('#flyLayer');
    const a = rectOf(from), b = rectOf(to);
    if (!a || !b || !layer){ resolve(); return; }
    const d = document.createElement('div');
    d.className = 'flyer';
    d.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;`;
    d.innerHTML = html;
    layer.appendChild(d);
    const dx = b.left + (b.width-a.width)/2 - a.left;
    const dy = b.top + (b.height-a.height)/2 - a.top;
    const sc = b.width / a.width;
    const ms = S(CONFIG.flyMs);
    requestAnimationFrame(() => {
      d.style.transition = `transform ${ms}ms cubic-bezier(.22,.75,.3,1)`;
      d.style.transform = `translate(${dx}px,${dy}px) scale(${sc})` + (flip ? ' rotateY(360deg)' : '');
    });
    setTimeout(() => { d.remove(); resolve(); }, ms + 30);
  });
}
async function flyCards(cards, to, faceUp){
  const n = Math.min(cards.length, 5);
  for (let i = 0; i < n; i++){
    fly($('#drawSlot'), to, faceUp ? cardHTML(cards[i]) : '<div class="cardback" style="width:100%;height:100%"></div>', faceUp);
    await sleep(S(150));
  }
  await sleep(Math.max(0, S(CONFIG.flyMs) - S(150)) + (faceUp ? S(CONFIG.drawHoldMs) : 0));
}
const handEl = i => document.querySelector(`#hand .card[data-i="${i}"]`);
const oppStackEl = p => document.querySelector(`.seat[data-p="${p}"] .opp`) || $('#drawSlot');

/* ============================================================
   6 · RENDU
   ============================================================ */
let flashT = null, lastDir = null;
let lastBubbleMove = -9, lastBubbleWho = -1;

function lineFor(p, kind){
  const set = LINES[MATCH.chars[p]];
  if (!set || !set[kind] || !set[kind].length) return null;
  const l = set[kind][Math.floor(Math.random() * set[kind].length)];
  return SET.trash ? l.t : l.c;
}
/* Une bulle à la fois, jamais deux fois de suite le même, et pas à chaque coup. */
function bubble(p, kind){
  if (p === ME || !G || skipAll) return;
  if (G.over && kind !== 'out' && kind !== 'lose') return;
  const fin = (kind === 'out' || kind === 'lose');
  /* un délai en nombre de coups : en duel il n'y a qu'un adversaire,
     interdire la répétition le réduisait au silence */
  if (!fin && G.moveNo - lastBubbleMove < CONFIG.bubbleGap) return;
  if (!fin && MATCH.n > 2 && p === lastBubbleWho) return;
  const txt = lineFor(p, kind);
  const seat = document.querySelector(`.seat[data-p="${p}"]`);
  const layer = $('#bubLayer');
  if (!txt || !seat || !layer) return;
  const r = seat.getBoundingClientRect();
  if (!r.width) return;
  layer.innerHTML = '';                                   // une seule bulle à la fois
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = txt;
  b.style.left = Math.round(r.left + r.width / 2) + 'px';
  b.style.top  = Math.round(r.top + 10) + 'px';
  layer.appendChild(b);
  /* on la ramène dans l'écran si elle dépasse d'un côté ou de l'autre */
  requestAnimationFrame(() => {
    const w = b.offsetWidth || 0, vw = window.innerWidth || 360, marge = 10;
    let x = r.left + r.width / 2;
    x = Math.max(w / 2 + marge, Math.min(vw - w / 2 - marge, x));
    b.style.left = Math.round(x) + 'px';
    b.classList.add('show');
  });
  setTimeout(() => { b.classList.remove('show'); setTimeout(() => b.remove(), 260); }, S(CONFIG.bubbleMs));
  lastBubbleMove = G.moveNo; lastBubbleWho = p;
}
function flash(txt, hot){
  const el = $('#flash');
  el.textContent = txt;
  el.classList.toggle('hot', !!hot);
  el.classList.add('show');
  clearTimeout(flashT);
  flashT = setTimeout(() => el.classList.remove('show'), S(1500));
}

/* Un signe unique par carte, identique à celui du panneau des règles.
   Le valet et le 7 changent de signe selon le mode réellement en cours. */
function signOf(r){
  const d = !G || duel();
  if (r === 'A') return '+2';
  if (r === '9') return '=9';
  if (r === '8') return '?';
  if (r === '10') return '↻';
  if (r === '7') return d ? '↻' : '↷';
  if (r === 'V') return d ? '↻' : '⇄';
  return '';
}

function cardHTML(c, extra, idx){
  const cls = ['card'];
  if (isRed(c.s)) cls.push('red');
  if (c.r === 'A') cls.push('sp-A');
  else if (c.r === '9') cls.push('sp-9');
  else if (c.r === '8') cls.push('sp-8');
  else if (isChain(c.r)) cls.push('sp-c');
  if (extra) cls.push(extra);
  const ch = SUIT_CHAR[c.s];
  const sg = signOf(c.r);
  return `<div class="${cls.join(' ')}"${idx !== undefined ? ` data-i="${idx}"` : ''}>
    ${sg ? `<span class="sign">${sg}</span>` : ''}
    <span class="corner tl"><span class="rk">${c.r}</span><span class="st">${ch}</span></span>
    <span class="pip">${ch}</span>
    <span class="corner br"><span class="rk">${c.r}</span><span class="st">${ch}</span></span>
  </div>`;
}

function sortHand(){
  const o = sortMode === 'suit'
    ? (a,b) => (SUITS.indexOf(a.s)-SUITS.indexOf(b.s)) || (RANKS.indexOf(a.r)-RANKS.indexOf(b.r))
    : (a,b) => (RANKS.indexOf(a.r)-RANKS.indexOf(b.r)) || (SUITS.indexOf(a.s)-SUITS.indexOf(b.s));
  G.hands[ME].sort(o);
}

/* les adversaires dans l'ordre de jeu à partir de moi, répartis gauche puis droite */
function oppOrder(){
  const out = [];
  for (let k = 1; k < MATCH.n; k++) out.push((ME + k) % MATCH.n);
  return out;
}
function renderOpps(){
  const row = $('#oppRow');
  const n = MATCH.n - 1;
  row.className = n >= 2 ? 'two' : '';
  row.dataset.n = n;
  row.innerHTML = '';
  const ordre = oppOrder();
  ordre.forEach((p, idx) => {
    const aim = G.pending && G.pending.target === p;
    const droite = idx >= Math.ceil(ordre.length / 2);
    const mine = G.turn === p && !G.over;
    const seat = document.createElement('div');
    seat.className = 'seat' + (droite ? ' right' : '') + (G.in[p] ? '' : ' out')
                   + (aim ? ' aim' : (mine ? ' turn' : ' dim'));
    seat.dataset.p = p;
    seat.innerHTML = `
      ${aim ? `<span class="aimTag">▼ ${G.pending.amount}</span>` : ''}
      <img class="face" src="${faceOf(p)}" alt="">
      <div class="opp${mine ? ' turn' : ''}${aim ? ' aim' : ''}">
        <div class="who"><div class="nm">${nameOf(p)}</div>
        <div class="mt">${MATCH.human[p] ? 'joueur' : MATCH.levels[p]}${MATCH.n > 2 ? ' · <b>' + (MATCH.scores[p] > 0 ? '+' : '') + MATCH.scores[p] + '</b>' : ''}</div></div>
        <span class="cnt">${G.hands[p].length}</span>
      </div>`;
    row.appendChild(seat);
  });
}

function renderHist(){
  const el = $('#histCol');
  el.innerHTML = G.hist.map((h, i) =>
    `<div class="chip ${isRed(h.s) ? 'r' : ''} f${Math.max(0, i-2)}"><u>${h.n}</u>${h.r}${SUIT_CHAR[h.s]}</div>`
  ).join('');
}

function render(){
  if (!G) return;
  sortHand();
  $('#matchTitle').textContent = (MATCH.n === 2 ? 'Face à face' : 'Partie à ' + MATCH.n)
    + (MATCH.online ? ' · en ligne' : '');
  $('#matchSub').textContent = MATCH.n > 2
    ? `Tour ${MATCH.tour}/${MATCH.tours} · toi ${MATCH.scores[ME] > 0 ? '+' : ''}${MATCH.scores[ME]}`
    : 'Manche sèche';
  const wd = WORLDS[MATCH.world] || WORLDS.quartier;
  $('#bgImg').style.backgroundImage = 'url(' + IMG[MATCH.world] + ')';
  $('#bgFar').style.backgroundImage = 'url(' + IMG[MATCH.world] + ')';
  document.documentElement.style.setProperty('--bgY', wd.bgY);
  document.documentElement.style.setProperty('--drop', wd.drop + 'px');
  $('#meFace').src = faceOf(ME);
  renderOpps();
  renderHist();

  $('#drawCount').textContent = G.deck.length;
  const ds = $('#discardSlot');
  if (G.top){
    ds.classList.remove('empty');
    const under = G.discard.slice(Math.max(0, G.discard.length - 3), G.discard.length - 1);
    let html = '';
    under.forEach((c, i) => {
      const rot = (i % 2 ? 1 : -1) * (5 - i * 1.5);
      html += `<div class="under" style="position:absolute;inset:0;transform:rotate(${rot}deg)">${cardHTML(c)}</div>`;
    });
    ds.innerHTML = html + cardHTML(G.top);
  }
  else { ds.classList.add('empty'); ds.innerHTML = ''; }
  const tag = $('#suitTag');
  if (G.activeSuit){
    const col = SUIT_COL[G.activeSuit];
    tag.className = '';
    tag.style.setProperty('--sc', col);
    ds.style.setProperty('--sc', col);
    tag.innerHTML = '<b>' + SUIT_CHAR[G.activeSuit] + '</b><span>' + SUIT_NAME[G.activeSuit] + '</span>';
  } else {
    tag.className = 'none';
    ds.style.setProperty('--sc', 'transparent');
    tag.innerHTML = '<b>—</b><span>couleur</span>';
  }

  const dw = $('#dirWrap');
  dw.style.display = MATCH.n > 2 ? 'flex' : 'none';
  const ar = $('#dirArrow');
  ar.textContent = G.dir === 1 ? '↻' : '↺';
  if (lastDir !== null && lastDir !== G.dir){
    ar.classList.remove('flip'); void ar.offsetWidth; ar.classList.add('flip');
    setTimeout(() => ar.classList.remove('flip'), 500);
  }
  lastDir = G.dir;
  $('#dirTxt').textContent = G.pending
    ? (G.pending.target === ME ? 'sur toi' : 'sur ' + nameOf(G.pending.target))
    : (G.dir === 1 ? 'sens horaire' : 'sens inversé');

  const hand = $('#hand'), cards = G.hands[ME];
  hand.innerHTML = '';
  $('#handCount').textContent = cards.length + (cards.length > 1 ? ' cartes' : ' carte');
  const cw = CW, avail = Math.max(120, hand.clientWidth - 8);
  const twoRows = cards.length > 9;
  hand.style.height = (twoRows ? CH + 46 : CH + 24) + 'px';
  const rows = twoRows ? [cards.slice(0, Math.ceil(cards.length/2)), cards.slice(Math.ceil(cards.length/2))] : [cards];
  let idx = 0;
  const myTurn = G.turn === ME && G.in[ME] && !G.over && !busy;
  rows.forEach((row, r) => {
    let step = cw + 5;
    if (row.length > 1 && cw + (row.length-1)*step > avail) step = Math.max(Math.round(Math.max(34, CW*0.42)), (avail - cw)/(row.length-1));
    const total = cw + (row.length-1)*step;
    const x0 = Math.max(4, (hand.clientWidth - total)/2);
    const mid = (row.length-1)/2;
    row.forEach((c, k) => {
      const i = idx++;
      const box = document.createElement('div');
      box.innerHTML = cardHTML(c, '', i);
      const el = box.firstElementChild;
      const rot = row.length > 1 ? (k - mid) * 1.7 : 0;
      el.style.left = (x0 + k*step) + 'px';
      el.style.bottom = twoRows && r === 0 ? Math.round(CH * 0.52) + 'px' : '0px';
      el.style.zIndex = r*100 + k;
      el.style.setProperty('--t', `rotate(${rot}deg) translateY(${Math.abs(k-mid)*1.3}px)`);
      if (i === selected) el.classList.add('sel');
      el.addEventListener('click', ev => { ev.stopPropagation(); onCardClick(i, el); });
      hand.appendChild(el);
    });
  });

  $('#handZone').classList.toggle('mine', myTurn);
  const btn = $('#drawBtn');
  btn.disabled = !myTurn;
  if (G.pending && myTurn){
    btn.innerHTML = '⚠ PRENDRE <span class="big">' + G.pending.amount + '</span> CARTES';
    btn.classList.add('danger');
  } else {
    btn.textContent = myTurn && hasPlayable(ME) ? 'Piocher quand même' : 'Piocher';
    btn.classList.remove('danger');
  }
  const showSkip = !G.in[ME] && !G.over;
  $('#skipBtn').classList.toggle('hidden', !showSkip);
  $('#handZone').style.opacity = G.in[ME] ? '1' : '.45';
  setTurnLine();
}

function setTurnLine(){
  const el = $('#turnLine');
  if (!G || G.over){ el.textContent = ''; el.className = ''; return; }
  if (!G.in[ME]){ el.className = ''; el.textContent = 'Tu es sorti — ils se départagent'; return; }
  if (G.turn === ME){
    el.className = 'you';
    if (G.pending) el.textContent = 'Contre avec un ' + (G.pending.type === 'A' ? 'as' : '9') + ' ou encaisse ' + G.pending.amount;
    else if (G.freeStart) el.textContent = 'Tu ouvres : pose la carte que tu veux';
    else el.textContent = hasPlayable(ME) ? 'À toi' : 'Rien à poser : pioche';
  } else { el.className = ''; el.textContent = nameOf(G.turn) + (busy ? ' joue…' : ' réfléchit…'); }
}
