// game.js — 게임 루프 및 상태 관리

let GS=null, rafId=null, lastTime=0, paused=false;
// 새 스펠 이펙트 오브젝트 (화면에 살아있는 이펙트들)
let spellEffects=[];  // {type, ...data}

function calcArena(){
  const padTop=68, padBot=68, padH=0;
  const maxW=Math.min(W-padH*2, W), maxH=Math.min(H-padTop-padBot, H-padTop-padBot);
  return {x:(W-maxW)/2, y:padTop+(H-padTop-padBot-maxH)/2, w:maxW, h:maxH, padding:4};
}

function createGS(){
  // resizeCanvas는 startGame에서만 호출 (여기서 호출 시 캔버스 리셋 버그)
  const arena=calcArena(), cx=arena.x+arena.w/2, cy=arena.y+arena.h/2;
  return {
    arena, players:[
      new Player(1, cx-arena.w/4, cy, '#4af0ff','#00c8ff', false),  // P1 항상 왼쪽
      new Player(2, cx+arena.w/4, cy, '#ff6b35','#ff4400', true),   // P2 항상 오른쪽
    ],
    projectiles:[],creatures:[],orbs:[],particles:[],pillars:[],
    timer:settings.timerDuration,timerAcc:0,orbSpawnTimer:3.5,goldenOrbTimer:28,
    shakeX:0,shakeY:0,shakeT:0,
    gameOver:false,started:false,startTimer:2.8,
  };
}

function spawnPillars(gs){
  const a=gs.arena, cx=a.x+a.w/2, cy=a.y+a.h/2;
  gs.pillars=[];
  // 중앙 좌우 대칭 2개 + 중앙 상하 2개
  const positions=[
    [cx-a.w*.18, cy-a.h*.22],
    [cx-a.w*.18, cy+a.h*.22],
    [cx+a.w*.18, cy-a.h*.22],
    [cx+a.w*.18, cy+a.h*.22],
  ];
  positions.forEach(([x,y])=>gs.pillars.push(new Pillar(x,y)));
}

function recalcArena(){
  if(!GS)return;
  const old=GS.arena, neo=calcArena();
  GS.players.forEach(p=>{p.x=neo.x+(p.x-old.x)/old.w*neo.w; p.y=neo.y+(p.y-old.y)/old.h*neo.h;});
  GS.arena=neo;
}

function tick(ts){
  try{
    const dt=Math.min((ts-lastTime)/1000,.05); lastTime=ts;
    if(!paused&&GS&&!GS.gameOver) gameUpdate(dt);
    else if(!paused&&GS&&GS.gameOver){
      if(GS.particles){ GS.particles.forEach(p=>p.update(dt)); GS.particles=GS.particles.filter(p=>p.alive); }
    }
    gameRender();
  }catch(e){ console.error('tick error',e); }
  rafId=requestAnimationFrame(tick);
}

// ── 궁극기 발동 ──────────────────────────────────
function fireUltimate(player){
  if(!player.ultReady||player.ultCD>0)return;
  player.ultReady=false; player.ult=0; player.ultCD=18; // 18초 재충전
  const a=GS.arena;
  const isP1=player.id===1;

  if(isP1){
    // P1 궁극기: 번개 폭풍 — 화면 전체에 번개 투사체 12개 부채꼴
    showNotif('⚡ LIGHTNING STORM!','#4af0ff'); shakeScreen(0.6);
    playSFX('explosion',0.9);
    for(let i=0;i<12;i++){
      const angle=(-0.4+i*0.08)+Math.random()*0.04; // 좁은 부채꼴, 오른쪽
      const spd=11+Math.random()*3;
      GS.projectiles.push(new Projectile(
        player.x,player.y, Math.cos(angle)*spd, Math.sin(angle)*spd,
        {name:'ult_lightning',color:'#4af0ff',dmg:38,speed:spd,radius:7,pierce:true,slow:false,ult:true},
        player.id
      ));
    }
    // 화면 번쩍
    const cv=document.getElementById('game-canvas');
    if(cv){cv.style.boxShadow='0 0 80px #4af0ff'; setTimeout(()=>cv.style.boxShadow='',400);}
  } else {
    // P2 궁극기: 화염 폭발 — 원형 폭발파 + 중앙 화염탄
    showNotif('🔥 INFERNO BURST!','#ff6b35'); shakeScreen(0.6);
    playSFX('explosion',0.9);
    for(let i=0;i<16;i++){
      const angle=(i/16)*Math.PI*2;
      const spd=5+Math.random()*2;
      GS.projectiles.push(new Projectile(
        player.x,player.y, Math.cos(angle)*spd, Math.sin(angle)*spd,
        {name:'ult_fire',color:'#ff6b35',dmg:30,speed:spd,radius:12,pierce:false,slow:false,ult:true},
        player.id
      ));
    }
    const cv=document.getElementById('game-canvas');
    if(cv){cv.style.boxShadow='0 0 80px #ff4400'; setTimeout(()=>cv.style.boxShadow='',400);}
    spawnDeathFX(player.x,player.y,'#ff6b35');
  }
}

// ── 크리티컬 히트 (10% 확률, 1.8배 데미지) ──
// 독구름 스폰
function spawnCloudZone(x,y,sp,ownerId){
  spellEffects.push({
    type:'cloud_zone', x, y, ownerId, r:sp.cloudR||55,
    timer:sp.cloudDur||2500, maxTimer:sp.cloudDur||2500,
    dmg:sp.cloudDmg||8, tickTimer:0,
    color:sp.color||'#44ff88'
  });
  showNotif('☠️ 독구름!','#44ff88');
  shakeScreen(0.1);
}

