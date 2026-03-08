// network.js — 온라인 멀티플레이어
// HOST 권위 서버, JOIN 입력 전송, 정규화 좌표로 화면 크기 독립

let peer=null,netConn=null,netRole=null,netReady=false;
let netSyncTimer=0;
const NET_HZ=60; // 60fps 동기화로 딜레이 최소화
let remoteP2Input={vx:0,vy:0};
let joinCreatureCache={};

function randCode(){return Math.random().toString(36).substring(2,8).toUpperCase();}
function showOnlineScreen(){showScreen('online-screen');initHostPeer();}
function leaveOnline(){if(peer){peer.destroy();peer=null;}netConn=null;netRole=null;netReady=false;joinCreatureCache={};showScreen('title-screen');}
function copyHostCode(){const code=document.getElementById('host-code').textContent;if(code==='생성 중...')return;navigator.clipboard?.writeText(code).then(()=>showNotif('코드 복사됨!','#44ff88')).catch(()=>{});}

function initHostPeer(){
  if(peer)peer.destroy();
  const code=randCode();
  document.getElementById('host-code').textContent='생성 중...';
  document.getElementById('host-status').textContent='연결 초기화 중...';
  document.getElementById('host-status').className='lobby-status wait';
  peer=new Peer('spella-'+code,{host:'0.peerjs.com',port:443,secure:true,
    config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}});
  peer.on('open',()=>{document.getElementById('host-code').textContent=code;document.getElementById('host-status').textContent='상대방 접속 대기 중...';document.getElementById('host-status').className='lobby-status wait';});
  peer.on('connection',conn=>{
    netConn=conn;netRole='host';
    conn.on('open',()=>{document.getElementById('host-status').textContent='연결됨! 게임 시작 중...';document.getElementById('host-status').className='lobby-status ok';netReady=true;setTimeout(()=>startOnlineGame('host'),800);});
    conn.on('data',handleNetData);
    conn.on('close',()=>{showNotif('상대방 연결 끊김','#ff4444');netReady=false;});
    conn.on('error',e=>console.error(e));
  });
  peer.on('error',e=>{document.getElementById('host-status').textContent='오류: '+e.type;document.getElementById('host-status').className='lobby-status err';setTimeout(initHostPeer,3000);});
}

function joinGame(){
  const raw=document.getElementById('join-input').value.trim().toUpperCase();
  if(raw.length<4){document.getElementById('join-status').textContent='코드를 입력하세요';document.getElementById('join-status').className='lobby-status err';return;}
  document.getElementById('join-status').textContent='연결 중...';document.getElementById('join-status').className='lobby-status wait';
  if(peer)peer.destroy();
  peer=new Peer(undefined,{host:'0.peerjs.com',port:443,secure:true,
    config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}});
  peer.on('open',()=>{
    // reliable+binary 직렬화로 지연 최소화
    const conn=peer.connect('spella-'+raw,{reliable:false,serialization:'json'});
    netConn=conn;netRole='join';
    conn.on('open',()=>{document.getElementById('join-status').textContent='연결됨!';document.getElementById('join-status').className='lobby-status ok';netReady=true;});
    conn.on('data',handleNetData);
    conn.on('close',()=>{showNotif('상대방 연결 끊김','#ff4444');netReady=false;});
    conn.on('error',e=>{document.getElementById('join-status').textContent='연결 실패: '+e.type;document.getElementById('join-status').className='lobby-status err';});
  });
  peer.on('error',e=>{document.getElementById('join-status').textContent=e.type;document.getElementById('join-status').className='lobby-status err';});
}

function handleNetData(data){
  if(!data||!data.type)return;
  if(data.type==='start'  &&netRole==='join')startOnlineGame('join');
  if(data.type==='input'  &&netRole==='host')remoteP2Input=data;
  if(data.type==='state'  &&netRole==='join')applyNetState(data.gs);
  if(data.type==='action' &&netRole==='host')applyRemoteAction(data);
  if(data.type==='sound')playSFX(data.sfx,data.vol||.5);
  if(data.type==='rematch'&&netRole==='join'){
    totalStats={kills:0,spells:0,summons:0};scores=[0,0];roundNum=1;joinCreatureCache={};
    GS=createGS();GS.players[1].isAI=false;
    showScreen('game-screen');resetGameHUD();
    paused=false;lastTime=performance.now();
    if(rafId)cancelAnimationFrame(rafId);rafId=requestAnimationFrame(tick);
  }
}

function startOnlineGame(role){
  difficulty='normal';scores=[0,0];roundNum=1;totalStats={kills:0,spells:0,summons:0};joinCreatureCache={};
  document.getElementById('p2-name-span').textContent='PLAYER 2';
  GS=createGS();GS.players[1].isAI=false;
  showScreen('game-screen');resetGameHUD();
  paused=false;lastTime=performance.now();
  if(role==='host'&&netConn)netConn.send({type:'start'});
  rafId=requestAnimationFrame(tick);
}

