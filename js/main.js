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

let EN_SEQUENCE = false;
async function startManche(){
  EN_SEQUENCE = true;
  if (MATCH.online && !MATCH.host) return;      // seul l'hôte distribue
  stopChrono();
  busy = true; pending8 = -1;
  annuleVols(); filVide();
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
  EN_SEQUENCE = false;
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
bornerVitesse(); speedIdx = SET.speed;
refreshSet();
refreshSetup();

/* ---- Numéro de version : sur l'accueil et dans la pause ---- */
const VERSION_JEU = '2.2.1';
$('#versionHome').textContent = 'Version ' + VERSION_JEU;
$('#versionMenu').textContent = 'Version ' + VERSION_JEU;

/* ---- Mises à jour : le jeu va chercher la nouvelle version tout seul ---- */
if ('serviceWorker' in navigator){
  const dejaGere = !!navigator.serviceWorker.controller;   /* première visite : pas de rechargement */
  let recharge = false;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      /* on revérifie chaque fois que le jeu revient au premier plan */
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!dejaGere || recharge) return;
    const enPartie = (G && !G.over) || MATCH.online;
    if (!enPartie){ recharge = true; location.reload(); }   /* hors partie : on recharge tout de suite */
    else netBar('Nouvelle version prête : elle s\'installera à la prochaine ouverture du jeu.', true);
  });
}


/* ============================================================
   BOÎTE NOIRE ET SÉCURITÉ (diagnostic)
   - garde en mémoire les derniers coups et les erreurs
   - si le tour d'un adversaire ne démarre pas, le relance
   ============================================================ */
const JOURNAL = [];
let relances = 0;
function note(quoi, extra){
  JOURNAL.push(Object.assign({ s: Math.round(performance.now() / 100) / 10, quoi }, extra || {}));
  if (JOURNAL.length > 140) JOURNAL.shift();
}
window.addEventListener('error', e => note('ERREUR', {
  msg: String(e.message || ''), ou: String(e.filename || '').split('/').pop() + ':' + e.lineno }));
window.addEventListener('unhandledrejection', e => note('ERREUR PROMESSE', {
  msg: String((e.reason && e.reason.message) || e.reason || '') }));

let dernierActe = -1, immobile = 0;
setInterval(() => {
  try {
    if (!G || G.over) return;
    if (G.actNo !== dernierActe){
      dernierActe = G.actNo; immobile = 0;
      note('coup', { n:G.actNo, qui:G.lastAct ? G.lastAct.p : -1, quoi:G.lastAct ? G.lastAct.k : '',
                     tour:G.turn, busy, mains:G.hands.map(h => h.length).join('/') });
      return;
    }
    immobile++;
    if (EN_SEQUENCE){ immobile = 0; return; }          /* distribution ou présentation en cours */
    const attenteIA = G.turn !== ME && isAI(G.turn) && G.in[G.turn] && (!MATCH.online || MATCH.host);
    if (attenteIA && immobile >= 6){
      note('BLOCAGE', { tour:G.turn, busy, skipAll, humains:champs('human').slice(0, MATCH.n).join(','),
        enJeu:G.in.slice(0, MATCH.n).join(','), mains:G.hands.map(h => h.length).join('/'),
        pioche:G.deck.length, defausse:G.discard.length,
        attaque:G.pending ? (G.pending.type + '+' + G.pending.amount + '→' + G.pending.target) : '—',
        top:G.top ? (G.top.r + G.top.s) : '—', couleur:G.activeSuit, actNo:G.actNo });
      immobile = 0; relances++;
      GEN_IA++;                           /* toute boucle figée s'arrête à son prochain tour */
      busy = false;
      flash('Adversaire relancé', true);
      runAI();
    }
  } catch(e){ note('ERREUR VEILLE', { msg:String(e && e.message) }); }
}, 1000);

function rapport(){
  return JSON.stringify({
    version: VERSION_JEU, protocole: (typeof VERSION_PROTO !== 'undefined' ? VERSION_PROTO : '?'),
    quand: new Date().toISOString(), relances,
    minuteries: (typeof minuteriesVivantes === 'function' ? minuteriesVivantes() : []),
    fichiers: { reseau: typeof texteRevanche === 'function', moteur: typeof verifieSieges === 'function',
                affichage: typeof ajusteTable === 'function', ecrans: typeof shuffleSeats === 'function' },
    ecran: (window.innerWidth || 0) + 'x' + (window.innerHeight || 0),
    match: G ? { n:MATCH.n, enLigne:MATCH.online, hote:MATCH.host, moi:ME, tour:MATCH.tour + '/' + MATCH.tours,
                 humains:champs('human').slice(0, MATCH.n), niveaux:champs('level').slice(0, MATCH.n),
                 vitesse:SET.speed } : null,
    etat: G ? { tour:G.turn, finie:G.over, busy, skipAll, enJeu:G.in.slice(0, MATCH.n),
                mains:G.hands.map(h => h.length), pioche:G.deck.length, defausse:G.discard.length,
                attaque:G.pending, top:G.top, couleur:G.activeSuit, actNo:G.actNo, sortis:G.out } : null,
    journal: JOURNAL.slice(-70)
  }, null, 1);
}
document.querySelectorAll('.diagBtn').forEach(b => b.addEventListener('click', async () => {
  const txt = rapport();
  $('#diagTxt').value = txt;
  let copie = false;
  try { await navigator.clipboard.writeText(txt); copie = true; } catch(e){}
  if (copie){ flash('Rapport copié — colle-le dans la conversation', true); }
  else { $('#menuScreen').classList.add('hidden'); $('#diagScreen').classList.remove('hidden'); }
}));
$('#diagCopy').addEventListener('click', () => {
  const t = $('#diagTxt'); t.focus(); t.select();
  try { document.execCommand('copy'); flash('Rapport copié', true); } catch(e){}
});
$('#diagClose').addEventListener('click', () => { $('#diagScreen').classList.add('hidden'); });
