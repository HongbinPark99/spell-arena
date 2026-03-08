// ════════════════════════════════════════
//  renderer.js — 캔버스 렌더링
//
//  핵심: JOIN 시점에서 화면을 좌우 반전
//  → JOIN은 항상 왼쪽(P2가 '나'), HOST는 오른쪽
//  → ctx.scale(-1,1) + translate 로 미러링
// ════════════════════════════════════════

function gameRender(){
  ctx.clearRect(0,0,W,H);
  if(!GS)return;
  const s=GS;

  ctx.save();
  if(s.shakeX||s.shakeY) ctx.translate(s.shakeX,s.shakeY);
  ctx.fillStyle='#05030f'; ctx.fillRect(0,0,W,H);

  // JOIN 시점: 화면 좌우 반전 (내가 항상 왼쪽에 보이도록)
  const isJoin = netRole==='join';
  if(isJoin){
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }

  drawArena(s.arena, s.players, isJoin);
  s.orbs.forEach(o=>o.draw(ctx));
  s.particles.forEach(p=>p.draw(ctx));
  s.creatures.forEach(c=>c.draw(ctx));
  s.players.forEach(p=>p.draw(ctx));
  s.projectiles.forEach(pr=>pr.draw(ctx));

  if(isJoin) ctx.restore();

  // 카운트다운 오버레이 (반전 없이)
  if(!s.started){
    const t=Math.ceil(s.startTimer);
    ctx.save();
    ctx.font=`bold ${130-(s.startTimer%1)*45}px 'Cinzel Decorative',serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle=`rgba(245,200,66,${s.startTimer%1})`; ctx.shadowBlur=60; ctx.shadowColor='#f5c842';
    ctx.fillText(t>0?t:'GO!',W/2,H/2);
    ctx.restore();
  }

  ctx.restore();
}

// drawArena에 isJoin 전달 → 영역 라벨 반전
function drawArena(a, players, isJoin){
  const midX=a.x+a.w/2, cy=a.y+a.h/2;

  // 배경 — HOST 시점 기준
  // 왼쪽=P1(파랑), 오른쪽=P2(불)
  // JOIN 시점: 화면 미러되므로 시각상 왼=내 진영(파랑→JOIN이 파랑 계열로 보임)
  const lg=ctx.createLinearGradient(a.x,a.y,midX,a.y);
  lg.addColorStop(0,'#03090f'); lg.addColorStop(1,'#060d14');
  ctx.fillStyle=lg; ctx.fillRect(a.x,a.y,a.w/2,a.h);
  const rg=ctx.createLinearGradient(midX,a.y,a.x+a.w,a.y);
  rg.addColorStop(0,'#0f0703'); rg.addColorStop(1,'#130500');
  ctx.fillStyle=rg; ctx.fillRect(midX,a.y,a.w/2,a.h);

  // 침범 틴트
  const [p1,p2]=players;
  if(p1.alive&&p1.inEnemyTerritory){
    const urg=Math.min(1,p1.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.13})`; ctx.fillRect(midX,a.y,a.w/2,a.h);
  }
  if(p2.alive&&p2.inEnemyTerritory){
    const urg=Math.min(1,p2.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.13})`; ctx.fillRect(a.x,a.y,a.w/2,a.h);
  }

  // 그리드
  ctx.save(); ctx.strokeStyle='rgba(168,85,247,0.055)'; ctx.lineWidth=1;
  const gs=60;
  for(let x=a.x;x<=a.x+a.w;x+=gs){ctx.beginPath();ctx.moveTo(x,a.y);ctx.lineTo(x,a.y+a.h);ctx.stroke();}
  for(let y=a.y;y<=a.y+a.h;y+=gs){ctx.beginPath();ctx.moveTo(a.x,y);ctx.lineTo(a.x+a.w,y);ctx.stroke();}
  ctx.restore();

  // 룬
  drawRune(ctx,a.x+a.w/4,cy,65,'#4af0ff',0.09);
  drawRune(ctx,a.x+a.w*3/4,cy,65,'#ff6b35',0.09);

  // 영역 라벨 — JOIN일 때 텍스트도 다시 뒤집어야 읽힘
  ctx.save();
  if(isJoin){
    // 텍스트는 이미 미러된 좌표계에 있으므로 다시 반전
    ctx.font="bold 11px 'Cinzel',serif"; ctx.textBaseline='top';

    // 왼쪽 라벨 (JOIN에게는 '내 진영')
    const lx=a.x+a.w/4;
    ctx.save(); ctx.translate(lx, a.y+8); ctx.scale(-1,1);
    ctx.textAlign='center'; ctx.fillStyle='rgba(255,107,53,.2)'; ctx.fillText('MY TERRITORY',0,0);
    ctx.restore();

    // 오른쪽 라벨 (JOIN에게는 '상대 진영')
    const rx=a.x+a.w*3/4;
    ctx.save(); ctx.translate(rx, a.y+8); ctx.scale(-1,1);
    ctx.textAlign='center'; ctx.fillStyle='rgba(74,240,255,.15)'; ctx.fillText('ENEMY TERRITORY',0,0);
    ctx.restore();
  } else {
    ctx.font="bold 11px 'Cinzel',serif"; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillStyle='rgba(74,240,255,.15)'; ctx.fillText('PLAYER TERRITORY',a.x+a.w/4,a.y+8);
    ctx.fillStyle='rgba(255,107,53,.15)'; ctx.fillText(netRole?'ENEMY TERRITORY':'AI TERRITORY',a.x+a.w*3/4,a.y+8);
  }
  ctx.restore();

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
