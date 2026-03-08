// ════════════════════════════════════════
//  network.js — 온라인 멀티플레이어 (수정판)
//
//  수정 내용:
//  1. reliable:true 로 변경 → 소환수/스펠 패킷 손실 없음
//  2. creatures에 cid(고유ID) 부여 → spawnScale 캐시 유지
//  3. JOIN 측에서 HOST 상태 완전 반영 (플레이어 위치 보간)
//  4. sound 이벤트 네트워크 전파
//
//  조작키:
//  HOST(P1): 방향키 이동 · Q W E R 스펠 · A S D F 소환 · Space 검
//  JOIN(P2): I J K L 이동 · U O P [ 스펠 · 1 2 3 4 소환 · Enter 검
// ════════════════════════════════════════

let peer        = null;
let netConn     = null;
let netRole     = null;
let netReady    = false;
let netSyncTimer= 0;
const NET_HZ    = 30;

let remoteP2Input = { vx:0, vy:0, sdx:1, sdy:0 };
let joinCreatureCache = {};

function randCode(){ return Math.random().toString(36).substring(2,8).toUpperCase(); }

function showOnlineScreen(){
  showScreen('online-screen');
  initHostPeer();
}

function leaveOnline(){
  if(peer){ peer.destroy(); peer=null; }
  netConn=null; netRole=null; netReady=false;
  joinCreatureCache={};
  showScreen('title-screen');
}

function copyHostCode(){
  const code=document.getElementById('host-code').textContent;
  if(code==='생성 중...')return;
  navigator.clipboard?.writeText(code).then(()=>showNotif('코드 복사됨!','#44ff88')).catch(()=>{});
}

function initHostPeer(){
  if(peer){ peer.destroy(); }
  const code=randCode();
  document.getElementById('host-code').textContent='생성 중...';
  document.getElementById('host-status').textContent='연결 초기화 중...';
  document.getElementById('host-status').className='lobby-status wait';

  peer=new Peer('spella-'+code, {
    host:'0.peerjs.com', port:443, secure:true,
    config:{ iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}] }
  });

  peer.on('open', ()=>{
    document.getElementById('host-code').textContent=code;
    document.getElementById('host-status').textContent='상대방 접속 대기 중...';
    document.getElementById('host-status').className='lobby-status wait';
  });

  peer.on('connection', conn=>{
    netConn=conn; netRole='host';
    conn.on('open',()=>{
      document.getElementById('host-status').textContent='연결됨! 게임 시작 중...';
      document.getElementById('host-status').className='lobby-status ok';
      netReady=true;
      setTimeout(()=>startOnlineGame('host'),1000);
    });
    conn.on('data', handleNetData);
    conn.on('close',()=>{ showNotif('상대방 연결 끊김','#ff4444'); netReady=false; });
    conn.on('error', e=>console.error('conn err',e));
  });

  peer.on('error', e=>{
    document.getElementById('host-status').textContent='오류: '+e.type;
    document.getElementById('host-status').className='lobby-status err';
    setTimeout(initHostPeer, 3000);
  });
}

function joinGame(){
  const raw=document.getElementById('join-input').value.trim().toUpperCase();
  if(raw.length<4){
    document.getElementById('join-status').textContent='코드를 입력하세요';
    document.getElementById('join-status').className='lobby-status err';
    return;
  }
  const peerId='spella-'+raw;
  document.getElementById('join-status').textContent='연결 중...';
  document.getElementById('join-status').className='lobby-status wait';

  if(peer){ peer.destroy(); }
  peer=new Peer(undefined, {
    host:'0.peerjs.com', port:443, secure:true,
    config:{ iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}] }
  });

  peer.on('open', ()=>{
    const conn=peer.connect(peerId, {reliable:true, serialization:'json'});
    netConn=conn; netRole='join';
    conn.on('open',()=>{
      document.getElementById('join-status').textContent='연결됨! 게임 시작 중...';
      document.getElementById('join-status').className='lobby-status ok';
      netReady=true;
    });
    conn.on('data', handleNetData);
    conn.on('close',()=>{ showNotif('상대방 연결 끊김','#ff4444'); netReady=false; });
    conn.on('error', e=>{
      document.getElementById('join-status').textContent='연결 실패: '+e.type;
      document.getElementById('join-status').className='lobby-status err';
    });
  });

  peer.on('error', e=>{
    document.getElementById('join-status').textContent=e.type;
    document.getElementById('join-status').className='lobby-status err';
  });
}

