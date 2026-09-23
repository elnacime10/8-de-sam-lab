/* Le 8 de SAM — js/son.js
   Bruitages générés et vibration. */

/* ---- son : tout passe par un volume maître + un limiteur, sinon ça sature ---- */
let actx = null, master = null;
function audio(){
  try {
    if (!actx){
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = 2.1;   // volume général : bien plus audible
      const comp = actx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 10; comp.attack.value = .003; comp.release.value = .12;
      master.connect(comp); comp.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
  } catch(e){ return null; }
  return actx;
}
document.addEventListener('pointerdown', () => audio(), { once:true });

function tone(freq, dur, type, vol, delay){
  if (!SET.sound || !audio()) return;
  try {
    const t0 = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'triangle'; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || .05, t0 + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + .02);
  } catch(e){}
}
/* bruit court, TOUJOURS passé au filtre passe-bas : sans ça c'est du grésillement */
function noise(dur, cut0, cut1, vol, delay){
  if (!SET.sound || !audio()) return;
  try {
    const t0 = actx.currentTime + (delay || 0);
    const n = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, n, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++){ const k = 1 - i / n; d[i] = (Math.random()*2 - 1) * k * k; }
    const src = actx.createBufferSource(); src.buffer = buf;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q = 0.7;
    lp.frequency.setValueAtTime(cut0, t0);
    lp.frequency.exponentialRampToValueAtTime(cut1, t0 + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + .02);
  } catch(e){}
}
function vibe(ms){ if (SET.vibe && navigator.vibrate) { try{ navigator.vibrate(ms); }catch(e){} } }
const SFX = {
  play : () => { noise(.038, 2000, 500, .16); tone(300, .04, 'sine', .055, .004); },
  draw : () => { noise(.085, 1500, 420, .11); },
  /* annonce de la dernière carte : deux notes claires qui montent */
  last : () => { tone(740, .09, 'triangle', .075); tone(988, .13, 'triangle', .065, .075); vibe(45); },
  /* enchaînement : trois notes qui montent */
  combo: () => { tone(523, .07, 'triangle', .06); tone(659, .07, 'triangle', .06, .06);
                 tone(880, .16, 'triangle', .07, .12); vibe([25,40,25]); },
  /* couleur demandée par un 8 */
  suit : () => { tone(440, .06, 'sine', .05); tone(587, .12, 'sine', .05, .05); },
  atk  : (n) => { const k = Math.max(0, Math.min(3, ((n || 2) / 2) - 1));
                  noise(.055, 1100 + k * 260, 300, .12);
                  tone(84 + k * 18, .2 + k * .03, 'sine', .13); 
                  tone(126 + k * 34, .14, 'triangle', .035, .01); vibe(60 + k * 28); },
  mine : () => { tone(620, .08, 'triangle', .075); tone(830, .1, 'triangle', .062, .06); vibe(28); },
  out  : () => { tone(660, .09, 'triangle', .08); tone(880, .14, 'triangle', .07, .07); vibe(40); },
  end  : () => { tone(523, .13, 'triangle', .08); tone(659, .15, 'triangle', .072, .1); tone(784, .28, 'triangle', .072, .21); vibe([40,60,90]); },
  no   : () => { tone(150, .08, 'triangle', .085); vibe(35); }
};
