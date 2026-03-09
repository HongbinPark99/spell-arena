// config.js — v13 베이스 + 마나 증가 + 로드아웃 풀

let curScreen = 'title-screen';
function showScreen(id) {
  // 모든 일반 메뉴 화면 숨기기
  document.querySelectorAll('.screen').forEach(el => { el.style.display = 'none'; });
  // 게임 래퍼 숨기기
  const gw = document.getElementById('game-screen');
  if(gw) gw.style.display = 'none';
  // 결과 오버레이 숨기기
  const ro = document.getElementById('result-screen');
  if(ro) ro.style.display = 'none';

  if(id === 'game-screen'){
    if(gw) gw.style.display = 'block';
  } else if(id === 'result-screen'){
    if(gw) gw.style.display = 'block';   // 배경으로 게임 유지
    if(ro) ro.style.display = 'flex';    // 결과 위에 오버레이
  } else {
    const el = document.getElementById(id);
    if(el) el.style.display = 'flex';
  }
  curScreen = id;
}
function changeDiff() { if(rafId) cancelAnimationFrame(rafId); GS=null; showScreen('diff-screen'); }
function goMenu()     { if(rafId) cancelAnimationFrame(rafId); GS=null; netRole=null; showScreen('title-screen'); }

// 타이틀 스파크
(()=>{
  const cont=document.getElementById('sparks'), cols=['#a855f7','#4af0ff','#f5c842','#ff6b35'];
  for(let i=0;i<35;i++){
    const s=document.createElement('div'); s.className='spark';
    s.style.cssText=`left:${Math.random()*100}%;background:${cols[i%4]};box-shadow:0 0 4px ${cols[i%4]};animation-duration:${4+Math.random()*8}s;animation-delay:${-Math.random()*12}s;width:${1+Math.random()*3}px;height:${1+Math.random()*3}px`;
    cont.appendChild(s);
  }
})();

let settings = { timerDuration: 90 };
function changeTimer(d){
  settings.timerDuration = Math.max(30, Math.min(300, settings.timerDuration+d));
  document.getElementById('timer-val').textContent = settings.timerDuration;
}

// ═══ 스펠 풀 (8종) — id 기준 ═══
const SPELL_POOL = [
  { id:'fireball',  name:'파이어볼',   emoji:'🔥', color:'#ff6030', cost:20, cd:800,  dmg:28, speed:6,   radius:10, type:'proj' },
  { id:'frost',     name:'프로스트',   emoji:'❄️', color:'#80dfff', cost:15, cd:600,  dmg:18, speed:4.5, radius:8,  type:'proj', slow:true },
  { id:'lightning', name:'번개',        emoji:'⚡', color:'#ffee00', cost:30, cd:1200, dmg:45, speed:11,  radius:6,  type:'proj', pierce:true },
  { id:'vortex',   name:'보텍스',      emoji:'🌀', color:'#b070ff', cost:40, cd:2000, dmg:12, speed:3,   radius:22, type:'nova', count:8 },
  { id:'nova',     name:'블라스트',    emoji:'💥', color:'#ff4488', cost:45, cd:2400, dmg:18, speed:4,   radius:14, type:'nova', count:12 },
  { id:'shadow',   name:'섀도우볼트',  emoji:'🌑', color:'#8822cc', cost:22, cd:800,  dmg:32, speed:6,   radius:9,  type:'proj' },
  { id:'meteor',   name:'메테오',      emoji:'☄️', color:'#ff8800', cost:50, cd:2800, dmg:65, speed:9,   radius:16, type:'proj' },
  { id:'icespear', name:'아이스랜스',  emoji:'🧊', color:'#aaeeff', cost:30, cd:1000, dmg:35, speed:11,  radius:7,  type:'proj', slow:true, pierce:true },
  { id:'poison',   name:'포이즌',      emoji:'☠️', color:'#44ff88', cost:25, cd:900,  dmg:12, speed:5,   radius:10, type:'proj', dot:true },
  { id:'arcane',   name:'아케인볼트',  emoji:'🔵', color:'#88ccff', cost:18, cd:500,  dmg:22, speed:8,   radius:8,  type:'proj' },
  { id:'thunder',  name:'썬더클랩',    emoji:'🌩', color:'#fff176', cost:35, cd:1800, dmg:38, speed:0,   radius:80, type:'nova', count:1 },
  { id:'darkfire', name:'다크파이어',  emoji:'🖤', color:'#cc44ff', cost:28, cd:1000, dmg:30, speed:7,   radius:11, type:'proj', pierce:true },
];

