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

// ═══ 스펠 풀 (12종) — type별 개성 ═══
const SPELL_POOL = [
  // ── 공격형 ──
  { id:'fireball',  name:'파이어볼',   emoji:'🔥', color:'#ff6030', cost:22, cd:900,   dmg:30, speed:6,   radius:11, type:'proj',
    desc:'폭발하면 주변에 불씨 파편 3개 퍼짐', burst:true, burstCount:3, burstDmg:10 },

  { id:'icespear',  name:'아이스랜스', emoji:'🧊', color:'#aaeeff', cost:28, cd:1000,  dmg:28, speed:12,  radius:7,  type:'proj',
    desc:'명중 시 슬로우 2.5초 + 소환수도 둔화', slow:true, slowDur:2.5, pierce:false },

  { id:'meteor',    name:'메테오',     emoji:'☄️', color:'#ff8800', cost:55, cd:3000,  dmg:70, speed:8,   radius:18, type:'proj',
    desc:'느리지만 충격파로 주변 소환수도 피해', shockwave:true, shockwaveR:70, shockwaveDmg:25 },

  { id:'chain',     name:'체인 라이트닝', emoji:'⚡', color:'#ffee44', cost:35, cd:1600, dmg:35, speed:0, radius:0, type:'chain',
    desc:'적 소환수 3마리를 연쇄로 감전 (범위:220)', chainRange:220, chainCount:3, chainDmg:30 },

  // ── 방어/지원형 ──
  { id:'shield',    name:'마법 방패',  emoji:'🛡', color:'#4af0ff', cost:30, cd:2500,  dmg:0,  speed:0,   radius:0,  type:'shield',
    desc:'0.7초간 앞에서 오는 투사체를 모두 막음', shieldDur:700 },

  { id:'mirror',    name:'미러월',     emoji:'🪞', color:'#c0e8ff', cost:40, cd:3200,  dmg:0,  speed:0,   radius:0,  type:'mirror',
    desc:'0.5초 내 맞는 투사체를 반사시킴', mirrorDur:500 },

  { id:'blink',     name:'블링크',     emoji:'💨', color:'#88ffcc', cost:25, cd:2000,  dmg:0,  speed:0,   radius:0,  type:'blink',
    desc:'자기 진영 내에서 0.6초 무적 + 순간이동', blinkDist:180 },

  // ── 범위/제압형 ──
  { id:'nova',      name:'아케인 노바',emoji:'💥', color:'#ff44aa', cost:45, cd:2500,  dmg:20, speed:5,   radius:14, type:'nova',
    desc:'12방향 폭발 — 소환수 정리에 특효', count:12 },

  { id:'blizzard',  name:'블리자드',   emoji:'🌨', color:'#cceeff', cost:50, cd:3000,  dmg:12, speed:3.5, radius:9,  type:'nova',
    desc:'8방향 슬로우 투사체 — 소환수 진입 차단', count:8, slow:true, slowDur:3.0 },

  { id:'gravwell',  name:'그래비티웰',  emoji:'🌀', color:'#b070ff', cost:40, cd:2200,  dmg:8,  speed:0,   radius:0,  type:'gravwell',
    desc:'3초간 전선 중앙에 인력 — 소환수를 끌어당겨 뭉침', gravDur:3000, gravRange:180, gravPull:55 },

  // ── 독/지속 피해형 ──
  { id:'poison',    name:'독안개',     emoji:'☠️', color:'#44ff88', cost:30, cd:2000,  dmg:6,  speed:4,   radius:18, type:'cloud',
    desc:'명중 위치에 독 구름 2.5초 생성 — 구름 안 소환수 초당 피해', cloudDur:2500, cloudDmg:8, cloudR:55 },

  { id:'shadow',    name:'섀도우 마크', emoji:'🌑', color:'#8822cc', cost:25, cd:1200, dmg:15, speed:7,   radius:9,  type:'proj',
    desc:'명중하면 마크 — 3초간 해당 대상이 추가 피해 +50% 받음', mark:true, markDur:3000, markAmp:1.5 },
];

// ═══ 소환수 풀 (6종) ═══
const SUMMON_POOL = [
  // cost 올리고 hp 낮춤 → 스펠로 처치 의미있게, 소환수 스팸 억제
  { id:'drake',   name:'Drake',   emoji:'🐉', color:'#4af0ff', glow:'#0088ff', cost:60, cd:7000, hp:90,  speed:160, radius:28, dmg:11, atkRange:55, atkCd:1000, sightRange:360, shootRange:180, shootCd:2400, shootDmg:8,  shootSpd:5,  shootR:8 },
  { id:'specter', name:'Specter', emoji:'👻', color:'#b090ff', glow:'#8040ff', cost:45, cd:5000, hp:45,  speed:240, radius:22, dmg:8,  atkRange:50, atkCd:700,  sightRange:400, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0, phase:true },
  { id:'golem',   name:'Golem',   emoji:'🛡️', color:'#88aaff', glow:'#4466ff', cost:75, cd:9000, hp:160, speed:100, radius:34, dmg:15, atkRange:65, atkCd:1400, sightRange:280, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0 },
  { id:'wisp',    name:'Wisp',    emoji:'🔮', color:'#ff88cc', glow:'#ff44aa', cost:38, cd:4000, hp:30,  speed:210, radius:20, dmg:6,  atkRange:45, atkCd:600,  sightRange:420, shootRange:260, shootCd:1600, shootDmg:11, shootSpd:7,  shootR:9, pierce:true },
  { id:'phoenix', name:'Phoenix', emoji:'🦅', color:'#ffaa00', glow:'#ff6600', cost:65, cd:7000, hp:70,  speed:220, radius:26, dmg:9,  atkRange:50, atkCd:800,  sightRange:380, shootRange:220, shootCd:1800, shootDmg:10, shootSpd:7,  shootR:8 },
  { id:'goliath', name:'Goliath', emoji:'👾', color:'#44ff88', glow:'#00cc44', cost:85, cd:10000,hp:240, speed:85,  radius:42, dmg:20, atkRange:70, atkCd:1600, sightRange:280, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0 },
  { id:'serpent', name:'Serpent', emoji:'🐍', color:'#88ff44', glow:'#44cc00', cost:48, cd:5500, hp:55,  speed:230, radius:20, dmg:10, atkRange:48, atkCd:700,  sightRange:420, shootRange:240, shootCd:2000, shootDmg:13, shootSpd:6,  shootR:8, slow:true },
  { id:'golem2',  name:'IceGolem',emoji:'🧊', color:'#aaddff', glow:'#66aaff', cost:68, cd:8000, hp:130, speed:115, radius:30, dmg:16, atkRange:60, atkCd:1200, sightRange:280, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0, slow:true },
];

// 플레이어 로드아웃 (기본값 = v13과 동일한 4스펠 4소환)
let playerLoadout = {
  spells:  ['fireball','icespear','shield','chain'],
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
function resizeCanvas(){
  // game-screen이 보이는 상태에서 실제 뷰포트를 정확히 측정
  const gw=document.getElementById('game-screen');
  const w = (gw&&gw.offsetWidth>0) ? gw.offsetWidth : window.innerWidth;
  const h = (gw&&gw.offsetHeight>0) ? gw.offsetHeight : window.innerHeight;
  W=canvas.width=w; H=canvas.height=h;
}
window.addEventListener('resize', ()=>{ resizeCanvas(); if(GS) recalcArena(); });

function hex2rgb(hex){
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