// 방어막 시각 FX
function spawnShieldFX(x,y,color){
  if(!GS) return;
  for(let i=0;i<12;i++){
    const a=(i/12)*Math.PI*2;
    const vx=Math.cos(a)*3, vy=Math.sin(a)*3;
    GS.particles.push(new Particle(x+Math.cos(a)*40,y+Math.sin(a)*40,vx,vy,color,14,0.6));
  }
}

// 블링크 FX
function spawnBlinkFX(x,y,color){
  if(!GS) return;
  for(let i=0;i<16;i++){
    const a=(i/16)*Math.PI*2, spd=3+Math.random()*3;
    GS.particles.push(new Particle(x,y,Math.cos(a)*spd,Math.sin(a)*spd,color,10,0.5));
  }
}

function calcDmg(dmg, x, y){
  if(Math.random()<0.10){
    const cd=Math.round(dmg*1.8);
    // 크리티컬 텍스트 파티클
    if(GS) for(let i=0;i<8;i++){const a=Math.random()*Math.PI*2,v=4+Math.random()*4; GS.particles.push(new Particle(x+(Math.random()-.5)*20,y+(Math.random()-.5)*20,'#ffee00',Math.cos(a)*v,Math.sin(a)*v-2,4+Math.random()*3,.6));}
    showNotif('💥 CRITICAL! ×1.8','#ffee00');
    shakeScreen(0.25);
    return cd;
  }
  return dmg;
}

