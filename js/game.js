// ════════════════════════════════════════
//  game.js — 게임 루프 및 상태 관리
//  · createGS / calcArena / recalcArena
//  · tick / gameUpdate
//  · 충돌 감지 (스펠·검 vs 플레이어·소환수)
//  · handleDeath / endRound / showResult
//  · startGame / rematch / resetGameHUD
// ════════════════════════════════════════

// ─── GAME STATE ──────────────────────────
let GS=null, rafId=null, lastTime=0, paused=false;

function calcArena(){
  const padH=60,padTop=82,padBot=82;
  const maxW=Math.min(W-padH*2,1100), maxH=Math.min(H-padTop-padBot,620);
  return {x:(W-maxW)/2,y:padTop+(H-padTop-padBot-maxH)/2,w:maxW,h:maxH,padding:4};
}
function createGS(){
  resizeCanvas();
  const arena=calcArena(), cx=arena.x+arena.w/2, cy=arena.y+arena.h/2;
  return {
    arena, players:[
      new Player(1,cx-arena.w/4,cy,'#4af0ff','#00c8ff',false),
      new Player(2,cx+arena.w/4,cy,'#ff6b35','#ff4400',true),
    ],
    projectiles:[],creatures:[],orbs:[],particles:[],
    timer:settings.timerDuration,timerAcc:0,orbSpawnTimer:3.5,
    shakeX:0,shakeY:0,shakeT:0,
    gameOver:false,started:false,startTimer:2.8,
  };
}
function recalcArena(){
  if(!GS)return; const old=GS.arena,neo=calcArena();
  GS.players.forEach(p=>{ p.x=neo.x+(p.x-old.x)/old.w*neo.w; p.y=neo.y+(p.y-old.y)/old.h*neo.h; });
  GS.arena=neo;
}

// ─── GAME LOOP ───────────────────────────
function tick(ts){
  const dt=Math.min((ts-lastTime)/1000,.05); lastTime=ts;
  if(!paused&&GS&&!GS.gameOver) gameUpdate(dt);
  gameRender();
  rafId=requestAnimationFrame(tick);
}