function handleNetData(data){
  if(!data||!data.type)return;
  switch(data.type){
    case 'start':
      if(netRole==='join') startOnlineGame('join');
      break;
    case 'input':
      if(netRole==='host') remoteP2Input=data;
      break;
    case 'state':
      if(netRole==='join') applyNetState(data.gs);
      break;
    case 'action':
      if(netRole==='host') applyRemoteAction(data);
      break;
    case 'sound':
      if(data.sfx) playSFX(data.sfx, data.vol||0.5);
      break;
  }
}

function startOnlineGame(role){
  difficulty='normal';
  scores=[0,0]; roundNum=1; totalStats={kills:0,spells:0,summons:0};
  joinCreatureCache={};

  document.getElementById('p2-name-span').textContent='PLAYER 2';

  GS=createGS();
  GS.players[1].isAI=false;

  showScreen('game-screen'); resetGameHUD();
  paused=false; lastTime=performance.now();

  if(role==='host' && netConn){ netConn.send({type:'start'}); }

  rafId=requestAnimationFrame(tick);
}

// HOST -> JOIN: 풀 상태 스냅샷 전송 (30fps)
function netSyncState(){
  if(netRole!=='host'||!netConn||!GS)return;
  const gs={
    players: GS.players.map(p=>({
      id:p.id, x:Math.round(p.x), y:Math.round(p.y),
      hp:Math.round(p.hp), mp:Math.round(p.mp),
      facing:p.facing, swordActive:p.swordActive, swordAngle:p.swordAngle,
      slowTimer:p.slowTimer, inEnemyTerritory:p.inEnemyTerritory,
      invasionTimer:p.invasionTimer, alive:p.alive,
      spellCDs:p.spellCDs.map(v=>Math.round(v)),
      summonCDs:p.summonCDs.map(v=>Math.round(v)),
      selSpell:p.selSpell
    })),
    projectiles: GS.projectiles.map(pr=>({
      x:Math.round(pr.x), y:Math.round(pr.y), vx:pr.vx, vy:pr.vy,
      spell:{name:pr.spell.name,color:pr.spell.color,dmg:pr.spell.dmg,
             speed:pr.spell.speed,radius:pr.spell.radius,
             pierce:!!pr.spell.pierce,slow:!!pr.spell.slow},
      ownerId:pr.ownerId
    })),
    creatures: GS.creatures.map(c=>({
      cid:c.cid||'c_'+c.ownerId,
      x:Math.round(c.x), y:Math.round(c.y),
      defName:c.def.name, ownerId:c.ownerId,
      hp:Math.round(c.hp), maxHp:c.maxHp,
      facing:c.facing, alive:c.alive,
      spawnScale:c.spawnScale
    })),
    orbs: GS.orbs.map(o=>({x:Math.round(o.x),y:Math.round(o.y),alive:o.alive})),
    timer:GS.timer, gameOver:GS.gameOver, started:GS.started,
    shakeX:Math.round(GS.shakeX), shakeY:Math.round(GS.shakeY),
  };
  try{ netConn.send({type:'state',gs}); }catch(e){}
}

// JOIN: HOST 상태를 완전히 반영
function applyNetState(ns){
  if(!GS||!ns)return;

  // 두 플레이어 모두 HOST 권위로 동기화
  ns.players.forEach((np,i)=>{
    const p=GS.players[i]; if(!p)return;
    const lerp = (i===1) ? 0.55 : 0.75;
    p.x+=(np.x-p.x)*lerp;
    p.y+=(np.y-p.y)*lerp;
    p.hp=np.hp; p.mp=np.mp; p.facing=np.facing;
    p.swordActive=np.swordActive; p.swordAngle=np.swordAngle;
    p.slowTimer=np.slowTimer; p.inEnemyTerritory=np.inEnemyTerritory;
    p.invasionTimer=np.invasionTimer; p.alive=np.alive;
    p.spellCDs=np.spellCDs; p.summonCDs=np.summonCDs; p.selSpell=np.selSpell;
  });

  // 투사체 - HOST 완전 권위
  GS.projectiles=ns.projectiles.map(np=>
    new Projectile(np.x,np.y,np.vx,np.vy,np.spell,np.ownerId)
  );

  // 소환수 - cid 기반으로 spawnScale 유지 (팝인 방지)
  const newCache={};
  GS.creatures=ns.creatures.filter(nc=>nc.alive).map(nc=>{
    const def=SUMMONS.find(s=>s.name===nc.defName);
    if(!def)return null;
    const prev=joinCreatureCache[nc.cid];
    const c=new Creature(nc.x,nc.y,def,nc.ownerId);
    // 위치 보간
    if(prev){ c.x=prev.x+(nc.x-prev.x)*0.65; c.y=prev.y+(nc.y-prev.y)*0.65; }
    c.hp=nc.hp; c.maxHp=nc.maxHp; c.facing=nc.facing; c.alive=true;
    // HOST가 보낸 spawnScale 사용 (1에 가까울수록 완전히 보임)
    c.spawnScale = nc.spawnScale !== undefined ? nc.spawnScale : (prev ? prev.spawnScale : 0.1);
    newCache[nc.cid]={x:c.x,y:c.y,spawnScale:c.spawnScale};
    return c;
  }).filter(Boolean);
  joinCreatureCache=newCache;

  // 마나 구슬
  GS.orbs=ns.orbs.filter(o=>o.alive).map(o=>new ManaOrb(o.x,o.y));

  // 게임 상태
  GS.timer=ns.timer; GS.gameOver=ns.gameOver;
  if(ns.shakeX){ GS.shakeX=ns.shakeX; GS.shakeY=ns.shakeY; }
  if(ns.started&&!GS.started){ GS.started=true; showOverlay('FIGHT!','#f5c842',1.2); }

  if(ns.gameOver&&!GS._resultShown){
    GS._resultShown=true;
    updateHUD();
    setTimeout(showResult,2800);
  }
}