// ═══ 소환수 풀 (6종) ═══
const SUMMON_POOL = [
  { id:'drake',   name:'Drake',   emoji:'🐉', color:'#4af0ff', glow:'#0088ff', cost:55, cd:6000, hp:120, speed:170, radius:28, dmg:13, atkRange:55, atkCd:900,  sightRange:380, shootRange:190, shootCd:2200, shootDmg:10, shootSpd:5.5, shootR:8 },
  { id:'specter', name:'Specter', emoji:'👻', color:'#b090ff', glow:'#8040ff', cost:40, cd:4500, hp:60,  speed:260, radius:22, dmg:10, atkRange:50, atkCd:650,  sightRange:400, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0, phase:true },
  { id:'golem',   name:'Golem',   emoji:'🛡️', color:'#88aaff', glow:'#4466ff', cost:70, cd:8000, hp:200, speed:110, radius:34, dmg:18, atkRange:65, atkCd:1200, sightRange:300, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0 },
  { id:'wisp',    name:'Wisp',    emoji:'🔮', color:'#ff88cc', glow:'#ff44aa', cost:35, cd:3500, hp:40,  speed:220, radius:20, dmg:7,  atkRange:45, atkCd:500,  sightRange:420, shootRange:280, shootCd:1500, shootDmg:14, shootSpd:7,  shootR:9, pierce:true },
  { id:'phoenix', name:'Phoenix', emoji:'🦅', color:'#ffaa00', glow:'#ff6600', cost:60, cd:6000, hp:90,  speed:230, radius:26, dmg:11, atkRange:50, atkCd:700,  sightRange:400, shootRange:240, shootCd:1600, shootDmg:13, shootSpd:7,  shootR:8 },
  { id:'goliath', name:'Goliath', emoji:'👾', color:'#44ff88', glow:'#00cc44', cost:80, cd:9000, hp:300, speed:90,  radius:42, dmg:25, atkRange:70, atkCd:1400, sightRange:300, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0 },
  { id:'serpent', name:'Serpent', emoji:'🐍', color:'#88ff44', glow:'#44cc00', cost:45, cd:5000, hp:70,  speed:240, radius:20, dmg:12, atkRange:48, atkCd:600,  sightRange:420, shootRange:260, shootCd:1800, shootDmg:16, shootSpd:6.5, shootR:8, slow:true },
  { id:'golem2',  name:'IceGolem',emoji:'🧊', color:'#aaddff', glow:'#66aaff', cost:65, cd:7500, hp:160, speed:120, radius:30, dmg:20, atkRange:60, atkCd:1100, sightRange:300, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0, slow:true },
];

// 플레이어 로드아웃 (기본값 = v13과 동일한 4스펠 4소환)
let playerLoadout = {
  spells:  ['fireball','frost','lightning','vortex'],
  summons: ['drake','specter','golem','wisp'],
};

// SPELLS / SUMMONS: 로드아웃 적용 (v13 기존 코드와 완전 호환)
let SPELLS = [], SUMMONS = [];
function applyLoadout() {
  SPELLS  = playerLoadout.spells .map(id => SPELL_POOL .find(s=>s.id===id) || SPELL_POOL[0]);
  SUMMONS = playerLoadout.summons.map(id => SUMMON_POOL.find(s=>s.id===id) || SUMMON_POOL[0]);
}
applyLoadout();

const DIFF = {
  easy:   { aiSpeed:0.65, aiAttackRate:0.35, aiSummonRate:0.025, invasionDmg:6,  invasionDelay:2.0 },
  normal: { aiSpeed:0.85, aiAttackRate:0.55, aiSummonRate:0.045, invasionDmg:10, invasionDelay:1.2 },
  hard:   { aiSpeed:1.1,  aiAttackRate:0.80, aiSummonRate:0.07,  invasionDmg:16, invasionDelay:0.6 },
};

let difficulty='normal', roundNum=1, scores=[0,0], totalStats={kills:0,spells:0,summons:0};

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
let W, H;
function resizeCanvas(){ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }
window.addEventListener('resize', ()=>{ resizeCanvas(); if(GS) recalcArena(); });

function hex2rgb(hex){
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
