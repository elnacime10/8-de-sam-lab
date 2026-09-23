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
/* ---- Le vol d'une carte : un vrai geste ----
   accélération au départ, arc, rotation, freinage et petit calage à l'arrivée.
   Les vols en cours sont mémorisés pour pouvoir être annulés proprement. */
const VOLS = new Set();
const MOUVEMENT_REDUIT = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } })();
function annuleVols(){ VOLS.forEach(d => { try{ d.remove(); }catch(e){} }); VOLS.clear(); }

function fly(from, to, html, flip, son){   /* son = joué à l'impact, pas au départ */
  return new Promise(resolve => {
    const layer = $('#flyLayer');
    const a = rectOf(from), b = rectOf(to);
    if (!a || !b || !layer || MOUVEMENT_REDUIT || skipAll){ resolve(); return; }
    /* une carte a toujours la taille d'une carte : elle part du centre de sa
       source, quelle que soit la taille de celle-ci (vignette, bande, pioche) */
    const w = CW, h = CH;
    const d = document.createElement('div');
    d.className = 'flyer' + (flip ? ' retourne' : '');
    d.style.cssText = `left:${a.left + a.width/2 - w/2}px;top:${a.top + a.height/2 - h/2}px;width:${w}px;height:${h}px;`;
    d.innerHTML = flip
      ? `<div class="av">${html}</div><div class="ar"><div class="cardback"></div></div>`
      : html;
    layer.appendChild(d);
    VOLS.add(d);

    const dx = (b.left + b.width/2) - (a.left + a.width/2);
    const dy = (b.top + b.height/2) - (a.top + a.height/2);
    const sc = Math.max(0.42, Math.min(1.45, b.width / w));    /* grandit vers la défausse, rétrécit vers une vignette */
    const len = Math.max(1, Math.hypot(dx, dy));
    const arc = Math.min(70, len * 0.17);                 /* hauteur de l'arc */
    const px = -dy / len * arc, py = dx / len * arc;      /* perpendiculaire au trajet */
    const rot = (Math.random() * 9 - 4.5);                /* une carte n'arrive jamais droite */
    const ms = S(CONFIG.flyMs);
    const t = (x, y, r, k, f) => `translate(${Math.round(x)}px,${Math.round(y)}px) rotate(${r.toFixed(1)}deg) scale(${k.toFixed(3)})` + (flip ? ` rotateY(${f}deg)` : '');
    const frames = [
      { transform: t(0, 0, 0, 1, 180), offset:0,    easing:'cubic-bezier(.38,0,.55,.35)' },
      { transform: t(dx*0.55 + px, dy*0.55 + py, rot*1.8, 1 + (sc-1)*0.6, 270), offset:0.55, easing:'cubic-bezier(.2,.6,.25,1)' },
      { transform: t(dx*1.035, dy*1.035, rot*1.15, sc, 360), offset:0.86, easing:'ease-out' },
      { transform: t(dx, dy, rot*0.35, sc, 360), offset:1 }
    ];
    let fini = false;
    const finir = () => { if (fini) return; fini = true; VOLS.delete(d); try{ d.remove(); }catch(e){} if (son) son(); resolve(); };
    try {
      const anim = d.animate(frames, { duration:ms, fill:'forwards' });
      anim.onfinish = finir;
      setTimeout(finir, ms + 120);                        /* filet : jamais de carte fantôme */
    } catch(e){ setTimeout(finir, ms); }
  });
}
async function flyCards(cards, to, faceUp){
  const n = Math.min(cards.length, 5);
  for (let i = 0; i < n; i++){
    fly($('#drawSlot'), to, faceUp ? cardHTML(cards[i]) : '<div class="cardback" style="width:100%;height:100%"></div>', faceUp);
    await sleep(S(160));
  }
  await sleep(Math.max(0, S(CONFIG.flyMs) - S(160)) + (faceUp ? S(CONFIG.drawHoldMs) : 0));
}
/* Anime un coup qui n'a pas été joué sur cet appareil (coup d'un joueur
   distant, chez l'hôte comme chez l'invité). La carte est déjà sur la
   défausse quand on arrive ici : on la masque le temps du vol. */
