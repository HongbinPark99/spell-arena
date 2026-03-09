// renderer.js — 고퀄 판타지 아레나 렌더링

function gameRender(){
  if(!GS){ ctx.clearRect(0,0,W,H); return; }
  const s=GS;
  const sx=s.shakeX||0, sy=s.shakeY||0;
  // shake 범위를 포함해 여유있게 클리어 (ctx.translate로 이동해도 잘림 없음)
  ctx.clearRect(-16,-16,W+32,H+32);
  try {
    ctx.save();
    if(sx||sy) ctx.translate(sx,sy);
    drawArena(s.arena, s.players);
    if(s.pillars) s.pillars.forEach(pl=>{ try{pl.draw(ctx);}catch(e){} });
    if(s.orbs) s.orbs.forEach(o=>{ try{o.draw(ctx);}catch(e){} });
    if(s.particles) s.particles.forEach(p=>{ try{p.draw(ctx);}catch(e){} });
    if(s.creatures) s.creatures.forEach(c=>{ try{c.draw(ctx);}catch(e){} });
    if(s.players) s.players.forEach(p=>{ try{p.draw(ctx);}catch(e){} });
    if(s.projectiles) s.projectiles.forEach(pr=>{ try{pr.draw(ctx);}catch(e){} });
    // 스펠 이펙트 렌더링
    try{ drawSpellEffects(ctx); }catch(e){}
    // 방패/미러/블링크 오버레이
    if(s.players) s.players.forEach(p=>{ try{ drawPlayerBuffs(ctx,p); }catch(e){} });
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
  } catch(e){ console.error('render error',e); try{ctx.restore();}catch(_){} }
  // CSS transform 미사용 — ctx.translate로만 처리
}

function drawSpellEffects(ctx){
  if(typeof spellEffects==='undefined'||!spellEffects) return;
  spellEffects.forEach(e=>{
    const alpha=Math.min(1, e.timer/e.maxTimer);
    ctx.save();
    ctx.globalAlpha=alpha;
    if(e.type==='gravwell'){
      const T=Date.now()*.003;
      for(let i=0;i<3;i++){
        const r=e.range*(0.3+i*0.35);
        const a=T*(i%2===0?1:-1);
        ctx.strokeStyle=e.color; ctx.lineWidth=2-i*0.4;
        ctx.shadowBlur=14; ctx.shadowColor=e.color;
        ctx.beginPath(); ctx.arc(e.x,e.y,r,0,Math.PI*2); ctx.stroke();
        for(let d=0;d<6;d++){
          const da=(d/6)*Math.PI*2+a;
          ctx.beginPath(); ctx.arc(e.x+Math.cos(da)*r,e.y+Math.sin(da)*r,3,0,Math.PI*2);
          ctx.fillStyle=e.color; ctx.fill();
        }
      }
    } else if(e.type==='cloud_zone'){
      const T=Date.now()*.002;
      const g=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.r);
      g.addColorStop(0,e.color+'55'); g.addColorStop(0.6,e.color+'33'); g.addColorStop(1,e.color+'00');
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
      ctx.shadowBlur=8; ctx.shadowColor=e.color;
      for(let i=0;i<8;i++){
        const da=(i/8)*Math.PI*2+T*(i%2===0?.5:-.5);
        const dr=e.r*(0.3+Math.sin(T*3+i)*0.25);
        ctx.beginPath(); ctx.arc(e.x+Math.cos(da)*dr,e.y+Math.sin(da)*dr,5,0,Math.PI*2);
        ctx.fillStyle=e.color+'aa'; ctx.fill();
      }
    } else if(e.type==='chain_fx'){
      ctx.strokeStyle=e.color; ctx.lineWidth=3; ctx.shadowBlur=16; ctx.shadowColor=e.color;
      for(let i=0;i<e.pts.length-1;i++){
        const a=e.pts[i], b=e.pts[i+1];
        const mid={x:(a.x+b.x)/2+(Math.random()-0.5)*30,y:(a.y+b.y)/2+(Math.random()-0.5)*30};
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.quadraticCurveTo(mid.x,mid.y,b.x,b.y); ctx.stroke();
      }
    } else if(e.type==='shockwave_fx'){
      ctx.strokeStyle=e.color; ctx.lineWidth=3*(e.timer/e.maxTimer);
      ctx.shadowBlur=20; ctx.shadowColor=e.color;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r||10,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  });
}