function gameUpdate(dt){
  const s=GS;

  // 카운트다운
  if(!s.started){
    s.startTimer-=dt;
    if(s.startTimer<=0){s.started=true; showOverlay('FIGHT!','#f5c842',1.2);}
    s.particles.forEach(p=>p.update(dt)); s.particles=s.particles.filter(p=>p.alive);
    // JOIN은 HOST 상태만 기다림 (여기서 return)
    if(netRole==='join'){updateHUD(); return;}
    return;
  }

  // JOIN: 입력 전송 + 렌더링은 applyNetState가 처리
  // 단, 파티클/shake는 로컬 처리
  if(netRole==='join'){
    // 이동 입력 → HOST 전송
    const p2=s.players[1];
    p2.vx=(keys['ArrowRight']?1:0)-(keys['ArrowLeft']?1:0);
    p2.vy=(keys['ArrowDown']?1:0)-(keys['ArrowUp']?1:0);
    if(p2.jx||p2.jy){p2.vx=p2.jx; p2.vy=p2.jy;}
    const l=Math.sqrt(p2.vx**2+p2.vy**2); if(l>1){p2.vx/=l;p2.vy/=l;}
    if(Math.abs(p2.vx)>.05||Math.abs(p2.vy)>.05){p2.sdx=p2.vx; p2.sdy=p2.vy;}
    if(netConn){try{netConn.send({type:'input',vx:p2.vx,vy:p2.vy,sdx:p2.sdx,sdy:p2.sdy});}catch(e){}}
    // 파티클/shake 로컬
    s.particles.forEach(p=>p.update(dt)); s.particles=s.particles.filter(p=>p.alive);
    s.shakeX=0; s.shakeY=0; // shake disabled
    updateTerritoryWarning(s.players[1]);
    updateHUD();
    return;
  }

  // ── HOST / 싱글 ──────────────────────────

  // 타이머
  s.timerAcc+=dt;
  if(s.timerAcc>=1){
    s.timerAcc-=1; s.timer--;
    const td=document.getElementById('timer-disp');
    td.textContent=s.timer;
    if(s.timer<=10)td.style.color='#ff4444';
    if(s.timer<=0){endRound(); return;}
  }

  const [p1,p2]=s.players;

  // P1 입력 (화살표키)
  if(!p1.isAI){
    p1.vx=(keys['ArrowRight']?1:0)-(keys['ArrowLeft']?1:0);
    p1.vy=(keys['ArrowDown']?1:0)-(keys['ArrowUp']?1:0);
    if(p1.jx||p1.jy){p1.vx=p1.jx; p1.vy=p1.jy;}
    const l=Math.sqrt(p1.vx**2+p1.vy**2); if(l>1){p1.vx/=l;p1.vy/=l;}
  }

  // P2 입력 (HOST: JOIN에서 받음)
  if(netRole==='host') applyOnlineP2Input();

  s.players.forEach(p=>p.update(dt,s.arena,p.id===1?p2:p1));
  // AI 궁극기 자동 발동
  s.players.forEach(p=>{ if(p.isAI&&p.ultReady&&Math.random()<0.3*dt) fireUltimate(p); });
  updateTerritoryWarning(p1);

  // 투사체
  s.projectiles.forEach(pr=>pr.update(dt,s.arena));
  s.projectiles=s.projectiles.filter(pr=>pr.alive);
  if(s.projectiles.length>40) s.projectiles.length=40;
  s.projectiles.forEach(pr=>{
    s.players.forEach(p=>{
      if(!p.alive)return;
      const own=typeof pr.ownerId==='number'?pr.ownerId:parseInt(pr.ownerId);
      if(own===p.id)return;
      if(!s.gameOver&&Math.hypot(pr.x-p.x,pr.y-p.y)<p.radius+pr.radius){
        // 방패/블링크 무적 중 → 막기
        if(p.shieldTimer>0 || p.blinkTimer>0){
          spawnHitFX(pr.x,pr.y,'#4af0ff'); pr.alive=false;
          showNotif('🛡 막음!','#4af0ff'); return;
        }
        // 미러 → 투사체 반사
        if(p.mirrorTimer>0){
          pr.vx=-pr.vx; pr.vy=-pr.vy; pr.ownerId=p.id;
          spawnHitFX(pr.x,pr.y,'#c0e8ff');
          showNotif('🪞 반사!','#c0e8ff'); return;
        }
        // 마크 증폭
        const markMult=(p.markTimer>0 ? (pr.spell.markAmp||1.5) : 1);
        const pd=calcDmg(pr.spell.dmg*markMult,pr.x,pr.y); p.takeDamage(pd);
        if(pr.spell.slow)p.slowTimer=pr.spell.slowDur||2.2;
        // 마크 부여
        if(pr.spell.mark){ p.markTimer=pr.spell.markDur||3000; showNotif('🌑 마크!','#8822cc'); }
        spawnHitFX(pr.x,pr.y,pr.spell.color); shakeScreen(.14); playSFX('hit',0.35);
        if(!p.alive)handleDeath(p, p.id===1?p2:p1);
        // 독구름 터짐
        if(pr.spell.type==='cloud'){ spawnCloudZone(pr.x,pr.y,pr.spell,pr.ownerId); pr.alive=false; }
        if(!pr.spell.pierce)pr.alive=false;
      }
    });
    s.creatures.forEach(c=>{
      if(!c.alive)return;
      const fromOwner=typeof pr.ownerId==='number'?pr.ownerId===c.ownerId:pr.ownerId.startsWith(String(c.ownerId));
      if(fromOwner)return;
      if(Math.hypot(pr.x-c.x,pr.y-c.y)<c.radius+pr.radius){
        const markMult2=(c.markTimer&&c.markTimer>0?(pr.spell.markAmp||1.5):1);
        const cd=calcDmg(pr.spell.dmg*markMult2,pr.x,pr.y);
        if(pr.spell.slow){ c.slowTimer=pr.spell.slowDur||2.2; }
        if(pr.spell.mark){ if(!c.markTimer)c.markTimer=0; c.markTimer=pr.spell.markDur||3000; }
        c.takeDamage(cd); spawnHitFX(pr.x,pr.y,pr.spell.color); playSFX('hit',0.25);
        // 버스트 파이어볼 — 파편 3개
        if(pr.spell.burst && pr.alive){
          for(let _b=0;_b<(pr.spell.burstCount||3);_b++){
            const ba=((_b/(pr.spell.burstCount||3))*Math.PI*2)+Math.random()*.5;
            const bsp={...pr.spell, dmg:pr.spell.burstDmg||10, burst:false, radius:7, speed:5};
            GS.projectiles.push(new Projectile(pr.x,pr.y,Math.cos(ba)*5,Math.sin(ba)*5,bsp,pr.ownerId));
          }
        }
        // 충격파 메테오
        if(pr.spell.shockwave){
          GS.creatures.filter(e=>e.alive&&e.ownerId===c.ownerId&&e!==c&&Math.hypot(e.x-pr.x,e.y-pr.y)<(pr.spell.shockwaveR||70))
            .forEach(e=>{e.takeDamage(pr.spell.shockwaveDmg||25); spawnHitFX(e.x,e.y,'#ff8800');});
          spellEffects.push({type:'shockwave_fx',x:pr.x,y:pr.y,r:0,maxR:pr.spell.shockwaveR||70,timer:400,maxTimer:400,color:'#ff8800'});
        }
        // 독구름
        if(pr.spell.type==='cloud'){ spawnCloudZone(pr.x,pr.y,pr.spell,pr.ownerId); pr.alive=false; }
        if(!c.alive){
          spawnDeathFX(c.x,c.y,c.color);
          showNotif(c.def.emoji+' '+c.def.name+' 처치!',c.color); playSFX('death',0.5);
          const killer=GS.players.find(p=>p.id!==c.ownerId&&p.alive);
          if(killer){ killer.mp=Math.min(killer.maxMp,killer.mp+15); }
        }
        if(!pr.spell.pierce)pr.alive=false;
      }
    });
  });

  // 검
  s.players.forEach(atk=>{
    if(!atk.swordActive)return;
    // 검 선분: 플레이어 중심(base)에서 tip까지
    const bx=atk.x, by=atk.y;
    const tx=atk.x+Math.cos(atk.swordAngle)*110*atk.facing;
    const ty=atk.y+Math.sin(atk.swordAngle)*110;
    s.players.forEach(tgt=>{
      if(tgt.id===atk.id||!tgt.alive)return;
      if(!s.gameOver&&pointToSegDist(tgt.x,tgt.y,bx,by,tx,ty)<tgt.radius+14){
        const sd=calcDmg(32,tx,ty); tgt.takeDamage(sd); atk.swordActive=false;
        spawnHitFX(tx,ty,atk.color); shakeScreen(.28); playSFX('swordHit',0.6);
        if(!tgt.alive)handleDeath(tgt,atk);
      }
    });
    s.creatures.forEach(c=>{
      if(c.ownerId===atk.id||!c.alive)return;
      if(pointToSegDist(c.x,c.y,bx,by,tx,ty)<c.radius+14){
        const scd=calcDmg(40,tx,ty); c.takeDamage(scd); atk.swordActive=false;
        spawnHitFX(tx,ty,atk.color); playSFX('swordHit',0.5);
        if(!c.alive){spawnDeathFX(c.x,c.y,c.color); showNotif(c.def.emoji+' '+c.def.name+' 처치!',c.color); playSFX('death',0.5);}
      }
    });
  });

  // ── 기둥 업데이트 + 투사체 충돌 ──
  if(s.pillars){
    s.pillars.forEach(pl=>pl.update(dt));
    s.projectiles.forEach(pr=>{
      s.pillars.forEach(pl=>{
        if(!pl.alive)return;
        if(Math.hypot(pr.x-pl.x,pr.y-pl.y)<pl.r+pr.radius){
          pl.takeDamage(pr.spell.dmg*0.7);
          spawnHitFX(pr.x,pr.y,'#88aaff');
          if(!pr.spell.pierce)pr.alive=false;
        }
      });
    });
    // 플레이어+소환수 기둥 밀어내기 (충돌)
    [...s.players,...s.creatures].forEach(e=>{
      if(!e.alive)return;
      s.pillars.forEach(pl=>{
        if(!pl.alive)return;
        const ox=e.x-pl.x, oy=e.y-pl.y;
        const d=Math.sqrt(ox*ox+oy*oy);
        const minD=pl.r+(e.radius||20);
        if(d<minD&&d>0.5){
          const push=(minD-d)/d;
          e.x+=ox*push; e.y+=oy*push;
        }
      });
    });
  }

  s.creatures.forEach(c=>c.update(dt,s.arena,s.players,s.creatures,s.projectiles));

  // ── 스펠 이펙트 업데이트 ──
  spellEffects=spellEffects.filter(e=>{
    e.timer-=dt*1000;
    if(e.timer<=0) return false;
    // 그래비티웰: 소환수 끌어당김
    if(e.type==='gravwell'){
      s.creatures.forEach(c=>{
        if(!c.alive || c.ownerId!==e.ownerId) return; // 적 소환수만
        const dx=e.x-c.x, dy=e.y-c.y;
        const d=Math.hypot(dx,dy);
        if(d<e.range&&d>10){
          c.x+=dx/d*e.pull*dt;
          c.y+=dy/d*e.pull*dt;
        }
      });
      s.creatures.forEach(c=>{
        if(!c.alive || c.ownerId===e.ownerId) return;
        const dx=e.x-c.x, dy=e.y-c.y;
        const d=Math.hypot(dx,dy);
        if(d<e.range&&d>10){
          c.x+=dx/d*e.pull*dt;
          c.y+=dy/d*e.pull*dt;
        }
      });
    }
    // 독구름: 안에 있는 소환수 지속 피해
    if(e.type==='cloud_zone'){
      e.tickTimer=(e.tickTimer||0)-dt*1000;
      if(e.tickTimer<=0){
        e.tickTimer=500; // 0.5초마다 틱
        s.creatures.filter(c=>c.alive&&c.ownerId!==e.ownerId&&Math.hypot(c.x-e.x,c.y-e.y)<e.r)
          .forEach(c=>{ c.takeDamage(e.dmg); spawnHitFX(c.x,c.y,'#44ff88'); });
        // 플레이어 피해는 없음 (소환수 제압용)
      }
    }
    // 충격파 확장
    if(e.type==='shockwave_fx') e.r=e.maxR*(1-e.timer/e.maxTimer);
    return true;
  });
  // 소환수 처치 시 킬스트릭 마나 보너스
  s.creatures.forEach(c=>{
    if(!c.alive && !c._deathProcessed){
      c._deathProcessed=true;
      const killer=s.players.find(p=>p.id!==c.ownerId&&p.alive);
      if(killer){ killer.mp=Math.min(killer.maxMp,killer.mp+15); showNotif('+15 Mana (킬!)', '#ffcc44'); }
      totalStats.kills=(totalStats.kills||0)+1;
    }
  });
  s.creatures=s.creatures.filter(c=>c.alive&&isFinite(c.x)&&isFinite(c.y));

  // ── invasion(선 침범) 사망 체크 ──
  if(!s.gameOver){
    const [p1c,p2c]=s.players;
    if(!p1c.alive && !p2c.alive){
      // 동시 사망 → endRound로 처리
      s.gameOver=true;
      if(netRole==='host') netSyncState();
      showOverlay('DRAW!','#f5c842',2.4);
      setTimeout(checkRoundEnd,2800);
    } else if(!p1c.alive&&p2c.alive){
      handleDeath(p1c, p2c);
    } else if(!p2c.alive&&p1c.alive){
      handleDeath(p2c, p1c);
    }
  }

  // 마나 구슬
  s.orbSpawnTimer-=dt;
  if(s.orbSpawnTimer<=0){
    s.orbSpawnTimer=3.5+Math.random()*4;
    const a=s.arena;
    s.orbs.push(new ManaOrb(a.x+40+Math.random()*(a.w-80),a.y+40+Math.random()*(a.h-80)));
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

  // ── 골든 오브 이벤트 (28초마다 중앙 등장) ──
  s.goldenOrbTimer-=dt;
  if(s.goldenOrbTimer<=0){
    s.goldenOrbTimer=28;
    const a=s.arena, cx=a.x+a.w/2, cy=a.y+a.h/2;
    const go=new ManaOrb(cx+(-30+Math.random()*60),cy+(-30+Math.random()*60));
    go.golden=true; go.r=16; s.orbs.push(go);
    showNotif('✨ 황금 오브 등장!','#ffd700'); shakeScreen(0.3);
  }
  // 골든 오브 픽업
  s.orbs.filter(o=>o.golden).forEach(o=>{
    s.players.forEach(p=>{
      if(!p.alive)return;
      if(Math.hypot(o.x-p.x,o.y-p.y)<p.radius+o.r){
        p.mp=Math.min(p.maxMp,p.mp+50);
        // 쿨다운 20% 단축 (5초간)
        p.cdBoost=5.0;
        o.alive=false;
        spawnDeathFX(o.x,o.y,'#ffd700');
        showNotif('✨ +50 Mana & 쿨다운 20%↓','#ffd700');
        shakeScreen(0.5);
        playSFX('mana',0.8);
      }
    });
  });

  s.particles.forEach(p=>p.update(dt));
  s.particles=s.particles.filter(p=>p.alive);
  if(s.particles.length>120) s.particles.splice(0, s.particles.length-120); // 최대 120개
  s.shakeX=0; s.shakeY=0;

  // HOST → JOIN 동기화
  if(netRole==='host'&&netConn){
    netSyncTimer+=dt;
    if(netSyncTimer>=1/NET_HZ){netSyncTimer=0; netSyncState();}
  }

  updateHUD();
}

function updateTerritoryWarning(myPlayer){
  const tw=document.getElementById('territory-warn'), wt=document.getElementById('warn-text');
  if(myPlayer&&myPlayer.inEnemyTerritory&&myPlayer.alive){
    tw.classList.add('show');
    const rem=Math.max(0,DIFF[difficulty].invasionDelay-myPlayer.invasionTimer);
    wt.textContent=myPlayer.invasionTimer<DIFF[difficulty].invasionDelay?'적 진영! '+rem.toFixed(1)+'초 후 피해':'적 진영 — 피해 중!';
  } else tw.classList.remove('show');
}

function updateHUD(){
  if(!GS)return;
  const isJoin=netRole==='join';
  const me=isJoin?GS.players[1]:GS.players[0];
  const opp=isJoin?GS.players[0]:GS.players[1];
  document.getElementById('hp-p1').style.width=(me.hp/me.maxHp*100)+'%';
  document.getElementById('mp-p1').style.width=(me.mp/me.maxMp*100)+'%';
  document.getElementById('hp-p2').style.width=(opp.hp/opp.maxHp*100)+'%';
  document.getElementById('mp-p2').style.width=(opp.mp/opp.maxMp*100)+'%';
  // 숫자 표시
  const h1n=document.getElementById('hp-p1-num'), m1n=document.getElementById('mp-p1-num');
  const h2n=document.getElementById('hp-p2-num'), m2n=document.getElementById('mp-p2-num');
  if(h1n) h1n.textContent=Math.max(0,Math.ceil(me.hp));
  if(m1n) m1n.textContent=Math.max(0,Math.ceil(me.mp));
  if(h2n) h2n.textContent=Math.max(0,Math.ceil(opp.hp));
  if(m2n) m2n.textContent=Math.max(0,Math.ceil(opp.mp));
  // HP가 낮으면 빨갛게
  if(h1n) h1n.style.color=me.hp<30?'#ff4444':me.hp<60?'#ffaa44':'';
  if(h2n) h2n.style.color=opp.hp<30?'#ff4444':opp.hp<60?'#ffaa44':'';
  document.getElementById('score-p1').textContent=scores[isJoin?1:0];
  document.getElementById('score-p2').textContent=scores[isJoin?0:1];
  // 궁극기 게이지 HUD
  const ug1=document.getElementById('ult-bar-p1'), ug2=document.getElementById('ult-bar-p2');
  if(ug1) ug1.style.width=(me.ult/me.maxUlt*100)+'%';
  if(ug2) ug2.style.width=(opp.ult/opp.maxUlt*100)+'%';
  const ur1=document.getElementById('ult-ready-p1'), ur2=document.getElementById('ult-ready-p2');
  if(ur1){ ur1.style.display=me.ultReady?'block':'none'; }
  if(ur2){ ur2.style.display=opp.ultReady?'block':'none'; }
  // 황금 오브 버프 표시
  const boostEl=document.getElementById('cd-boost-indicator');
  if(boostEl){
    if(me.cdBoost>0){ boostEl.style.display='block'; boostEl.textContent='⚡ CD -20% '+me.cdBoost.toFixed(1)+'s'; }
    else boostEl.style.display='none';
  }
  SPELLS.forEach((_,i)=>{
    const sl=document.getElementById('sl-'+i); if(!sl)return;
    sl.classList.toggle('active',me.selSpell===i);
    let cd=sl.querySelector('.cd-overlay');
    if(me.spellCDs[i]>0){if(!cd){cd=document.createElement('div');cd.className='cd-overlay';sl.appendChild(cd);}cd.textContent=(me.spellCDs[i]/1000).toFixed(1);}
    else if(cd)cd.remove();
  });
  SUMMONS.forEach((_,i)=>{
    const sl=document.getElementById('sl-s'+i); if(!sl)return;
    let cd=sl.querySelector('.cd-overlay');
    if(me.summonCDs[i]>0){if(!cd){cd=document.createElement('div');cd.className='cd-overlay';sl.appendChild(cd);}cd.textContent=(me.summonCDs[i]/1000).toFixed(1);}
    else if(cd)cd.remove();
  });
}

// 점과 선분 사이 최단 거리 (검 히트박스용)
function pointToSegDist(px,py,ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay;
  const lenSq=dx*dx+dy*dy;
  if(lenSq===0)return Math.hypot(px-ax,py-ay);
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lenSq));
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}

