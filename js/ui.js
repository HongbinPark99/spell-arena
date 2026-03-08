// ui.js — 입력 처리
// P1(HOST/싱글) & P2(JOIN) 동일 키: 화살표(이동) QWER(스펠) ASDF(소환) Space(검)

const keys={};

document.addEventListener('keydown',e=>{
  if(e.repeat)return;
  keys[e.key]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
  if(e.key==='Escape'){togglePause(); return;}
  if(!GS||!GS.started)return;

  const spellMap={q:0,Q:0,w:1,W:1,e:2,E:2,r:3,R:3};
  const sumMap  ={a:0,A:0,s:1,S:1,d:2,D:2,f:3,F:3};

  if(netRole==='join'){
    // JOIN: P2 조종, 액션은 HOST로 전송
    const p2=GS.players[1]; if(!p2||!p2.alive)return;
    if(spellMap[e.key]!==undefined){
      p2.selSpell=spellMap[e.key];
      if(netConn){try{netConn.send({type:'action',action:'spell',idx:p2.selSpell,sdx:p2.sdx||1,sdy:p2.sdy||0});}catch(ex){}}
    }
    if(sumMap[e.key]!==undefined){
      const idx=sumMap[e.key];
      if(netConn){try{netConn.send({type:'action',action:'summon',idx});}catch(ex){}}
    }
    if(e.key===' '){
      if(netConn){try{netConn.send({type:'action',action:'sword'});}catch(ex){}}
    }
    return;
  }

  // HOST / 싱글: P1 조종
  const p1=GS.players[0]; if(!p1.alive)return;
  if(spellMap[e.key]!==undefined){
    p1.selSpell=spellMap[e.key];
    const pp=p1.castSpell();
    if(pp){GS.projectiles.push(...pp); playSFXForSpell(p1.selSpell);}
    else showNotif('마나 부족 / 쿨다운','#ff6644');
    return;
  }
  if(sumMap[e.key]!==undefined){
    const idx=sumMap[e.key];
    const c=p1.summonCreature(idx);
    if(c){c.cid='p1_'+Date.now()+'_'+idx; GS.creatures.push(c); showNotif(SUMMONS[idx].emoji+' '+SUMMONS[idx].name+' 소환!',SUMMONS[idx].color); playSFX('summon',0.5);}
    else showNotif('마나 부족 / 쿨다운','#ff6644');
    return;
  }
  if(e.key===' '){p1.startSword(); playSFX('sword',0.4);}
});

document.addEventListener('keyup',e=>{keys[e.key]=false;});

// 모바일 버튼
function mobSpell(idx){
  if(!GS||!GS.started)return;
  if(netRole==='join'){
    const p2=GS.players[1];
    if(netConn){try{netConn.send({type:'action',action:'spell',idx,sdx:p2.sdx||1,sdy:p2.sdy||0});}catch(ex){}}
    return;
  }
  const p=GS.players[0]; p.selSpell=idx;
  const pp=p.castSpell(); if(pp){GS.projectiles.push(...pp); playSFXForSpell(idx);}
}
function mobSummon(idx){
  if(!GS||!GS.started)return;
  if(netRole==='join'){
    if(netConn){try{netConn.send({type:'action',action:'summon',idx});}catch(ex){}}
    return;
  }
  const c=GS.players[0].summonCreature(idx);
  if(c){c.cid='p1_'+Date.now()+'_'+idx; GS.creatures.push(c); showNotif(SUMMONS[idx].emoji+' 소환!',SUMMONS[idx].color); playSFX('summon',0.5);}
  else showNotif('마나 부족','#ff6644');
}
function mobSword(){
  if(!GS||!GS.started)return;
  if(netRole==='join'){
    if(netConn){try{netConn.send({type:'action',action:'sword'});}catch(ex){}}
    return;
  }
  GS.players[0].startSword(); playSFX('sword',0.4);
}