function gameUpdate(dt){
  const s=GS;
  if(!s.started){ s.startTimer-=dt; if(s.startTimer<=0){s.started=true;showOverlay('FIGHT!','#f5c842',1.2);} return; }

  s.timerAcc+=dt;
  if(s.timerAcc>=1){
    s.timerAcc-=1; s.timer--;
    const td=document.getElementById('timer-disp'); td.textContent=s.timer;
    if(s.timer<=10)td.style.color='#ff4444';
    if(s.timer<=0){endRound();return;}
  }

  const [p1,p2]=s.players;

  // P1 입력 (로컬 항상)
  if(!p1.isAI){
    p1.vx=(keys['ArrowRight']?1:0)-(keys['ArrowLeft']?1:0);
    p1.vy=(keys['ArrowDown']?1:0)-(keys['ArrowUp']?1:0);
    if(p1.jx||p1.jy){p1.vx=p1.jx;p1.vy=p1.jy;}
    const l=Math.sqrt(p1.vx**2+p1.vy**2); if(l>1){p1.vx/=l;p1.vy/=l;}
  }

  // 온라인 모드 처리
  if(netRole==='host'){
    applyOnlineP2Input(); // HOST: 수신한 P2 입력 반영
  } else if(netRole==='join'){
    sendJoinInput(); // JOIN: 내 입력 전송 + 로컬 P2 이동
    // JOIN은 HOST 상태 수신 후 렌더링 (update 스킵)
    updateHUD(); return;
  }

  s.players.forEach(p=>p.update(dt,s.arena,p.id===1?p2:p1));

  // Territory warning
  const tw=document.getElementById('territory-warn'), wt=document.getElementById('warn-text');
  if(p1.inEnemyTerritory&&p1.alive){
    tw.classList.add('show');
    const rem=Math.max(0,DIFF[difficulty].invasionDelay-p1.invasionTimer);
    wt.textContent=p1.invasionTimer<DIFF[difficulty].invasionDelay?`⚠ 적 진영! ${rem.toFixed(1)}초 후 피해 ⚠`:`🔥 적 진영 — 피해 중! 🔥`;
  } else { tw.classList.remove('show'); }

  // Projectiles
  s.projectiles.forEach(pr=>pr.update(dt,s.arena));
  s.projectiles=s.projectiles.filter(pr=>pr.alive);

  s.projectiles.forEach(pr=>{
    s.players.forEach(p=>{
      if(!p.alive)return;
      const ownNum=typeof pr.ownerId==='number'?pr.ownerId:parseInt(pr.ownerId);
      if(ownNum===p.id)return;
      const dx=pr.x-p.x,dy=pr.y-p.y;
      if(Math.sqrt(dx*dx+dy*dy)<p.radius+pr.radius){
        p.takeDamage(pr.spell.dmg);
        if(pr.spell.slow)p.slowTimer=2.2;
        spawnHitFX(pr.x,pr.y,pr.spell.color); shakeScreen(.14);
        if(!p.alive)handleDeath(p,p.id===1?p2:p1);
        if(!pr.spell.pierce)pr.alive=false;
      }
    });
    s.creatures.forEach(c=>{
      if(!c.alive)return;
      const fromOwner=typeof pr.ownerId==='number'?pr.ownerId===c.ownerId:pr.ownerId.startsWith(String(c.ownerId));
      if(fromOwner)return;
      const dx=pr.x-c.x,dy=pr.y-c.y;
      if(Math.sqrt(dx*dx+dy*dy)<c.radius+pr.radius){
        c.takeDamage(pr.spell.dmg); spawnHitFX(pr.x,pr.y,pr.spell.color);
        if(!c.alive){ spawnDeathFX(c.x,c.y,c.color); showNotif(`${c.def.emoji} ${c.def.name} 처치!`,c.color); }
        if(!pr.spell.pierce)pr.alive=false;
      }
    });
  });

  // Sword
  s.players.forEach(atk=>{
    if(!atk.swordActive)return;
    const sx=atk.x+Math.cos(atk.swordAngle)*50*atk.facing, sy=atk.y+Math.sin(atk.swordAngle)*50;
    s.players.forEach(tgt=>{
      if(tgt.id===atk.id||!tgt.alive)return;
      if(Math.hypot(sx-tgt.x,sy-tgt.y)<tgt.radius+8){
        tgt.takeDamage(32); atk.swordActive=false;
        spawnHitFX(sx,sy,atk.color); shakeScreen(.28);
        if(!tgt.alive)handleDeath(tgt,atk);
      }
    });
    // 검은 소환수에게 40 피해 (플레이어보다 강함)
    s.creatures.forEach(c=>{
      if(c.ownerId===atk.id||!c.alive)return;
      if(Math.hypot(sx-c.x,sy-c.y)<c.radius+10){
        c.takeDamage(40); atk.swordActive=false;
        spawnHitFX(sx,sy,atk.color);
        if(!c.alive){ spawnDeathFX(c.x,c.y,c.color); showNotif(`${c.def.emoji} ${c.def.name} 처치!`,c.color); }
      }
    });
  });

  s.creatures.forEach(c=>c.update(dt,s.arena,s.players,s.creatures,s.projectiles));
  s.creatures=s.creatures.filter(c=>c.alive);

  s.orbSpawnTimer-=dt;
  if(s.orbSpawnTimer<=0){
    s.orbSpawnTimer=3.5+Math.random()*4;
    const a=s.arena; s.orbs.push(new ManaOrb(a.x+40+Math.random()*(a.w-80),a.y+40+Math.random()*(a.h-80)));
  }
  s.orbs.forEach(o=>{ o.update(dt); s.players.forEach(p=>{ if(!p.alive)return; if(Math.hypot(o.x-p.x,o.y-p.y)<p.radius+o.r){ p.mp=Math.min(p.maxMp,p.mp+30); o.alive=false; spawnOrbFX(o.x,o.y); showNotif('+30 Mana','#c084fc'); } }); });
  s.orbs=s.orbs.filter(o=>o.alive);
  s.particles.forEach(p=>p.update(dt)); s.particles=s.particles.filter(p=>p.alive);

  if(s.shakeT>0){ s.shakeT-=dt; const m=s.shakeT*14; s.shakeX=(Math.random()-.5)*m; s.shakeY=(Math.random()-.5)*m; }
  else { s.shakeX=s.shakeY=0; }

  // 온라인: HOST가 상태 전송 (30fps)
  if(netRole==='host'&&netConn){
    netSyncTimer+=dt;
    if(netSyncTimer>=1/NET_HZ){ netSyncTimer=0; netSyncState(); }
  }

  updateHUD();
}


// ─── HUD ─────────────────────────────────
function updateHUD(){
  const [p1,p2]=GS.players;
  document.getElementById('hp-p1').style.width=(p1.hp/p1.maxHp*100)+'%';
  document.getElementById('mp-p1').style.width=(p1.mp/p1.maxMp*100)+'%';
  document.getElementById('hp-p2').style.width=(p2.hp/p2.maxHp*100)+'%';
  document.getElementById('mp-p2').style.width=(p2.mp/p2.maxMp*100)+'%';
  document.getElementById('score-p1').textContent=scores[0];
  document.getElementById('score-p2').textContent=scores[1];
  SPELLS.forEach((_,i)=>{
    const sl=document.getElementById(`sl-${i}`); if(!sl)return;
    sl.classList.toggle('active',p1.selSpell===i);
    let cd=sl.querySelector('.cd-overlay');
    if(p1.spellCDs[i]>0){ if(!cd){cd=document.createElement('div');cd.className='cd-overlay';sl.appendChild(cd);} cd.textContent=(p1.spellCDs[i]/1000).toFixed(1); }
    else { if(cd)cd.remove(); }
  });
  SUMMONS.forEach((_,i)=>{
    const sl=document.getElementById(`sl-s${i}`); if(!sl)return;
    let cd=sl.querySelector('.cd-overlay');
    if(p1.summonCDs[i]>0){ if(!cd){cd=document.createElement('div');cd.className='cd-overlay';sl.appendChild(cd);} cd.textContent=(p1.summonCDs[i]/1000).toFixed(1); }
    else { if(cd)cd.remove(); }
  });
}

