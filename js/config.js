/* Le 8 de SAM — js/config.js
   Réglages : tailles d'écran, vitesses, préférences mémorisées. */

let CW = 62, CH = 88, COL = 620;
let PW0 = 90;              /* taille idéale de la défausse, avant ajustement */
function sizeUp(){
  const vw = window.innerWidth || 400, vh = window.innerHeight || 800;
  /* la colonne suit la hauteur : sur un grand écran tout grandit ensemble */
  COL = Math.max(300, Math.min(vw, Math.min(760, Math.round(vh * 0.62))));
  /* la carte est bornée par la largeur ET par la hauteur, sinon ça déborde */
  CW = Math.round(Math.max(50, Math.min(110, Math.min(COL * 0.215, vh * 0.106))));
  CH = Math.round(CW * 1.42);
  const pw = PW0 = Math.round(Math.max(70, Math.min(132, Math.min(COL * 0.27, vh * 0.155))));
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
  /* toutes les durées du jeu sont ici, en millisecondes, vitesse « normale » */
  aiThinkMs:1400, aiChainMs:900, flyMs:650, settleMs:320, drawHoldMs:420, fastMs:260,
  introMs:1400, dealMs:70,                 /* ouverture : volontairement rapide */
  histMax:7, filMax:3, bubbleGap:3, bubbleMs:2600,
  stagnation:{startTurn:3, relaxAt:6, pushAt:12, reshuffleForce:2},
  hardErrorRate:0.15, midErrorRate:0.32
};
const SPEEDS = [{name:'normale',k:1},{name:'rapide',k:0.62}];   /* deux vitesses suffisent */
const SET = { sound:true, vibe:true, speed:0, sort:'suit', trash:true };

function loadSet(){ try{ Object.assign(SET, JSON.parse(localStorage.getItem('sam8_set')) || {}); }catch(e){} }
/* deux vitesses désormais : un ancien réglage à 2 revient dans la plage */
function bornerVitesse(){ if (!(SET.speed >= 0 && SET.speed <= 1)) SET.speed = (SET.speed >= 2 ? 1 : 0); }
function saveSet(){ try{ localStorage.setItem('sam8_set', JSON.stringify(SET)); }catch(e){} }
let speedIdx = 0;
const S = ms => Math.round(ms * (SPEEDS[speedIdx] || SPEEDS[0]).k);