// ── 스펠 결과 처리 (투사체 배열 or 이펙트 이벤트) ──
function handleSpellResult(pp, caster){
  if(!pp||!GS) return;
  // 배열이면 투사체
  if(Array.isArray(pp)){
    GS.projectiles.push(...pp);
    return;
  }
  // 객체 이벤트
  const s=GS;
  if(pp.type==='shield'){
    spawnShieldFX(caster.x, caster.y, caster.color);
    showNotif('🛡 방어막 활성!', '#4af0ff');
    playSFX('mana',0.5);
  }
  else if(pp.type==='mirror'){
    spawnShieldFX(caster.x, caster.y, '#c0e8ff');
    showNotif('🪞 미러 활성!', '#c0e8ff');
    playSFX('mana',0.4);
  }
  else if(pp.type==='blink'){
    const sp=pp.sp;
    // 자기 진영 내로 블링크 (facing 반대 방향)
    const dist=sp.blinkDist||180;
    caster.x += caster.facing * (-dist);  // 뒤로 이동
    const a=s.arena;
    // 진영 내로 클램프
    if(caster.id===1){ caster.x=Math.max(a.x+caster.radius+4, Math.min(a.x+a.w/2-caster.radius-4, caster.x)); }
    else { caster.x=Math.min(a.x+a.w-caster.radius-4, Math.max(a.x+a.w/2+caster.radius+4, caster.x)); }
    caster.blinkTimer=400; // 무적
    spawnBlinkFX(caster.x, caster.y, caster.color);
    showNotif('💨 블링크!', '#88ffcc');
    playSFX('mana',0.3);
  }
  else if(pp.type==='chain'){
    fireChainLightning(caster, pp.sp);
  }
  else if(pp.type==='gravwell'){
    spellEffects.push({
      type:'gravwell', x:pp.x, y:pp.y, ownerId:caster.id,
      timer:pp.sp.gravDur||3000, maxTimer:pp.sp.gravDur||3000,
      range:pp.sp.gravRange||180, pull:pp.sp.gravPull||55,
      color:pp.sp.color||'#b070ff'
    });
    showNotif('🌀 그래비티웰!', '#b070ff');
    playSFX('hit',0.3);
  }
}

