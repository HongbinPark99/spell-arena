// ════════════════════════════════════════
//  game.js — 게임 루프 및 상태 관리
// ════════════════════════════════════════

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
      new Player(1, cx-arena.w/4, cy, '#4af0ff','#00c8ff', false),
      new Player(2, cx+arena.w/4, cy, '#ff6b35','#ff4400', true),
    ],
    projectiles:[],creatures:[],orbs:[],particles:[],
    timer:settings.timerDuration,timerAcc:0,orbSpawnTimer:3.5,
    shakeX:0,shakeY:0,shakeT:0,
    gameOver:false,started:false,startTimer:2.8,
  };
}

function recalcArena(){
  if(!GS)return;
  const old=GS.arena, neo=calcArena();
  GS.players.forEach(p=>{ p.x=neo.x+(p.x-old.x)/old.w*neo.w; p.y=neo.y+(p.y-old.y)/old.h*neo.h; });
  GS.arena=neo;
}

// ─── 게임 루프 ────────────────────────────
function tick(ts){
  const dt=Math.min((ts-lastTime)/1000,.05); lastTime=ts;
  if(!paused&&GS&&!GS.gameOver) gameUpdate(dt);
  gameRender();
  rafId=requestAnimationFrame(tick);
}

function gameUpdate(dt){
  const s=GS;
  if(!s.started){
    s.startTimer-=dt;
    if(s.startTimer<=0){ s.started=true; showOverlay('FIGHT!','#f5c842',1.2); }
    // JOIN: 시작 전에도 P2 입력 읽기 (키 등록)
    if(netRole==='join') readAndSendJoinInput();
    // JOIN: 파티클/shake 업데이트
    if(netRole==='join'){
      s.particles.forEach(p=>p.update(dt)); s.particles=s.particles.filter(p=>p.alive);
      if(s.shakeT>0){ s.shakeT-=dt; const m=s.shakeT*14; s.shakeX=(Math.random()-.5)*m; s.shakeY=(Math.random()-.5)*m; } else { s.shakeX=s.shakeY=0; }
    }
    return;
  }

  s.timerAcc+=dt;
  if(s.timerAcc>=1){
    s.timerAcc-=1; s.timer--;
    const td=document.getElementById('timer-disp');
    td.textContent=s.timer;
    if(s.timer<=10) td.style.color='#ff4444';
    if(s.timer<=0){ endRound(); return; }
  }

  const [p1,p2]=s.players;

  if(netRole==='join'){
    // ── JOIN 클라이언트 ──────────────────────
    // 1. 입력 읽기 + HOST로 전송
    const {vx,vy}=readAndSendJoinInput();
    // 2. P2(나)를 로컬에서 직접 update (입력 즉각 반응)
    p2.vx=vx; p2.vy=vy;
    p2.update(dt, s.arena, p1);
    // 3. 파티클/shake 업데이트
    s.particles.forEach(p=>p.update(dt)); s.particles=s.particles.filter(p=>p.alive);
    if(s.shakeT>0){ s.shakeT-=dt; const m=s.shakeT*14; s.shakeX=(Math.random()-.5)*m; s.shakeY=(Math.random()-.5)*m; } else { s.shakeX=s.shakeY=0; }
    // 4. 투사체 로컬 이동 (부드러운 렌더링)
    s.projectiles.forEach(pr=>pr.update(dt,s.arena));
    s.projectiles=s.projectiles.filter(pr=>pr.alive);
    // territory warning (내가 P2)
    updateTerritoryWarning(p2);
    updateHUD();
    return;
  }

  // ── HOST / 싱글플레이 ────────────────────
  // P1 로컬 입력
  if(!p1.isAI){
    p1.vx=(keys['ArrowRight']?1:0)-(keys['ArrowLeft']?1:0);
    p1.vy=(keys['ArrowDown']?1:0)-(keys['ArrowUp']?1:0);
    if(p1.jx||p1.jy){ p1.vx=p1.jx; p1.vy=p1.jy; }
    const l=Math.sqrt(p1.vx**2+p1.vy**2); if(l>1){p1.vx/=l;p1.vy/=l;}
  }

  if(netRole==='host') applyOnlineP2Input();

  s.players.forEach(p=>p.update(dt,s.arena,p.id===1?p2:p1));

  updateTerritoryWarning(p1);

  // 투사체
  s.projectiles.forEach(pr=>pr.update(dt,s.arena));
  s.projectiles=s.projectiles.filter(pr=>pr.alive);

  s.projectiles.forEach(pr=>{
    s.players.forEach(p=>{
      if(!p.alive)return;
      const ownNum=typeof pr.ownerId==='number'?pr.ownerId:parseInt(pr.ownerId);
      if(ownNum===p.id)return;
      if(Math.hypot(pr.x-p.x,pr.y-p.y)<p.radius+pr.radius){
        p.takeDamage(pr.spell.dmg);
        if(pr.spell.slow) p.slowTimer=2.2;
        spawnHitFX(pr.x,pr.y,pr.spell.color); shakeScreen(.14); playSFX('hit',0.35);
        if(!p.alive) handleDeath(p, p.id===1?p2:p1);
        if(!pr.spell.pierce) pr.alive=false;
      }
    });
    s.creatures.forEach(c=>{
      if(!c.alive)return;
      const fromOwner=typeof pr.ownerId==='number'?pr.ownerId===c.ownerId:pr.ownerId.startsWith(String(c.ownerId));
      if(fromOwner)return;
      if(Math.hypot(pr.x-c.x,pr.y-c.y)<c.radius+pr.radius){
        c.takeDamage(pr.spell.dmg); spawnHitFX(pr.x,pr.y,pr.spell.color); playSFX('hit',0.25);
        if(!c.alive){ spawnDeathFX(c.x,c.y,c.color); showNotif(c.def.emoji+' '+c.def.name+' 처치!',c.color); playSFX('death',0.5); }
        if(!pr.spell.pierce) pr.alive=false;
      }
    });
  });

  // 검 충돌
  s.players.forEach(atk=>{
    if(!atk.swordActive)return;
    const sx=atk.x+Math.cos(atk.swordAngle)*50*atk.facing, sy=atk.y+Math.sin(atk.swordAngle)*50;
    s.players.forEach(tgt=>{
      if(tgt.id===atk.id||!tgt.alive)return;
      if(Math.hypot(sx-tgt.x,sy-tgt.y)<tgt.radius+8){
        tgt.takeDamage(32); atk.swordActive=false;
        spawnHitFX(sx,sy,atk.color); shakeScreen(.28); playSFX('swordHit',0.6);
        if(!tgt.alive) handleDeath(tgt,atk);
      }
    });
    s.creatures.forEach(c=>{
      if(c.ownerId===atk.id||!c.alive)return;
      if(Math.hypot(sx-c.x,sy-c.y)<c.radius+10){
        c.takeDamage(40); atk.swordActive=false;
        spawnHitFX(sx,sy,atk.color); playSFX('swordHit',0.5);
        if(!c.alive){ spawnDeathFX(c.x,c.y,c.color); showNotif(c.def.emoji+' '+c.def.name+' 처치!',c.color); playSFX('death',0.5); }
      }
    });
  });

  s.creatures.forEach(c=>c.update(dt,s.arena,s.players,s.creatures,s.projectiles));
  s.creatures=s.creatures.filter(c=>c.alive);

  s.orbSpawnTimer-=dt;
  if(s.orbSpawnTimer<=0){
    s.orbSpawnTimer=3.5+Math.random()*4;
    const a=s.arena;
    s.orbs.push(new ManaOrb(a.x+40+Math.random()*(a.w-80), a.y+40+Math.random()*(a.h-80)));
  }
  s.orbs.forEach(o=>{
    o.update(dt);
    s.players.forEach(p=>{
      if(!p.alive)return;
      if(Math.hypot(o.x-p.x,o.y-p.y)<p.radius+o.r){
        p.mp=Math.min(p.maxMp,p.mp+30); o.alive=false;
        spawnOrbFX(o.x,o.y); showNotif('+30 Mana','#c084fc'); playSFX('mana',0.4);
      }
    });
  });
  s.orbs=s.orbs.filter(o=>o.alive);

  s.particles.forEach(p=>p.update(dt)); s.particles=s.particles.filter(p=>p.alive);

  if(s.shakeT>0){ s.shakeT-=dt; const m=s.shakeT*14; s.shakeX=(Math.random()-.5)*m; s.shakeY=(Math.random()-.5)*m; }
  else { s.shakeX=s.shakeY=0; }

  if(netRole==='host'&&netConn){
    netSyncTimer+=dt;
    if(netSyncTimer>=1/NET_HZ){ netSyncTimer=0; netSyncState(); }
  }

  updateHUD();
}

