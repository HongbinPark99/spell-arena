// ════════════════════════════════════════
//  network.js — 온라인 멀티플레이어
//  WebRTC via PeerJS (서버리스 P2P)
//
//  흐름:
//  HOST → initHostPeer() → 6자리 코드 생성
//       → 상대 접속 시 startOnlineGame('host')
//       → 매 프레임 netSyncState() 로 상태 전송
//
//  JOIN → joinGame() → HOST 코드 입력
//       → handleNetData 에서 'start' 수신 시 startOnlineGame('join')
//       → 매 프레임 sendJoinInput() 로 입력 전송
//       → applyNetState() 로 서버 상태 반영
//
//  조작키:
//  P1(HOST): 방향키 이동 · Q W E R 스펠 · A S D F 소환 · Space 검
//  P2(JOIN): I J K L 이동 · U O P [ 스펠 · 1 2 3 4 소환 · Enter 검
// ════════════════════════════════════════

// ══════════════════════════════════════════════
//  🌐 ONLINE MULTIPLAYER — WebRTC via PeerJS
//  ● HOST: 방 만들기 → 6자리 코드 공유
//  ● JOIN: 코드 입력 → 접속
//  ● 30fps 입력 동기화 (각 플레이어가 자신의 입력 전송)
//  ● HOST가 권위적 게임 상태 관리 (authoritative host)
// ══════════════════════════════════════════════
let peer = null;          // PeerJS 인스턴스
let netConn = null;       // 연결된 DataChannel
let netRole = null;       // 'host' | 'join'
let netReady = false;     // 연결 완료 여부
let netSyncTimer = 0;     // 동기화 타이머
const NET_HZ = 30;        // 동기화 주파수

// P2 (조인어) 입력 상태 — HOST에서 수신해 반영
let remoteP2Input = { vx:0, vy:0, sdx:1, sdy:0, actions:[] };

function randCode(){ return Math.random().toString(36).substring(2,8).toUpperCase(); }

function showOnlineScreen(){
  showScreen('online-screen');
  initHostPeer();
}

function leaveOnline(){
  if(peer){ peer.destroy(); peer=null; }
  netConn=null; netRole=null; netReady=false;
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

  peer.on('open', id=>{
    document.getElementById('host-code').textContent=code;
    document.getElementById('host-status').textContent='상대방 접속 대기 중...';
    document.getElementById('host-status').className='lobby-status wait';
  });

  peer.on('connection', conn=>{
    netConn=conn; netRole='host';
    conn.on('open',()=>{
      document.getElementById('host-status').textContent='✅ 연결됨! 게임 시작 중...';
      document.getElementById('host-status').className='lobby-status ok';
      netReady=true;
      setTimeout(()=>startOnlineGame('host'),1000);
    });
    conn.on('data', handleNetData);
    conn.on('close',()=>{ showNotif('상대방 연결 끊김','#ff4444'); netReady=false; });
    conn.on('error', e=>console.error('conn err',e));
  });

  peer.on('error', e=>{
    document.getElementById('host-status').textContent='⚠ 오류: '+e.type;
    document.getElementById('host-status').className='lobby-status err';
    setTimeout(initHostPeer, 3000); // 재시도
  });
}

function joinGame(){
  const raw=document.getElementById('join-input').value.trim().toUpperCase();
  if(raw.length<4){ document.getElementById('join-status').textContent='코드를 입력하세요'; document.getElementById('join-status').className='lobby-status err'; return; }
  const peerId='spella-'+raw;
  document.getElementById('join-status').textContent='연결 중...';
  document.getElementById('join-status').className='lobby-status wait';

  if(peer){ peer.destroy(); }
  peer=new Peer(undefined, {
    host:'0.peerjs.com', port:443, secure:true,
    config:{ iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}] }
  });

  peer.on('open', ()=>{
    const conn=peer.connect(peerId, {reliable:false, serialization:'json'});
    netConn=conn; netRole='join';
    conn.on('open',()=>{
      document.getElementById('join-status').textContent='✅ 연결됨! 게임 시작 중...';
      document.getElementById('join-status').className='lobby-status ok';
      netReady=true;
    });
    conn.on('data', handleNetData);
    conn.on('close',()=>{ showNotif('상대방 연결 끊김','#ff4444'); netReady=false; });
    conn.on('error', e=>{ document.getElementById('join-status').textContent='⚠ 연결 실패: '+e.type; document.getElementById('join-status').className='lobby-status err'; });
  });

  peer.on('error', e=>{ document.getElementById('join-status').textContent='⚠ '+e.type; document.getElementById('join-status').className='lobby-status err'; });
}