// 체인 라이트닝 처리
function fireChainLightning(caster, sp){
  if(!GS) return;
  const enemies=GS.creatures.filter(c=>c.alive&&c.ownerId!==caster.id);
  if(!enemies.length){ showNotif('⚡ 타겟 없음','#ffee44'); return; }
  const range=sp.chainRange||220;
  const maxChain=sp.chainCount||3;
  const dmg=sp.chainDmg||30;
  let hit=[];
  // 가장 가까운 적 소환수부터 시작
  let nearest=enemies.reduce((a,b)=>Math.hypot(b.x-caster.x,b.y-caster.y)<Math.hypot(a.x-caster.x,a.y-caster.y)?b:a);
  let cur=nearest; hit.push(cur);
  cur.takeDamage(dmg); spawnHitFX(cur.x,cur.y,'#ffee44');
  if(!cur.alive){spawnDeathFX(cur.x,cur.y,cur.color); showNotif(cur.def.emoji+' '+cur.def.name+' 처치!',cur.color);}
  // 연쇄
  for(let i=1;i<maxChain;i++){
    const next=enemies.filter(c=>c.alive&&!hit.includes(c)&&Math.hypot(c.x-cur.x,c.y-cur.y)<range);
    if(!next.length) break;
    const nxt=next.reduce((a,b)=>Math.hypot(b.x-cur.x,b.y-cur.y)<Math.hypot(a.x-cur.x,a.y-cur.y)?b:a);
    hit.push(nxt);
    nxt.takeDamage(dmg); spawnHitFX(nxt.x,nxt.y,'#ffee44');
    if(!nxt.alive){spawnDeathFX(nxt.x,nxt.y,nxt.color); showNotif(nxt.def.emoji+' '+nxt.def.name+' 처치!',nxt.color);}
    cur=nxt;
  }
  // 연쇄 번개 시각 이펙트 저장
  const pts=[caster, ...hit].map(e=>({x:e.x,y:e.y}));
  spellEffects.push({type:'chain_fx', pts, timer:400, maxTimer:400, color:'#ffee44'});
  showNotif('⚡ 체인 라이트닝 x'+hit.length+'!', '#ffee44');
  shakeScreen(0.2); playSFX('hit',0.5);
}

