// config.js — 게임 상수, 전역 설정, 스펠/소환수 풀

let curScreen='title-screen';
function showScreen(id){
  document.getElementById(curScreen).classList.add('hidden');
  document.getElementById(id).classList.remove('hidden');
  curScreen=id;
}
function changeDiff(){if(rafId)cancelAnimationFrame(rafId);GS=null;showScreen('loadout-screen');}
function goMenu(){if(rafId)cancelAnimationFrame(rafId);GS=null;netRole=null;showScreen('title-screen');}

// 타이틀 스파크 — DOM 로드 후 실행
window.addEventListener('DOMContentLoaded',()=>{
  const cont=document.getElementById('sparks');
  if(!cont)return;
  const cols=['#a855f7','#4af0ff','#f5c842','#ff6b35'];
  for(let i=0;i<35;i++){
    const s=document.createElement('div');s.className='spark';
    s.style.cssText=`left:${Math.random()*100}%;background:${cols[i%4]};box-shadow:0 0 4px ${cols[i%4]};animation-duration:${4+Math.random()*8}s;animation-delay:${-Math.random()*12}s;width:${1+Math.random()*3}px;height:${1+Math.random()*3}px`;
    cont.appendChild(s);
  }
});

let settings={timerDuration:90};
function changeTimer(d){settings.timerDuration=Math.max(30,Math.min(300,settings.timerDuration+d));document.getElementById('timer-val').textContent=settings.timerDuration;}

// ═══ 스펠 풀 (8종) ═══
const SPELL_POOL=[
  {id:'fireball',   name:'파이어볼',  emoji:'🔥', color:'#ff6030', cost:20, cd:700,  dmg:28, speed:7,   radius:10, type:'proj', desc:'빠른 화염 투사체'},
  {id:'frost',      name:'프로스트',  emoji:'❄️', color:'#80dfff', cost:15, cd:550,  dmg:16, speed:5,   radius:8,  type:'proj', slow:true, desc:'명중 시 적 속도 감소'},
  {id:'lightning',  name:'번개',      emoji:'⚡', color:'#ffee00', cost:28, cd:1100, dmg:42, speed:13,  radius:6,  type:'proj', pierce:true, desc:'관통, 높은 피해'},
  {id:'vortex',     name:'보텍스',    emoji:'🌀', color:'#b070ff', cost:38, cd:2000, dmg:10, speed:3.2, radius:20, type:'nova', count:8, desc:'8방향 동시 발사'},
  {id:'nova',       name:'블라스트',  emoji:'💥', color:'#ff4488', cost:45, cd:2400, dmg:18, speed:4,   radius:14, type:'nova', count:12, desc:'12방향 광역 폭발'},
  {id:'shadow',     name:'섀도우',    emoji:'🌑', color:'#8822cc', cost:22, cd:800,  dmg:32, speed:6,   radius:9,  type:'proj', pierceShield:true, desc:'독특한 암흑 투사체'},
  {id:'meteor',     name:'메테오',    emoji:'☄️', color:'#ff8800', cost:50, cd:2800, dmg:65, speed:9,   radius:16, type:'proj', desc:'강력한 단일 투사체'},
  {id:'icespear',   name:'아이스랜스',emoji:'🧊', color:'#aaeeff', cost:30, cd:1000, dmg:35, speed:11,  radius:7,  type:'proj', slow:true, pierce:true, desc:'관통+속도감소'},
];

// ═══ 소환수 풀 (6종) ═══
const SUMMON_POOL=[
  {id:'drake',   name:'드레이크',  emoji:'🐉', color:'#ff5500', glow:'#ff8800', cost:55, cd:5500, hp:130, speed:175, radius:15, dmg:20, atkRange:32, atkCd:850,  sightRange:320, shootRange:200, shootCd:2000, shootDmg:15, shootSpd:6,  shootR:9,  desc:'불 뿜는 비행 소환수'},
  {id:'specter', name:'스펙터',    emoji:'👻', color:'#b090ff', glow:'#8040ff', cost:40, cd:4000, hp:65,  speed:270, radius:12, dmg:14, atkRange:26, atkCd:600,  sightRange:360, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0,  phase:true, desc:'벽을 통과하는 유령'},
  {id:'golem',   name:'골렘',      emoji:'🛡️', color:'#88aaff', glow:'#4466ff', cost:70, cd:7500, hp:220, speed:115, radius:20, dmg:28, atkRange:40, atkCd:1300, sightRange:260, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0,   desc:'느리지만 강인한 탱커'},
  {id:'wisp',    name:'위스프',    emoji:'🔮', color:'#ff88cc', glow:'#ff44aa', cost:35, cd:3500, hp:45,  speed:225, radius:10, dmg:10, atkRange:22, atkCd:480,  sightRange:400, shootRange:290, shootCd:1400, shootDmg:22, shootSpd:7.5,shootR:9,  pierce:true, desc:'원거리 관통 공격'},
  {id:'phoenix', name:'피닉스',    emoji:'🦅', color:'#ffaa00', glow:'#ff6600', cost:60, cd:6000, hp:90,  speed:230, radius:14, dmg:16, atkRange:28, atkCd:700,  sightRange:380, shootRange:240, shootCd:1600, shootDmg:18, shootSpd:7,  shootR:8,  desc:'빠른 불꽃 공중 전사'},
  {id:'goliath', name:'골리앗',    emoji:'👾', color:'#44ff88', glow:'#00cc44', cost:80, cd:9000, hp:300, speed:90,  radius:22, dmg:35, atkRange:45, atkCd:1600, sightRange:240, shootRange:0,   shootCd:99999,shootDmg:0,  shootSpd:0,  shootR:0,   desc:'최강 체력의 거대 골렘'},
];