// ─── ROUND MANAGEMENT ────────────────────
function handleDeath(dead,killer){
  spawnDeathFX(dead.x,dead.y,dead.color); shakeScreen(.5);
  scores[killer.id-1]++;
  totalStats.kills++; totalStats.spells+=GS.players[0].spellsCast; totalStats.summons+=GS.players[0].summonsCast;
  showOverlay(killer.id===1?'YOU WIN!':'DEFEATED!',killer.id===1?'#4af0ff':'#ff6b35',2.4);
  GS.gameOver=true;
  setTimeout(showResult,2800);
}

function endRound(){
  if(!GS||GS.gameOver)return;
  GS.gameOver=true;
  const [p1,p2]=GS.players;
  totalStats.spells+=p1.spellsCast; totalStats.summons+=p1.summonsCast;
  let winner=null;
  if(p1.hp>p2.hp)winner=p1; else if(p2.hp>p1.hp)winner=p2;
  if(winner){ scores[winner.id-1]++; showOverlay(winner.id===1?'TIME UP — WIN!':'TIME UP — LOSE!',winner.id===1?'#4af0ff':'#ff6b35',2.4); }
  else showOverlay('TIME UP — DRAW!','#f5c842',2.4);
  setTimeout(showResult,2800);
}

// ─── RESULT SCREEN (FIX #3) ──────────────
function showResult(){
  showScreen('result-screen');
  cancelAnimationFrame(rafId); rafId=null;

  const [p1,p2]=GS.players;
  let winner=null;
  if(scores[0]>scores[1])winner=1; else if(scores[1]>scores[0])winner=2;

  const banEl=document.getElementById('res-banner');
  const winEl=document.getElementById('res-winner');
  const subEl=document.getElementById('res-subtitle');

  if(winner===1){
    banEl.textContent='🏆 VICTORY 🏆'; banEl.style.color='#f5c842';
    winEl.textContent='YOU WIN!'; winEl.style.color='#4af0ff'; winEl.style.textShadow='0 0 40px #4af0ff';
    subEl.textContent='적 마법사를 완전히 제압했습니다';
  } else if(winner===2){
    banEl.textContent='💀 DEFEATED 💀'; banEl.style.color='#ff4444';
    winEl.textContent='DEFEATED...'; winEl.style.color='#ff6b35'; winEl.style.textShadow='0 0 40px #ff4400';
    subEl.textContent='더 강하게 돌아오세요';
  } else {
    banEl.textContent='⚔️ DRAW ⚔️'; banEl.style.color='#f5c842';
    winEl.textContent='DRAW!'; winEl.style.color='#e8e0ff'; winEl.style.textShadow='0 0 30px #a855f7';
    subEl.textContent='막상막하의 혈전이었습니다';
  }

  document.getElementById('rs-kills').textContent=totalStats.kills;
  document.getElementById('rs-spells').textContent=totalStats.spells;
  document.getElementById('rs-summons').textContent=totalStats.summons;
  document.getElementById('rs-score').textContent=`${scores[0]}-${scores[1]}`;
}

function rematch(){
  totalStats={kills:0,spells:0,summons:0}; scores=[0,0]; roundNum=1;
  GS=createGS(); showScreen('game-screen'); resetGameHUD();
  paused=false; lastTime=performance.now(); rafId=requestAnimationFrame(tick);
}

function startGame(diff){
  difficulty=diff; scores=[0,0]; roundNum=1; totalStats={kills:0,spells:0,summons:0};
  GS=createGS(); showScreen('game-screen'); resetGameHUD();
  paused=false; lastTime=performance.now(); rafId=requestAnimationFrame(tick);
}

function resetGameHUD(){
  document.getElementById('timer-disp').textContent=settings.timerDuration;
  document.getElementById('timer-disp').style.color='';
  document.getElementById('round-lbl').textContent=`ROUND ${roundNum}`;
  document.getElementById('territory-warn').classList.remove('show');
  document.getElementById('overlay-msg').classList.remove('show');
}

function togglePause(){
  paused=!paused;
  if(paused)showOverlay('PAUSED','#f5c842',9999);
  else document.getElementById('overlay-msg').classList.remove('show');
}