function anime(a, son){
  if (!a || skipAll || MOUVEMENT_REDUIT || VOLS.size > 2) return false;
  const depuis = oppStackEl(a.p);
  if (a.k === 'play'){
    const ds = $('#discardSlot');
    ds.classList.add('enVol');
    fly(depuis, ds, cardHTML({ r:a.r, s:a.s }), false, () => { ds.classList.remove('enVol'); if (son) son(); })
      .then(() => ds.classList.remove('enVol'));
    return true;
  }
  if (a.k === 'draw' || a.k === 'take'){
    const n = Math.min(a.amt || 1, 5);
    for (let i = 0; i < n; i++)
      setTimeout(() => fly($('#drawSlot'), depuis, '<div class="cardback" style="width:100%;height:100%"></div>',
        false, i === 0 && son ? son : null), i * S(150));
    return true;
  }
  return false;
}
const handEl = i => document.querySelector(`#hand .card[data-i="${i}"]`);
const oppStackEl = p => document.querySelector(`.seat[data-p="${p}"] .opp`) || $('#drawSlot');

/* ============================================================
   6 · RENDU
   ============================================================ */
let flashT = null, lastDir = null;

/* ---- Les répliques ----
   Un sac par personnage et par situation : on tire sans remise, donc une
   phrase ne revient jamais avant que les autres soient passées.
   Un crédit de parole évite le brouhaha sans faire taire les moments forts. */
const SACS = {};
const CREDIT = [2,2,2,2,2];
const HUMEUR = { atk:'malin', hit:'enerve', low:'malin', out:'content', lose:'enerve' };

function lineFor(p, kind){
  const set = LINES[SG(p).char];
  if (!set || !set[kind] || !set[kind].length) return null;
  const cle = SG(p).char + ':' + kind;
  if (!SACS[cle] || !SACS[cle].length) SACS[cle] = set[kind].map((_, i) => i).sort(() => Math.random() - 0.5);
  const l = set[kind][SACS[cle].pop()];
  return SET.trash ? l.t : l.c;
}
function rechargeParole(){ for (let p = 0; p < 5; p++) CREDIT[p] = Math.min(2, CREDIT[p] + 1); }
/* Une bulle à la fois, jamais deux fois de suite le même, et pas à chaque coup. */
/* ---- LE FIL : un seul endroit où tout s'écrit, coups et répliques ----
   Plus de bulle posée sur un portrait, plus de bandeau séparé, plus de
   minuterie d'effacement : le fil défile, c'est tout. */
const FIL = [];
const ATTENTE = [];
let filT = null;
/* les lignes sortent espacées : trois messages d'un coup deviendraient illisibles */
function filAjoute(p, texte, genre, humeur, priorite){
  ATTENTE.push({ p, texte, genre, humeur:humeur || '', pr:priorite || (genre === 'dit' ? 1 : 2) });
  if (ATTENTE.length > 6) ATTENTE.sort((a, b) => b.pr - a.pr).splice(4);   /* on abandonne le moins important */
  if (!filT) filSuivant();
}
function filSuivant(){
  const l = ATTENTE.shift();
  if (!l){ filT = null; return; }
  const d = FIL[FIL.length - 1];
  if (!(d && d.p === l.p && d.texte === l.texte && d.genre === l.genre)){
    FIL.push(l);
    if (FIL.length > 14) FIL.shift();
    renderFil();
  }
  filT = setTimeout(filSuivant, S(330));
}
function filVide(){ ATTENTE.length = 0; clearTimeout(filT); filT = null; FIL.length = 0; renderFil(); }
function renderFil(){
  const el = $('#fil'); if (!el) return;
  const max = +(el.dataset.lignes || 4);
  const vues = FIL.slice(-max);
  el.innerHTML = vues.map((l, i) => {
    const age = vues.length - 1 - i;
    const corps = l.genre === 'dit' ? `<i>«&nbsp;${l.texte}&nbsp;»</i>` : l.texte;
    return `<div class="fl a${Math.min(age, 3)}" data-h="${l.humeur}"><span class="q">${nameOf(l.p)}</span>${corps}</div>`;
  }).join('');
}
/* les répliques des personnages passent par le fil */
/* Seul l'hôte (ou le jeu hors ligne) choisit une réplique. Elle part ensuite
   avec l'état, pour que tout le monde lise exactement la même chose. */