// 플레이어 로드아웃 (4스펠+2소환 슬롯)
let playerLoadout={
  spells: ['fireball','frost','lightning','vortex'],
  summons: ['drake','specter']
};

// 현재 게임에서 쓸 SPELLS/SUMMONS (loadout 기반으로 설정)
let SPELLS=[], SUMMONS=[];
function applyLoadout(){
  SPELLS=playerLoadout.spells.map(id=>SPELL_POOL.find(s=>s.id===id)||SPELL_POOL[0]);
  SUMMONS=playerLoadout.summons.map(id=>SUMMON_POOL.find(s=>s.id===id)||SUMMON_POOL[0]);
}
applyLoadout();

const DIFF={
  easy:   {aiSpeed:.6,  aiAttackRate:.3,  aiSummonRate:.02,  invasionDmg:5,  invasionDelay:2.2},
  normal: {aiSpeed:.82, aiAttackRate:.52, aiSummonRate:.042, invasionDmg:10, invasionDelay:1.2},
  hard:   {aiSpeed:1.1, aiAttackRate:.78, aiSummonRate:.07,  invasionDmg:16, invasionDelay:.6},
};

let difficulty='normal',roundNum=1,scores=[0,0],totalStats={kills:0,spells:0,summons:0};

// keys는 여기서 선언 — game.js와 ui.js 모두 참조
const keys={};

const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d');
let W,H;
function resizeCanvas(){W=canvas.width=window.innerWidth;H=canvas.height=window.innerHeight;}
window.addEventListener('resize',()=>{resizeCanvas();if(GS)recalcArena();});

function hex2rgb(hex){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `${r},${g},${b}`;}

// ─── 알림/오버레이 ─────────────────────────
function showNotif(msg,col='#f5c842'){
  let n=document.getElementById('notif-bar');
  if(!n){n=document.createElement('div');n.id='notif-bar';n.style.cssText='position:fixed;top:120px;left:50%;transform:translateX(-50%);font-family:Cinzel,serif;font-size:.85rem;font-weight:700;letter-spacing:.12em;pointer-events:none;z-index:200;transition:opacity .4s';document.body.appendChild(n);}
  n.textContent=msg;n.style.color=col;n.style.opacity=1;n.style.textShadow=`0 0 14px ${col}`;
  clearTimeout(n._t);n._t=setTimeout(()=>n.style.opacity=0,1800);
}
function showOverlay(msg,col='#f5c842',dur=1.8){
  const el=document.getElementById('overlay-msg');
  el.textContent=msg;el.style.color=col;el.style.textShadow=`0 0 40px ${col}`;
  el.classList.add('show');if(dur<9000)setTimeout(()=>el.classList.remove('show'),dur*1000);
}
function shakeScreen(str){if(GS){GS.shakeT=str;}}
function playSFXForSpell(idx){const sp=SPELLS[idx];if(!sp)return;playSFX(sp.type==='nova'?'nova':'spell',.4);}
function spawnHitFX(x,y,col){if(!GS)return;for(let i=0;i<7;i++)GS.particles.push(new Particle(x,y,col,(Math.random()-.5)*5,(Math.random()-.5)*5,3+Math.random()*3,.35+Math.random()*.3));}
function spawnDeathFX(x,y,col){if(!GS)return;for(let i=0;i<22;i++)GS.particles.push(new Particle(x,y,col,(Math.random()-.5)*8,(Math.random()-.2)*8,4+Math.random()*5,.6+Math.random()*.5));}
function spawnOrbFX(x,y){if(!GS)return;for(let i=0;i<8;i++)GS.particles.push(new Particle(x,y,'#c084fc',(Math.random()-.5)*4,(Math.random()-.5)*4,2+Math.random()*2,.4));}