// ── 네트워크 메시지 처리 ──────────────────────
function handleNetData(data){
  if(!data||!data.type)return;
  switch(data.type){
    case 'start':
      // JOIN이 start 수신 → 게임 시작
      if(netRole==='join') startOnlineGame('join');
      break;
    case 'input':
      // HOST가 JOIN의 입력 수신
      if(netRole==='host') remoteP2Input=data;
      break;
    case 'state':
      // JOIN이 HOST의 게임 상태 수신 → 렌더링에 반영
      if(netRole==='join') applyNetState(data.gs);
      break;
    case 'action':
      // HOST가 JOIN의 즉각 액션 수신 (스펠, 소환, 검)
      if(netRole==='host') applyRemoteAction(data);
      break;
  }
}

function startOnlineGame(role){
  difficulty='normal';
  scores=[0,0]; roundNum=1; totalStats={kills:0,spells:0,summons:0};

  // P2 HUD 이름 변경
  document.getElementById('p2-name-span').textContent = '⚡ PLAYER 2';

  GS=createGS();
  // 온라인에서는 P2도 isAI=false
  GS.players[1].isAI=false;

  showScreen('game-screen'); resetGameHUD();
  paused=false; lastTime=performance.now();

  // HOST→JOIN 게임 시작 신호
  if(role==='host' && netConn){ netConn.send({type:'start'}); }

  rafId=requestAnimationFrame(tick);
}

// ── HOST: 게임 상태를 JOIN에게 전송 ──────────────
function netSyncState(){
  if(netRole!=='host'||!netConn||!GS)return;
  // 경량화된 상태 스냅샷
  const gs={
    players: GS.players.map(p=>({id:p.id,x:Math.round(p.x),y:Math.round(p.y),hp:Math.round(p.hp),mp:Math.round(p.mp),facing:p.facing,swordActive:p.swordActive,swordAngle:p.swordAngle,slowTimer:p.slowTimer,inEnemyTerritory:p.inEnemyTerritory,invasionTimer:p.invasionTimer,alive:p.alive,spellCDs:p.spellCDs.map(v=>Math.round(v)),summonCDs:p.summonCDs.map(v=>Math.round(v)),selSpell:p.selSpell})),
    projectiles: GS.projectiles.map(pr=>({x:Math.round(pr.x),y:Math.round(pr.y),vx:pr.vx,vy:pr.vy,spell:{name:pr.spell.name,color:pr.spell.color,dmg:pr.spell.dmg,speed:pr.spell.speed,radius:pr.spell.radius,pierce:!!pr.spell.pierce,slow:!!pr.spell.slow},ownerId:pr.ownerId})),
    creatures: GS.creatures.map(c=>({x:Math.round(c.x),y:Math.round(c.y),defName:c.def.name,ownerId:c.ownerId,hp:Math.round(c.hp),maxHp:c.maxHp,facing:c.facing,alive:c.alive})),
    orbs: GS.orbs.map(o=>({x:Math.round(o.x),y:Math.round(o.y),alive:o.alive})),
    timer: GS.timer, gameOver: GS.gameOver, started: GS.started,
  };
  try{ netConn.send({type:'state',gs}); }catch(e){}
}

