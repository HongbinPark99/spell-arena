// ════════════════════════════════════════
//  ui.js — HUD 업데이트 & 입력 처리
// ════════════════════════════════════════

const keys={};

document.addEventListener('keydown',e=>{
  if(e.repeat)return;
  keys[e.key]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  if(e.key==='Escape'){ togglePause(); return; }
  if(!GS||!GS.started) return;

  // JOIN 모드에서는 P1 키를 처리하지 않음 (network.js에서 처리)
  if(netRole==='join') return;

  const p1=GS.players[0];
  if(!p1.alive) return;

  // 스펠: Q W E R
  const spellMap={'q':0,'Q':0,'w':1,'W':1,'e':2,'E':2,'r':3,'R':3};
  if(spellMap[e.key]!==undefined){
    p1.selSpell=spellMap[e.key];
    const pp=p1.castSpell();
    if(pp){
      GS.projectiles.push(...pp);
      playSFXForSpell(p1.selSpell);
    } else {
      showNotif('마나 부족 / 쿨다운','#ff6644');
    }
    return;
  }

  // 소환: A S D F
  const sumMap={'a':0,'A':0,'s':1,'S':1,'d':2,'D':2,'f':3,'F':3};
  if(sumMap[e.key]!==undefined){
    const idx=sumMap[e.key];
    const c=p1.summonCreature(idx);
    if(c){
      c.cid='p1_'+Date.now()+'_'+idx;
      GS.creatures.push(c);
      showNotif(SUMMONS[idx].emoji+' '+SUMMONS[idx].name+' 소환!',SUMMONS[idx].color);
      playSFX('summon',0.5);
    } else {
      showNotif('마나 부족 / 쿨다운 (필요: '+SUMMONS[idx].cost+'MP)','#ff6644');
    }
    return;
  }

  if(e.key===' '){ p1.startSword(); playSFX('sword',0.4); }
});

document.addEventListener('keyup',e=>{ keys[e.key]=false; });

// ─── 모바일 ──────────────────────────────
function mobSpell(idx){
  if(!GS||!GS.started)return;
  const p=netRole==='join'?GS.players[1]:GS.players[0];
  if(netRole==='join'){
    // JOIN 모바일: 액션을 HOST로 전송
    if(netConn){ try{netConn.send({type:'action',action:'spell',idx,sdx:p.sdx,sdy:p.sdy});}catch(ex){} }
    return;
  }
  p.selSpell=idx;
  const pp=p.castSpell();
  if(pp){ GS.projectiles.push(...pp); playSFXForSpell(idx); }
}

function mobSummon(idx){
  if(!GS||!GS.started)return;
  if(netRole==='join'){
    if(netConn){ try{netConn.send({type:'action',action:'summon',idx});}catch(ex){} }
    return;
  }
  const c=GS.players[0].summonCreature(idx);
  if(c){
    c.cid='p1_'+Date.now()+'_'+idx;
    GS.creatures.push(c);
    showNotif(SUMMONS[idx].emoji+' 소환!',SUMMONS[idx].color);
    playSFX('summon',0.5);
  } else { showNotif('마나 부족','#ff6644'); }
}

function mobSword(){
  if(!GS||!GS.started)return;
  if(netRole==='join'){
    if(netConn){ try{netConn.send({type:'action',action:'sword'});}catch(ex){} }
    return;
  }
  GS.players[0].startSword();
  playSFX('sword',0.4);
}

// ─── 조이스틱 (모바일) ────────────────────
(()=>{
  const zone=document.getElementById('jzone'),thumb=document.getElementById('jsthumb'),BASE=55;
  let active=false,sx=0,sy=0,tid;
  zone.addEventListener('touchstart',e=>{
    e.preventDefault();
    const t=e.changedTouches[0]; tid=t.identifier;
    const r=zone.getBoundingClientRect(); sx=r.left+BASE; sy=r.top+BASE; active=true;
  },{passive:false});
  document.addEventListener('touchmove',e=>{
    if(!active||!GS)return; e.preventDefault();
    const t=Array.from(e.touches).find(t=>t.identifier===tid); if(!t)return;
    let dx=t.clientX-sx, dy=t.clientY-sy;
    const dist=Math.sqrt(dx*dx+dy*dy);
    if(dist>BASE){dx=dx/dist*BASE;dy=dy/dist*BASE;}
    thumb.style.left=(BASE+dx)+'px'; thumb.style.top=(BASE+dy)+'px';
    // JOIN은 p2, HOST/싱글은 p1 조종
    const pidx = netRole==='join' ? 1 : 0;
    GS.players[pidx].jx=dist>8?dx/BASE:0;
    GS.players[pidx].jy=dist>8?dy/BASE:0;
  },{passive:false});
  document.addEventListener('touchend',e=>{
    const t=Array.from(e.changedTouches).find(t=>t.identifier===tid); if(!t)return;
    active=false;
    thumb.style.left=BASE+'px'; thumb.style.top=BASE+'px';
    if(GS){
      const pidx = netRole==='join' ? 1 : 0;
      GS.players[pidx].jx=0; GS.players[pidx].jy=0;
    }
  });
})();
