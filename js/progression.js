// ═══════════════════════════════════════════════════
//  progression.js — 싱글 모드: 경험치/레벨/해금 시스템
// ═══════════════════════════════════════════════════

// ── 저장/불러오기 ─────────────────────────────────
const SAVE_KEY = 'spellArena_save_v1';

function saveProgress() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(PROG)); } catch(e) {}
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(PROG, saved);
    }
  } catch(e) {}
}

// ── 진행 상태 ────────────────────────────────────
const PROG = {
  xp: 0, level: 1, xpToNext: 100,
  clearedStages: [],      // 'ch1_s1', 'ch1_s2', ...
  unlockedSpells:  ['fireball','icespear','nova','meteor'],
  unlockedSummons: ['drake','specter','golem','wisp'],
  totalKills: 0, totalWins: 0, totalSpellsCast: 0,
};

// XP 테이블 (레벨별 필요 XP)
function xpForLevel(lv) { return Math.floor(80 * Math.pow(1.35, lv - 1)); }

// 경험치 획득
function gainXP(amount) {
  PROG.xp += amount;
  let leveled = false;
  const unlocks = [];
  while (PROG.xp >= PROG.xpToNext) {
    PROG.xp -= PROG.xpToNext;
    PROG.level++;
    PROG.xpToNext = xpForLevel(PROG.level);
    leveled = true;
    const u = checkLevelUnlocks(PROG.level);
    unlocks.push(...u);
  }
  saveProgress();
  return { leveled, unlocks };
}

// ── 해금 테이블 ───────────────────────────────────
const UNLOCK_TABLE = [
  { level: 2,  type:'spell',  id:'shadow',   name:'섀도우 마크',  emoji:'🌑' },
  { level: 2,  type:'summon', id:'phoenix',  name:'Phoenix',      emoji:'🦅' },
  { level: 3,  type:'spell',  id:'blizzard', name:'블리자드',     emoji:'🌨' },
  { level: 3,  type:'summon', id:'serpent',  name:'Serpent',      emoji:'🐍' },
  { level: 4,  type:'spell',  id:'shield',   name:'마법 방패',    emoji:'🛡' },
  { level: 4,  type:'summon', id:'goliath',  name:'Goliath',      emoji:'👾' },
  { level: 5,  type:'spell',  id:'chain',    name:'체인 라이트닝',emoji:'⚡' },
  { level: 5,  type:'summon', id:'golem2',   name:'IceGolem',     emoji:'🧊' },
  { level: 6,  type:'spell',  id:'poison',   name:'독안개',       emoji:'☠️' },
  { level: 7,  type:'spell',  id:'mirror',   name:'미러월',       emoji:'🪞' },
  { level: 8,  type:'spell',  id:'blink',    name:'블링크',       emoji:'💨' },
  { level: 9,  type:'spell',  id:'gravwell', name:'그래비티웰',   emoji:'🌀' },
  { level:10,  type:'summon', id:'goliath',  name:'Goliath (MAX)',emoji:'👾' },
];

function checkLevelUnlocks(lv) {
  const news = UNLOCK_TABLE.filter(u => u.level === lv);
  news.forEach(u => {
    if (u.type === 'spell'  && !PROG.unlockedSpells.includes(u.id))
      PROG.unlockedSpells.push(u.id);
    if (u.type === 'summon' && !PROG.unlockedSummons.includes(u.id))
      PROG.unlockedSummons.push(u.id);
  });
  return news;
}