function drawPlayerBuffs(ctx,p){
  const T=Date.now()*.004;
  if(p.shieldTimer>0){
    const a=Math.min(1,p.shieldTimer/700)*0.85;
    ctx.save(); ctx.globalAlpha=a;
    ctx.shadowBlur=30; ctx.shadowColor='#4af0ff';
    ctx.strokeStyle='#4af0ff'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.radius+8+Math.sin(T*3)*3,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#4af0ff'; ctx.font='18px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🛡',p.x,p.y-p.radius-16);
    ctx.restore();
  }
  if(p.mirrorTimer>0){
    const a=Math.min(1,p.mirrorTimer/500)*0.85;
    ctx.save(); ctx.globalAlpha=a;
    ctx.shadowBlur=30; ctx.shadowColor='#c0e8ff';
    ctx.strokeStyle='#c0e8ff'; ctx.lineWidth=3;
    const R=p.radius+12;
    ctx.beginPath(); ctx.moveTo(p.x,p.y-R); ctx.lineTo(p.x+R,p.y); ctx.lineTo(p.x,p.y+R); ctx.lineTo(p.x-R,p.y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle='#c0e8ff'; ctx.font='18px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🪞',p.x,p.y-p.radius-16);
    ctx.restore();
  }
  if(p.blinkTimer>0){
    const a=(p.blinkTimer/400)*0.5;
    ctx.save(); ctx.globalAlpha=a;
    ctx.shadowBlur=40; ctx.shadowColor=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.radius+15,0,Math.PI*2);
    ctx.strokeStyle=p.color; ctx.lineWidth=3; ctx.stroke();
    ctx.restore();
  }
  if(p.markTimer&&p.markTimer>0){
    const a=Math.min(1,p.markTimer/3000)*0.7;
    ctx.save(); ctx.globalAlpha=a;
    ctx.shadowBlur=20; ctx.shadowColor='#8822cc';
    ctx.strokeStyle='#8822cc'; ctx.lineWidth=2; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.radius+14+Math.sin(T*4)*4,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#cc44ff'; ctx.font='16px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🌑',p.x,p.y-p.radius-16);
    ctx.restore();
  }
}

