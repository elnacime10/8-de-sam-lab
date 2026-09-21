/* Le 8 de SAM — js/son.js
   Bruitages générés et vibration. */

/* ---- son : tout passe par un volume maître + un limiteur, sinon ça sature ---- */
let actx = null, master = null;
function audio(){
  try {
    if (!actx){
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = 0.9;
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
  play : () => { noise(.032, 2000, 500, .085); tone(300, .035, 'sine', .028, .004); },
  draw : () => { noise(.075, 1500, 420, .055); },
  atk  : (n) => { const k = Math.max(0, Math.min(3, ((n || 2) / 2) - 1));
                  noise(.05, 1100 + k * 260, 300, .07);
                  tone(84 + k * 18, .2 + k * .03, 'sine', .075); 
                  tone(126 + k * 34, .14, 'triangle', .035, .01); vibe(60 + k * 28); },
  mine : () => { tone(620, .07, 'triangle', .04); tone(830, .09, 'triangle', .033, .06); vibe(28); },
  out  : () => { tone(660, .08, 'triangle', .045); tone(880, .12, 'triangle', .038, .07); },
  end  : () => { tone(523, .12, 'triangle', .045); tone(659, .14, 'triangle', .04, .1); tone(784, .26, 'triangle', .04, .21); vibe([40,60,90]); },
  no   : () => { tone(150, .07, 'triangle', .04); vibe(35); }
};
