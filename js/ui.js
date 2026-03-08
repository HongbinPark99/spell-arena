// ui.js — 입력, HUD 빌드, 로드아웃 UI

let pickingSpellSlot=-1, pickingSummonSlot=-1;

// ─── HUD 동적 빌드 ───────────────────────
function buildActionBar(){
  const sb=document.getElementById('spell-bar');
  const smb=document.getElementById('summon-bar');
  const msb=document.getElementById('mob-spells');
  const msmb=document.getElementById('mob-summons');
  if(!sb)return;
  sb.innerHTML='';smb.innerHTML='';
  if(msb)msb.innerHTML='';if(msmb)msmb.innerHTML='';
  const spellKeys=['Q','W','E','R'];
  SPELLS.forEach((sp,i)=>{
    const d=document.createElement('div');
    d.className='aslot spell-slot'+(i===0?' active':'');d.id='sl-'+i;
    d.innerHTML=`<span class="slot-key">${spellKeys[i]}</span>${sp.emoji}<span class="slot-cost">${sp.cost}</span>`;
    sb.appendChild(d);
    if(msb){const mb=document.createElement('button');mb.className='mob-btn';mb.textContent=sp.emoji;mb.ontouchstart=()=>mobSpell(i);msb.appendChild(mb);}
  });
  const sumKeys=['A','S'];
  SUMMONS.forEach((sm,i)=>{
    const d=document.createElement('div');
    d.className='aslot summon-slot';d.id='sl-s'+i;
    d.innerHTML=`<span class="slot-key">${sumKeys[i]}</span>${sm.emoji}<span class="slot-cost">${sm.cost}</span>`;
    smb.appendChild(d);
    if(msmb){const mb=document.createElement('button');mb.className='mob-btn';mb.textContent=sm.emoji;mb.ontouchstart=()=>mobSummon(i);msmb.appendChild(mb);}
  });
}

// ─── 로드아웃 UI ─────────────────────────
function initLoadoutUI(){
  // 장착 슬롯 업데이트
  for(let i=0;i<4;i++) updateEquipSlot('spell',i);
  for(let i=0;i<2;i++) updateEquipSlot('summon',i);
  // 풀 그리드
  const spg=document.getElementById('spell-pool-grid');
  const smg=document.getElementById('summon-pool-grid');
  if(spg){spg.innerHTML='';SPELL_POOL.forEach(sp=>{const d=document.createElement('div');d.className='pool-card';d.innerHTML=`<div class="pool-emoji">${sp.emoji}</div><div class="pool-name">${sp.name}</div><div class="pool-desc">${sp.desc}</div><div class="pool-cost">MP: ${sp.cost} / CD: ${(sp.cd/1000).toFixed(1)}s</div>`;d.onclick=()=>{if(pickingSpellSlot>=0){equipSpell(pickingSpellSlot,sp.id);pickingSpellSlot=-1;clearPickHighlight();}};spg.appendChild(d);});}
  if(smg){smg.innerHTML='';SUMMON_POOL.forEach(sm=>{const d=document.createElement('div');d.className='pool-card';d.innerHTML=`<div class="pool-emoji">${sm.emoji}</div><div class="pool-name">${sm.name}</div><div class="pool-desc">${sm.desc}</div><div class="pool-cost">MP: ${sm.cost} / HP: ${sm.hp}</div>`;d.onclick=()=>{if(pickingSummonSlot>=0){equipSummon(pickingSummonSlot,sm.id);pickingSummonSlot=-1;clearPickHighlight();}};smg.appendChild(d);});}
}
function updateEquipSlot(type,idx){
  const el=document.getElementById('e'+type+'-'+idx);if(!el)return;
  const item=type==='spell'?SPELL_POOL.find(s=>s.id===playerLoadout.spells[idx]):SUMMON_POOL.find(s=>s.id===playerLoadout.summons[idx]);
  if(item) el.innerHTML=`<div class="pool-emoji" style="font-size:1.6rem">${item.emoji}</div><div style="font-size:.55rem;color:var(--gold);font-family:'Cinzel',serif;">${item.name}</div>`;
  else el.innerHTML='<div style="font-size:1.4rem;color:var(--dim)">+</div>';
}
function openSpellPicker(slot){pickingSpellSlot=slot;pickingSummonSlot=-1;highlightSlot('espell-'+slot);}
function openSummonPicker(slot){pickingSummonSlot=slot;pickingSpellSlot=-1;highlightSlot('esummon-'+slot);}
function highlightSlot(id){clearPickHighlight();const el=document.getElementById(id);if(el)el.classList.add('picking');}
function clearPickHighlight(){document.querySelectorAll('.equip-slot.picking').forEach(e=>e.classList.remove('picking'));}
function equipSpell(slot,id){playerLoadout.spells[slot]=id;applyLoadout();updateEquipSlot('spell',slot);}
function equipSummon(slot,id){playerLoadout.summons[slot]=id;applyLoadout();updateEquipSlot('summon',slot);}