// ── 챕터/스테이지 정의 ────────────────────────────
const CAMPAIGN = [
  {
    id:'ch1', name:'어둠의 시작', emoji:'🌑', unlockLevel:1,
    stages:[
      { id:'ch1_s1', name:'첫 번째 결투', diff:'easy',   xp:60,  bonus:'소환수 없이 승리 시 +30XP',
        aiSpells:['fireball','icespear','nova','meteor'], desc:'기초를 익혀라' },
      { id:'ch1_s2', name:'그림자 전사', diff:'normal', xp:90,  bonus:'30초 이내 승리 시 +40XP',
        aiSpells:['fireball','shadow','nova','meteor'],   desc:'AI가 강해졌다' },
      { id:'ch1_s3', name:'어둠의 군주', diff:'hard',   xp:130, bonus:'HP 50 이상 유지 시 +50XP',
        aiSpells:['shadow','meteor','chain','blizzard'],  desc:'챕터 보스' },
    ]
  },
  {
    id:'ch2', name:'불꽃의 시련', emoji:'🔥', unlockLevel:3,
    stages:[
      { id:'ch2_s1', name:'용암 마법사',  diff:'normal', xp:100, bonus:'메테오 3회 명중 시 +40XP',
        aiSpells:['fireball','meteor','nova','poison'],   desc:'화염 속성 AI' },
      { id:'ch2_s2', name:'불사조 군단',  diff:'normal', xp:120, bonus:'Phoenix 처치마다 +15XP',
        aiSpells:['fireball','nova','blizzard','meteor'], desc:'소환수가 강력하다' },
      { id:'ch2_s3', name:'인페르노 로드',diff:'hard',   xp:160, bonus:'완벽 승리 시 +80XP',
        aiSpells:['meteor','nova','chain','fireball'],    desc:'챕터 보스 — 소환수 폭격형' },
    ]
  },
  {
    id:'ch3', name:'얼음의 요새', emoji:'❄️', unlockLevel:5,
    stages:[
      { id:'ch3_s1', name:'서리 결계사',  diff:'normal', xp:120, bonus:'슬로우 5회 적중 시 +40XP',
        aiSpells:['icespear','blizzard','shield','nova'], desc:'방어형 AI' },
      { id:'ch3_s2', name:'빙하 골렘',    diff:'hard',   xp:150, bonus:'소환수 없이 승리 시 +60XP',
        aiSpells:['blizzard','icespear','meteor','chain'],desc:'IceGolem 스팸' },
      { id:'ch3_s3', name:'겨울의 여왕',  diff:'hard',   xp:200, bonus:'완벽 승리 시 +100XP',
        aiSpells:['icespear','mirror','blizzard','chain'],desc:'챕터 보스 — 반사형' },
    ]
  },
  {
    id:'ch4', name:'번개의 탑', emoji:'⚡', unlockLevel:7,
    stages:[
      { id:'ch4_s1', name:'감전 마법사',  diff:'hard',   xp:150, bonus:'체인 2회 이상 성공 +50XP',
        aiSpells:['chain','meteor','nova','shadow'],      desc:'연쇄 번개 특화' },
      { id:'ch4_s2', name:'폭풍 소환사',  diff:'hard',   xp:180, bonus:'30초 이내 승리 시 +70XP',
        aiSpells:['chain','blizzard','nova','meteor'],    desc:'소환수+번개 조합' },
      { id:'ch4_s3', name:'번개의 제왕',  diff:'hard',   xp:250, bonus:'완벽 승리 시 +120XP',
        aiSpells:['chain','meteor','mirror','shadow'],    desc:'챕터 보스 — 최강' },
    ]
  },
  {
    id:'ch5', name:'심연의 마법사', emoji:'🌀', unlockLevel:9,
    stages:[
      { id:'ch5_s1', name:'차원의 균열사',diff:'hard',   xp:200, bonus:'블링크 5회 성공 +80XP',
        aiSpells:['gravwell','chain','meteor','blink'],   desc:'중력 제어형' },
      { id:'ch5_s2', name:'그림자 군주',  diff:'hard',   xp:220, bonus:'마크 10회 적중 +80XP',
        aiSpells:['shadow','mirror','gravwell','chain'],  desc:'디버프 특화' },
      { id:'ch5_s3', name:'심연의 아르칸',diff:'hard',   xp:300, bonus:'완벽 승리 시 +150XP',
        aiSpells:['gravwell','shadow','meteor','chain'],  desc:'🏆 최종 보스' },
    ]
  },
];

// ── 현재 진행 중인 스테이지 ───────────────────────
let currentStage = null; // { stage, chapter, bonusXP }
let stageStartHp = 100;
let stageStartTime = 0;
let stageStats = { kills:0, spellsLanded:0, noSummons:true, blinkCount:0, markHits:0, chainHits:0, meteorHits:0, phoenixKills:0 };

function startCampaignStage(stage) {
  currentStage = stage;
  stageStats = { kills:0, spellsLanded:0, noSummons:true, blinkCount:0, markHits:0, chainHits:0, meteorHits:0, phoenixKills:0 };
  stageStartTime = Date.now();
}

function calcStageXP(won, finalHp) {
  if (!currentStage || !won) return { total:0, base:0, bonus:0, bonusReason:'' };
  const st = currentStage;
  let base = st.xp;
  let bonus = 0, bonusReason = '';
  const elapsed = (Date.now() - stageStartTime) / 1000;

  // 보너스 조건 판정
  if (st.id === 'ch1_s1' && stageStats.noSummons)  { bonus = 30;  bonusReason = '소환수 없이 승리!'; }
  if (st.id === 'ch1_s2' && elapsed < 30)           { bonus = 40;  bonusReason = '30초 이내 승리!'; }
  if (st.id === 'ch1_s3' && finalHp >= 50)           { bonus = 50;  bonusReason = 'HP 50+ 유지 클리어!'; }
  if (st.id === 'ch2_s1' && stageStats.meteorHits >= 3){ bonus = 40; bonusReason = '메테오 3회 명중!'; }
  if (st.id === 'ch2_s2' && stageStats.phoenixKills > 0){ bonus = stageStats.phoenixKills*15; bonusReason = `Phoenix ${stageStats.phoenixKills}처치!`; }
  if (['ch2_s3','ch3_s3','ch4_s3','ch5_s3'].includes(st.id) && finalHp >= 80){ bonus = parseInt(st.bonus); bonusReason = '완벽 승리!'; }
  if (st.id === 'ch3_s1' && stageStats.spellsLanded >= 5) { bonus = 40; bonusReason = '슬로우 5회 적중!'; }
  if (st.id === 'ch3_s2' && stageStats.noSummons)   { bonus = 60;  bonusReason = '소환수 없이 승리!'; }
  if (st.id === 'ch4_s1' && stageStats.chainHits >= 2){ bonus = 50; bonusReason = '체인 2회 성공!'; }
  if (st.id === 'ch4_s2' && elapsed < 30)            { bonus = 70;  bonusReason = '30초 이내 승리!'; }
  if (st.id === 'ch5_s1' && stageStats.blinkCount >= 5){ bonus = 80; bonusReason = '블링크 5회!'; }
  if (st.id === 'ch5_s2' && stageStats.markHits >= 10){ bonus = 80; bonusReason = '마크 10회 적중!'; }

  return { total: base+bonus, base, bonus, bonusReason };
}