// HOST → JOIN: 정규화 좌표(0~1) 전송
function netSyncState(){
  if(netRole!=='host'||!netConn||!GS)return;
  const a=GS.arena;
  const nx=x=>(x-a.x)/a.w, ny=y=>(y-a.y)/a.h;
  const gs={
    players:GS.players.map(p=>({
      id:p.id,nx:nx(p.x),ny:ny(p.y),hp:p.hp|0,mp:p.mp|0,
      facing:p.facing,alive:p.alive,
      swordActive:p.swordActive,swordAngle:p.swordAngle,
      slowTimer:p.slowTimer,inEnemyTerritory:p.inEnemyTerritory,invasionTimer:p.invasionTimer,
      spellCDs:p.spellCDs.map(v=>v|0),summonCDs:p.summonCDs.map(v=>v|0),selSpell:p.selSpell
    })),
    projectiles:GS.projectiles.slice(0,40).map(pr=>({
      nx:nx(pr.x),ny:ny(pr.y),nvx:pr.vx/a.w,nvy:pr.vy/a.h,ownerId:pr.ownerId,
      spell:{name:pr.spell.name,color:pr.spell.color,dmg:pr.spell.dmg,
             speed:pr.spell.speed,radius:pr.spell.radius,pierce:!!pr.spell.pierce,slow:!!pr.spell.slow}
    })),
    creatures:GS.creatures.slice(0,12).map(c=>({
      cid:c.cid,nx:nx(c.x),ny:ny(c.y),defId:c.def.id,defName:c.def.name,ownerId:c.ownerId,
      hp:c.hp|0,maxHp:c.maxHp,facing:c.facing,alive:c.alive,spawnScale:c.spawnScale
    })),
    orbs:GS.orbs.map(o=>({nx:nx(o.x),ny:ny(o.y),alive:o.alive})),
    timer:GS.timer,gameOver:GS.gameOver,started:GS.started,
    shakeX:GS.shakeX,shakeY:GS.shakeY,
  };
  try{netConn.send({type:'state',gs});}catch(e){}
}

// JOIN: 정규화 좌표 → 로컬 픽셀
function applyNetState(ns){
  if(!GS||!ns)return;
  const a=GS.arena;
  const ax=nx=>a.x+nx*a.w, ay=ny=>a.y+ny*a.h;
  ns.players.forEach((np,i)=>{
    const p=GS.players[i];if(!p)return;
    p.x=ax(np.nx);p.y=ay(np.ny);
    p.hp=np.hp;p.mp=np.mp;p.facing=np.facing;p.alive=np.alive;
    p.swordActive=np.swordActive;p.swordAngle=np.swordAngle;
    p.slowTimer=np.slowTimer;p.inEnemyTerritory=np.inEnemyTerritory;p.invasionTimer=np.invasionTimer;
    p.spellCDs=np.spellCDs;p.summonCDs=np.summonCDs;p.selSpell=np.selSpell;
  });
  GS.projectiles=ns.projectiles.map(np=>new Projectile(ax(np.nx),ay(np.ny),np.nvx*a.w,np.nvy*a.h,np.spell,np.ownerId));
  const newCache={};
  GS.creatures=ns.creatures.filter(c=>c.alive).map(nc=>{
    const def=SUMMON_POOL.find(s=>s.id===nc.defId||s.name===nc.defName);if(!def)return null;
    const prev=joinCreatureCache[nc.cid];
    const c=new Creature(ax(nc.nx),ay(nc.ny),def,nc.ownerId);
    c.hp=nc.hp;c.maxHp=nc.maxHp;c.facing=nc.facing;c.alive=true;
    c.spawnScale=nc.spawnScale!==undefined?nc.spawnScale:(prev?prev.spawnScale:.1);c.cid=nc.cid;
    newCache[nc.cid]={spawnScale:c.spawnScale};return c;
  }).filter(Boolean);
  joinCreatureCache=newCache;
  GS.orbs=ns.orbs.filter(o=>o.alive).map(o=>new ManaOrb(ax(o.nx),ay(o.ny)));
  GS.timer=ns.timer;GS.gameOver=ns.gameOver;
  if(ns.shakeX){GS.shakeX=ns.shakeX;GS.shakeY=ns.shakeY;}
  if(ns.started&&!GS.started){GS.started=true;showOverlay('FIGHT!','#f5c842',1.2);}
  if(ns.gameOver&&!GS._resultShown){
    GS._resultShown=true;updateHUD();
    const p2=GS.players[1],p1=GS.players[0];
    let msg='DRAW!',col='#f5c842';
    if(!p1.alive){msg='YOU WIN!';col='#4af0ff';}
    else if(!p2.alive){msg='DEFEATED!';col='#ff6b35';}
    else if(p1.hp<p2.hp){msg='YOU WIN!';col='#4af0ff';}
    else if(p2.hp<p1.hp){msg='DEFEATED!';col='#ff6b35';}
    showOverlay(msg,col,2.4);setTimeout(showResult,2800);
  }
}

function applyRemoteAction(data){
  if(!GS)return;
  const p2=GS.players[1];if(!p2||!p2.alive)return;
  if(data.action==='spell'){
    p2.selSpell=data.idx;
    const pp=p2.castSpell();if(pp){GS.projectiles.push(...pp);playSFX('spell',.4);}
  } else if(data.action==='summon'){
    const c=p2.summonCreature(data.idx);
    if(c){GS.creatures.push(c);showNotif(SUMMONS[data.idx]?.emoji+' '+(SUMMONS[data.idx]?.name||'')+' (P2)',SUMMONS[data.idx]?.color||'#fff');playSFX('summon',.5);}
  } else if(data.action==='sword'){p2.startSword();playSFX('sword',.5);}
}

function applyOnlineP2Input(){
  if(netRole!=='host'||!GS)return;
  const p2=GS.players[1];
  p2.vx=remoteP2Input.vx||0;p2.vy=remoteP2Input.vy||0;
}