function updateTerritoryWarning(myPlayer){
  const tw=document.getElementById('territory-warn');
  const wt=document.getElementById('warn-text');
  if(myPlayer&&myPlayer.inEnemyTerritory&&myPlayer.alive){
    tw.classList.add('show');
    const rem=Math.max(0,DIFF[difficulty].invasionDelay-myPlayer.invasionTimer);
    wt.textContent=myPlayer.invasionTimer<DIFF[difficulty].invasionDelay
      ? '적 진영! '+rem.toFixed(1)+'초 후 피해'
      : '적 진영 — 피해 중!';
  } else {
    tw.classList.remove('show');
  }
}

// ─── HUD ─────────────────────────────────
function updateHUD(){
  if(!GS)return;
  const isJoin=netRole==='join';
  const me  =isJoin?GS.players[1]:GS.players[0];
  const opp =isJoin?GS.players[0]:GS.players[1];

  document.getElementById('hp-p1').style.width=(me.hp/me.maxHp*100)+'%';
  document.getElementById('mp-p1').style.width=(me.mp/me.maxMp*100)+'%';
  document.getElementById('hp-p2').style.width=(opp.hp/opp.maxHp*100)+'%';
  document.getElementById('mp-p2').style.width=(opp.mp/opp.maxMp*100)+'%';
  document.getElementById('score-p1').textContent=scores[isJoin?1:0];
  document.getElementById('score-p2').textContent=scores[isJoin?0:1];

  SPELLS.forEach((_,i)=>{
    const sl=document.getElementById('sl-'+i); if(!sl)return;
    sl.classList.toggle('active',me.selSpell===i);
    let cd=sl.querySelector('.cd-overlay');
    if(me.spellCDs[i]>0){ if(!cd){cd=document.createElement('div');cd.className='cd-overlay';sl.appendChild(cd);} cd.textContent=(me.spellCDs[i]/1000).toFixed(1); }
    else { if(cd)cd.remove(); }
  });
  SUMMONS.forEach((_,i)=>{
    const sl=document.getElementById('sl-s'+i); if(!sl)return;
    let cd=sl.querySelector('.cd-overlay');
    if(me.summonCDs[i]>0){ if(!cd){cd=document.createElement('div');cd.className='cd-overlay';sl.appendChild(cd);} cd.textContent=(me.summonCDs[i]/1000).toFixed(1); }
    else { if(cd)cd.remove(); }
  });
}

