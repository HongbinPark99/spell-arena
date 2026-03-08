// ════════════════════════════════════════
//  config.js — 게임 상수 및 전역 설정
//  · 스펠/소환수/난이도 데이터
//  · 캔버스 초기화
//  · 화면 전환 (showScreen)
// ════════════════════════════════════════

// ─── 화면 전환 ───────────────────────────
let curScreen = 'title-screen';
function showScreen(id) {
  document.getElementById(curScreen).classList.add('hidden');
  document.getElementById(id).classList.remove('hidden');
  curScreen = id;
}
function changeDiff() { if(rafId) cancelAnimationFrame(rafId); GS=null; showScreen('diff-screen'); }
function goMenu()     { if(rafId) cancelAnimationFrame(rafId); GS=null; showScreen('title-screen'); }

// ─── 타이틀 스파크 파티클 ─────────────────
(()=>{
  const cont=document.getElementById('sparks'), cols=['#a855f7','#4af0ff','#f5c842','#ff6b35'];
  for(let i=0;i<35;i++){
    const s=document.createElement('div'); s.className='spark';
    s.style.cssText=`left:${Math.random()*100}%;background:${cols[i%4]};box-shadow:0 0 4px ${cols[i%4]};animation-duration:${4+Math.random()*8}s;animation-delay:${-Math.random()*12}s;width:${1+Math.random()*3}px;height:${1+Math.random()*3}px`;
    cont.appendChild(s);
  }
})();

// ─── 게임 설정 ────────────────────────────
let settings = { timerDuration: 90 };
function changeTimer(d){
  settings.timerDuration = Math.max(30, Math.min(300, settings.timerDuration+d));
  document.getElementById('timer-val').textContent = settings.timerDuration;
}

// ─── 스펠 데이터 ──────────────────────────
// cost: 마나 소비 / cd: 쿨다운(ms) / dmg: 피해 / speed: 투사체 속도
// type: 'proj'=직선, 'nova'=사방 발사
const SPELLS = [
  { name:'Fireball',  emoji:'🔥', color:'#ff6030', cost:20, cd:800,  dmg:28, speed:6,   radius:10, type:'proj' },
  { name:'Frost',     emoji:'❄️', color:'#80dfff', cost:15, cd:600,  dmg:18, speed:4.5, radius:8,  type:'proj', slow:true },
  { name:'Lightning', emoji:'⚡', color:'#ffee00', cost:30, cd:1200, dmg:45, speed:11,  radius:6,  type:'proj', pierce:true },
  { name:'Vortex',    emoji:'🌀', color:'#b070ff', cost:40, cd:2000, dmg:12, speed:3,   radius:22, type:'nova', count:8 },
];

// ─── 소환수 데이터 ────────────────────────
// 검 피해: 40 / 소환수 HP 기준으로 몇 대인지 계산
// Drake:   HP 120 → 검 3회 / Fireball 5회 / Lightning 3회
// Specter: HP  60 → 검 2회 / Fireball 3회 / Lightning 2회
// Golem:   HP 200 → 검 5회 / Fireball 8회 / Lightning 5회 (탱커!)
// Wisp:    HP  40 → 검 1회 / Fireball 2회 (유리몸, 원거리 강함)
const SUMMONS = [
  { name:'Drake',   emoji:'🐉', color:'#ff5500', glow:'#ff8800', cost:55, cd:6000, hp:120, speed:170, radius:15, dmg:18, atkRange:30, atkCd:900,  sightRange:320, shootRange:190, shootCd:2200, shootDmg:14, shootSpd:5.5, shootR:8 },
  { name:'Specter', emoji:'👻', color:'#b090ff', glow:'#8040ff', cost:40, cd:4500, hp:60,  speed:260, radius:12, dmg:13, atkRange:24, atkCd:650,  sightRange:360, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0,  phase:true },
  { name:'Golem',   emoji:'🛡️', color:'#88aaff', glow:'#4466ff', cost:70, cd:8000, hp:200, speed:110, radius:20, dmg:25, atkRange:38, atkCd:1400, sightRange:250, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0 },
  { name:'Wisp',    emoji:'🔮', color:'#ff88cc', glow:'#ff44aa', cost:35, cd:3500, hp:40,  speed:220, radius:10, dmg:10, atkRange:20, atkCd:500,  sightRange:400, shootRange:280, shootCd:1500, shootDmg:20, shootSpd:7,  shootR:9,  pierce:true },
];

// ─── 난이도 설정 ──────────────────────────
const DIFF = {
  easy:   { aiSpeed:0.65, aiAttackRate:0.35, aiSummonRate:0.025, invasionDmg:6,  invasionDelay:2.0 },
  normal: { aiSpeed:0.85, aiAttackRate:0.55, aiSummonRate:0.045, invasionDmg:10, invasionDelay:1.2 },
  hard:   { aiSpeed:1.1,  aiAttackRate:0.80, aiSummonRate:0.07,  invasionDmg:16, invasionDelay:0.6 },
};

// ─── 게임 상태 변수 ───────────────────────
let difficulty='normal', roundNum=1, scores=[0,0], totalStats={kills:0,spells:0,summons:0};

// ─── 캔버스 초기화 ────────────────────────
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
let W, H;
function resizeCanvas(){ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }
window.addEventListener('resize', ()=>{ resizeCanvas(); if(GS) recalcArena(); });

// ─── 그리기 유틸 ──────────────────────────
function hex2rgb(hex){
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