// ── JOIN: 수신한 상태를 GS에 반영 ────────────────
function applyNetState(ns){
  if(!GS||!ns)return;
  // Players
  ns.players.forEach((np,i)=>{
    const p=GS.players[i]; if(!p)return;
    // JOIN 자신(p2, idx1)의 위치는 로컬 입력 우선 (부드러운 이동을 위해 보간)
    if(i===1){
      p.x+=(np.x-p.x)*.4; p.y+=(np.y-p.y)*.4; // 부드러운 보간
    } else {
      p.x+=(np.x-p.x)*.6; p.y+=(np.y-p.y)*.6;
    }
    p.hp=np.hp; p.mp=np.mp; p.facing=np.facing;
    p.swordActive=np.swordActive; p.swordAngle=np.swordAngle;
    p.slowTimer=np.slowTimer; p.inEnemyTerritory=np.inEnemyTerritory;
    p.invasionTimer=np.invasionTimer; p.alive=np.alive;
    p.spellCDs=np.spellCDs; p.summonCDs=np.summonCDs; p.selSpell=np.selSpell;
  });
  // Projectiles — HOST 권위
  GS.projectiles=ns.projectiles.map(np=>{
    const pr=new Projectile(np.x,np.y,np.vx,np.vy,np.spell,np.ownerId);
    return pr;
  });
  // Creatures
  GS.creatures=ns.creatures.map(nc=>{
    const def=SUMMONS.find(s=>s.name===nc.defName);
    if(!def)return null;
    const c=new Creature(nc.x,nc.y,def,nc.ownerId);
    c.hp=nc.hp; c.maxHp=nc.maxHp; c.facing=nc.facing; c.alive=nc.alive;
    return c;
  }).filter(Boolean);
  // Orbs
  GS.orbs=ns.orbs.filter(o=>o.alive).map(o=>new ManaOrb(o.x,o.y));
  GS.timer=ns.timer; GS.gameOver=ns.gameOver;
  if(ns.started&&!GS.started){ GS.started=true; showOverlay('FIGHT!','#f5c842',1.2); }
}

// ── HOST: JOIN의 즉각 액션 처리 ──────────────────
function applyRemoteAction(data){
  if(!GS)return;
  const p2=GS.players[1];
  if(!p2||!p2.alive)return;
  switch(data.action){
    case 'spell':
      p2.selSpell=data.idx;
      p2.sdx=data.sdx||p2.facing; p2.sdy=data.sdy||0;
      const pp=p2.castSpell(); if(pp) GS.projectiles.push(...pp);
      break;
    case 'summon':
      const c=p2.summonCreature(data.idx);
      if(c){ GS.creatures.push(c); showNotif(`${SUMMONS[data.idx].emoji} ${SUMMONS[data.idx].name} (P2)`,SUMMONS[data.idx].color); }
      break;
    case 'sword':
      p2.startSword();
      break;
  }
}

// ── 온라인 키 입력 (JOIN = P2) ────────────────────
// P2 조작: IJKL 이동 · U O P [ 스펠 · 1 2 3 4 소환 · Enter 검
const P2_MOVE = {'i':'up','k':'down','j':'left','l':'right','I':'up','K':'down','J':'left','L':'right'};
const P2_SPELL = {'u':0,'U':0,'o':1,'O':1,'p':2,'P':2,'[':3};
const P2_SUMMON = {'1':0,'2':1,'3':2,'4':3};

document.addEventListener('keydown', e=>{
  if(!GS||!GS.started||netRole!=='join')return;
  const p2=GS.players[1]; if(!p2||!p2.alive)return;

  if(P2_MOVE[e.key]!==undefined){
    keys['p2_'+P2_MOVE[e.key]]=true;
  }
  if(P2_SPELL[e.key]!==undefined){
    p2.selSpell=P2_SPELL[e.key];
    // JOIN: 스펠 액션을 HOST에 전송
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

// ── gameUpdate 내 온라인 P2 입력 처리 (HOST) ─────
// HOST에서 매 프레임 remoteP2Input으로 P2 vx/vy 설정
function applyOnlineP2Input(){
  if(netRole!=='host'||!GS)return;
  const p2=GS.players[1];
  p2.vx=remoteP2Input.vx||0; p2.vy=remoteP2Input.vy||0;
  if(remoteP2Input.sdx!==undefined){ p2.sdx=remoteP2Input.sdx; p2.sdy=remoteP2Input.sdy; }
}

// ── JOIN 자신의 입력을 HOST에 전송 ───────────────
function sendJoinInput(){
  if(netRole!=='join'||!netConn||!GS)return;
  const p2=GS.players[1];
  let vx=(keys['p2_right']?1:0)-(keys['p2_left']?1:0);
  let vy=(keys['p2_down']?1:0)-(keys['p2_up']?1:0);
  const l=Math.sqrt(vx*vx+vy*vy); if(l>1){vx/=l;vy/=l;}
  p2.vx=vx; p2.vy=vy;
  // 이동 방향 업데이트
  if(Math.abs(vx)>.05||Math.abs(vy)>.05){ p2.sdx=vx; p2.sdy=vy; p2.facing=vx>=0?1:-1; }
  try{ netConn.send({type:'input',vx,vy,sdx:p2.sdx,sdy:p2.sdy}); }catch(e){}
}

