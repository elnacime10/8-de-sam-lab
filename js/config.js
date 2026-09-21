/* Le 8 de SAM — js/config.js
   Réglages : tailles d'écran, vitesses, préférences mémorisées. */

let CW = 62, CH = 88, COL = 620;
function sizeUp(){
  const vw = window.innerWidth || 400, vh = window.innerHeight || 800;
  /* la colonne suit la hauteur : sur un grand écran tout grandit ensemble */
  COL = Math.max(300, Math.min(vw, Math.min(760, Math.round(vh * 0.62))));
  /* la carte est bornée par la largeur ET par la hauteur, sinon ça déborde */
  CW = Math.round(Math.max(50, Math.min(94, Math.min(COL * 0.165, vh * 0.102))));
  CH = Math.round(CW * 1.42);
  const pw = Math.round(Math.max(72, Math.min(150, Math.min(COL * 0.30, vh * 0.17))));
  const faceH = Math.round(Math.max(58, Math.min(160, vh * (vh < 640 ? 0.118 : 0.145))));
  const gap = vh < 640 ? 5 : 9;
  const r = document.documentElement.style;
  r.setProperty('--col', COL + 'px');
  r.setProperty('--card-w', CW + 'px');
  r.setProperty('--card-h', CH + 'px');
  r.setProperty('--pile-w', pw + 'px');
  r.setProperty('--pile-h', Math.round(pw * 1.4) + 'px');
  r.setProperty('--faceH', faceH + 'px');
  r.setProperty('--gap', gap + 'px');
}

const CONFIG = {
  aiThinkMs    : 850,
  aiChainMs    : 600,
  flyMs        : 400,
  settleMs     : 240,
  drawHoldMs   : 300,
  fastMs       : 190,      // résolution accélérée quand tu es sorti
  stagnation   : { startTurn:3, relaxAt:6, pushAt:12, reshuffleForce:2 },
  hardErrorRate: 0.15,
  midErrorRate : 0.32,
  histMax      : 7,
  bubbleGap    : 4,      // coups minimum entre deux répliques
  bubbleMs     : 2600    // durée d'affichage d'une réplique
};
const SPEEDS = [{name:'lente',k:1.5},{name:'normale',k:1},{name:'rapide',k:0.55}];
const SET = { sound:true, vibe:true, speed:1, sort:'suit', trash:true };

function loadSet(){ try{ Object.assign(SET, JSON.parse(localStorage.getItem('sam8_set')) || {}); }catch(e){} }
function saveSet(){ try{ localStorage.setItem('sam8_set', JSON.stringify(SET)); }catch(e){} }
let speedIdx = 1;
const S = ms => Math.round(ms * SPEEDS[speedIdx].k);