// ─── 라운드 관리 ──────────────────────────
function handleDeath(dead,killer){
  spawnDeathFX(dead.x,dead.y,dead.color); shakeScreen(.5); playSFX('death',0.7);
  scores[killer.id-1]++;
  totalStats.kills++; totalStats.spells+=GS.players[0].spellsCast; totalStats.summons+=GS.players[0].summonsCast;
  const myId=netRole==='join'?2:1;
  showOverlay(killer.id===myId?'YOU WIN!':'DEFEATED!',killer.id===myId?'#4af0ff':'#ff6b35',2.4);
  GS.gameOver=true;
  setTimeout(showResult,2800);
}

function endRound(){
  if(!GS||GS.gameOver)return;
  GS.gameOver=true;
  const [p1,p2]=GS.players;
  totalStats.spells+=p1.spellsCast; totalStats.summons+=p1.summonsCast;
  let winner=null;
  if(p1.hp>p2.hp) winner=p1; else if(p2.hp>p1.hp) winner=p2;
  const myId=netRole==='join'?2:1;
  if(winner){ scores[winner.id-1]++; showOverlay(winner.id===myId?'TIME UP — WIN!':'TIME UP — LOSE!',winner.id===myId?'#4af0ff':'#ff6b35',2.4); }
  else showOverlay('TIME UP — DRAW!','#f5c842',2.4);
  setTimeout(showResult,2800);
}

function showResult(){
  showScreen('result-screen');
  cancelAnimationFrame(rafId); rafId=null;

  let winner=null;
  if(scores[0]>scores[1]) winner=1; else if(scores[1]>scores[0]) winner=2;
  const myId=netRole==='join'?2:1;

  const banEl=document.getElementById('res-banner');
  const winEl=document.getElementById('res-winner');
  const subEl=document.getElementById('res-subtitle');

  if(winner===myId){
    banEl.textContent='VICTORY'; banEl.style.color='#f5c842';
    winEl.textContent='YOU WIN!'; winEl.style.color='#4af0ff'; winEl.style.textShadow='0 0 40px #4af0ff';
    subEl.textContent='적 마법사를 완전히 제압했습니다';
  } else if(winner&&winner!==myId){
    banEl.textContent='DEFEATED'; banEl.style.color='#ff4444';
    winEl.textContent='DEFEATED...'; winEl.style.color='#ff6b35'; winEl.style.textShadow='0 0 40px #ff4400';
    subEl.textContent='더 강하게 돌아오세요';
  } else {
    banEl.textContent='DRAW'; banEl.style.color='#f5c842';
    winEl.textContent='DRAW!'; winEl.style.color='#e8e0ff'; winEl.style.textShadow='0 0 30px #a855f7';
    subEl.textContent='막상막하의 혈전이었습니다';
  }

  document.getElementById('rs-kills').textContent=totalStats.kills;
  document.getElementById('rs-spells').textContent=totalStats.spells;
  document.getElementById('rs-summons').textContent=totalStats.summons;
  document.getElementById('rs-score').textContent=scores[0]+'-'+scores[1];
}

function rematch(){
  totalStats={kills:0,spells:0,summons:0}; scores=[0,0]; roundNum=1;
  GS=createGS();
  if(netRole) GS.players[1].isAI=false;
  showScreen('game-screen'); resetGameHUD();
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
  document.getElementById('round-lbl').textContent='ROUND '+roundNum;
  document.getElementById('territory-warn').classList.remove('show');
  document.getElementById('overlay-msg').classList.remove('show');
}

function togglePause(){
  paused=!paused;
  if(paused) showOverlay('PAUSED','#f5c842',9999);
  else document.getElementById('overlay-msg').classList.remove('show');
}