function drawArena(a, players){
  const midX=a.x+a.w/2, cy=a.y+a.h/2;
  const T=Date.now()*.001;

  // ── 배경: 심연의 전투장 ──────────────────────
  // 기본 어두운 배경
  const base=ctx.createLinearGradient(a.x,a.y,a.x+a.w,a.y+a.h);
  base.addColorStop(0,'#040810'); base.addColorStop(.5,'#080c18'); base.addColorStop(1,'#040810');
  ctx.fillStyle=base; ctx.fillRect(a.x,a.y,a.w,a.h);

  // 타일 바닥 패턴 (Stone tile grid)
  ctx.save();
  ctx.strokeStyle='rgba(40,60,100,.18)'; ctx.lineWidth=1;
  const tileSize=64;
  for(let x=a.x;x<a.x+a.w;x+=tileSize){
    ctx.beginPath(); ctx.moveTo(x,a.y); ctx.lineTo(x,a.y+a.h); ctx.stroke();
  }
  for(let y=a.y;y<a.y+a.h;y+=tileSize){
    ctx.beginPath(); ctx.moveTo(a.x,y); ctx.lineTo(a.x+a.w,y); ctx.stroke();
  }
  ctx.restore();

  // P1 진영 배경 (청색 마법 기운)
  const lg=ctx.createRadialGradient(a.x+a.w*.15,cy,0,a.x+a.w*.15,cy,a.w*.5);
  lg.addColorStop(0,'rgba(0,40,80,.28)'); lg.addColorStop(.5,'rgba(0,20,50,.12)'); lg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=lg; ctx.fillRect(a.x,a.y,a.w/2,a.h);

  // P2 진영 배경 (적색 용암 기운)
  const rg=ctx.createRadialGradient(a.x+a.w*.85,cy,0,a.x+a.w*.85,cy,a.w*.5);
  rg.addColorStop(0,'rgba(80,15,0,.28)'); rg.addColorStop(.5,'rgba(50,8,0,.12)'); rg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=rg; ctx.fillRect(midX,a.y,a.w/2,a.h);

  // 바닥 원형 균열선
  ctx.save();
  ctx.strokeStyle='rgba(70,50,120,.2)'; ctx.lineWidth=1.5;
  for(let r=60;r<Math.max(a.w,a.h)*.7;r+=75){
    ctx.beginPath(); ctx.arc(midX,cy,r,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();

  // 중앙 대형 전투 구역 룬 원
  const cr=Math.min(a.w,a.h)*.38;
  ctx.save();
  // 외곽 글로우
  const cg=ctx.createRadialGradient(midX,cy,cr*.5,midX,cy,cr*1.2);
  cg.addColorStop(0,'rgba(100,40,180,.06)'); cg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(midX,cy,cr*1.2,0,Math.PI*2); ctx.fillStyle=cg; ctx.fill();

  ctx.shadowBlur=16; ctx.shadowColor='rgba(150,80,240,.7)';
  ctx.strokeStyle='rgba(150,80,240,.5)'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.arc(midX,cy,cr,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='rgba(150,80,240,.3)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(midX,cy,cr*.65,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(midX,cy,cr*.3,0,Math.PI*2); ctx.stroke();
  ctx.shadowBlur=0;

  // 룬 방사선 (16개)
  ctx.strokeStyle='rgba(140,70,220,.22)'; ctx.lineWidth=1.2;
  for(let i=0;i<16;i++){
    const ang=i*Math.PI/8 + T*.05;
    ctx.beginPath();
    ctx.moveTo(midX+Math.cos(ang)*cr*.3,cy+Math.sin(ang)*cr*.3);
    ctx.lineTo(midX+Math.cos(ang)*cr,cy+Math.sin(ang)*cr);
    ctx.stroke();
  }
  ctx.restore();

  // 진영 룬 심볼 (큰)
  drawArenaRune(ctx,a.x+a.w*.2,cy,cr*.42,'#4af0ff',0.38, T*.12);
  drawArenaRune(ctx,a.x+a.w*.8,cy,cr*.42,'#ff6b35',0.38,-T*.12);

  // 토템 기둥 (4코너) — 더 크게
  drawTotem(ctx, a.x+a.w*.06, a.y+a.h*.1,  R_SMALL(a)*1.3, '#4af0ff', T);
  drawTotem(ctx, a.x+a.w*.06, a.y+a.h*.9,  R_SMALL(a)*1.3, '#4af0ff', T+1);
  drawTotem(ctx, a.x+a.w*.94, a.y+a.h*.1,  R_SMALL(a)*1.3, '#ff6b35', T+2);
  drawTotem(ctx, a.x+a.w*.94, a.y+a.h*.9,  R_SMALL(a)*1.3, '#ff6b35', T+3);

  // 침범 경고 틴트
  const [p1,p2]=players;
  if(p1.alive&&p1.inEnemyTerritory){
    const urg=Math.min(1,p1.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.16})`; ctx.fillRect(midX,a.y,a.w/2,a.h);
  }
  if(p2.alive&&p2.inEnemyTerritory){
    const urg=Math.min(1,p2.invasionTimer/DIFF[difficulty].invasionDelay);
    ctx.fillStyle=`rgba(255,40,40,${urg*.16})`; ctx.fillRect(a.x,a.y,a.w/2,a.h);
  }

  // 중앙 분리선 (에너지 장벽)
  ctx.save();
  // 배경 글로우 기둥
  const clg=ctx.createLinearGradient(midX-24,a.y,midX+24,a.y);
  clg.addColorStop(0,'rgba(160,80,255,0)'); clg.addColorStop(.5,'rgba(160,80,255,.18)'); clg.addColorStop(1,'rgba(160,80,255,0)');
  ctx.fillStyle=clg; ctx.fillRect(midX-24,a.y,48,a.h);
  // 주 선
  ctx.shadowBlur=32; ctx.shadowColor='#a855f7cc';
  ctx.strokeStyle='rgba(210,140,255,.95)'; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(midX,a.y); ctx.lineTo(midX,a.y+a.h); ctx.stroke();
  // 에너지 펄스
  ctx.strokeStyle='rgba(255,255,255,.18)'; ctx.lineWidth=1; ctx.setLineDash([18,14]);
  ctx.lineDashOffset=-T*25;
  ctx.beginPath(); ctx.moveTo(midX,a.y); ctx.lineTo(midX,a.y+a.h); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();

  // 중앙 맥동 오브
  ctx.save();
  const pulse=Math.sin(T*2.4)*.4+.6;
  const plr=18*pulse;
  ctx.shadowBlur=44; ctx.shadowColor='#c084fc';
  const og=ctx.createRadialGradient(midX,cy,0,midX,cy,plr*1.8);
  og.addColorStop(0,'rgba(255,255,255,.96)'); og.addColorStop(.3,'rgba(210,140,255,.9)'); og.addColorStop(.75,'rgba(168,85,247,.55)'); og.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(midX,cy,plr*1.8,0,Math.PI*2); ctx.fillStyle=og; ctx.fill();
  ctx.restore();

  // 아레나 테두리
  ctx.save();
  ctx.shadowBlur=24; ctx.shadowColor='#a855f7';
  ctx.strokeStyle='rgba(168,85,247,.65)'; ctx.lineWidth=3.5; ctx.strokeRect(a.x,a.y,a.w,a.h);
  ctx.shadowBlur=0;
  // 코너 L자 장식
  const cl=44;
  [[a.x,a.y,1,1,'#4af0ff'],[a.x+a.w,a.y,-1,1,'#4af0ff'],[a.x,a.y+a.h,1,-1,'#ff6b35'],[a.x+a.w,a.y+a.h,-1,-1,'#ff6b35']].forEach(([x,y,sx,sy,col])=>{
    ctx.shadowBlur=20; ctx.shadowColor=col;
    ctx.strokeStyle=col; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(x+sx*cl,y); ctx.lineTo(x,y); ctx.lineTo(x,y+sy*cl); ctx.stroke();
    // 코너 다이아
    ctx.fillStyle=col; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(x+sx*7,y+sy*7,6,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();

  // 영역 라벨
  ctx.font="bold 11px 'Cinzel',serif"; ctx.textAlign='center'; ctx.textBaseline='top';
  if(netRole==='join'){
    ctx.fillStyle='rgba(255,107,53,.24)';  ctx.fillText('MY TERRITORY',   a.x+a.w*3/4, a.y+8);
    ctx.fillStyle='rgba(74,240,255,.18)'; ctx.fillText('ENEMY TERRITORY',a.x+a.w/4,   a.y+8);
  } else {
    ctx.fillStyle='rgba(74,240,255,.2)'; ctx.fillText('PLAYER TERRITORY',a.x+a.w/4,  a.y+8);
    ctx.fillStyle='rgba(255,107,53,.18)'; ctx.fillText(netRole?'ENEMY TERRITORY':'AI TERRITORY',a.x+a.w*3/4,a.y+8);
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
function shakeScreen(i){} // shake disabled — 캔버스 깨짐 원인

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