function handleDeath(dead,killer){
  if(!GS||GS.gameOver)return;
  GS.gameOver=true;
  spawnDeathFX(dead.x,dead.y,dead.color); playSFX('death',0.7);
  // scores는 HOST/싱글에서만 증가 (JOIN은 HOST state로 동기화)
  if(netRole!=='join') scores[killer.id-1]++;
  totalStats.kills++; totalStats.spells+=GS.players[0].spellsCast; totalStats.summons+=GS.players[0].summonsCast;
  // HOST: scores 포함해서 즉시 동기화
  if(netRole==='host'){ GS._roundWinnerId=killer.id; netSyncFull(); }
  const myId=netRole==='join'?2:1;
  showOverlay(killer.id===myId?'YOU WIN!':'DEFEATED!',killer.id===myId?'#4af0ff':'#ff6b35',2.4);
  // JOIN은 결과 처리를 하지 않음 — HOST로부터 roundEnd 메시지를 받아 처리
  if(netRole!=='join') setTimeout(checkRoundEnd,2800);
}

function endRound(){
  if(!GS||GS.gameOver)return;
  GS.gameOver=true;
  const [p1,p2]=GS.players;
  totalStats.spells+=p1.spellsCast; totalStats.summons+=p1.summonsCast;
  let winner=null;
  if(p1.hp>p2.hp)winner=p1; else if(p2.hp>p1.hp)winner=p2;
  if(netRole!=='join' && winner) scores[winner.id-1]++;
  if(netRole==='host'){ if(winner) GS._roundWinnerId=winner.id; netSyncFull(); }
  const myId=netRole==='join'?2:1;
  if(winner) showOverlay(winner.id===myId?'TIME UP — WIN!':'TIME UP — LOSE!',winner.id===myId?'#4af0ff':'#ff6b35',2.4);
  else showOverlay('TIME UP — DRAW!','#f5c842',2.4);
  if(netRole!=='join') setTimeout(checkRoundEnd,2800);
}

