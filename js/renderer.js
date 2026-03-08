// ════════════════════════════════════════
//  renderer.js — 캔버스 렌더링
//
//  거울 모드:
//  JOIN은 x좌표만 아레나 기준 반전해서 렌더링
//  게임 로직/좌표는 HOST 기준 그대로 유지
// ════════════════════════════════════════

function _mx(x){
  // JOIN 시점에서 x를 아레나 기준으로 미러링
  if(netRole!=='join'||!GS) return x;
  const a=GS.arena;
  return a.x + a.w - (x - a.x);
}

function gameRender(){
  ctx.clearRect(0,0,W,H);
  if(!GS) return;
  const s=GS;

  ctx.save();
  if(s.shakeX||s.shakeY) ctx.translate(s.shakeX, s.shakeY);
  ctx.fillStyle='#05030f'; ctx.fillRect(0,0,W,H);

  drawArena(s.arena, s.players);
  s.orbs.forEach(o => _drawOrbMirror(o));
  s.particles.forEach(p => _drawParticleMirror(p));
  s.creatures.forEach(c => _drawCreatureMirror(c));
  s.players.forEach(p => _drawPlayerMirror(p));
  s.projectiles.forEach(pr => _drawProjectileMirror(pr));

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

// ── 각 오브젝트의 미러 draw 헬퍼 ─────────
// 핵심: this.x/y/facing을 미러값으로 임시 교체 → draw() 호출 → 복원
// trail은 별도로 미러링된 복사본 생성

function _drawPlayerMirror(p){
  const ox=p.x, of=p.facing;
  const rx=_mx(p.x);
  const rf=netRole==='join'?-p.facing:p.facing;

  // trail: 미러된 복사본으로 교체
  const origTrail=p.trail;
  p.trail=origTrail.map(t=>({t:t.t, x:_mx(t.x), y:t.y}));

  p.x=rx; p.facing=rf;
  p.draw(ctx);
  p.x=ox; p.facing=of;
  p.trail=origTrail;
}

function _drawCreatureMirror(c){
  const ox=c.x, of=c.facing;
  const rx=_mx(c.x);
  const rf=netRole==='join'?-c.facing:c.facing;

  const origTrail=c.trail;
  c.trail=origTrail.map(t=>({t:t.t, x:_mx(t.x), y:t.y}));

  c.x=rx; c.facing=rf;
  c.draw(ctx);
  c.x=ox; c.facing=of;
  c.trail=origTrail;
}

function _drawProjectileMirror(pr){
  const ox=pr.x;
  const origTrail=pr.trail;
  pr.trail=(origTrail||[]).map(t=>({x:_mx(t.x), y:t.y}));
  pr.x=_mx(pr.x);
  pr.draw(ctx);
  pr.x=ox;
  pr.trail=origTrail;
}

function _drawOrbMirror(o){
  const ox=o.x;
  o.x=_mx(o.x);
  o.draw(ctx);
  o.x=ox;
}

function _drawParticleMirror(p){
  const ox=p.x;
  p.x=_mx(p.x);
  p.draw(ctx);
  p.x=ox;
}

function drawArena(a, players){
  const isJoin=netRole==='join';
  const midX=a.x+a.w/2, cy=a.y+a.h/2;

  // 배경: JOIN이면 좌우 색상 교체 (내 진영이 항상 왼쪽에 보이도록)
  const L=isJoin?['#0f0703','#130500']:['#03090f','#060d14'];
  const R=isJoin?['#03090f','#060d14']:['#0f0703','#130500'];
  const lg=ctx.createLinearGradient(a.x,a.y,midX,a.y);
  lg.addColorStop(0,L[0]); lg.addColorStop(1,L[1]);
  ctx.fillStyle=lg; ctx.fillRect(a.x,a.y,a.w/2,a.h);
  const rg=ctx.createLinearGradient(midX,a.y,a.x+a.w,a.y);
  rg.addColorStop(0,R[0]); rg.addColorStop(1,R[1]);
  ctx.fillStyle=rg; ctx.fillRect(midX,a.y,a.w/2,a.h);

  // 침범 틴트 — 시각적으로 맞는 쪽에
  const [p1,p2]=players;
  // HOST: p1이 왼쪽, p2가 오른쪽
  // JOIN: p2가 왼쪽(내가 왼쪽), p1이 오른쪽
  const leftP =isJoin?p2:p1, rightP=isJoin?p1:p2;
  // leftP가 적 진영(오른쪽)을 침범 중
  if(leftP.alive&&leftP.inEnemyTerritory){
    const urg=Math.min(1,leftP.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.13})`; ctx.fillRect(midX,a.y,a.w/2,a.h);
  }
  if(rightP.alive&&rightP.inEnemyTerritory){
    const urg=Math.min(1,rightP.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.13})`; ctx.fillRect(a.x,a.y,a.w/2,a.h);
  }

  // 그리드
  ctx.save(); ctx.strokeStyle='rgba(168,85,247,0.055)'; ctx.lineWidth=1;
  const gs=60;
  for(let x=a.x;x<=a.x+a.w;x+=gs){ctx.beginPath();ctx.moveTo(x,a.y);ctx.lineTo(x,a.y+a.h);ctx.stroke();}
  for(let y=a.y;y<=a.y+a.h;y+=gs){ctx.beginPath();ctx.moveTo(a.x,y);ctx.lineTo(a.x+a.w,y);ctx.stroke();}
  ctx.restore();

  // 룬 — JOIN이면 내 진영 룬이 왼쪽에 오도록
  const myRuneX =isJoin?a.x+a.w*3/4:a.x+a.w/4;
  const oppRuneX=isJoin?a.x+a.w/4:a.x+a.w*3/4;
  drawRune(ctx,myRuneX, cy,65,'#4af0ff',0.09);
  drawRune(ctx,oppRuneX,cy,65,'#ff6b35',0.09);

  ctx.font="bold 11px 'Cinzel',serif"; ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle='rgba(74,240,255,.15)'; ctx.fillText('MY TERRITORY',   myRuneX, a.y+8);
  ctx.fillStyle='rgba(255,107,53,.15)'; ctx.fillText(isJoin?'ENEMY TERRITORY':(netRole?'ENEMY TERRITORY':'AI TERRITORY'), oppRuneX, a.y+8);

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