// ─── 키보드 입력 ─────────────────────────
document.addEventListener('keydown',e=>{
  keys[e.key]=true; // repeat 여부 관계없이 항상 세팅
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
  if(e.repeat)return; // 스펠/소환 중복 실행만 방지
  if(e.key==='Escape'){togglePause();return;}
  if(!GS)return;

  const spellMap={q:0,Q:0,w:1,W:1,e:2,E:2,r:3,R:3};
  const sumMap  ={a:0,A:0,s:1,S:1};

  if(netRole==='join'){
    const p2=GS.players[1];if(!p2||!p2.alive)return;
    if(spellMap[e.key]!==undefined){
      p2.selSpell=spellMap[e.key];
      if(netConn){try{netConn.send({type:'action',action:'spell',idx:p2.selSpell});}catch(ex){}}
    }
    if(sumMap[e.key]!==undefined){
      const idx=sumMap[e.key];
      if(netConn){try{netConn.send({type:'action',action:'summon',idx});}catch(ex){}}
    }
    if(e.key===' '){if(netConn){try{netConn.send({type:'action',action:'sword'});}catch(ex){}}}
    return;
  }

  const p1=GS.players[0];if(!p1.alive)return;
  if(spellMap[e.key]!==undefined){
    p1.selSpell=spellMap[e.key];
    const pp=p1.castSpell();
    if(pp){GS.projectiles.push(...pp);playSFXForSpell(p1.selSpell);}
    else showNotif('마나 부족 / 쿨다운','#ff6644');
    return;
  }
  if(sumMap[e.key]!==undefined){
    const idx=sumMap[e.key];
    const c=p1.summonCreature(idx);
    if(c){GS.creatures.push(c);showNotif(SUMMONS[idx].emoji+' '+SUMMONS[idx].name+' 소환!',SUMMONS[idx].color);playSFX('summon',.5);}
    else showNotif('마나 부족 / 쿨다운','#ff6644');
    return;
  }
  if(e.key===' '){p1.startSword();playSFX('sword',.4);}
});

document.addEventListener('keyup',e=>{keys[e.key]=false;});

// 모바일 버튼
function mobSpell(idx){
  if(!GS||!GS.started)return;
  if(netRole==='join'){const p2=GS.players[1];if(netConn)try{netConn.send({type:'action',action:'spell',idx});}catch(ex){}return;}
  const p=GS.players[0];p.selSpell=idx;const pp=p.castSpell();if(pp){GS.projectiles.push(...pp);playSFXForSpell(idx);}
}
function mobSummon(idx){
  if(!GS||!GS.started)return;
  if(netRole==='join'){if(netConn)try{netConn.send({type:'action',action:'summon',idx});}catch(ex){}return;}
  const c=GS.players[0].summonCreature(idx);
  if(c){GS.creatures.push(c);showNotif(SUMMONS[idx].emoji+' 소환!',SUMMONS[idx].color);playSFX('summon',.5);}
  else showNotif('마나 부족','#ff6644');
}
function mobSword(){
  if(!GS||!GS.started)return;
  if(netRole==='join'){if(netConn)try{netConn.send({type:'action',action:'sword'});}catch(ex){}return;}
  GS.players[0].startSword();playSFX('sword',.4);
}

// 조이스틱
(()=>{
  const zone=document.getElementById('jzone'),thumb=document.getElementById('jsthumb'),BASE=55;
  let active=false,sx=0,sy=0,tid;
  if(!zone)return;
  zone.addEventListener('touchstart',e=>{e.preventDefault();const t=e.changedTouches[0];tid=t.identifier;const r=zone.getBoundingClientRect();sx=r.left+BASE;sy=r.top+BASE;active=true;},{passive:false});
  document.addEventListener('touchmove',e=>{
    if(!active||!GS)return;e.preventDefault();
    const t=Array.from(e.touches).find(t=>t.identifier===tid);if(!t)return;
    let dx=t.clientX-sx,dy=t.clientY-sy;const dist=Math.sqrt(dx*dx+dy*dy);
    if(dist>BASE){dx=dx/dist*BASE;dy=dy/dist*BASE;}
    thumb.style.left=(BASE+dx)+'px';thumb.style.top=(BASE+dy)+'px';
    const p=netRole==='join'?GS.players[1]:GS.players[0];
    p.jx=dist>8?dx/BASE:0;p.jy=dist>8?dy/BASE:0;
  },{passive:false});
  document.addEventListener('touchend',e=>{
    const t=Array.from(e.changedTouches).find(t=>t.identifier===tid);if(!t)return;
    active=false;thumb.style.left=BASE+'px';thumb.style.top=BASE+'px';
    if(GS){const p=netRole==='join'?GS.players[1]:GS.players[0];p.jx=0;p.jy=0;}
  });
})();