// HOST: JOIN 즉각 액션 처리
function applyRemoteAction(data){
  if(!GS)return;
  const p2=GS.players[1];
  if(!p2||!p2.alive)return;
  switch(data.action){
    case 'spell':
      p2.selSpell=data.idx;
      p2.sdx=data.sdx||p2.facing; p2.sdy=data.sdy||0;
      const pp=p2.castSpell();
      if(pp){ GS.projectiles.push(...pp); playSFX('spell',0.4); }
      break;
    case 'summon':
      const c=p2.summonCreature(data.idx);
      if(c){
        c.cid='p2_'+Date.now()+'_'+data.idx;
        GS.creatures.push(c);
        showNotif(SUMMONS[data.idx].emoji+' '+SUMMONS[data.idx].name+' (P2)',SUMMONS[data.idx].color);
        playSFX('summon',0.5);
      }
      break;
    case 'sword':
      p2.startSword();
      playSFX('sword',0.5);
      break;
  }
}

// JOIN 키입력
const P2_MOVE  = {'i':'up','k':'down','j':'left','l':'right','I':'up','K':'down','J':'left','L':'right'};
const P2_SPELL = {'u':0,'U':0,'o':1,'O':1,'p':2,'P':2,'[':3};
const P2_SUMMON= {'1':0,'2':1,'3':2,'4':3};

document.addEventListener('keydown', e=>{
  if(!GS||!GS.started||netRole!=='join')return;
  const p2=GS.players[1]; if(!p2||!p2.alive)return;
  if(P2_MOVE[e.key]!==undefined) keys['p2_'+P2_MOVE[e.key]]=true;
  if(P2_SPELL[e.key]!==undefined){
    p2.selSpell=P2_SPELL[e.key];
    if(netConn){ try{ netConn.send({type:'action',action:'spell',idx:p2.selSpell,sdx:p2.sdx,sdy:p2.sdy}); }catch(ex){} }
  }
  if(P2_SUMMON[e.key]!==undefined){
    const idx=P2_SUMMON[e.key];
    if(netConn){ try{ netConn.send({type:'action',action:'summon',idx}); }catch(ex){} }
  }
  if(e.key==='Enter'){
    if(netConn){ try{ netConn.send({type:'action',action:'sword'}); }catch(ex){} }
    e.preventDefault();
  }
});
document.addEventListener('keyup', e=>{
  if(P2_MOVE[e.key]!==undefined) keys['p2_'+P2_MOVE[e.key]]=false;
});

function applyOnlineP2Input(){
  if(netRole!=='host'||!GS)return;
  const p2=GS.players[1];
  p2.vx=remoteP2Input.vx||0; p2.vy=remoteP2Input.vy||0;
  if(remoteP2Input.sdx!==undefined){ p2.sdx=remoteP2Input.sdx; p2.sdy=remoteP2Input.sdy; }
}

function sendJoinInput(){
  if(netRole!=='join'||!netConn||!GS)return;
  const p2=GS.players[1];
  let vx=(keys['p2_right']?1:0)-(keys['p2_left']?1:0);
  let vy=(keys['p2_down']?1:0)-(keys['p2_up']?1:0);
  const l=Math.sqrt(vx*vx+vy*vy); if(l>1){vx/=l;vy/=l;}
  p2.vx=vx; p2.vy=vy;
  if(Math.abs(vx)>.05||Math.abs(vy)>.05){ p2.sdx=vx; p2.sdy=vy; p2.facing=vx>=0?1:-1; }
  try{ netConn.send({type:'input',vx,vy,sdx:p2.sdx,sdy:p2.sdy}); }catch(e){}
}
