// ═══════════════════════════════════════════════════
//  campaign.js — 캠페인 화면 UI + 스테이지 진입 로직
// ═══════════════════════════════════════════════════

function openCampaign() {
  loadProgress();
  renderCampaignScreen();
  showScreen('campaign-screen');
}

function renderCampaignScreen() {
  // XP 바 업데이트
  const xpPct = Math.min(100, (PROG.xp / PROG.xpToNext) * 100);
  const el = id => document.getElementById(id);
  if(el('camp-level'))  el('camp-level').textContent  = 'Lv.' + PROG.level;
  if(el('camp-xp-bar')) el('camp-xp-bar').style.width = xpPct + '%';
  if(el('camp-xp-txt')) el('camp-xp-txt').textContent = PROG.xp + ' / ' + PROG.xpToNext + ' XP';
  if(el('camp-wins'))   el('camp-wins').textContent   = PROG.totalWins;
  if(el('camp-kills'))  el('camp-kills').textContent  = PROG.totalKills;

  // 챕터 목록 렌더링
  const container = el('campaign-chapters');
  if (!container) return;
  container.innerHTML = '';

  CAMPAIGN.forEach(ch => {
    const locked = PROG.level < ch.unlockLevel;
    const clearedCount = ch.stages.filter(s => PROG.clearedStages.includes(s.id)).length;
    const allClear = clearedCount === ch.stages.length;

    const chDiv = document.createElement('div');
    chDiv.className = 'camp-chapter' + (locked ? ' camp-locked' : '') + (allClear ? ' camp-cleared' : '');
    chDiv.innerHTML = `
      <div class="camp-ch-header">
        <span class="camp-ch-emoji">${ch.emoji}</span>
        <span class="camp-ch-name">${ch.name}</span>
        ${locked ? `<span class="camp-lock-badge">🔒 Lv.${ch.unlockLevel}</span>` : ''}
        ${allClear ? '<span class="camp-clear-badge">✅ CLEAR</span>' : `<span class="camp-progress">${clearedCount}/${ch.stages.length}</span>`}
      </div>
      <div class="camp-stages" id="stages-${ch.id}"></div>
    `;
    container.appendChild(chDiv);

    if (locked) return;

    const stagesDiv = chDiv.querySelector(`#stages-${ch.id}`);
    ch.stages.forEach((st, i) => {
      const cleared = PROG.clearedStages.includes(st.id);
      // 이전 스테이지 클리어해야 진입 가능
      const prevCleared = i === 0 || PROG.clearedStages.includes(ch.stages[i-1].id);
      const stageLocked = !prevCleared;
      const diffColor = {easy:'#44ff88', normal:'#f5c842', hard:'#ff6b35'}[st.diff] || '#fff';
      const btn = document.createElement('button');
      btn.className = 'camp-stage-btn' + (cleared ? ' camp-stage-cleared' : '') + (stageLocked ? ' camp-stage-locked' : '');
      btn.innerHTML = `
        <span class="camp-stage-num">${i+1}</span>
        <div class="camp-stage-info">
          <div class="camp-stage-name">${st.name}</div>
          <div class="camp-stage-desc">${st.desc}</div>
          <div class="camp-stage-bonus" style="color:${diffColor}">${st.bonus}</div>
        </div>
        <div class="camp-stage-meta">
          <span class="camp-stage-diff" style="color:${diffColor}">${st.diff.toUpperCase()}</span>
          <span class="camp-stage-xp">+${st.xp} XP</span>
          ${cleared ? '<span class="camp-star">★</span>' : ''}
        </div>
      `;
      if (!stageLocked) btn.onclick = () => enterCampaignStage(ch, st);
      stagesDiv.appendChild(btn);
    });
  });
}

function enterCampaignStage(ch, stage) {
  currentStage = stage;
  startCampaignStage(stage);
  // AI 스펠 오버라이드
  _campaignAISpells = stage.aiSpells || ['fireball','icespear','nova','meteor'];
  // 게임 시작
  difficulty = stage.diff;
  scores = [0,0]; roundNum = 1;
  totalStats = {kills:0, spells:0, summons:0};
  spellEffects = [];
  applyLoadout(); rebuildActionBar();
  showScreen('game-screen'); resizeCanvas();
  _showResultPending = false;
  GS = createGS(); spawnPillars(GS);
  // AI 스펠 적용
  _applyCampaignAISpells();
  resetGameHUD();
  paused = false; lastTime = performance.now(); rafId = requestAnimationFrame(tick);
}

let _campaignAISpells = null;
function _applyCampaignAISpells() {
  if (!_campaignAISpells || !GS) return;
  const ai = GS.players[1];
  // AI SPELLS를 스테이지별로 오버라이드
  ai._stageSpells = _campaignAISpells.map(id => SPELL_POOL.find(s=>s.id===id) || SPELL_POOL[0]);
}

// 해금 화면 렌더링
function renderUnlockScreen(unlocks, xpResult) {
  const el = id => document.getElementById(id);
  if (!el('unlock-screen')) return;

  const xpPct = Math.min(100, (PROG.xp / PROG.xpToNext) * 100);
  if(el('ul-level'))    el('ul-level').textContent   = 'Lv.' + PROG.level;
  if(el('ul-xp-bar'))   el('ul-xp-bar').style.width  = xpPct + '%';
  if(el('ul-xp-txt'))   el('ul-xp-txt').textContent  = PROG.xp + ' / ' + PROG.xpToNext + ' XP';
  if(el('ul-xp-gain'))  el('ul-xp-gain').textContent = '+' + xpResult.total + ' XP';
  if(el('ul-base-xp'))  el('ul-base-xp').textContent = '+' + xpResult.base;
  if(el('ul-bonus-xp')) el('ul-bonus-xp').textContent = xpResult.bonus > 0 ? '+' + xpResult.bonus + ' (' + xpResult.bonusReason + ')' : '–';

  const unlockDiv = el('ul-unlocks');
  if (unlockDiv) {
    if (unlocks.length === 0) {
      unlockDiv.innerHTML = '<div style="color:var(--dim);font-size:.8rem;text-align:center">해금된 항목 없음</div>';
    } else {
      unlockDiv.innerHTML = unlocks.map(u => `
        <div class="ul-item">
          <span class="ul-emoji">${u.emoji}</span>
          <div>
            <div class="ul-name">${u.name}</div>
            <div class="ul-type">${u.type === 'spell' ? '🔥 스펠 해금' : '🐉 소환수 해금'}</div>
          </div>
          <span class="ul-new">NEW!</span>
        </div>
      `).join('');
    }
  }

  showScreen('unlock-screen');
}