// ── 3라운드 매치 ──────────────────────────────
const MAX_ROUNDS = 3;
const WIN_ROUNDS = 2; // 2선승

function checkRoundEnd(){
  if(_showResultPending) return;
  const matchOver = scores[0]>=WIN_ROUNDS || scores[1]>=WIN_ROUNDS || roundNum>=MAX_ROUNDS;
  if(matchOver){
    showResult();
  } else {
    roundNum++;
    const el=document.getElementById('round-lbl');
    if(el) el.textContent='ROUND '+roundNum;
    _showResultPending=false;
    showOverlay('ROUND '+roundNum,'#f5c842',1.8);
    setTimeout(()=>{
      if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
      _showResultPending=false;
      spellEffects=[]; GS=createGS(); spawnPillars(GS);
      if(typeof _campaignAISpells!=='undefined'&&_campaignAISpells) _applyCampaignAISpells();
      const td=document.getElementById('timer-disp');
      if(td){ td.textContent=settings.timerDuration; td.style.color=''; }
      // 루프 재시작 (gameOver로 멈춰있었으므로)
      paused=false; lastTime=performance.now();
      rafId=requestAnimationFrame(tick);
      // HOST: JOIN에 새 라운드 시작 알림
      if(netRole==='host'&&netConn){ try{netConn.send({type:'roundStart',roundNum});}catch(e){} }
    }, 1800);
  }
}

let _showResultPending=false;
function showResult(){
  if(_showResultPending)return; _showResultPending=true;
  // 루프 완전 정지
  if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
  // 직접 DOM 조작으로 확실하게 result 화면 표시
  document.querySelectorAll('.screen').forEach(el=>el.style.display='none');
  const gw=document.getElementById('game-screen');
  const ro=document.getElementById('result-screen');
  if(gw) gw.style.display='block';
  if(ro){ ro.style.display='flex'; ro.style.zIndex='9999'; }

  const online=!!netRole;
  const btnLo=document.getElementById('btn-loadout'), btnDiff=document.getElementById('btn-diff');
  if(btnLo)  btnLo.style.display=online?'none':'';
  if(btnDiff)btnDiff.style.display=online?'none':'';

  let winner=null;
  if(scores[0]>scores[1])winner=1; else if(scores[1]>scores[0])winner=2;
  // 온라인: 내 시점으로 승패. 로컬(netRole=null): 실제 승자 표시
  const myId=netRole==='join'?2:1;
  const isOnline=!!netRole;

  // 로컬 2인 플레이면 승자를 직접 표시 (my/enemy 구분 없이)
  const iWon  = isOnline ? (winner===myId) : (winner===1);  // 로컬선 P1 기준
  const theyWon = isOnline ? (winner && winner!==myId) : (winner===2);
  const isDraw = !winner;

  const verdictEl=document.getElementById('res-verdict');
  const winEl    =document.getElementById('res-winner');
  const subEl    =document.getElementById('res-subtitle');
  const rs       =document.getElementById('result-screen');

  if(!isOnline && winner){
    // 로컬 2인: 실제 승자 이름 표시
    const wName = winner===1 ? 'PLAYER 1' : 'PLAYER 2';
    const wColor = winner===1 ? '#4af0ff' : '#ff6b35';
    rs.style.background='radial-gradient(ellipse at 50% 20%,#0d2a10 0%,#05030f 65%)';
    verdictEl.textContent='🏆 VICTORY';
    verdictEl.style.cssText=`color:#f5c842;text-shadow:0 0 60px #f5c842,0 0 120px #f5c84255;`;
    winEl.textContent=wName+' WIN!';
    winEl.style.cssText=`color:${wColor};text-shadow:0 0 50px ${wColor},0 0 100px ${wColor}55;`;
    subEl.textContent='상대 마법사를 완전히 제압했습니다!';
    subEl.style.color='#a3f0cc';
    spawnResultParticles('win');
  } else if(iWon){
    rs.style.background='radial-gradient(ellipse at 50% 20%,#0d2a10 0%,#05030f 65%)';
    verdictEl.textContent='🏆 VICTORY';
    verdictEl.style.cssText='color:#f5c842;text-shadow:0 0 60px #f5c842,0 0 120px #f5c84255;';
    winEl.textContent='YOU WIN!';
    winEl.style.cssText='color:#4af0ff;text-shadow:0 0 50px #4af0ff,0 0 100px #4af0ff55;';
    subEl.textContent='상대 마법사를 완전히 제압했습니다!';
    subEl.style.color='#a3f0cc';
    spawnResultParticles('win');
  } else if(theyWon){
    rs.style.background='radial-gradient(ellipse at 50% 20%,#2a0808 0%,#05030f 65%)';
    verdictEl.textContent='💀 DEFEAT';
    verdictEl.style.cssText='color:#ff4444;text-shadow:0 0 60px #ff4444,0 0 120px #ff000055;';
    winEl.textContent='DEFEATED...';
    winEl.style.cssText='color:#ff6b35;text-shadow:0 0 50px #ff4400;';
    subEl.textContent='더 강해져서 돌아오세요.';
    subEl.style.color='#ffaa88';
    spawnResultParticles('lose');
  } else {
    rs.style.background='radial-gradient(ellipse at 50% 20%,#180d28 0%,#05030f 65%)';
    verdictEl.textContent='⚖ DRAW';
    verdictEl.style.cssText='color:#c084fc;text-shadow:0 0 60px #a855f7;';
    winEl.textContent='무승부!';
    winEl.style.cssText='color:#e8e0ff;text-shadow:0 0 40px #a855f7;';
    subEl.textContent='막상막하의 혈전이었습니다.';
    subEl.style.color='#c084fc';
    spawnResultParticles('draw');
  }

  // 점수카드
  const s1=document.getElementById('res-s1'), s2=document.getElementById('res-s2');
  const c1=document.getElementById('res-p1-card'), c2=document.getElementById('res-p2-card');
  if(s1) s1.textContent=scores[0];
  if(s2) s2.textContent=scores[1];
  if(c1){
    c1.style.borderColor=winner===1?'#4af0ff':'rgba(100,60,200,0.38)';
    c1.style.boxShadow=winner===1?'0 0 40px rgba(74,240,255,.5),inset 0 0 30px rgba(74,240,255,.08)':'';
    c1.style.transform=winner===1?'scale(1.06)':'scale(1)';
  }
  if(c2){
    c2.style.borderColor=winner===2?'#ff6b35':'rgba(100,60,200,0.38)';
    c2.style.boxShadow=winner===2?'0 0 40px rgba(255,107,53,.5),inset 0 0 30px rgba(255,107,53,.08)':'';
    c2.style.transform=winner===2?'scale(1.06)':'scale(1)';
  }

  const rk=document.getElementById('rs-kills'), rs2=document.getElementById('rs-spells');
  const rsm=document.getElementById('rs-summons'), rsc=document.getElementById('rs-score');
  if(rk) rk.textContent=totalStats.kills;
  if(rs2)rs2.textContent=totalStats.spells;
  if(rsm)rsm.textContent=totalStats.summons;
  if(rsc)rsc.textContent=scores[0]+' — '+scores[1];

  // ── 캠페인 모드: XP 획득 처리 ──
  if(typeof currentStage !== 'undefined' && currentStage && typeof PROG !== 'undefined') {
    const myHp = GS ? (GS.players[0].hp||0) : 0;
    const won = (winner===1);
    PROG.totalKills  += (totalStats.kills||0);
    PROG.totalSpellsCast += (totalStats.spells||0);
    if(won){
      PROG.totalWins++;
      if(!PROG.clearedStages.includes(currentStage.id))
        PROG.clearedStages.push(currentStage.id);
      const xpResult = calcStageXP(true, myHp);
      const { leveled, unlocks } = gainXP(xpResult.total);
      // 0.8초 후 해금 화면으로 전환
      setTimeout(()=>{
        document.querySelectorAll('.screen').forEach(el=>el.style.display='none');
        const gw=document.getElementById('game-screen');
        const ro=document.getElementById('result-screen');
        if(ro) ro.style.display='none';
        renderUnlockScreen(unlocks, xpResult);
      }, 800);
    } else {
      // 패배해도 소량 XP
      const { leveled, unlocks } = gainXP(Math.floor((currentStage.xp||60)*0.15));
      saveProgress();
    }
    currentStage = null;
  }
}