function bubble(p, kind, force){
  if (!G || skipAll) return;
  if (MATCH.online && !MATCH.host) return;          // l'invité ne décide de rien
  if (G.over && kind !== 'out' && kind !== 'lose') return;
  const majeur = force || kind === 'out' || kind === 'lose';
  if (!majeur){
    if (CREDIT[p] <= 0) return;
    CREDIT[p]--;
  }
  const txt = lineFor(p, kind);
  if (!txt) return;
  journal(p, txt, 'dit', HUMEUR[kind] || '');
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
  row.className = n >= 2 ? 'two' : 'solo';
  row.dataset.n = n;
  row.innerHTML = '';
  oppOrder().forEach(p => {
    const aim = G.pending && G.pending.target === p;
    const mine = G.turn === p && !G.over;
    const derniere = G.in[p] && G.hands[p].length === 1 && !G.over;   /* le moment où tout se joue */
    const seat = document.createElement('div');
    seat.className = 'seat' + (G.in[p] ? '' : ' out') + (aim ? ' aim' : (mine ? ' turn' : ' dim')) + (derniere ? ' last' : '');
    seat.dataset.p = p;
    const tag = aim ? `<span class="tagS aimT">▼ +${G.pending.amount}</span>`
              : derniere ? '<span class="tagS lastT">DERNIÈRE CARTE</span>'
              : mine ? '<span class="tagS turnT">IL JOUE</span>' : '';
    const nb = G.hands[p].length;
    const niveau = SG(p).human ? 'joueur' : SG(p).level;
    const score = MATCH.n > 2 ? ' · <b>' + (SG(p).score > 0 ? '+' : '') + SG(p).score + '</b>' : '';
    seat.innerHTML = `
      <div class="opp${mine ? ' turn' : ''}${aim ? ' aim' : ''}">
        ${tag}
        <img class="face" src="${faceOf(p)}" alt="">
        <div class="who"><div class="nm">${nameOf(p)}</div><div class="mt">${niveau}${score}</div></div>
        <div class="cntBox"><span class="cnt">${G.in[p] ? nb : '✓'}</span><span class="cntL">${G.in[p] ? (nb > 1 ? 'cartes' : 'carte') : 'sorti'}</span></div>
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
    ? `Tour ${MATCH.tour}/${MATCH.tours} · toi ${SG(ME).score > 0 ? '+' : ''}${SG(ME).score}`
    : 'Manche sèche';
  const wd = WORLDS[MATCH.world] || WORLDS.quartier;
  document.documentElement.dataset.world = MATCH.world;      /* habillage du fil */
  $('#bgImg').style.backgroundImage = 'url(' + IMG[MATCH.world] + ')';
  $('#bgFar').style.backgroundImage = 'url(' + IMG[MATCH.world] + ')';
  document.documentElement.style.setProperty('--bgY', wd.bgY);
  document.documentElement.style.setProperty('--drop', wd.drop + 'px');
  $('#meFace').src = faceOf(ME);
  renderOpps();
  renderHist();

  $('#drawCount').textContent = G.deck.length;
  $('#drawSlot').dataset.ep = G.deck.length > 20 ? 3 : (G.deck.length > 8 ? 2 : (G.deck.length > 0 ? 1 : 0));
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
  dw.style.display = (MATCH.n > 2 && G.dir === -1) ? 'flex' : 'none';   /* seulement quand le sens est inversé */
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
  /* on retient où était chaque carte pour la faire glisser à sa nouvelle place */
  const avant = {};
  hand.querySelectorAll('.card').forEach(e => { if (e.dataset.k) avant[e.dataset.k] = e.getBoundingClientRect(); });
  hand.innerHTML = '';
  $('#handCount').textContent = cards.length + (cards.length > 1 ? ' cartes' : ' carte');
  const cw = CW, avail = Math.max(120, hand.clientWidth - 8);
  const nRows = cards.length > 24 ? 3 : (cards.length > 11 ? 2 : 1);   /* deux étages suffisent jusqu'à 24 cartes */
  const lift = Math.round(CH * 0.5);
  hand.style.height = (CH + 24 + (nRows - 1) * lift) + 'px';
  const per = Math.ceil(cards.length / nRows), rows = [];
  for (let k = 0; k < cards.length; k += per) rows.push(cards.slice(k, k + per));
  let idx = 0;
  const myTurn = G.turn === ME && G.in[ME] && !G.over && !busy;
  rows.forEach((row, r) => {
    let step = cw + 5;
    /* on resserre autant qu'il faut : la main ne sort jamais de l'écran */
    if (row.length > 1 && cw + (row.length-1)*step > avail) step = Math.max(12, (avail - cw)/(row.length-1));
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
      el.style.bottom = ((rows.length - 1 - r) * lift) + 'px';
      el.style.zIndex = r*100 + k;
      el.style.setProperty('--t', `rotate(${rot}deg) translateY(${Math.abs(k-mid)*1.3}px)`);
      if (i === selected) el.classList.add('sel');
      el.addEventListener('click', ev => { ev.stopPropagation(); onCardClick(i, el); });
      el.dataset.k = c.r + c.s;
      hand.appendChild(el);
      const vieux = avant[el.dataset.k];
      if (vieux){
        const neuf = el.getBoundingClientRect();
        const ddx = vieux.left - neuf.left, ddy = vieux.top - neuf.top;
        if (Math.abs(ddx) > 1 || Math.abs(ddy) > 1){
          el.style.transition = 'none';
          el.style.transform = `translate(${ddx}px,${ddy}px)`;
          requestAnimationFrame(() => {
            el.style.transition = 'transform ' + S(260) + 'ms cubic-bezier(.2,.7,.3,1)';
            el.style.transform = '';
          });
        }
      }
    });
  });

  $('#handZone').classList.toggle('mine', myTurn);
  $('#turnBanner').classList.toggle('hidden', !myTurn);
  $('#deckInfo').textContent = 'pioche ' + G.deck.length;
  renderAct();
  renderSuitBig();
  const btn = $('#drawBtn');
  btn.disabled = !myTurn;
  if (G.pending && myTurn){
    btn.innerHTML = '⚠ PRENDRE <span class="big">' + G.pending.amount + '</span> CARTE' + (G.pending.amount > 1 ? 'S' : '');
    btn.classList.add('danger');
  } else {
    btn.textContent = myTurn && hasPlayable(ME) ? 'Piocher quand même' : 'Piocher';
    btn.classList.remove('danger');
    btn.classList.toggle('prime', myTurn && !hasPlayable(ME));   /* doré seulement quand il faut piocher */
  }
  const showSkip = !G.in[ME] && !G.over;
  $('#skipBtn').classList.toggle('hidden', !showSkip);
  $('#handZone').style.opacity = G.in[ME] ? '1' : '.45';
  setTurnLine();
  ajusteTable();
}

function setTurnLine(){
  const el = $('#turnLine');
  if (!G || G.over){ el.textContent = ''; el.className = ''; return; }
  if (!G.in[ME]){ el.className = ''; el.textContent = 'Tu es sorti — ils se départagent'; return; }
  if (G.turn === ME){
    el.className = 'you';
    if (G.pending) el.textContent = 'Contre avec un ' + (G.pending.type === 'A' ? 'as' : '9') + ' ou encaisse ' + G.pending.amount;
    else if (G.freeStart) el.textContent = 'Tu ouvres : pose la carte que tu veux';
    else el.textContent = hasPlayable(ME) ? '' : 'Rien à poser : pioche';   /* « À toi » : le bandeau suffit */
  } else { el.className = ''; el.textContent = ''; }   /* la vignette dit déjà qui joue */
}


/* ---- Ce qu'a fait le joueur précédent, écrit en clair ---- */
let lastActShown = 0;
const DUEL_BONUS = () => (MATCH.n === 2 ? 1.7 : 1);     /* à deux, personne pour commenter : on parle plus */
const tire = pr => Math.random() < pr * DUEL_BONUS();

/* Le fil raconte ce qu'on ne peut pas deviner, et les personnages réagissent. */
function renderAct(){
  if (MATCH.online && !MATCH.host) return;      /* l'invité lit le journal, il ne l'écrit pas */
  const a = G && G.lastAct;
  if (!a || a.n === lastActShown) return;
  const premier = lastActShown === 0;
  lastActShown = a.n;
  rechargeParole();

  /* 1. ce qu'on mange, ce qu'on pioche */
  if (a.k === 'take'){
    const n = a.amt || 1;
    if (a.typ === '9'){ journal(a.p, 'mange un <b>9</b>', 'coup', 'enerve');
      if (tire(0.5)) bubble(a.p, 'hit'); }
    else if (a.typ === 'A'){ journal(a.p, n <= 2 ? 'mange un <b>As</b>' : 'mange <b>' + (n/2) + ' As</b>', 'coup', 'enerve');
      if (tire(n > 2 ? 0.9 : 0.6)) bubble(a.p, 'hit'); }
    else journal(a.p, 'pioche', 'coup', '');
  }
  if (a.k === 'draw') journal(a.p, 'pioche', 'coup', '');

  /* 2. ce qu'on pose */
  if (a.k === 'play'){
    const contre = a.amt && a.amt > 2;
    if (a.suit){ SFX.suit(); journal(a.p, 'demande <b class="' + (isRed(a.suit) ? 'r' : '') + '">' + SUIT_CHAR[a.suit] + ' ' + SUIT_NAME[a.suit] + '</b>', 'coup', 'malin'); }
    if (a.r === 'A'){ if (tire(contre ? 0.9 : 0.55)) bubble(a.p, 'atk'); }
    else if (a.r === '9'){ if (tire(0.35)) bubble(a.p, 'atk'); }
    else if (a.skip !== undefined){ if (tire(0.3)) bubble(a.p, 'atk'); }
    if ((CHAINE[a.p] || 0) >= 3){ SFX.combo(); bubble(a.p, 'atk', true); }   /* un enchaînement, ça se fête */
  }

  /* 3. l'annonce : tout le monde annonce sa dernière carte, comme dans la vraie vie */
  if (!premier) seats().forEach(p => {
    if (!G.in[p]) return;
    const n = G.hands[p].length;
    if (n === 1 && ANNONCE[p] !== G.mid){
      ANNONCE[p] = G.mid;
      journal(p, '<b>Carte !</b>', 'coup', 'malin', 3);
      SFX.last();
      seats().forEach(q => { if (q !== p && G.in[q] && tire(0.35)) bubble(q, 'low'); });
    }
    if (n > 1) ANNONCE[p] = null;
  });
}
const ANNONCE = [null,null,null,null,null];

/* ---- La couleur demandée par un 8 recouvre la carte, et teinte la table ---- */
/* symboles dessinés (pleins, nets, sans rien qui transparaisse) */
const SUIT_SVG = {
  H:'M50 88C20 66 6 50 6 32 6 18 17 8 30 8c9 0 16 5 20 12 4-7 11-12 20-12 13 0 24 10 24 24 0 18-14 34-44 56Z',
  D:'M50 6 86 50 50 94 14 50Z',
  S:'M50 6C30 30 8 42 8 60c0 14 12 22 24 22 8 0 13-4 16-8-2 10-6 16-12 20h28c-6-4-10-10-12-20 3 4 8 8 16 8 12 0 24-8 24-22C92 42 70 30 50 6Z',
  C:'M50 8a17 17 0 1 1 0 34 17 17 0 1 1 0-34ZM28 36a17 17 0 1 1 0 34 17 17 0 1 1 0-34ZM72 36a17 17 0 1 1 0 34 17 17 0 1 1 0-34ZM46 52h8l6 42H40Z'
};
function renderSuitBig(){
  const el = $('#suitBig'), ds = $('#discardSlot'), tab = $('#table');
  const demande = G && G.top && G.top.r === '8' && G.activeSuit;
  ds.classList.toggle('masque', !!demande);
  if (!demande){ el.classList.add('hidden'); el.dataset.s = ''; tab.style.setProperty('--tint', 'transparent'); return; }
  const col = SUIT_COL[G.activeSuit];
  if (el.dataset.s !== G.activeSuit || el.classList.contains('hidden')){
    el.dataset.s = G.activeSuit;
    el.innerHTML = '<svg viewBox="0 0 100 100" width="58%" height="58%" aria-hidden="true"><path fill="#fff" d="' + SUIT_SVG[G.activeSuit] + '"/></svg>';
    el.style.background = col;
    el.classList.remove('hidden');
  }
  tab.style.setProperty('--tint', col + '40');
}

/* ---- La table prend la hauteur qui reste : rien ne déborde, rien ne défile ----
   On rapetisse la pioche et la défausse jusqu'à ce que tout tienne. En dernier
   recours on masque l'historique, puis le sens de rotation. */
function ajusteTable(){
  try { ajusteTableSur(); } catch(e){ /* une mesure ratée ne doit jamais empêcher la partie de s'afficher */ }
}
function ajusteTableSur(){
  if (VOLS.size) return;                 /* une carte est en l'air : la table ne bouge pas */
  const t = $('#table'); if (!t || !t.children || typeof getComputedStyle !== 'function') return;
  const r = document.documentElement.style;
  const besoin = () => {
    let h = 0, n = 0;
    for (const e of Array.from(t.children)){
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.position === 'absolute') continue;
      h += e.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0); n++;
    }
    return h + Math.max(0, n - 1) * (parseFloat(getComputedStyle(t).rowGap) || 0);
  };
  const pose = w => { r.setProperty('--pile-w', w + 'px'); r.setProperty('--pile-h', Math.round(w * 1.4) + 'px'); };
  $('#histCol').style.display = '';
  $('#hand').style.transform = '';
  t.classList.remove('serre');
  let pw = PW0; pose(pw);
  /* on ne calcule plus : on regarde si quelque chose sort vraiment de la table */
  const trop = () => {
    const r = t.getBoundingClientRect(); let dehors = 0;
    for (const e of Array.from(t.children)){
      const cs2 = getComputedStyle(e);
      if (cs2.display === 'none' || cs2.position === 'absolute') continue;
      const b = e.getBoundingClientRect();
      dehors = Math.max(dehors, r.top - b.top, b.bottom - r.bottom);
    }
    return dehors > 1;
  };
  let garde = 0;
  while (trop() && pw > 48 && garde++ < 20){ pw -= 6; pose(pw); }
  const fil = $('#fil');
  if (fil && fil.dataset.lignes !== "4"){ fil.dataset.lignes = 4; renderFil(); }
  if (trop()) t.classList.add('serre');    /* plus de place : on aligne en haut, jamais de coupe */
  if (trop()) $('#dirWrap').style.display = 'none';
  if (trop() && fil){ fil.dataset.lignes = 3; renderFil(); }   /* le fil ne cède qu'après le sens */
  if (trop() && fil){ fil.dataset.lignes = 2; renderFil(); }
  if (trop()) $('#histCol').style.display = 'none';            /* l'historique en tout dernier */
  if (trop() && fil){ fil.dataset.lignes = 1; renderFil(); }   /* écran minuscule : une seule ligne */
  /* tout petit écran : la main se réduit un peu plutôt que de chevaucher la table */
  const hand = $('#hand'), manque = besoin() - t.clientHeight;
  if (manque > 0){
    const h = hand.offsetHeight, k = Math.max(0.72, (h - manque) / h);
    hand.style.transformOrigin = '50% 100%';
    hand.style.transform = 'scale(' + k.toFixed(3) + ')';
    hand.style.height = Math.round(h * k) + 'px';
  }
}