// 조이스틱
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
    if(dist>BASE){dx=dx/dist*BASE; dy=dy/dist*BASE;}
    thumb.style.left=(BASE+dx)+'px'; thumb.style.top=(BASE+dy)+'px';
    const p=netRole==='join'?GS.players[1]:GS.players[0];
    p.jx=dist>8?dx/BASE:0; p.jy=dist>8?dy/BASE:0;
  },{passive:false});
  document.addEventListener('touchend',e=>{
    const t=Array.from(e.changedTouches).find(t=>t.identifier===tid); if(!t)return;
    active=false;
    thumb.style.left=BASE+'px'; thumb.style.top=BASE+'px';
    if(GS){const p=netRole==='join'?GS.players[1]:GS.players[0]; p.jx=0; p.jy=0;}
  });
})();

// ─── 액션바 동적 재빌드 (로드아웃 변경 후) ─
function rebuildActionBar(){
  const spellKeys=['Q','W','E','R'];
  const sumKeys  =['A','S','D','F'];
  SPELLS.forEach((sp,i)=>{
    const sl=document.getElementById('sl-'+i); if(!sl)return;
    sl.innerHTML=`<span class="slot-key">${spellKeys[i]}</span>${sp.emoji}<span class="slot-cost">${sp.cost}</span>`;
  });
  SUMMONS.forEach((sm,i)=>{
    const sl=document.getElementById('sl-s'+i); if(!sl)return;
    sl.innerHTML=`<span class="slot-key">${sumKeys[i]}</span>${sm.emoji}<span class="slot-cost">${sm.cost}</span>`;
  });
}

// ─── 로드아웃 UI ─────────────────────────
let _pickType=null, _pickIdx=-1;

function initLoadoutUI(){
  _pickType=null; _pickIdx=-1;
  for(let i=0;i<4;i++){ updateLoSlot('spell',i); updateLoSlot('summon',i); }
  buildPool('spell');  buildPool('summon');
}

function updateLoSlot(type,idx){
  const el=document.getElementById(type==='spell'?'lo-s'+idx:'lo-m'+idx); if(!el)return;
  const item=type==='spell'
    ? SPELL_POOL .find(s=>s.id===playerLoadout.spells[idx])
    : SUMMON_POOL.find(s=>s.id===playerLoadout.summons[idx]);
  if(item) el.innerHTML=`<div style="font-size:1.5rem">${item.emoji}</div><div style="font-size:.55rem;color:var(--gold);font-family:'Cinzel',serif">${item.name}</div>`;
  else     el.innerHTML=`<div style="font-size:1.4rem;color:var(--dim)">+</div>`;
  el.classList.remove('lo-slot-active');
}

function buildPool(type){
  const pool=type==='spell'?SPELL_POOL:SUMMON_POOL;
  const el=document.getElementById(type==='spell'?'lo-spell-pool':'lo-summon-pool'); if(!el)return;
  el.innerHTML='';
  pool.forEach(item=>{
    const d=document.createElement('div'); d.className='lo-card';
    const costLabel=type==='spell'?`MP:${item.cost} CD:${(item.cd/1000).toFixed(1)}s`:`MP:${item.cost} HP:${item.hp}`;
    d.innerHTML=`<div class="lo-card-emoji">${item.emoji}</div><div class="lo-card-name">${item.name}</div><div class="lo-card-info">${costLabel}</div>`;
    d.onclick=()=>assignItem(type,item.id);
    el.appendChild(d);
  });
}

function pickSlot(type,idx){
  _pickType=type; _pickIdx=idx;
  document.querySelectorAll('.lo-slot').forEach(e=>e.classList.remove('lo-slot-active'));
  const elId=type==='spell'?'lo-s'+idx:'lo-m'+idx;
  document.getElementById(elId)?.classList.add('lo-slot-active');
  document.getElementById('lo-hint').textContent='← 아래에서 선택';
}

function assignItem(type,id){
  if(_pickType!==type||_pickIdx<0)return;
  if(type==='spell')  playerLoadout.spells [_pickIdx]=id;
  else                playerLoadout.summons[_pickIdx]=id;
  applyLoadout();
  updateLoSlot(type,_pickIdx);
  document.getElementById(_pickType==='spell'?'lo-s'+_pickIdx:'lo-m'+_pickIdx)?.classList.remove('lo-slot-active');
  _pickType=null; _pickIdx=-1;
  document.getElementById('lo-hint').textContent='슬롯 클릭 후 선택';
}