function spawnResultParticles(type){
  const cont=document.getElementById('result-particles');
  if(!cont)return;
  cont.innerHTML='';
  const colors={win:['#f5c842','#4af0ff','#44ff88','#ffffff'],lose:['#ff4444','#ff6b35','#ff2200','#aa0000'],draw:['#a855f7','#c084fc','#e8e0ff','#7c3aed']};
  const cols=colors[type];
  for(let i=0;i<28;i++){
    const p=document.createElement('div');
    p.className='res-particle';
    const col=cols[i%cols.length];
    p.style.cssText=`left:${Math.random()*100}%;background:${col};box-shadow:0 0 6px ${col};width:${2+Math.random()*4}px;height:${2+Math.random()*4}px;animation-duration:${2+Math.random()*4}s;animation-delay:${Math.random()*2}s;animation-name:${type==='win'?'resPFloat':'resPDrop'}`;
    cont.appendChild(p);
  }
}

let rematchReady = false; // 내가 rematch 눌렀는지
function rematch(){
  if(netRole){
    // 온라인: 상대방에게 rematch 요청 전송, 대기 상태로 전환
    rematchReady = true;
    const btn = document.querySelector('.res-btn-primary');
    if(btn){ btn.textContent='⏳ 상대방 대기 중...'; btn.disabled=true; btn.style.opacity='0.6'; }
    if(netRole==='host'&&netConn){ try{netConn.send({type:'rematch'});}catch(e){} }
    if(netRole==='join'&&netConn){ try{netConn.send({type:'rematch'});}catch(e){} }
    return;
  }
  // 로컬: 즉시 재시작
  _doRematch();
}
function _doRematch(){
  rematchReady=false; _showResultPending=false;
  totalStats={kills:0,spells:0,summons:0}; scores=[0,0]; roundNum=1;
  applyLoadout(); rebuildActionBar();
  showScreen('game-screen');
  // 한 번만, window 기준으로 정확하게
  W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight;
  spellEffects=[]; GS=createGS(); spawnPillars(GS);
  if(netRole) GS.players[1].isAI=false;
  resetGameHUD();
  paused=false; lastTime=performance.now(); rafId=requestAnimationFrame(tick);
}
function startGame(diff){
  difficulty=diff; scores=[0,0]; roundNum=1; totalStats={kills:0,spells:0,summons:0}; spellEffects=[];
  applyLoadout(); rebuildActionBar();
  _showResultPending=false; GS=createGS(); spawnPillars(GS); showScreen('game-screen'); resetGameHUD();
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
  if(paused)showOverlay('PAUSED','#f5c842',9999);
  else document.getElementById('overlay-msg').classList.remove('show');
}
