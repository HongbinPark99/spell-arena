// ════════════════════════════════════════
//  ui.js — HUD 업데이트 & 입력 처리
//  · updateHUD()       — HP/MP 바, 쿨다운 표시
//  · 키보드 이벤트     — P1 스펠/소환/검/일시정지
//  · 모바일 함수       — mobSpell/mobSummon/mobSword
//  · 조이스틱          — 360도 아날로그 입력
// ════════════════════════════════════════

// ─── KEYBOARD ────────────────────────────
const keys={};
document.addEventListener('keydown',e=>{
  if(e.repeat)return;
  keys[e.key]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
  if(e.key==='Escape'){togglePause();return;}
  if(!GS||!GS.started)return;
  const p1=GS.players[0], p2=GS.players[1];
  if(!p1.alive)return;

  // Spell: Q W E R — fires in current movement direction (sdx/sdy)
  const spellMap={'q':0,'Q':0,'w':1,'W':1,'e':2,'E':2,'r':3,'R':3};
  if(spellMap[e.key]!==undefined){
    p1.selSpell=spellMap[e.key];
    const pp=p1.castSpell();
    if(pp){GS.projectiles.push(...pp);}
    else showNotif('마나 부족 / 쿨다운','#ff6644');
    return;
  }
  // Summon: A S D F
  const sumMap={'a':0,'A':0,'s':1,'S':1,'d':2,'D':2,'f':3,'F':3};
  if(sumMap[e.key]!==undefined){
    const idx=sumMap[e.key], c=p1.summonCreature(idx);
    if(c){ GS.creatures.push(c); showNotif(`${SUMMONS[idx].emoji} ${SUMMONS[idx].name} 소환!`,SUMMONS[idx].color); }
    else  showNotif(`마나 부족 / 쿨다운 (필요: ${SUMMONS[idx].cost}MP)`,'#ff6644');
    return;
  }
  if(e.key===' ')p1.startSword();
});
document.addEventListener('keyup',e=>{ keys[e.key]=false; });

// ─── MOBILE ──────────────────────────────
function mobSpell(idx){if(!GS||!GS.started)return; const p1=GS.players[0]; p1.selSpell=idx; const pp=p1.castSpell(); if(pp)GS.projectiles.push(...pp);}
function mobSummon(idx){if(!GS||!GS.started)return; const c=GS.players[0].summonCreature(idx); if(c){GS.creatures.push(c);showNotif(`${SUMMONS[idx].emoji} 소환!`,SUMMONS[idx].color);}else showNotif('마나 부족','#ff6644');}
function mobSword(){if(!GS||!GS.started)return;GS.players[0].startSword();}

// Joystick
(()=>{
  const zone=document.getElementById('jzone'),thumb=document.getElementById('jsthumb'),BASE=55;
  let active=false,sx=0,sy=0,tid;
  zone.addEventListener('touchstart',e=>{ e.preventDefault(); const t=e.changedTouches[0]; tid=t.identifier; const r=zone.getBoundingClientRect(); sx=r.left+BASE; sy=r.top+BASE; active=true; },{passive:false});
  document.addEventListener('touchmove',e=>{ if(!active||!GS)return; e.preventDefault(); const t=Array.from(e.touches).find(t=>t.identifier===tid); if(!t)return; let dx=t.clientX-sx,dy=t.clientY-sy; const dist=Math.sqrt(dx*dx+dy*dy); if(dist>BASE){dx=dx/dist*BASE;dy=dy/dist*BASE;} thumb.style.left=(BASE+dx)+'px'; thumb.style.top=(BASE+dy)+'px'; GS.players[0].jx=dist>8?dx/BASE:0; GS.players[0].jy=dist>8?dy/BASE:0; },{passive:false});
  document.addEventListener('touchend',e=>{ const t=Array.from(e.changedTouches).find(t=>t.identifier===tid); if(!t)return; active=false; thumb.style.left=BASE+'px'; thumb.style.top=BASE+'px'; if(GS){GS.players[0].jx=0;GS.players[0].jy=0;} });
})();


// ─── 조이스틱 (모바일) ────────────────────
(()=>{
  const zone=document.getElementById('jzone'),thumb=document.getElementById('jsthumb'),BASE=55;
  let active=false,sx=0,sy=0,tid;
  zone.addEventListener('touchstart',e=>{ e.preventDefault(); const t=e.changedTouches[0]; tid=t.identifier; const r=zone.getBoundingClientRect(); sx=r.left+BASE; sy=r.top+BASE; active=true; },{passive:false});
  document.addEventListener('touchmove',e=>{ if(!active||!GS)return; e.preventDefault(); const t=Array.from(e.touches).find(t=>t.identifier===tid); if(!t)return; let dx=t.clientX-sx,dy=t.clientY-sy; const dist=Math.sqrt(dx*dx+dy*dy); if(dist>BASE){dx=dx/dist*BASE;dy=dy/dist*BASE;} thumb.style.left=(BASE+dx)+'px'; thumb.style.top=(BASE+dy)+'px'; GS.players[0].jx=dist>8?dx/BASE:0; GS.players[0].jy=dist>8?dy/BASE:0; },{passive:false});
  document.addEventListener('touchend',e=>{ const t=Array.from(e.changedTouches).find(t=>t.identifier===tid); if(!t)return; active=false; thumb.style.left=BASE+'px'; thumb.style.top=BASE+'px'; if(GS){GS.players[0].jx=0;GS.players[0].jy=0;} });
})();
