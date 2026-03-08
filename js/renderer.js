// renderer.js — 고퀄 판타지 아레나 렌더링

function gameRender(){
  ctx.clearRect(0,0,W,H);
  if(!GS) return;
  const s=GS;
  ctx.save();
  if(s.shakeX||s.shakeY) ctx.translate(s.shakeX, s.shakeY);

  drawArena(s.arena, s.players);
  s.orbs.forEach(o=>o.draw(ctx));
  s.particles.forEach(p=>p.draw(ctx));
  s.creatures.forEach(c=>c.draw(ctx));
  s.players.forEach(p=>p.draw(ctx));
  s.projectiles.forEach(pr=>pr.draw(ctx));

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

function drawArena(a, players){
  const midX=a.x+a.w/2, cy=a.y+a.h/2;
  const T=Date.now()*.001;

  // ── 배경: 판타지 대지 ──────────────────────
  // 전체 바닥 어두운 용암 + 바위
  const base=ctx.createLinearGradient(a.x,a.y,a.x+a.w,a.y+a.h);
  base.addColorStop(0,'#0d0508'); base.addColorStop(.5,'#180c08'); base.addColorStop(1,'#08060d');
  ctx.fillStyle=base; ctx.fillRect(a.x,a.y,a.w,a.h);

  // P1 진영 (왼쪽 — 차가운 마법 돌바닥)
  const lg=ctx.createRadialGradient(a.x+a.w*.18,cy,0,a.x+a.w*.18,cy,a.w*.42);
  lg.addColorStop(0,'#0a1520'); lg.addColorStop(.5,'#06101a'); lg.addColorStop(1,'#040a10');
  ctx.fillStyle=lg; ctx.fillRect(a.x,a.y,a.w/2,a.h);

  // P2 진영 (오른쪽 — 불꽃 용암 바위)
  const rg=ctx.createRadialGradient(a.x+a.w*.82,cy,0,a.x+a.w*.82,cy,a.w*.42);
  rg.addColorStop(0,'#1a0805'); rg.addColorStop(.5,'#130604'); rg.addColorStop(1,'#0a0408');
  ctx.fillStyle=rg; ctx.fillRect(midX,a.y,a.w/2,a.h);

  // 바닥 돌 패턴 (원형 균열)
  ctx.save();
  ctx.strokeStyle='rgba(80,50,30,.22)'; ctx.lineWidth=1.5;
  for(let r=40;r<Math.max(a.w,a.h)*.6;r+=55){
    ctx.beginPath(); ctx.arc(midX,cy,r,0,Math.PI*2); ctx.stroke();
  }
  // 바닥 타일 금
  ctx.strokeStyle='rgba(60,40,20,.18)'; ctx.lineWidth=1;
  for(let x=a.x;x<a.x+a.w;x+=52){
    ctx.beginPath(); ctx.moveTo(x,a.y); ctx.lineTo(x,a.y+a.h); ctx.stroke();
  }
  for(let y=a.y;y<a.y+a.h;y+=52){
    ctx.beginPath(); ctx.moveTo(a.x,y); ctx.lineTo(a.x+a.w,y); ctx.stroke();
  }
  ctx.restore();

  // 중앙 원형 전투 구역 (빛나는 룬 바닥)
  const cr=Math.min(a.w,a.h)*.34;
  const cg=ctx.createRadialGradient(midX,cy,0,midX,cy,cr);
  cg.addColorStop(0,'rgba(120,60,180,.12)'); cg.addColorStop(.6,'rgba(80,30,120,.06)'); cg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(midX,cy,cr,0,Math.PI*2); ctx.fillStyle=cg; ctx.fill();

  // 중앙 대형 룬 원 (선명)
  ctx.save();
  ctx.strokeStyle='rgba(140,70,220,.45)'; ctx.lineWidth=2.5;
  ctx.shadowBlur=12; ctx.shadowColor='rgba(140,70,220,.6)';
  ctx.beginPath(); ctx.arc(midX,cy,cr,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(midX,cy,cr*.62,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(midX,cy,cr*.28,0,Math.PI*2); ctx.stroke();
  ctx.shadowBlur=0;

  // 룬 방사선
  ctx.strokeStyle='rgba(140,70,220,.3)'; ctx.lineWidth=1.5;
  for(let i=0;i<12;i++){
    const a2=i*Math.PI/6;
    ctx.beginPath();
    ctx.moveTo(midX+Math.cos(a2)*cr*.28,cy+Math.sin(a2)*cr*.28);
    ctx.lineTo(midX+Math.cos(a2)*cr,cy+Math.sin(a2)*cr);
    ctx.stroke();
  }
  ctx.restore();

  // 각 진영 룬 심볼
  drawArenaRune(ctx,a.x+a.w*.22,cy,cr*.38,'#4af0ff',0.35, T*.15);
  drawArenaRune(ctx,a.x+a.w*.78,cy,cr*.38,'#ff6b35',0.35,-T*.15);

  // 불꽃 토템 (4코너)
  drawTotem(ctx, a.x+a.w*.08, a.y+a.h*.12, R_SMALL(a), '#4af0ff', T);
  drawTotem(ctx, a.x+a.w*.08, a.y+a.h*.88, R_SMALL(a), '#4af0ff', T+1);
  drawTotem(ctx, a.x+a.w*.92, a.y+a.h*.12, R_SMALL(a), '#ff6b35', T+2);
  drawTotem(ctx, a.x+a.w*.92, a.y+a.h*.88, R_SMALL(a), '#ff6b35', T+3);

  // 침범 틴트
  const [p1,p2]=players;
  if(p1.alive&&p1.inEnemyTerritory){
    const urg=Math.min(1,p1.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.14})`; ctx.fillRect(midX,a.y,a.w/2,a.h);
  }
  if(p2.alive&&p2.inEnemyTerritory){
    const urg=Math.min(1,p2.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.14})`; ctx.fillRect(a.x,a.y,a.w/2,a.h);
  }

  // 중앙 분리선 (마법 균열)
  ctx.save();
  // 균열 빛 기둥
  const clig=ctx.createLinearGradient(midX-18,a.y,midX+18,a.y);
  clig.addColorStop(0,'rgba(168,85,247,0)'); clig.addColorStop(.5,'rgba(168,85,247,.22)'); clig.addColorStop(1,'rgba(168,85,247,0)');
  ctx.fillStyle=clig; ctx.fillRect(midX-18,a.y,36,a.h);

  ctx.shadowBlur=28; ctx.shadowColor='#a855f7cc';
  ctx.strokeStyle='rgba(200,120,255,.9)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(midX,a.y); ctx.lineTo(midX,a.y+a.h); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.15)'; ctx.lineWidth=1; ctx.setLineDash([14,10]);
  ctx.beginPath(); ctx.moveTo(midX,a.y); ctx.lineTo(midX,a.y+a.h); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();

  // 중앙 구슬 (맥동)
  ctx.save();
  const pulse=Math.sin(T*2.2)*.38+.62;
  const plr=16*pulse;
  ctx.shadowBlur=38; ctx.shadowColor='#c084fc';
  const og=ctx.createRadialGradient(midX,cy,0,midX,cy,plr*1.6);
  og.addColorStop(0,'rgba(255,255,255,.95)'); og.addColorStop(.35,'rgba(200,130,255,.85)'); og.addColorStop(.8,'rgba(168,85,247,.5)'); og.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(midX,cy,plr*1.6,0,Math.PI*2); ctx.fillStyle=og; ctx.fill();
  ctx.restore();

  // 아레나 테두리 (각진 석재 프레임)
  ctx.save();
  // 테두리 안쪽 글로우
  ctx.shadowBlur=20; ctx.shadowColor='#a855f7';
  ctx.strokeStyle='rgba(168,85,247,.6)'; ctx.lineWidth=3; ctx.strokeRect(a.x,a.y,a.w,a.h);
  ctx.shadowBlur=0;
  // 코너 장식 (더 크고 화려)
  const cl=36;
  [[a.x,a.y,1,1,'#4af0ff'],[a.x+a.w,a.y,-1,1,'#4af0ff'],[a.x,a.y+a.h,1,-1,'#ff6b35'],[a.x+a.w,a.y+a.h,-1,-1,'#ff6b35']].forEach(([x,y,sx,sy,col])=>{
    ctx.shadowBlur=16; ctx.shadowColor=col;
    ctx.strokeStyle=col; ctx.lineWidth=3.5;
    ctx.beginPath(); ctx.moveTo(x+sx*cl,y); ctx.lineTo(x,y); ctx.lineTo(x,y+sy*cl); ctx.stroke();
    ctx.fillStyle=col;
    ctx.beginPath(); ctx.arc(x+sx*6,y+sy*6,5,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();

  // 영역 텍스트
  ctx.font="bold 11px 'Cinzel',serif"; ctx.textAlign='center'; ctx.textBaseline='top';
  if(netRole==='join'){
    ctx.fillStyle='rgba(255,107,53,.22)';  ctx.fillText('MY TERRITORY',   a.x+a.w*3/4, a.y+6);
    ctx.fillStyle='rgba(74,240,255,.16)'; ctx.fillText('ENEMY TERRITORY',a.x+a.w/4,   a.y+6);
  } else {
    ctx.fillStyle='rgba(74,240,255,.18)'; ctx.fillText('PLAYER TERRITORY',a.x+a.w/4,  a.y+6);
    ctx.fillStyle='rgba(255,107,53,.16)'; ctx.fillText(netRole?'ENEMY TERRITORY':'AI TERRITORY',a.x+a.w*3/4,a.y+6);
  }
}

function R_SMALL(a){ return Math.min(a.w,a.h)*.028; }

// 진영 룬 심볼
function drawArenaRune(ctx,cx,cy,r,col,alpha,rot){
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(rot);
  ctx.globalAlpha=alpha;
  ctx.shadowBlur=10; ctx.shadowColor=col;
  ctx.strokeStyle=col; ctx.lineWidth=1.8;
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0,0,r*.58,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0,0,r*.22,0,Math.PI*2); ctx.stroke();
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    ctx.beginPath(); ctx.moveTo(Math.cos(a)*r*.22,Math.sin(a)*r*.22); ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); ctx.stroke();
  }
  // 별 8각
  ctx.beginPath();
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4-.5, ri=i%2===0?r*.85:r*.45;
    i===0?ctx.moveTo(Math.cos(a)*ri,Math.sin(a)*ri):ctx.lineTo(Math.cos(a)*ri,Math.sin(a)*ri);
  }
  ctx.closePath(); ctx.stroke();
  ctx.restore();
}

// 장식용 토템 기둥
function drawTotem(ctx,x,y,r,col,T){
  const flicker=Math.sin(T*3.5+x*.05)*.2+.8;
  r=r*1.5;
  // 기둥 몸체
  const pg=ctx.createLinearGradient(x-r*.5,y-r*3,x+r*.5,y);
  pg.addColorStop(0,'#2a2010'); pg.addColorStop(1,'#1a1008');
  ctx.fillStyle=pg; ctx.beginPath(); ctx.rect(x-r*.4,y-r*3.5,r*.8,r*3.5); ctx.fill();
  ctx.strokeStyle='rgba(255,200,80,.2)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.rect(x-r*.4,y-r*3.5,r*.8,r*3.5); ctx.stroke();
  // 받침대
  ctx.fillStyle='#1a1408'; ctx.beginPath(); ctx.rect(x-r*.6,y-r*.3,r*1.2,r*.3); ctx.fill();
  ctx.strokeStyle='rgba(255,200,80,.3)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.rect(x-r*.6,y-r*.3,r*1.2,r*.3); ctx.stroke();
  // 불꽃 (3단)
  if(flicker>.4){
    ctx.save();
    ctx.shadowBlur=22*flicker; ctx.shadowColor=col;
    for(let f=0;f<3;f++){
      const fw=r*(1.1-f*.28)*flicker, fh=r*(1.5-f*.35)*flicker;
      const fg=ctx.createRadialGradient(x,y-r*3.5,0,x,y-r*3.5,fw);
      fg.addColorStop(0,'rgba(255,255,200,.95)');
      fg.addColorStop(.25,col+'dd');
      fg.addColorStop(.7,col+'66');
      fg.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(x,y-r*3.5-fh*.3,fw,0,Math.PI*2); ctx.fillStyle=fg; ctx.fill();
    }
    ctx.restore();
  }
  // 토템 눈
  ctx.shadowBlur=10; ctx.shadowColor=col;
  ctx.fillStyle=col; ctx.globalAlpha=flicker*.8;
  ctx.beginPath(); ctx.ellipse(x,y-r*2.6,r*.15,r*.2,0,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1; ctx.shadowBlur=0;
}

function spawnHitFX(x,y,col){
  if(!document.getElementById('particles-toggle').classList.contains('on'))return;
  for(let i=0;i<10;i++){const a=Math.random()*Math.PI*2,v=2+Math.random()*4;GS.particles.push(new Particle(x,y,col,Math.cos(a)*v,Math.sin(a)*v-2,3+Math.random()*3,.3+Math.random()*.4));}
}
function spawnDeathFX(x,y,col){
  for(let i=0;i<24;i++){const a=Math.random()*Math.PI*2,v=3+Math.random()*6;GS.particles.push(new Particle(x,y,col,Math.cos(a)*v,Math.sin(a)*v-3,4+Math.random()*6,.5+Math.random()*1));}
  for(let i=0;i<8;i++){const a=Math.random()*Math.PI*2,v=1+Math.random()*2;GS.particles.push(new Particle(x,y,'#fff',Math.cos(a)*v,Math.sin(a)*v,2+Math.random()*4,.8));}
}
function spawnOrbFX(x,y){for(let i=0;i<12;i++){const a=Math.random()*Math.PI*2;GS.particles.push(new Particle(x,y,'#a855f7',Math.cos(a)*3,Math.sin(a)*3-1,3,.5));}}
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
