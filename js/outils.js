/* Le 8 de SAM — js/outils.js
   Petits outils partagés par tout le jeu. */

const coarse = matchMedia('(pointer: coarse)').matches;
/* Filet : un élément absent ne doit jamais tuer la page. */
const NOEL = { classList:{ add(){}, remove(){}, toggle(){}, contains:()=>false },
  style:{ setProperty(){}, removeProperty(){} }, dataset:{},
  addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){}, focus(){},
  querySelector:()=>NOEL, querySelectorAll:()=>[], getBoundingClientRect:()=>({left:0,top:0,width:0,height:0}),
  textContent:'', innerHTML:'', value:'', src:'', disabled:false, clientWidth:0, scrollTop:0, scrollHeight:0,
  firstElementChild:null, _absent:true };
const $ = q => document.querySelector(q) || NOEL;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const seats = () => [...Array(MATCH.n).keys()];
const nameOf = p => MATCH.names[p] || CHARS[MATCH.chars[p]].nom;
const faceOf = p => IMG[MATCH.chars[p]];
const isChain = r => r === '7' || r === '10' || r === 'V';
const countSuit = (h, s) => h.filter(c => c.s === s).length;
const countRank = (h, r) => h.filter(c => c.r === r).length;
