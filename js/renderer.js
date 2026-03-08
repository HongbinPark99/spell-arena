// ════════════════════════════════════════
//  renderer.js — 캔버스 렌더링
//
//  거울 모드 구현 방식:
//  - 화면 전체 미러링(scale -1) 방식 X
//  - 렌더링 시 x좌표만 변환: mirrorX(x)
//    → arena 기준으로 좌우 반전된 위치에 그림
//  - 게임 로직/좌표는 HOST 기준 그대로 유지
//  - JOIN 시점에서만 시각적으로 반전
// ════════════════════════════════════════

// JOIN 시점에서 x좌표를 아레나 기준으로 미러링
function mirrorX(x, arena){
  return arena.x + arena.w - (x - arena.x);
}

// 현재 렌더링이 JOIN 시점이면 x를 변환
function mx(x){
  if(netRole !== 'join' || !GS) return x;
  return mirrorX(x, GS.arena);
}

// facing도 반전 (JOIN 시점)
function mf(facing){
  return netRole === 'join' ? -facing : facing;
}

function gameRender(){
  ctx.clearRect(0,0,W,H);
  if(!GS) return;
  const s=GS;

  ctx.save();
  if(s.shakeX||s.shakeY) ctx.translate(s.shakeX, s.shakeY);
  ctx.fillStyle='#05030f'; ctx.fillRect(0,0,W,H);

  drawArena(s.arena, s.players);
  s.orbs.forEach(o => o.drawMirror(ctx, mx(o.x), o.y));
  s.particles.forEach(p => p.drawMirror(ctx, mx(p.x), p.y));
  s.creatures.forEach(c => c.drawMirror(ctx, mx(c.x), c.y, mf(c.facing)));
  s.players.forEach(p => p.drawMirror(ctx, mx(p.x), p.y, mf(p.facing), p.swordAngle !== undefined ? (netRole==='join' ? Math.PI - p.swordAngle : p.swordAngle) : 0));
  s.projectiles.forEach(pr => pr.drawMirror(ctx, mx(pr.x), pr.y));

  if(!s.started){
    const t=Math.ceil(s.startTimer);
    ctx.save();
    ctx.font=`bold ${130-(s.startTimer%1)*45}px 'Cinzel Decorative',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=`rgba(245,200,66,${s.startTimer%1})`; ctx.shadowBlur=60; ctx.shadowColor='#f5c842';
    ctx.fillText(t>0?t:'GO!', W/2, H/2);
    ctx.restore();
  }

  ctx.restore();
}

function drawArena(a, players){
  const isJoin = netRole === 'join';
  // JOIN이면 왼/오른쪽이 시각적으로 반전됨
  // midX는 동일, 배경색만 좌우 교체
  const midX = a.x + a.w/2, cy = a.y + a.h/2;

  // 배경
  // HOST: 왼=P1(파랑), 오른=P2(불)
  // JOIN: 왼=P2(불→내진영=파랑으로 표시), 오른=P1(적진영=불로 표시)
  const myLeft  = isJoin ? {c0:'#0f0703',c1:'#060d14'} : {c0:'#03090f',c1:'#060d14'};
  const myRight = isJoin ? {c0:'#03090f',c1:'#060d14'} : {c0:'#0f0703',c1:'#130500'};

  const lg=ctx.createLinearGradient(a.x,a.y,midX,a.y);
  lg.addColorStop(0,myLeft.c0); lg.addColorStop(1,myLeft.c1);
  ctx.fillStyle=lg; ctx.fillRect(a.x,a.y,a.w/2,a.h);

  const rg=ctx.createLinearGradient(midX,a.y,a.x+a.w,a.y);
  rg.addColorStop(0,myRight.c0); rg.addColorStop(1,myRight.c1);
  ctx.fillStyle=rg; ctx.fillRect(midX,a.y,a.w/2,a.h);

  // 침범 틴트 — JOIN이면 좌우 교체
  const [p1,p2] = players;
  const myP  = isJoin ? p2 : p1; // 화면 왼쪽 플레이어
  const oppP = isJoin ? p1 : p2; // 화면 오른쪽 플레이어
  if(myP.alive && myP.inEnemyTerritory){
    const urg=Math.min(1,myP.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.13})`; ctx.fillRect(midX,a.y,a.w/2,a.h);
  }
  if(oppP.alive && oppP.inEnemyTerritory){
    const urg=Math.min(1,oppP.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.13})`; ctx.fillRect(a.x,a.y,a.w/2,a.h);
  }

  // 그리드
  ctx.save(); ctx.strokeStyle='rgba(168,85,247,0.055)'; ctx.lineWidth=1;
  const gs=60;
  for(let x=a.x;x<=a.x+a.w;x+=gs){ctx.beginPath();ctx.moveTo(x,a.y);ctx.lineTo(x,a.y+a.h);ctx.stroke();}
  for(let y=a.y;y<=a.y+a.h;y+=gs){ctx.beginPath();ctx.moveTo(a.x,y);ctx.lineTo(a.x+a.w,y);ctx.stroke();}
  ctx.restore();

  // 룬 — JOIN이면 룬 위치도 반전
  const runeL = isJoin ? a.x+a.w*3/4 : a.x+a.w/4;
  const runeR = isJoin ? a.x+a.w/4   : a.x+a.w*3/4;
  drawRune(ctx, runeL, cy, 65, '#4af0ff', 0.09); // 내 진영 룬 (항상 왼쪽)
  drawRune(ctx, runeR, cy, 65, '#ff6b35', 0.09); // 적 진영 룬 (항상 오른쪽)

  // 영역 라벨
  ctx.font="bold 11px 'Cinzel',serif"; ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle='rgba(74,240,255,.15)';
  ctx.fillText('MY TERRITORY', runeL, a.y+8);
  ctx.fillStyle='rgba(255,107,53,.15)';
  ctx.fillText(isJoin ? 'ENEMY TERRITORY' : (netRole ? 'ENEMY TERRITORY' : 'AI TERRITORY'), runeR, a.y+8);

  // 중앙 분리선
  ctx.save(); ctx.shadowBlur=22; ctx.shadowColor='#a855f766';
  ctx.beginPath(); ctx.moveTo(midX,a.y); ctx.lineTo(midX,a.y+a.h);
  ctx.strokeStyle='rgba(168,85,247,.55)'; ctx.lineWidth=2; ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.lineWidth=1; ctx.setLineDash([10,8]);
  ctx.beginPath(); ctx.moveTo(midX,a.y); ctx.lineTo(midX,a.y+a.h); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();

  // 중앙 오브
  ctx.save(); ctx.shadowBlur=28; ctx.shadowColor='#a855f7';
  const pulse=Math.sin(Date.now()*.003)*.4+.6;
  const og=ctx.createRadialGradient(midX,cy,0,midX,cy,20*pulse);
  og.addColorStop(0,'rgba(255,255,255,.95)'); og.addColorStop(.5,'rgba(168,85,247,.7)'); og.addColorStop(1,'rgba(168,85,247,0)');
  ctx.beginPath(); ctx.arc(midX,cy,20*pulse,0,Math.PI*2); ctx.fillStyle=og; ctx.fill(); ctx.restore();

  // 테두리
  ctx.save(); ctx.shadowBlur=30; ctx.shadowColor='#a855f7';
  ctx.strokeStyle='rgba(168,85,247,.55)'; ctx.lineWidth=2; ctx.strokeRect(a.x,a.y,a.w,a.h);
  const cl=20;
  [[a.x,a.y,1,1],[a.x+a.w,a.y,-1,1],[a.x,a.y+a.h,1,-1],[a.x+a.w,a.y+a.h,-1,-1]].forEach(([x,y,sx,sy])=>{
    ctx.beginPath(); ctx.moveTo(x+sx*cl,y); ctx.lineTo(x,y); ctx.lineTo(x,y+sy*cl);
    ctx.strokeStyle='#4af0ff'; ctx.lineWidth=3; ctx.stroke();
  }); ctx.restore();
}

function drawRune(ctx,cx,cy,r,col,alpha){
  ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle=col; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,r*.58,0,Math.PI*2); ctx.stroke();
  for(let i=0;i<6;i++){ const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); ctx.stroke(); }
  ctx.restore();
}

// ─── FX ──────────────────────────────────
function spawnHitFX(x,y,col){
  if(!document.getElementById('particles-toggle').classList.contains('on'))return;
  for(let i=0;i<8;i++){const a=Math.random()*Math.PI*2,v=2+Math.random()*3.5;GS.particles.push(new Particle(x,y,col,Math.cos(a)*v,Math.sin(a)*v-2,3+Math.random()*3,.3+Math.random()*.4));}
}
function spawnDeathFX(x,y,col){for(let i=0;i<20;i++){const a=Math.random()*Math.PI*2,v=3+Math.random()*5;GS.particles.push(new Particle(x,y,col,Math.cos(a)*v,Math.sin(a)*v-3,4+Math.random()*6,.5+Math.random()*.9));}}
function spawnOrbFX(x,y){for(let i=0;i<10;i++){const a=Math.random()*Math.PI*2;GS.particles.push(new Particle(x,y,'#a855f7',Math.cos(a)*2.5,Math.sin(a)*2.5-1,3,.5));}}
function shakeScreen(i){if(!document.getElementById('shake-toggle').classList.contains('on'))return;if(GS)GS.shakeT=Math.max(GS.shakeT,i*.5);}

let _ovT;
function showOverlay(txt,col,dur=1.5){
  const el=document.getElementById('overlay-msg'),t=document.getElementById('overlay-txt');
  t.textContent=txt; t.style.color=col; el.classList.add('show');
  clearTimeout(_ovT); _ovT=setTimeout(()=>el.classList.remove('show'),dur*1000);
}
function showNotif(txt,col='#f5c842'){
  const area=document.getElementById('notif-area'),n=document.createElement('div');
  n.className='notif'; n.textContent=txt; n.style.borderColor=col; n.style.color=col;
  area.appendChild(n); setTimeout(()=>n.remove(),2000);
}
