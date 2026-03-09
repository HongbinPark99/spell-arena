// ════════════════════════════════════════
//  entities.js — 모든 게임 클래스 정의
//  · Player     — 플레이어 / AI
//  · Creature   — 소환수 (Drake, Specter, Golem, Wisp)
//  · Projectile — 투사체
//  · ManaOrb    — 마나 구슬
//  · Particle   — 파티클 이펙트
// ════════════════════════════════════════

class Player {
  constructor(id,x,y,color,glow,isAI){
    this.id=id; this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.radius=44; this.speed=210;
    this.hp=100; this.maxHp=100; this.mp=100; this.maxMp=100; this.mpRegen=14;
    this.color=color; this.glow=glow;
    this.facing=id===1?1:-1;
    // Shoot direction — updated by movement keys. Default toward enemy.
    this.sdx=id===1?1:-1; this.sdy=0;
    this.selSpell=0; this.spellCDs=[0,0,0,0]; this.summonCDs=[0,0,0,0];
    this.swordActive=false; this.swordTimer=0; this.swordCD=0; this.swordAngle=0; this.swordSwingDir=0;
    this.alive=true; this.stunTimer=0; this.slowTimer=0; this.flash=0; this.invincible=0;
    this.isAI=isAI||false; this.aiTimer=0; this.jx=0; this.jy=0;
    this.trail=[];
    this.spellsCast=0; this.summonsCast=0;
    this.invasionTimer=0; this.inEnemyTerritory=false;
  }

  update(dt,arena,opponent){
    if(!this.alive)return;
    if(this.stunTimer>0){this.stunTimer-=dt;return;}
    this.mp=Math.min(this.maxMp,this.mp+this.mpRegen*dt);
    const spd=this.speed*(this.slowTimer>0?.5:1)*dt;
    if(this.slowTimer>0)this.slowTimer-=dt;
    this.x+=this.vx*spd; this.y+=this.vy*spd;
    const pad=this.radius+arena.padding;
    this.x=Math.max(arena.x+pad,Math.min(arena.x+arena.w-pad,this.x));
    this.y=Math.max(arena.y+pad,Math.min(arena.y+arena.h-pad,this.y));

    // facing 항상 상대 진영 방향으로 고정 (이동 방향 무관)
    // P1=오른쪽(+1), P2=왼쪽(-1) — 절대 바뀌지 않음
    this.facing = this.id===1 ? 1 : -1;

    // Territory check
    const midX=arena.x+arena.w/2;
    this.inEnemyTerritory=this.id===1?this.x>midX:this.x<midX;
    if(this.inEnemyTerritory){
      this.invasionTimer+=dt;
      const del=DIFF[difficulty].invasionDelay;
      if(this.invasionTimer>=del){
        this.hp=Math.max(0,this.hp-DIFF[difficulty].invasionDmg*dt);
        // alive=false만 — game.js 루프에서 handleDeath 호출
        if(this.hp<=0){ this.hp=0; this.alive=false; }
      }
    } else { this.invasionTimer=0; }

    // Trail
    this.trail.push({x:this.x,y:this.y,t:1});
    if(this.trail.length>10)this.trail.shift();
    this.trail.forEach(t=>t.t-=dt*3.5);

    // Sword
    if(this.swordActive){
      this.swordTimer-=dt*1000;
      this.swordAngle+=this.swordSwingDir*dt*13;
      if(this.swordTimer<=0)this.swordActive=false;
    }
    if(this.swordCD>0)this.swordCD-=dt*1000;
    for(let i=0;i<4;i++){
      if(this.spellCDs[i]>0)this.spellCDs[i]-=dt*1000;
      if(this.summonCDs[i]>0)this.summonCDs[i]-=dt*1000;
    }
    if(this.flash>0)this.flash-=dt*5;
    if(this.invincible>0)this.invincible-=dt;
    if(this.isAI&&opponent)this.updateAI(dt,arena,opponent);
  }

  updateAI(dt,arena,opponent){
    this.aiTimer-=dt;
    if(this.aiTimer>0)return;
    const diff=DIFF[difficulty];
    this.aiTimer=0.15+Math.random()*.25;
    const dx=opponent.x-this.x, dy=opponent.y-this.y;
    const dist=Math.sqrt(dx*dx+dy*dy)||1;
    const midX=arena.x+arena.w/2;

    // Movement — stay on right half
    if(dist>260){
      const tx=Math.min(opponent.x-90, midX-10);
      const tdx=tx-this.x, tdy=opponent.y-this.y, td=Math.sqrt(tdx*tdx+tdy*tdy)||1;
      this.vx=tdx/td*diff.aiSpeed; this.vy=tdy/td*diff.aiSpeed;
    } else if(dist<110){
      this.vx=-dx/dist*diff.aiSpeed; this.vy=-dy/dist*diff.aiSpeed;
    } else {
      this.vx=(Math.random()-.5)*diff.aiSpeed; this.vy=(Math.random()-.5)*diff.aiSpeed*1.5;
    }
    if(this.x<midX-20) this.vx=Math.abs(this.vx);

    // Cast — AI aims at opponent by setting sdx/sdy
    if(dist<380&&Math.random()<diff.aiAttackRate){
      const sp=SPELLS[this.selSpell];
      if(this.mp>=sp.cost&&this.spellCDs[this.selSpell]<=0){
        this.sdx=dx/dist; this.sdy=dy/dist;
        const pp=this.castSpell();
        if(pp&&GS)GS.projectiles.push(...pp);
      }
    }
    if(Math.random()<.08)this.selSpell=Math.floor(Math.random()*4);
    if(Math.random()<diff.aiSummonRate){
      const idx=Math.floor(Math.random()*4);
      const c=this.summonCreature(idx);
      if(c&&GS)GS.creatures.push(c);
    }
    if(dist<75&&Math.random()<.35)this.startSword();
  }

  castSpell(){
    const sp=SPELLS[this.selSpell];
    if(this.mp<sp.cost||this.spellCDs[this.selSpell]>0)return null;
    this.mp-=sp.cost; this.spellCDs[this.selSpell]=sp.cd; this.spellsCast++;
    // 항상 상대 진영 방향(facing)으로 발사
    // facing: P1=+1(오른쪽), P2=-1(왼쪽)
    const dir=this.facing; // +1 or -1
    if(sp.type==='nova'){
      return Array.from({length:sp.count},(_,i)=>{
        const a=(i/sp.count)*Math.PI*2;
        return new Projectile(this.x,this.y,Math.cos(a)*sp.speed,Math.sin(a)*sp.speed,sp,this.id);
      });
    }
    return [new Projectile(this.x,this.y,dir*sp.speed,0,sp,this.id)];
  }

  summonCreature(idx){
    const def=SUMMONS[idx];
    if(!def||this.mp<def.cost||this.summonCDs[idx]>0)return null;
    this.mp-=def.cost; this.summonCDs[idx]=def.cd; this.summonsCast++;
    const angle=Math.random()*Math.PI*2, d=this.radius+def.radius+22;
    const _c=new Creature(this.x+Math.cos(angle)*d,this.y+Math.sin(angle)*d,def,this.id);
    _c.cid="c_"+this.id+"_"+Date.now()+"_"+idx;
    return _c;
  }

  startSword(){
    if(this.swordCD>0)return;
    this.swordActive=true; this.swordTimer=300; this.swordCD=600;
    this.swordSwingDir=this.facing; this.swordAngle=-this.facing*1.2;
  }

  // FIX #1: NO knockback — damage only
  takeDamage(dmg){
    if(this.invincible>0||!this.alive)return;
    this.hp=Math.max(0,this.hp-dmg);
    this.flash=1; this.invincible=0.14;
    if(this.hp<=0)this.alive=false;
  }

  // ─── HIGH QUALITY DRAW ───────────────────
  draw(ctx){
    // Trail
    this.trail.forEach(t=>{
      if(t.t<=0)return;
      ctx.beginPath(); ctx.arc(t.x,t.y,this.radius*t.t*.38,0,Math.PI*2);
      ctx.fillStyle=this.color+Math.floor(t.t*28).toString(16).padStart(2,'0');
      ctx.fill();
    });
    if(!this.alive)return;

    const fl=this.flash>0&&Math.floor(Date.now()/55)%2===0;
    const x=this.x, y=this.y, f=this.facing, R=this.radius;

    // Aura
    if(!fl){
      const ag=ctx.createRadialGradient(x,y,R*.4,x,y,R*2.5);
      ag.addColorStop(0,this.glow+'55'); ag.addColorStop(1,this.glow+'00');
      ctx.beginPath(); ctx.arc(x,y,R*2.5,0,Math.PI*2); ctx.fillStyle=ag; ctx.fill();
    }

    // Territory burn ring
    if(this.inEnemyTerritory&&this.invasionTimer>0){
      const pulse=Math.sin(Date.now()*.012)*.5+.5;
      ctx.save(); ctx.shadowBlur=18; ctx.shadowColor='#ff2200';
      ctx.beginPath(); ctx.arc(x,y,R+7+pulse*5,0,Math.PI*2);
      ctx.strokeStyle=`rgba(255,60,0,${.35+pulse*.45})`; ctx.lineWidth=2.5; ctx.stroke(); ctx.restore();
    }

    ctx.save();
    ctx.translate(x,y);
    ctx.shadowBlur=fl?22:15; ctx.shadowColor=fl?'#ffffff':this.glow;
    ctx.scale(f,1); // flip for facing direction

    if(this.id===1){
      this._drawBlueMage(ctx,R,fl);
    } else {
      this._drawFireWarlock(ctx,R,fl);
    }

    ctx.restore();

    // Slow ring
    if(this.slowTimer>0){
      ctx.beginPath(); ctx.arc(x,y,R+5,0,Math.PI*2);
      ctx.strokeStyle='#80dfff66'; ctx.lineWidth=2; ctx.setLineDash([3,4]); ctx.stroke(); ctx.setLineDash([]);
    }

    // Sword
    if(this.swordActive){
      ctx.save(); ctx.translate(x,y); ctx.rotate(this.swordAngle);
      ctx.shadowBlur=22; ctx.shadowColor=this.color;
      // Blade
      const sg=ctx.createLinearGradient(0,0,f*58,0);
      sg.addColorStop(0,this.color); sg.addColorStop(.5,'#ffffff'); sg.addColorStop(1,this.color+'44');
      ctx.beginPath(); ctx.moveTo(f*6,-1); ctx.lineTo(f*58,-1);
      ctx.strokeStyle=sg; ctx.lineWidth=5; ctx.lineCap='round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f*6,1); ctx.lineTo(f*58,1);
      ctx.strokeStyle='rgba(255,255,255,.4)'; ctx.lineWidth=2; ctx.stroke();
      // Guard
      ctx.beginPath(); ctx.moveTo(f*11,-12); ctx.lineTo(f*11,12);
      ctx.strokeStyle=this.color; ctx.lineWidth=4; ctx.lineCap='round'; ctx.stroke();
      ctx.restore();
    }

    // HP bar
    const bw=64,bh=6,bx=x-bw/2,by=y-R-22;
    ctx.fillStyle='rgba(0,0,0,.65)'; ctx.fillRect(bx,by,bw,bh);
    const hpPct=this.hp/this.maxHp;
    ctx.fillStyle=hpPct>.5?this.color:hpPct>.25?'#ffaa00':'#ff2200';
    ctx.fillRect(bx,by,bw*hpPct,bh);
    ctx.fillStyle='rgba(255,255,255,.22)'; ctx.fillRect(bx,by,bw*hpPct,bh*.5);
    ctx.strokeStyle=this.color+'55'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
  }

  // BLUE ARCANE MAGE — detailed body

  // ══ P1: STORM KNIGHT — 번개 기사 ════════════════
  _drawBlueMage(ctx,R,fl){
    const T=Date.now()*.003;
    const c=fl?'#fff':'#4af0ff', gw=fl?'#fff':this.glow;
    const steel='#0d2244', mid='#1a4488', bright='#2a6acc', edge='#4af0ff';
    const gold=fl?'#ddd':'#e8c050', skin=fl?'#eee':'#d4a878';

    // 거대 전기 오라
    if(!fl){
      ctx.save();
      const ring=T*2;
      for(let k=0;k<4;k++){
        const a=ring+k*Math.PI*.5, r=R*(1.55+k*.18);
        const grad=ctx.createLinearGradient(Math.cos(a)*r,Math.sin(a)*r,Math.cos(a+Math.PI)*r,Math.sin(a+Math.PI)*r);
        grad.addColorStop(0,'transparent'); grad.addColorStop(.5,edge+'44'); grad.addColorStop(1,'transparent');
        ctx.strokeStyle=edge+(k%2?'22':'44'); ctx.lineWidth=1.5+k*.4;
        ctx.beginPath(); ctx.arc(0,0,r,a,a+Math.PI*1.1); ctx.stroke();
      }
      // 방전 파티클
      for(let k=0;k<8;k++){
        const a=T*3.5+k*.785, r=R*(1.1+Math.sin(T*4+k)*.35);
        ctx.shadowBlur=8; ctx.shadowColor=edge;
        ctx.fillStyle=edge+'55'; ctx.beginPath(); ctx.arc(Math.cos(a)*r,Math.sin(a)*r,2+Math.sin(T*5+k)*1.2,0,Math.PI*2); ctx.fill();
      }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 큰 망토 (뒤)
    const cg=ctx.createLinearGradient(0,-R*.6,0,R*1.5);
    cg.addColorStop(0,'#030d2eee'); cg.addColorStop(.4,'#061535dd'); cg.addColorStop(1,'#02091aaa');
    ctx.beginPath();
    ctx.moveTo(-R*.22,-R*.55);
    ctx.bezierCurveTo(-R*1.05,R*.05,-R*1.15,R*1.0,-R*.68,R*1.35);
    ctx.lineTo(R*.68,R*1.35); ctx.bezierCurveTo(R*1.15,R*1.0,R*1.05,R*.05,R*.22,-R*.55);
    ctx.fillStyle=cg; ctx.fill();
    if(!fl){ ctx.strokeStyle=edge+'28'; ctx.lineWidth=1.5; ctx.stroke(); }

    // 망토 빛 엣지
    if(!fl){
      ctx.save(); ctx.shadowBlur=12; ctx.shadowColor=edge;
      ctx.strokeStyle=edge+'44'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-R*.68,R*1.35); ctx.bezierCurveTo(-R*1.15,R*1.0,-R*1.05,R*.05,-R*.22,-R*.55); ctx.stroke();
      ctx.restore();
    }

    // 다리 중판 갑옷
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      // 넓적다리
      const tg=ctx.createLinearGradient(R*.06,R*.28,R*.5,R*.3);
      tg.addColorStop(0,mid); tg.addColorStop(.5,bright); tg.addColorStop(1,steel);
      ctx.beginPath(); ctx.roundRect(R*.06,R*.28,R*.42,R*.56,R*.07);
      ctx.fillStyle=tg; ctx.fill(); ctx.strokeStyle=edge+'88'; ctx.lineWidth=2; ctx.stroke();
      // 무릎 보호대 (크리스탈)
      ctx.shadowBlur=fl?0:18; ctx.shadowColor=edge;
      ctx.fillStyle=fl?'#999':bright; ctx.beginPath(); ctx.ellipse(R*.28,R*.82,R*.24,R*.19,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=fl?'#888':edge; ctx.lineWidth=2; ctx.stroke();
      ctx.shadowBlur=0;
      // 정강이 갑옷
      ctx.beginPath(); ctx.roundRect(R*.09,R*.94,R*.36,R*.42,R*.05);
      ctx.fillStyle=mid; ctx.fill(); ctx.strokeStyle=edge+'55'; ctx.lineWidth=1.5; ctx.stroke();
      // 수직 능선 디테일
      ctx.strokeStyle=bright+'66'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(R*.27,R*.96); ctx.lineTo(R*.27,R*1.32); ctx.stroke();
      // 발 (뭉툭한 발판형)
      ctx.beginPath(); ctx.roundRect(R*.02,R*1.34,R*.54,R*.22,R*.04);
      ctx.fillStyle=steel; ctx.fill(); ctx.strokeStyle=edge+'66'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.restore();
    }

    // 허리 벨트
    ctx.fillStyle=steel; ctx.beginPath(); ctx.roundRect(-R*.56,R*.18,R*1.12,R*.16,R*.03); ctx.fill();
    ctx.strokeStyle=gold+'66'; ctx.lineWidth=1.5; ctx.strokeRect(-R*.56,R*.18,R*1.12,R*.16);
    // 벨트 버클
    ctx.fillStyle=fl?'#888':gold; ctx.beginPath(); ctx.roundRect(-R*.09,R*.19,R*.18,R*.14,R*.02); ctx.fill();

    // 흉갑
    const tg=ctx.createLinearGradient(-R*.58,-R*.62,R*.5,R*.22);
    tg.addColorStop(0,bright); tg.addColorStop(.3,mid); tg.addColorStop(.7,bright); tg.addColorStop(1,steel);
    ctx.beginPath();
    ctx.moveTo(-R*.56,-R*.28); ctx.lineTo(-R*.58,R*.2); ctx.lineTo(R*.58,R*.2); ctx.lineTo(R*.56,-R*.28);
    ctx.bezierCurveTo(R*.56,-R*.68,R*.32,-R*.82,0,-R*.82);
    ctx.bezierCurveTo(-R*.32,-R*.82,-R*.56,-R*.68,-R*.56,-R*.28);
    ctx.fillStyle=tg; ctx.fill(); ctx.strokeStyle=edge; ctx.lineWidth=2.5; ctx.stroke();

    // 흉갑 수직 라인 (갑옷 분절)
    ctx.strokeStyle=edge+'44'; ctx.lineWidth=1.5;
    for(let ox of[-R*.22,0,R*.22]){
      ctx.beginPath(); ctx.moveTo(ox,-R*.72); ctx.lineTo(ox,R*.18); ctx.stroke();
    }

    // 흉갑 가운데 크리스탈 코어 (빛나는)
    if(!fl){
      const pulse=Math.sin(T*3)*.3+.7;
      ctx.shadowBlur=35+pulse*20; ctx.shadowColor=edge;
      const cg2=ctx.createRadialGradient(0,-R*.22,0,0,-R*.22,R*.28);
      cg2.addColorStop(0,'#fff'); cg2.addColorStop(.2,edge); cg2.addColorStop(.6,edge+'55'); cg2.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,-R*.22,R*.28,0,Math.PI*2); ctx.fillStyle=cg2; ctx.fill();
      // 크리스탈 8각형 커팅
      ctx.strokeStyle=edge+'cc'; ctx.lineWidth=1.5;
      for(let k=0;k<8;k++){
        const a=k*Math.PI*.25, r1=R*.06, r2=R*.24;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*r1,-R*.22+Math.sin(a)*r1); ctx.lineTo(Math.cos(a)*r2,-R*.22+Math.sin(a)*r2); ctx.stroke();
      }
      ctx.shadowBlur=0;
    }

    // 견갑 (크고 두꺼운 어깨 갑옷)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      const sg=ctx.createLinearGradient(R*.38,-R*.65,R*.85,-R*.08);
      sg.addColorStop(0,bright); sg.addColorStop(.4,mid); sg.addColorStop(1,steel);
      ctx.beginPath();
      ctx.moveTo(R*.36,-R*.62); ctx.lineTo(R*.88,-R*.54); ctx.lineTo(R*.9,-R*.12); ctx.lineTo(R*.48,-R*.16); ctx.closePath();
      ctx.fillStyle=sg; ctx.fill(); ctx.strokeStyle=edge+'aa'; ctx.lineWidth=2; ctx.stroke();
      // 어깨 엣지 라인
      ctx.strokeStyle=gold+'55'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(R*.38,-R*.62); ctx.lineTo(R*.88,-R*.54); ctx.stroke();
      // 어깨 뾰족 스파이크
      if(!fl){ ctx.shadowBlur=14; ctx.shadowColor=edge; }
      ctx.fillStyle=fl?'#aaa':bright;
      ctx.beginPath(); ctx.moveTo(R*.56,-R*.62); ctx.lineTo(R*.62,-R*.95); ctx.lineTo(R*.72,-R*.62); ctx.fill();
      ctx.beginPath(); ctx.moveTo(R*.74,-R*.56); ctx.lineTo(R*.88,-R*.84); ctx.lineTo(R*.94,-R*.54); ctx.fill();
      ctx.shadowBlur=0;
      ctx.restore();
    }

    // 왼팔 (방패 팔)
    ctx.strokeStyle=mid; ctx.lineWidth=R*.26; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-R*.58,-R*.26); ctx.lineTo(-R*.88,R*.22); ctx.stroke();
    ctx.strokeStyle=edge+'22'; ctx.lineWidth=1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-R*.72,R*.02,R*.22,R*.16,-.4,0,Math.PI*2);
    ctx.fillStyle=bright; ctx.fill(); ctx.strokeStyle=edge+'77'; ctx.lineWidth=1.5; ctx.stroke();
    // 건틀릿 (장갑)
    ctx.beginPath(); ctx.ellipse(-R*.9,R*.26,R*.2,R*.15,-.5,0,Math.PI*2);
    ctx.fillStyle=mid; ctx.fill(); ctx.strokeStyle=edge+'88'; ctx.lineWidth=2; ctx.stroke();
    // 건틀릿 너클
    for(let k=0;k<3;k++){
      const a=-.5+k*.3, r=R*.2;
      ctx.fillStyle=bright; ctx.beginPath(); ctx.arc(Math.cos(a)*r-R*.9,Math.sin(a)*r+R*.26,R*.055,0,Math.PI*2); ctx.fill();
    }

    // 오른팔 (검 팔)
    ctx.strokeStyle=mid; ctx.lineWidth=R*.24; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(R*.58,-R*.26); ctx.lineTo(R*.8,R*.16); ctx.stroke();
    ctx.strokeStyle=edge+'22'; ctx.lineWidth=1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(R*.68,-R*.04,R*.2,R*.15,-.3,0,Math.PI*2);
    ctx.fillStyle=bright; ctx.fill(); ctx.strokeStyle=edge+'77'; ctx.lineWidth=1.5; ctx.stroke();

    // 크리스탈 대검 (크고 인상적)
    ctx.save(); ctx.translate(R*.82,R*.22); ctx.rotate(-.18);
    if(!fl){ ctx.shadowBlur=40; ctx.shadowColor=gw; }
    // 검날 (크리스탈 형태)
    const bg=ctx.createLinearGradient(-R*.16,R*.28,-R*.02,-R*2.4);
    bg.addColorStop(0,'#002266'); bg.addColorStop(.3,edge+'cc'); bg.addColorStop(.62,'#e8f8ff'); bg.addColorStop(1,'transparent');
    ctx.beginPath();
    ctx.moveTo(-R*.14,R*.3); ctx.lineTo(-R*.18,-R*1.12); ctx.lineTo(0,-R*2.42); ctx.lineTo(R*.18,-R*1.12); ctx.lineTo(R*.14,R*.3);
    ctx.fillStyle=bg; ctx.fill();
    // 검날 중앙 능선 (빛 반사)
    ctx.strokeStyle='#d0f8ffcc'; ctx.lineWidth=2.5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-R*.06,-R*.08); ctx.lineTo(-R*.1,-R*1.88); ctx.stroke();
    ctx.strokeStyle=edge+'88'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(R*.04,-R*.06); ctx.lineTo(R*.06,-R*1.42); ctx.stroke();
    // 가드 (크로스 가드)
    ctx.fillStyle=fl?'#ccc':gold;
    ctx.beginPath(); ctx.roundRect(-R*.42,-R*.08,R*.84,R*.13,R*.02); ctx.fill();
    ctx.strokeStyle=fl?'#888':'#885500'; ctx.lineWidth=1.5; ctx.strokeRect(-R*.42,-R*.08,R*.84,R*.13);
    // 손잡이
    ctx.strokeStyle=fl?'#555':'#220e00'; ctx.lineWidth=R*.14; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,-R*.04); ctx.lineTo(0,R*.44); ctx.stroke();
    // 손잡이 감기
    ctx.strokeStyle=fl?'#888':gold+'88'; ctx.lineWidth=2.5;
    for(let k=0;k<3;k++){ ctx.beginPath(); ctx.moveTo(-R*.07,R*.08+k*R*.12); ctx.lineTo(R*.07,R*.08+k*R*.12); ctx.stroke(); }
    // 폼멜
    ctx.fillStyle=fl?'#aaa':edge; ctx.beginPath(); ctx.ellipse(0,R*.46,R*.14,R*.1,0,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();

    // 목
    ctx.fillStyle=skin; ctx.beginPath(); ctx.roundRect(-R*.15,-R*.78,R*.3,R*.2,R*.04); ctx.fill();

    // 투구 (그레이트 헬름 스타일)
    const hg=ctx.createLinearGradient(-R*.46,-R*1.6,R*.38,-R*.58);
    hg.addColorStop(0,bright); hg.addColorStop(.38,mid); hg.addColorStop(.8,steel); hg.addColorStop(1,'#050f22');
    ctx.beginPath(); ctx.ellipse(0,-R*1.04,R*.44,R*.5,0,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=edge+'cc'; ctx.lineWidth=2.5; ctx.stroke();

    // 투구 날개 크레스트 (큰!)
    if(!fl){
      ctx.shadowBlur=22; ctx.shadowColor=edge;
      // 가운데 핀
      const cr=ctx.createLinearGradient(0,-R*1.45,0,-R*2.0);
      cr.addColorStop(0,edge); cr.addColorStop(1,edge+'00');
      ctx.beginPath(); ctx.moveTo(-R*.1,-R*1.42); ctx.lineTo(0,-R*2.04); ctx.lineTo(R*.1,-R*1.42);
      ctx.fillStyle=cr; ctx.fill();
      // 양쪽 깃털 날개
      for(let s of[-1,1]){
        ctx.save(); ctx.scale(s,1);
        ctx.fillStyle=edge+'66';
        ctx.beginPath(); ctx.moveTo(R*.08,-R*1.44); ctx.lineTo(R*.28,-R*1.75); ctx.lineTo(R*.12,-R*1.42); ctx.fill();
        ctx.beginPath(); ctx.moveTo(R*.2,-R*1.4); ctx.lineTo(R*.42,-R*1.65); ctx.lineTo(R*.24,-R*1.38); ctx.fill();
        ctx.restore();
      }
      ctx.shadowBlur=0;
    }

    // 눈 바이저 슬릿 (T형)
    ctx.fillStyle='#000812'; ctx.beginPath(); ctx.roundRect(-R*.38,-R*1.15,R*.76,R*.13,R*.03); ctx.fill();
    ctx.fillStyle='#000812'; ctx.beginPath(); ctx.roundRect(-R*.04,-R*1.22,R*.08,R*.22,R*.02); ctx.fill();
    if(!fl){
      ctx.shadowBlur=24; ctx.shadowColor=edge;
      ctx.fillStyle=edge;
      ctx.beginPath(); ctx.ellipse(-R*.16,-R*1.1,R*.12,R*.085,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( R*.16,-R*1.1,R*.12,R*.085,0,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }

    // 투구 금테
    ctx.strokeStyle=fl?'#888':gold; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,-R*1.04,R*.38,Math.PI*.82,Math.PI*.18,true); ctx.stroke();
    // 귀 보호대
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.beginPath(); ctx.ellipse(R*.42,-R*1.04,R*.12,R*.18,.2,0,Math.PI*2);
      ctx.fillStyle=mid; ctx.fill(); ctx.strokeStyle=edge+'88'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.restore();
    }
  }

  // ══ P2: VOID OVERLORD — 심연 군주 ════════════════
  _drawFireWarlock(ctx,R,fl){
    const T=Date.now()*.004;
    const c=fl?'#fff':'#ff6b35', gw=fl?'#fff':this.glow;
    const void_='#0d0008', dark='#200410', blood='#500818', ember='#8a1a04';
    const lava='#ff4400', fire='#ff6b35', gold='#cc8800', bone='#d4c898', skin='#c07050';

    // 지옥 오라 (회전 화염)
    if(!fl){
      ctx.save();
      const gr=ctx.createRadialGradient(0,0,R*.3,0,0,R*2.5);
      gr.addColorStop(0,'rgba(255,60,0,.14)'); gr.addColorStop(.5,'rgba(180,20,0,.06)'); gr.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,0,R*2.5,0,Math.PI*2); ctx.fillStyle=gr; ctx.fill();
      // 불꽃 파티클 궤도
      for(let k=0;k<8;k++){
        const a=-T*2.2+k*.785, r=R*(1.2+Math.sin(T*3+k)*.4);
        ctx.shadowBlur=12; ctx.shadowColor=lava;
        ctx.fillStyle=k%2?fire+'66':lava+'44';
        ctx.beginPath(); ctx.arc(Math.cos(a)*r,Math.sin(a)*r,2.5+Math.cos(T*4+k)*1,0,Math.PI*2); ctx.fill();
      }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 어둠 망토 (넓은)
    const cg=ctx.createLinearGradient(0,-R*.5,0,R*1.5);
    cg.addColorStop(0,'#1a0408ee'); cg.addColorStop(.45,'#110208dd'); cg.addColorStop(1,'#0a0204aa');
    ctx.beginPath();
    ctx.moveTo(-R*.24,-R*.52);
    ctx.bezierCurveTo(-R*1.08,R*.08,-R*1.18,R*1.05,-R*.72,R*1.38);
    ctx.lineTo(R*.72,R*1.38); ctx.bezierCurveTo(R*1.18,R*1.05,R*1.08,R*.08,R*.24,-R*.52);
    ctx.fillStyle=cg; ctx.fill();
    if(!fl){ ctx.strokeStyle=lava+'22'; ctx.lineWidth=1.5; ctx.stroke(); }

    // 망토 화염 엣지
    if(!fl){
      ctx.save(); ctx.shadowBlur=14; ctx.shadowColor=lava;
      ctx.strokeStyle=lava+'55'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-R*.72,R*1.38); ctx.bezierCurveTo(-R*1.18,R*1.05,-R*1.08,R*.08,-R*.24,-R*.52); ctx.stroke();
      ctx.restore();
    }

    // 다리 갑옷 (어두운 중판)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      const lg=ctx.createLinearGradient(R*.06,R*.28,R*.5,R*.3);
      lg.addColorStop(0,blood); lg.addColorStop(.5,ember); lg.addColorStop(1,dark);
      ctx.beginPath(); ctx.roundRect(R*.06,R*.28,R*.42,R*.56,R*.07);
      ctx.fillStyle=lg; ctx.fill(); ctx.strokeStyle=lava+'66'; ctx.lineWidth=2; ctx.stroke();
      // 무릎 (용암 보석)
      ctx.shadowBlur=fl?0:20; ctx.shadowColor=lava;
      ctx.fillStyle=fl?'#666':blood; ctx.beginPath(); ctx.ellipse(R*.28,R*.82,R*.24,R*.19,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=fl?'#555':lava; ctx.lineWidth=2; ctx.stroke();
      ctx.shadowBlur=0;
      ctx.beginPath(); ctx.roundRect(R*.09,R*.94,R*.36,R*.42,R*.05);
      ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=lava+'44'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.strokeStyle=blood+'88'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(R*.27,R*.96); ctx.lineTo(R*.27,R*1.32); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(R*.02,R*1.34,R*.54,R*.22,R*.04);
      ctx.fillStyle=void_; ctx.fill(); ctx.strokeStyle=lava+'55'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.restore();
    }

    // 허리
    ctx.fillStyle=void_; ctx.beginPath(); ctx.roundRect(-R*.56,R*.18,R*1.12,R*.16,R*.03); ctx.fill();
    ctx.strokeStyle=gold+'44'; ctx.lineWidth=1.5; ctx.strokeRect(-R*.56,R*.18,R*1.12,R*.16);
    ctx.fillStyle=fl?'#444':blood; ctx.beginPath(); ctx.roundRect(-R*.09,R*.19,R*.18,R*.14,R*.02); ctx.fill();

    // 흉갑 (어두운 용암 갑옷)
    const tg=ctx.createLinearGradient(-R*.58,-R*.62,R*.5,R*.22);
    tg.addColorStop(0,ember); tg.addColorStop(.3,blood); tg.addColorStop(.7,ember); tg.addColorStop(1,void_);
    ctx.beginPath();
    ctx.moveTo(-R*.56,-R*.28); ctx.lineTo(-R*.58,R*.2); ctx.lineTo(R*.58,R*.2); ctx.lineTo(R*.56,-R*.28);
    ctx.bezierCurveTo(R*.56,-R*.68,R*.32,-R*.82,0,-R*.82);
    ctx.bezierCurveTo(-R*.32,-R*.82,-R*.56,-R*.68,-R*.56,-R*.28);
    ctx.fillStyle=tg; ctx.fill(); ctx.strokeStyle=lava+'aa'; ctx.lineWidth=2.5; ctx.stroke();

    // 흉갑 균열 용암
    if(!fl){
      ctx.strokeStyle=lava+'55'; ctx.lineWidth=1.5;
      for(let k=-1;k<=1;k++) { ctx.beginPath(); ctx.moveTo(k*R*.22,-R*.72); ctx.lineTo(k*R*.22,R*.18); ctx.stroke(); }
    }

    // 흉갑 용암 코어 (맥동)
    if(!fl){
      const pulse=Math.sin(T*3.5)*.4+.6;
      ctx.shadowBlur=38+pulse*18; ctx.shadowColor=lava;
      const cg2=ctx.createRadialGradient(0,-R*.22,0,0,-R*.22,R*.28);
      cg2.addColorStop(0,'#fff8f0'); cg2.addColorStop(.2,lava); cg2.addColorStop(.6,lava+'44'); cg2.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,-R*.22,R*.28,0,Math.PI*2); ctx.fillStyle=cg2; ctx.fill();
      // 방사형 균열
      ctx.strokeStyle=lava+'88'; ctx.lineWidth=1.5;
      for(let k=0;k<6;k++){
        const a=k*Math.PI/3+T;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*.08,-R*.22+Math.sin(a)*R*.08); ctx.lineTo(Math.cos(a)*R*.26,-R*.22+Math.sin(a)*R*.26); ctx.stroke();
      }
      ctx.shadowBlur=0;
    }

    // 견갑 (뾰족한 악마 어깨)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      const sg=ctx.createLinearGradient(R*.38,-R*.65,R*.85,-R*.08);
      sg.addColorStop(0,ember); sg.addColorStop(.4,blood); sg.addColorStop(1,void_);
      ctx.beginPath();
      ctx.moveTo(R*.36,-R*.62); ctx.lineTo(R*.88,-R*.54); ctx.lineTo(R*.9,-R*.12); ctx.lineTo(R*.48,-R*.16); ctx.closePath();
      ctx.fillStyle=sg; ctx.fill(); ctx.strokeStyle=lava+'88'; ctx.lineWidth=2; ctx.stroke();
      // 어깨 스파이크 3개
      if(!fl){ ctx.shadowBlur=14; ctx.shadowColor=lava; }
      ctx.fillStyle=fl?'#555':bone;
      ctx.beginPath(); ctx.moveTo(R*.52,-R*.58); ctx.lineTo(R*.56,-R*.96); ctx.lineTo(R*.66,-R*.58); ctx.fill();
      ctx.beginPath(); ctx.moveTo(R*.7,-R*.54); ctx.lineTo(R*.78,-R*.88); ctx.lineTo(R*.86,-R*.54); ctx.fill();
      ctx.beginPath(); ctx.moveTo(R*.36,-R*.6); ctx.lineTo(R*.38,-R*.88); ctx.lineTo(R*.48,-R*.6); ctx.fill();
      ctx.shadowBlur=0;
      ctx.restore();
    }

    // 왼팔
    ctx.strokeStyle=blood; ctx.lineWidth=R*.26; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-R*.58,-R*.26); ctx.lineTo(-R*.88,R*.22); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-R*.72,R*.02,R*.22,R*.16,-.4,0,Math.PI*2);
    ctx.fillStyle=ember; ctx.fill(); ctx.strokeStyle=lava+'66'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-R*.9,R*.26,R*.2,R*.15,-.5,0,Math.PI*2);
    ctx.fillStyle=blood; ctx.fill(); ctx.strokeStyle=lava+'88'; ctx.lineWidth=2; ctx.stroke();
    for(let k=0;k<3;k++){
      const a=-.5+k*.3;
      ctx.fillStyle=ember; ctx.beginPath(); ctx.arc(Math.cos(a)*R*.2-R*.9,Math.sin(a)*R*.2+R*.26,R*.055,0,Math.PI*2); ctx.fill();
    }

    // 오른팔
    ctx.strokeStyle=blood; ctx.lineWidth=R*.24; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(R*.58,-R*.26); ctx.lineTo(R*.82,R*.18); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(R*.68,-R*.04,R*.2,R*.15,-.3,0,Math.PI*2);
    ctx.fillStyle=ember; ctx.fill(); ctx.strokeStyle=lava+'66'; ctx.lineWidth=1.5; ctx.stroke();

    // 대형 사신 낫 (길고 위협적인)
    ctx.save(); ctx.translate(R*.84,R*.3); ctx.rotate(.2);
    // 자루 (긴 뼈 스태프)
    ctx.strokeStyle=fl?'#333':'#0a0205'; ctx.lineWidth=6; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,R*.5); ctx.lineTo(0,-R*2.1); ctx.stroke();
    // 마디 장식
    for(let y of[R*.3,R*.0,-R*.5,-R*1.0,-R*1.5]){
      ctx.fillStyle=fl?'#555':blood; ctx.beginPath(); ctx.ellipse(0,y,R*.08,R*.05,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=fl?'#888':lava+'66'; ctx.lineWidth=1.5; ctx.stroke();
    }
    // 낫 날 (대형 곡선)
    if(!fl){ ctx.shadowBlur=44; ctx.shadowColor=lava; }
    const blade=ctx.createLinearGradient(0,-R*2.0,R*.9,-R*.9);
    blade.addColorStop(0,fl?'#ccc':lava+'ee'); blade.addColorStop(.35,fl?'#eee':fire); blade.addColorStop(.7,fl?'#aaa':'#ff220066'); blade.addColorStop(1,'transparent');
    ctx.beginPath();
    ctx.moveTo(0,-R*2.1);
    ctx.bezierCurveTo(R*.6,-R*2.55,R*1.25,-R*2.15,R*1.15,-R*1.45);
    ctx.bezierCurveTo(R*1.05,-R*.95, R*.5,-R*.8, 0,-R*1.1);
    ctx.bezierCurveTo(-R*.1,-R*1.3,-R*.08,-R*1.8,0,-R*2.1);
    ctx.fillStyle=blade; ctx.fill();
    // 날 엣지 라인 (날카로운)
    ctx.strokeStyle=fl?'#eee':lava+'ee'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(0,-R*2.1); ctx.bezierCurveTo(R*.6,-R*2.55,R*1.25,-R*2.15,R*1.15,-R*1.45); ctx.stroke();
    // 반사광
    if(!fl){
      ctx.strokeStyle='#ffffff55'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(R*.12,-R*2.05); ctx.bezierCurveTo(R*.58,-R*2.4,R*1.0,-R*2.08,R*.96,-R*1.58); ctx.stroke();
    }
    ctx.shadowBlur=0;
    // 낫 등날 (작은)
    ctx.fillStyle=fl?'#aaa':bone;
    ctx.beginPath(); ctx.moveTo(0,-R*2.1); ctx.lineTo(-R*.18,-R*2.0); ctx.lineTo(-R*.12,-R*1.9); ctx.lineTo(0,-R*1.95); ctx.fill();
    // 폼멜 해골
    ctx.shadowBlur=fl?0:12; ctx.shadowColor=lava;
    ctx.fillStyle=fl?'#888':bone; ctx.beginPath(); ctx.arc(0,R*.55,R*.12,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();

    // 목
    ctx.fillStyle=skin; ctx.beginPath(); ctx.roundRect(-R*.15,-R*.78,R*.3,R*.2,R*.04); ctx.fill();

    // 악마 투구 (거대)
    const hg=ctx.createLinearGradient(-R*.48,-R*1.6,R*.4,-R*.58);
    hg.addColorStop(0,ember); hg.addColorStop(.38,blood); hg.addColorStop(.8,void_); hg.addColorStop(1,'#0a0002');
    ctx.beginPath(); ctx.ellipse(0,-R*1.04,R*.46,R*.52,0,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=lava+'88'; ctx.lineWidth=2.5; ctx.stroke();

    // 악마 뿔 (2쌍 — 작은+큰)
    if(!fl){ ctx.shadowBlur=18; ctx.shadowColor=lava; }
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.fillStyle=fl?'#666':bone;
      // 안쪽 뾰족 뿔
      ctx.beginPath(); ctx.moveTo(R*.16,-R*1.38); ctx.lineTo(R*.08,-R*1.72); ctx.lineTo(R*.26,-R*1.38); ctx.fill();
      // 바깥쪽 굽어진 큰 뿔
      ctx.beginPath();
      ctx.moveTo(R*.3,-R*1.3);
      ctx.bezierCurveTo(R*.5,-R*1.45,R*.65,-R*1.72,R*.48,-R*1.9);
      ctx.bezierCurveTo(R*.6,-R*1.72,R*.52,-R*1.44,R*.42,-R*1.3);
      ctx.fill();
      // 뿔 끝 불꽃
      if(!fl){
        ctx.fillStyle=lava+'99';
        ctx.beginPath(); ctx.arc(R*.48,-R*1.9,R*.05,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.shadowBlur=0;

    // 눈 바이저 (타오르는 붉은 눈)
    ctx.fillStyle='#050002'; ctx.beginPath(); ctx.roundRect(-R*.38,-R*1.15,R*.76,R*.13,R*.03); ctx.fill();
    ctx.fillStyle='#050002'; ctx.beginPath(); ctx.roundRect(-R*.04,-R*1.22,R*.08,R*.22,R*.02); ctx.fill();
    if(!fl){
      ctx.shadowBlur=26; ctx.shadowColor=lava;
      ctx.fillStyle=lava;
      ctx.beginPath(); ctx.ellipse(-R*.16,-R*1.1,R*.12,R*.085,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( R*.16,-R*1.1,R*.12,R*.085,0,0,Math.PI*2); ctx.fill();
      // 눈 내부 밝은 코어
      ctx.fillStyle='#ffcc88';
      ctx.beginPath(); ctx.ellipse(-R*.16,-R*1.1,R*.06,R*.04,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( R*.16,-R*1.1,R*.06,R*.04,0,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }

    // 투구 금속 디테일
    ctx.strokeStyle=fl?'#666':gold+'66'; ctx.lineWidth=1.8;
    ctx.beginPath(); ctx.arc(0,-R*1.04,R*.4,Math.PI*.82,Math.PI*.18,true); ctx.stroke();
    // 얼굴 마스크 수직선
    ctx.strokeStyle=fl?'#444':blood+'88'; ctx.lineWidth=1.2;
    for(let k=-2;k<=2;k++){
      ctx.beginPath(); ctx.moveTo(k*R*.12,-R*1.2); ctx.lineTo(k*R*.12,-R*.92); ctx.stroke();
    }
    // 귀 보호대
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.beginPath(); ctx.ellipse(R*.44,-R*1.04,R*.12,R*.18,.2,0,Math.PI*2);
      ctx.fillStyle=blood; ctx.fill(); ctx.strokeStyle=lava+'66'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.restore();
    }
  }

  // ══ DRAKE — 번개 드래곤 ════════════════
  _drawDrake(ctx,R,fl){
    const T=Date.now()*.003;
    const bolt=fl?'#ccc':'#4af0ff', dk='#001028', scale_='#002855', bright='#1a6aaa';

    if(!fl){
      ctx.save();
      for(let k=0;k<3;k++){
        const a=T*2.2+k*2.09, r=R*(1.6+k*.25);
        ctx.shadowBlur=16; ctx.shadowColor=bolt;
        ctx.strokeStyle=bolt+['55','33','22'][k]; ctx.lineWidth=2-k*.4;
        ctx.beginPath(); ctx.arc(0,0,r,a,a+Math.PI*1.0); ctx.stroke();
      }
      for(let k=0;k<7;k++){
        const a=T*4+k*.9, r=R*(1.0+Math.sin(T*5+k)*.3);
        ctx.fillStyle=bolt+'55'; ctx.shadowBlur=8;
        ctx.beginPath(); ctx.arc(Math.cos(a)*r,Math.sin(a)*r,2.5,0,Math.PI*2); ctx.fill();
      }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 날개 (거대)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      const wg=ctx.createLinearGradient(0,0,R*2.8,-R*.5);
      wg.addColorStop(0,scale_+'ff'); wg.addColorStop(.5,dk+'cc'); wg.addColorStop(1,'transparent');
      ctx.beginPath();
      ctx.moveTo(R*.18,-R*.1);
      ctx.bezierCurveTo(R*.7,-R*1.2,R*1.9,-R*1.6,R*2.8,-R*.95);
      ctx.bezierCurveTo(R*2.55,-R*.38,R*2.0,R*.18,R*1.25,R*.55);
      ctx.bezierCurveTo(R*.75,R*.7,R*.28,R*.44,R*.12,R*.2);
      ctx.fillStyle=wg; ctx.fill();
      // 날개 갈비뼈
      if(!fl){ ctx.shadowBlur=10; ctx.shadowColor=bolt; }
      ctx.strokeStyle=fl?'#666':bolt+'66'; ctx.lineWidth=1.8;
      for(let k=0;k<4;k++){
        const t=k/3;
        ctx.beginPath(); ctx.moveTo(R*.18,-R*.1); ctx.lineTo(R*(2.8-t*1.2),-R*(.95-t*.3)); ctx.stroke();
      }
      // 날개 막
      ctx.strokeStyle=fl?'#333':bolt+'22'; ctx.lineWidth=1;
      for(let k=1;k<4;k++){
        const t=k/4;
        ctx.beginPath(); ctx.moveTo(R*(2.8-t*1.2),-R*(.95-t*.3)); ctx.lineTo(R*(1.25-t*.7),R*(.55-t*.1)); ctx.stroke();
      }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 꼬리
    if(!fl){
      const tg=ctx.createLinearGradient(-R*2.4,0,-R*.3,0);
      tg.addColorStop(0,'transparent'); tg.addColorStop(1,scale_+'bb');
      ctx.beginPath(); ctx.moveTo(-R*.5,R*.08); ctx.bezierCurveTo(-R*1.1,R*.55,-R*2.0,R*.35,-R*2.2,-R*.25); ctx.bezierCurveTo(-R*2.4,-R*.7,-R*1.85,-R*1.1,-R*1.35,-R*.62);
      ctx.strokeStyle=tg; ctx.lineWidth=R*.22; ctx.lineCap='round'; ctx.stroke();
      ctx.shadowBlur=14; ctx.shadowColor=bolt; ctx.strokeStyle=bolt+'88'; ctx.lineWidth=1.8;
      ctx.beginPath(); ctx.moveTo(-R*1.62,-.12*R); ctx.lineTo(-R*1.95,-R*.4); ctx.lineTo(-R*1.72,-R*.62); ctx.stroke();
      ctx.shadowBlur=0;
    }

    // 뒷다리
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.beginPath(); ctx.moveTo(R*.12,R*.42); ctx.lineTo(-R*.06,R*1.08); ctx.lineTo(R*.3,R*1.22); ctx.lineTo(R*.45,R*.6);
      ctx.fillStyle=scale_+'cc'; ctx.fill(); ctx.strokeStyle=bright+'66'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.shadowBlur=fl?0:12; ctx.shadowColor=bolt; ctx.strokeStyle=fl?'#aaa':bolt; ctx.lineWidth=2.5; ctx.lineCap='round';
      for(let k=-1;k<=1;k++){ ctx.beginPath(); ctx.moveTo(R*(.16+k*.1),R*1.15); ctx.lineTo(R*(.1+k*.16),R*1.42); ctx.stroke(); }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 몸통 (비늘 질감)
    const bg=ctx.createRadialGradient(-R*.12,-R*.04,R*.05,-R*.12,-R*.04,R*1.08);
    bg.addColorStop(0,scale_); bg.addColorStop(.5,dk); bg.addColorStop(1,'#000810');
    ctx.beginPath(); ctx.ellipse(0,R*.08,R*.84,R*.58,-0.05,0,Math.PI*2);
    ctx.fillStyle=bg; ctx.fill(); ctx.strokeStyle=bright+'bb'; ctx.lineWidth=2.5; ctx.stroke();
    // 비늘 패턴
    if(!fl){
      ctx.strokeStyle=bolt+'28'; ctx.lineWidth=1.2;
      for(let k=0;k<6;k++){ ctx.beginPath(); ctx.arc(-R*.52+k*R*.22,R*.14,R*.12,Math.PI,Math.PI*2); ctx.stroke(); }
    }

    // 앞발
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.beginPath(); ctx.moveTo(R*.52,-R*.12); ctx.lineTo(R*.92,R*.44); ctx.lineTo(R*.68,R*.58);
      ctx.fillStyle=scale_; ctx.fill(); ctx.strokeStyle=bright+'88'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.shadowBlur=fl?0:16; ctx.shadowColor=bolt; ctx.strokeStyle=fl?'#aaa':bolt; ctx.lineWidth=2.5; ctx.lineCap='round';
      for(let k=-1;k<=1;k++){ ctx.beginPath(); ctx.moveTo(R*(.74+k*.1),R*.5); ctx.lineTo(R*(.8+k*.16),R*.76); ctx.stroke(); }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 목
    ctx.beginPath(); ctx.moveTo(-R*.1,-R*.3); ctx.lineTo(R*.24,-R*.82); ctx.lineTo(R*.52,-R*.68); ctx.lineTo(R*.22,-R*.18);
    ctx.fillStyle=scale_+'cc'; ctx.fill(); ctx.strokeStyle=bright+'88'; ctx.lineWidth=1.5; ctx.stroke();

    // 등 가시
    if(!fl){
      ctx.shadowBlur=22; ctx.shadowColor=bolt;
      for(let k=0;k<6;k++){
        const px=-R*.44+k*R*.2, py=-R*.44-Math.sin(k*.5)*.12*R;
        ctx.fillStyle=bolt;
        ctx.beginPath(); ctx.moveTo(px-R*.05,py); ctx.lineTo(px,py-R*.38); ctx.lineTo(px+R*.05,py); ctx.fill();
      }
      ctx.shadowBlur=0;
    }

    // 머리
    const hg=ctx.createRadialGradient(R*.42,-R*1.02,0,R*.42,-R*1.02,R*.5);
    hg.addColorStop(0,bright); hg.addColorStop(.5,scale_); hg.addColorStop(1,dk);
    ctx.beginPath(); ctx.ellipse(R*.44,-R*1.02,R*.46,R*.33,0.28,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=bright+'cc'; ctx.lineWidth=2.5; ctx.stroke();
    // 뿔
    if(!fl){ ctx.shadowBlur=28; ctx.shadowColor=bolt; }
    ctx.fillStyle=fl?'#aaa':bolt;
    ctx.beginPath(); ctx.moveTo(R*.28,-R*1.22); ctx.lineTo(R*.12,-R*1.65); ctx.lineTo(R*.38,-R*1.24); ctx.fill();
    ctx.beginPath(); ctx.moveTo(R*.52,-R*1.24); ctx.lineTo(R*.62,-R*1.72); ctx.lineTo(R*.68,-R*1.24); ctx.fill();
    ctx.shadowBlur=0;
    // 눈
    ctx.shadowBlur=fl?0:32; ctx.shadowColor=bolt;
    ctx.fillStyle=fl?'#fff':bolt; ctx.beginPath(); ctx.ellipse(R*.6,-R*1.06,R*.11,R*.13,0.1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#001122'; ctx.beginPath(); ctx.arc(R*.6,-R*1.06,R*.055,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffffffaa'; ctx.beginPath(); ctx.arc(R*.64,-R*1.1,R*.028,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // 번개 방출
    if(!fl){
      ctx.shadowBlur=34; ctx.shadowColor=bolt; ctx.strokeStyle=bolt; ctx.lineWidth=2.8; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(R*.82,-R*.92); ctx.lineTo(R*1.08,-R*.86); ctx.lineTo(R*.98,-R*.76); ctx.lineTo(R*1.26,-R*.7); ctx.stroke();
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(R*.82,-R*.92); ctx.lineTo(R*1.04,-R*.86); ctx.stroke();
      ctx.shadowBlur=0;
    }
    // 이빨
    ctx.fillStyle=fl?'#ccc':'#c8e8ff';
    for(let k=0;k<4;k++){ ctx.beginPath(); ctx.moveTo(R*(.2+k*.12),-R*.78); ctx.lineTo(R*(.26+k*.12),-R*.62); ctx.lineTo(R*(.32+k*.12),-R*.78); ctx.fill(); }
  }

  // ══ SPECTER — 망령 기사 ════════════════
  _drawSpecter(ctx,R,fl){
    const T=Date.now()*.003;
    const soul=fl?'#ccc':'#aa88ff', dim='#1a0832', mid='#2a1258', spirit='#5522aa', glow_='#8844ff';

    // 영혼 오라 (흔들림)
    if(!fl){
      const waver=Math.sin(T*2.5)*.06;
      for(let k=0;k<4;k++){
        const ag=ctx.createRadialGradient(0,0,R*(0.4+k*.3),0,0,R*(1.1+k*.4));
        ag.addColorStop(0,'transparent'); ag.addColorStop(.6,soul+['18','12','0c','06'][k]); ag.addColorStop(1,'transparent');
        ctx.beginPath(); ctx.arc(waver*R*k,0,R*(1.1+k*.4),0,Math.PI*2); ctx.fillStyle=ag; ctx.fill();
      }
    }

    // 유령 망토 (흔들림 효과)
    const waveBase=Math.sin(T*2)*.04*R;
    const cloak=ctx.createLinearGradient(0,-R*.4,0,R*1.6);
    cloak.addColorStop(0,dim+'ee'); cloak.addColorStop(.5,mid+'cc'); cloak.addColorStop(1,'transparent');
    ctx.beginPath();
    ctx.moveTo(-R*.2,-R*.45+waveBase);
    ctx.bezierCurveTo(-R*.95,R*.12,-R*1.05,R*1.1,-R*.6,R*1.5+waveBase*.5);
    ctx.bezierCurveTo(-R*.2,R*1.8+waveBase,R*.2,R*1.8-waveBase,R*.6,R*1.5-waveBase*.5);
    ctx.bezierCurveTo(R*1.05,R*1.1,R*.95,R*.12,R*.2,-R*.45-waveBase);
    ctx.fillStyle=cloak; ctx.fill();
    if(!fl){ ctx.strokeStyle=soul+'44'; ctx.lineWidth=1.5; ctx.stroke(); }

    // 망토 빛 엣지
    if(!fl){
      ctx.save(); ctx.shadowBlur=18; ctx.shadowColor=soul;
      ctx.strokeStyle=soul+'55'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-R*.6,R*1.5); ctx.bezierCurveTo(-R*1.05,R*1.1,-R*.95,R*.12,-R*.2,-R*.45); ctx.stroke();
      ctx.restore();
    }

    // 갑옷 흉갑
    const tg=ctx.createLinearGradient(-R*.46,-R*.68,R*.4,R*.2);
    tg.addColorStop(0,spirit); tg.addColorStop(.4,mid); tg.addColorStop(1,dim);
    ctx.beginPath();
    ctx.moveTo(-R*.44,-R*.3); ctx.lineTo(-R*.46,R*.22); ctx.lineTo(R*.46,R*.22); ctx.lineTo(R*.44,-R*.3);
    ctx.bezierCurveTo(R*.44,-R*.62,R*.26,-R*.74,0,-R*.74);
    ctx.bezierCurveTo(-R*.26,-R*.74,-R*.44,-R*.62,-R*.44,-R*.3);
    ctx.fillStyle=tg; ctx.fill(); ctx.strokeStyle=soul+'66'; ctx.lineWidth=2; ctx.stroke();

    // 흉갑 문양 (해골 / 심연 기호)
    if(!fl){
      ctx.shadowBlur=22; ctx.shadowColor=soul;
      ctx.fillStyle=soul+'88';
      ctx.beginPath(); ctx.ellipse(-R*.12,-R*.22,R*.09,R*.08,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( R*.12,-R*.22,R*.09,R*.08,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=soul+'66'; ctx.lineWidth=1.8;
      ctx.beginPath(); ctx.moveTo(-R*.16,-R*.1); ctx.lineTo(-R*.04,-R*.04); ctx.lineTo(R*.04,-R*.04); ctx.lineTo(R*.16,-R*.1); ctx.stroke();
      ctx.shadowBlur=0;
    }

    // 어깨 뾰족 스파이크
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      const sg=ctx.createLinearGradient(R*.36,-R*.56,R*.72,-R*.1);
      sg.addColorStop(0,spirit); sg.addColorStop(1,dim);
      ctx.beginPath(); ctx.ellipse(R*.54,-R*.32,R*.3,R*.24,-.22,0,Math.PI*2);
      ctx.fillStyle=sg; ctx.fill(); ctx.strokeStyle=soul+'55'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle=fl?'#777':soul+'cc'; ctx.shadowBlur=fl?0:12; ctx.shadowColor=soul;
      ctx.beginPath(); ctx.moveTo(R*.44,-R*.5); ctx.lineTo(R*.38,-R*.82); ctx.lineTo(R*.54,-R*.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(R*.6,-R*.46); ctx.lineTo(R*.6,-R*.76); ctx.lineTo(R*.72,-R*.46); ctx.fill();
      ctx.shadowBlur=0; ctx.restore();
    }

    // 팔 (유령처럼 반투명)
    ctx.strokeStyle=mid+'bb'; ctx.lineWidth=R*.22; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-R*.44,-R*.22); ctx.lineTo(-R*.78,R*.3); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-R*.86,R*.28,R*.18,R*.14,-.5,0,Math.PI*2);
    ctx.fillStyle=mid+'bb'; ctx.fill(); ctx.strokeStyle=soul+'44'; ctx.lineWidth=1.5; ctx.stroke();

    // 오른팔 + 검 (대형 투핸드 소드)
    ctx.strokeStyle=mid+'bb'; ctx.lineWidth=R*.22; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(R*.44,-R*.22); ctx.lineTo(R*.78,R*.3); ctx.stroke();
    ctx.save(); ctx.translate(R*.82,R*.32); ctx.rotate(-.12);
    if(!fl){ ctx.shadowBlur=38; ctx.shadowColor=soul; }
    const bg=ctx.createLinearGradient(-R*.12,R*.24,0,-R*2.2);
    bg.addColorStop(0,'#110022'); bg.addColorStop(.32,soul+'cc'); bg.addColorStop(.65,'#ddeeff'); bg.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.moveTo(-R*.12,R*.28); ctx.lineTo(-R*.16,-R*1.0); ctx.lineTo(0,-R*2.2); ctx.lineTo(R*.16,-R*1.0); ctx.lineTo(R*.12,R*.28); ctx.fillStyle=bg; ctx.fill();
    ctx.strokeStyle='#ccaaffcc'; ctx.lineWidth=2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-R*.05,-R*.04); ctx.lineTo(-R*.08,-R*1.72); ctx.stroke();
    ctx.fillStyle=fl?'#888':soul+'dd'; ctx.beginPath(); ctx.roundRect(-R*.38,-R*.06,R*.76,R*.12,R*.02); ctx.fill();
    ctx.strokeStyle=fl?'#555':'#220044'; ctx.lineWidth=R*.12; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(0,-R*.04); ctx.lineTo(0,R*.38); ctx.stroke();
    ctx.shadowBlur=0; ctx.restore();

    // 머리 (해골 투구)
    const hg=ctx.createRadialGradient(0,-R*.92,0,0,-R*.92,R*.44);
    hg.addColorStop(0,spirit); hg.addColorStop(.6,mid); hg.addColorStop(1,dim);
    ctx.beginPath(); ctx.ellipse(0,-R*.92,R*.34,R*.42,0,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=soul+'55'; ctx.lineWidth=1.8; ctx.stroke();
    // 빈 눈 (영혼의 불꽃)
    ctx.shadowBlur=fl?0:30; ctx.shadowColor=soul;
    ctx.fillStyle=fl?'#ddd':soul;
    ctx.beginPath(); ctx.ellipse(-R*.12,-R*.96,R*.11,R*.1,-.1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( R*.12,-R*.96,R*.11,R*.1,.1,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle=dim+'dd';
    ctx.beginPath(); ctx.ellipse(-R*.12,-R*.96,R*.055,R*.052,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( R*.12,-R*.96,R*.055,R*.052,0,0,Math.PI*2); ctx.fill();
    // 뿔
    ctx.fillStyle=fl?'#999':spirit; ctx.shadowBlur=fl?0:14; ctx.shadowColor=soul;
    for(let s of[-1,1]){ ctx.save(); ctx.scale(s,1); ctx.beginPath(); ctx.moveTo(R*.18,-R*1.24); ctx.lineTo(R*.08,-R*1.6); ctx.lineTo(R*.28,-R*1.24); ctx.fill(); ctx.restore(); }
    ctx.shadowBlur=0;
    // 이빨
    ctx.fillStyle=fl?'#ccc':soul+'88';
    for(let k=0;k<4;k++){ ctx.beginPath(); ctx.rect(R*(-.16+k*.09),-R*.72,R*.06,R*.09); ctx.fill(); }
  }

  // ══ GOLEM — 고대 석신 (Ancient Stone God) ════════════════
  _drawGolem(ctx,R,fl){
    const T=Date.now()*.002;
    const stone='#1a2438', bright='#2a4488', crystal='#4488ff', accent='#88aaff', glow_=fl?'#ccc':this.glow;

    // 크리스탈 에너지 맥박
    if(!fl){
      ctx.shadowBlur=44; ctx.shadowColor=crystal;
      for(let k=0;k<4;k++){
        const a=T*.6+k*Math.PI*.5;
        ctx.strokeStyle=crystal+['2a','22','1a','12'][k]; ctx.lineWidth=2.5;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*R,Math.sin(a)*R); ctx.lineTo(Math.cos(a)*R*2.8+Math.sin(T*3)*.06*R,Math.sin(a)*R*2.8); ctx.stroke();
      }
      ctx.shadowBlur=0;
    }

    // 다리 (육중한 석판)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      const lg=ctx.createLinearGradient(R*.06,R*.3,R*.58,R*.85);
      lg.addColorStop(0,bright); lg.addColorStop(.5,stone); lg.addColorStop(1,'#080f1c');
      ctx.beginPath(); ctx.roundRect(R*.06,R*.28,R*.5,R*.62,R*.05); ctx.fillStyle=lg; ctx.fill(); ctx.strokeStyle=crystal+'66'; ctx.lineWidth=2.5; ctx.stroke();
      ctx.shadowBlur=fl?0:24; ctx.shadowColor=crystal;
      ctx.fillStyle=fl?'#888':crystal; ctx.beginPath(); ctx.arc(R*.3,R*.88,R*.15,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#000b1e'; ctx.beginPath(); ctx.arc(R*.3,R*.88,R*.075,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      ctx.beginPath(); ctx.roundRect(R*.08,R*.96,R*.4,R*.48,R*.04); ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=bright+'44'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(R*.02,R*1.4,R*.58,R*.22,R*.03); ctx.fillStyle=bright+'88'; ctx.fill(); ctx.strokeStyle=crystal+'55'; ctx.lineWidth=2; ctx.stroke();
      ctx.restore();
    }

    // 몸통 (거대한 각진 석상)
    const tg=ctx.createLinearGradient(-R*.68,-R*.78,R*.6,R*.42);
    tg.addColorStop(0,bright); tg.addColorStop(.32,stone); tg.addColorStop(.68,bright+'88'); tg.addColorStop(1,'#080e1a');
    ctx.beginPath();
    ctx.moveTo(-R*.64,-R*.4); ctx.lineTo(-R*.64,R*.34); ctx.lineTo(R*.64,R*.34); ctx.lineTo(R*.64,-R*.4);
    ctx.bezierCurveTo(R*.64,-R*.78,R*.36,-R*.94,0,-R*.94);
    ctx.bezierCurveTo(-R*.36,-R*.94,-R*.64,-R*.78,-R*.64,-R*.4);
    ctx.fillStyle=tg; ctx.fill(); ctx.strokeStyle=crystal+'bb'; ctx.lineWidth=3; ctx.stroke();
    // 갑옷 분절선
    ctx.strokeStyle=bright+'55'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-R*.62,-R*.1); ctx.lineTo(R*.62,-R*.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R*.6,R*.15); ctx.lineTo(R*.6,R*.15); ctx.stroke();

    // 가슴 마석 코어 (크게 빛나는)
    if(!fl){
      const pulse=Math.sin(T*4)*.35+.65;
      ctx.shadowBlur=50+pulse*25; ctx.shadowColor=crystal;
      const cg=ctx.createRadialGradient(0,-R*.24,0,0,-R*.24,R*.38);
      cg.addColorStop(0,'#ffffff'); cg.addColorStop(.18,crystal); cg.addColorStop(.6,crystal+'44'); cg.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,-R*.24,R*.38,0,Math.PI*2); ctx.fillStyle=cg; ctx.fill();
      for(let k=0;k<8;k++){
        const a=k*Math.PI*.25+T*.5, r1=R*.1, r2=R*.34;
        ctx.fillStyle=crystal+'66';
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*r1,-R*.24+Math.sin(a)*r1); ctx.lineTo(Math.cos(a+.35)*r2,-R*.24+Math.sin(a+.35)*r2); ctx.lineTo(Math.cos(a-.35)*r2,-R*.24+Math.sin(a-.35)*r2); ctx.closePath(); ctx.fill();
      }
      ctx.shadowBlur=0;
    }

    // 어깨 (거대 석판 — 바위처럼)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      const sg=ctx.createLinearGradient(R*.46,-R*.76,R*.98,-R*.1);
      sg.addColorStop(0,bright); sg.addColorStop(1,stone);
      ctx.beginPath(); ctx.moveTo(R*.46,-R*.74); ctx.lineTo(R*1.05,-R*.62); ctx.lineTo(R*1.02,-R*.12); ctx.lineTo(R*.52,-R*.18); ctx.closePath();
      ctx.fillStyle=sg; ctx.fill(); ctx.strokeStyle=crystal+'aa'; ctx.lineWidth=2.5; ctx.stroke();
      // 어깨 마석
      ctx.shadowBlur=fl?0:20; ctx.shadowColor=crystal;
      ctx.fillStyle=fl?'#888':crystal; ctx.beginPath(); ctx.arc(R*.75,-R*.44,R*.12,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#000812'; ctx.beginPath(); ctx.arc(R*.75,-R*.44,R*.06,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      ctx.restore();
    }

    // 팔 (석상 주먹)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.strokeStyle=stone; ctx.lineWidth=R*.32; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(R*.62,-R*.36); ctx.lineTo(R*.92,R*.32); ctx.stroke();
      ctx.strokeStyle=crystal+'44'; ctx.lineWidth=1.5; ctx.stroke();
      // 주먹
      ctx.fillStyle=bright; ctx.beginPath(); ctx.roundRect(R*.82,R*.26,R*.32,R*.3,R*.06); ctx.fill();
      ctx.strokeStyle=crystal+'88'; ctx.lineWidth=2; ctx.stroke();
      // 너클 라인
      ctx.strokeStyle=crystal+'55'; ctx.lineWidth=1.5;
      for(let k=0;k<3;k++){ ctx.beginPath(); ctx.moveTo(R*.84,R*(.28+k*.1)); ctx.lineTo(R*1.12,R*(.28+k*.1)); ctx.stroke(); }
      ctx.restore();
    }

    // 머리 (거대 각진 석상 머리)
    const hg=ctx.createRadialGradient(0,-R*1.12,0,0,-R*1.12,R*.56);
    hg.addColorStop(0,bright); hg.addColorStop(.5,stone); hg.addColorStop(1,'#060c18');
    ctx.beginPath(); ctx.roundRect(-R*.44,-R*1.5,R*.88,R*.82,R*.1); ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=crystal+'88'; ctx.lineWidth=2.5; ctx.stroke();

    // 눈 (마석 빛)
    ctx.shadowBlur=fl?0:38; ctx.shadowColor=crystal;
    const eyeG=ctx.createRadialGradient(-R*.2,-R*1.2,0,-R*.2,-R*1.2,R*.18);
    eyeG.addColorStop(0,'#fff'); eyeG.addColorStop(.3,crystal); eyeG.addColorStop(1,'transparent');
    ctx.fillStyle=fl?'#888':eyeG; ctx.beginPath(); ctx.ellipse(-R*.2,-R*1.2,R*.18,R*.16,0,0,Math.PI*2); ctx.fill();
    const eyeG2=ctx.createRadialGradient(R*.2,-R*1.2,0,R*.2,-R*1.2,R*.18);
    eyeG2.addColorStop(0,'#fff'); eyeG2.addColorStop(.3,crystal); eyeG2.addColorStop(1,'transparent');
    ctx.fillStyle=fl?'#888':eyeG2; ctx.beginPath(); ctx.ellipse(R*.2,-R*1.2,R*.18,R*.16,0,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // 돌 이마 균열
    ctx.strokeStyle=bright+'66'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,-R*1.46); ctx.lineTo(R*.08,-R*1.28); ctx.lineTo(-R*.04,-R*1.18); ctx.stroke();

    // 머리 왕관 마석
    if(!fl){
      ctx.shadowBlur=24; ctx.shadowColor=crystal;
      for(let k=-2;k<=2;k++){
        ctx.fillStyle=crystal+(Math.abs(k)===0?'ff':'88');
        const h=R*(.14-Math.abs(k)*R*.015);
        ctx.beginPath(); ctx.rect(k*R*.16-R*.06,-R*1.5-h,R*.12,h); ctx.fill();
      }
      ctx.shadowBlur=0;
    }
  }

  // ══ WISP — 정령 마법사 (Arcane Elemental) ════════════════
  _drawWisp(ctx,R,fl){
    const T=Date.now()*.004;
    const mag=fl?'#ddd':'#ff88cc', core='#ff44aa', aura=fl?'#ccc':'#ff88cc', dark='#1a0812';

    // 정령 오라 (회전 마법진)
    if(!fl){
      for(let k=0;k<3;k++){
        const a=T*2.2+k*2.09, r=R*(1.4+k*.28);
        ctx.shadowBlur=14; ctx.shadowColor=mag;
        ctx.strokeStyle=mag+(k===0?'55':k===1?'33':'22'); ctx.lineWidth=1.8;
        ctx.beginPath(); ctx.arc(0,0,r,a,a+Math.PI*.9); ctx.stroke();
      }
      ctx.shadowBlur=0;
    }

    // 로브 (긴 마법사 로브)
    const rg=ctx.createLinearGradient(0,-R*.35,0,R*1.55);
    rg.addColorStop(0,'#1a0418ee'); rg.addColorStop(.4,'#120312dd'); rg.addColorStop(1,'transparent');
    ctx.beginPath();
    ctx.moveTo(-R*.18,-R*.38);
    ctx.bezierCurveTo(-R*.82,R*.12,-R*.88,R*1.08,-R*.5,R*1.52);
    ctx.lineTo(R*.5,R*1.52); ctx.bezierCurveTo(R*.88,R*1.08,R*.82,R*.12,R*.18,-R*.38);
    ctx.fillStyle=rg; ctx.fill();
    if(!fl){ ctx.strokeStyle=mag+'33'; ctx.lineWidth=1.2; ctx.stroke(); }

    // 몸통 (로브 내부)
    const tg=ctx.createLinearGradient(-R*.42,-R*.62,R*.38,R*.22);
    tg.addColorStop(0,'#330a2a'); tg.addColorStop(.4,'#220618'); tg.addColorStop(1,dark);
    ctx.beginPath(); ctx.ellipse(0,-R*.04,R*.4,R*.56,0,0,Math.PI*2); ctx.fillStyle=tg; ctx.fill();

    // 가슴 마법진 (발광)
    if(!fl){
      const pulse=Math.sin(T*4)*.3+.7;
      ctx.shadowBlur=32+pulse*18; ctx.shadowColor=core;
      const cg=ctx.createRadialGradient(0,-R*.12,0,0,-R*.12,R*.24);
      cg.addColorStop(0,'#fff'); cg.addColorStop(.22,core); cg.addColorStop(.6,mag+'55'); cg.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,-R*.12,R*.24,0,Math.PI*2); ctx.fillStyle=cg; ctx.fill();
      // 별 문양
      ctx.strokeStyle=mag+'aa'; ctx.lineWidth=1.5;
      for(let k=0;k<6;k++){
        const a=k*Math.PI/3+T; ctx.beginPath();
        ctx.moveTo(Math.cos(a)*R*.06,-R*.12+Math.sin(a)*R*.06); ctx.lineTo(Math.cos(a)*R*.22,-R*.12+Math.sin(a)*R*.22); ctx.stroke();
      }
      ctx.shadowBlur=0;
    }

    // 숄더 케이프
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      const sg=ctx.createLinearGradient(R*.28,-R*.54,R*.65,-R*.08);
      sg.addColorStop(0,'#330a2a'); sg.addColorStop(1,dark);
      ctx.beginPath(); ctx.ellipse(R*.48,-R*.3,R*.26,R*.2,-.25,0,Math.PI*2);
      ctx.fillStyle=sg; ctx.fill(); ctx.strokeStyle=mag+'44'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.restore();
    }

    // 스태프 (마법 지팡이)
    ctx.save(); ctx.translate(R*.55,R*.22); ctx.rotate(-.14);
    if(!fl){ ctx.shadowBlur=32; ctx.shadowColor=mag; }
    ctx.strokeStyle=fl?'#333':'#1a0228'; ctx.lineWidth=5; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(0,R*.5); ctx.lineTo(0,-R*2.2); ctx.stroke();
    // 마디
    for(let y of[R*.3,R*.0,-R*.5,-R*1.0,-R*1.5]){
      ctx.fillStyle=fl?'#444':'#440022'; ctx.beginPath(); ctx.ellipse(0,y,R*.08,R*.05,0,0,Math.PI*2); ctx.fill();
    }
    // 스태프 오브 (위 끝)
    const og=ctx.createRadialGradient(0,-R*2.22,0,0,-R*2.22,R*.32);
    og.addColorStop(0,'#fff'); og.addColorStop(.28,fl?'#aaa':mag); og.addColorStop(.7,fl?'#666':mag+'55'); og.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(0,-R*2.22,R*.32,0,Math.PI*2); ctx.fillStyle=og; ctx.fill();
    // 오브 궤도 링
    if(!fl){
      ctx.strokeStyle=mag+'66'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.ellipse(0,-R*2.22,R*.4,R*.16,T*.8,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0,-R*2.22,R*.4,R*.16,-T*.8,0,Math.PI*2); ctx.stroke();
    }
    ctx.shadowBlur=0; ctx.restore();

    // 왼손 (마법 시전)
    ctx.save(); ctx.translate(-R*.48,R*.22);
    if(!fl){ ctx.shadowBlur=22; ctx.shadowColor=mag; }
    const hg=ctx.createRadialGradient(0,0,0,0,0,R*.3);
    hg.addColorStop(0,'#fff'); hg.addColorStop(.28,fl?'#bbb':mag); hg.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(0,0,R*.3,0,Math.PI*2); ctx.fillStyle=hg; ctx.fill();
    ctx.shadowBlur=0; ctx.restore();

    // 머리 (마법사 두건)
    // 두건
    const hood=ctx.createLinearGradient(-R*.34,-R*1.6,R*.28,-R*.72);
    hood.addColorStop(0,'#220612'); hood.addColorStop(.5,'#1a040e'); hood.addColorStop(1,dark);
    ctx.beginPath(); ctx.ellipse(0,-R*1.02,R*.36,R*.44,0,0,Math.PI*2); ctx.fillStyle=hood; ctx.fill();
    ctx.strokeStyle=mag+'55'; ctx.lineWidth=1.8; ctx.stroke();
    // 얼굴 (피부)
    const face=ctx.createRadialGradient(0,-R*1.02,0,0,-R*1.02,R*.28);
    face.addColorStop(0,'#f0c0d8'); face.addColorStop(.6,'#c89ab8'); face.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.ellipse(0,-R*1.02,R*.24,R*.3,0,0,Math.PI*2); ctx.fillStyle=face; ctx.fill();
    // 눈
    ctx.shadowBlur=fl?0:24; ctx.shadowColor=mag;
    ctx.fillStyle=fl?'#ddd':mag;
    ctx.beginPath(); ctx.ellipse(-R*.1,-R*1.06,R*.08,R*.06,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( R*.1,-R*1.06,R*.08,R*.06,0,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // 두건 끝
    ctx.fillStyle='#220612'; ctx.beginPath(); ctx.moveTo(-R*.28,-R*1.38); ctx.lineTo(-R*.14,-R*1.72); ctx.lineTo(R*.14,-R*1.72); ctx.lineTo(R*.28,-R*1.38); ctx.fill();
    ctx.strokeStyle=mag+'44'; ctx.lineWidth=1.2; ctx.stroke();
  }

  // ══ PHOENIX — 불사조 (Firebird Reborn) ════════════════
  _drawPhoenix(ctx,R,fl){
    const T=Date.now()*.004;
    const fire='#ff6600', lava='#ff2200', gold='#ffaa00', bright='#ffcc44', dark='#1a0500';

    // 불꽃 오라
    if(!fl){
      for(let k=0;k<4;k++){
        const ag=ctx.createRadialGradient(0,0,R*(0.3+k*.28),0,0,R*(1.0+k*.38));
        ag.addColorStop(0,'transparent'); ag.addColorStop(.6,fire+['22','18','0e','08'][k]); ag.addColorStop(1,'transparent');
        ctx.beginPath(); ctx.arc(0,0,R*(1.0+k*.38),0,Math.PI*2); ctx.fillStyle=ag; ctx.fill();
      }
    }

    // 불꽃 날개 (거대)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      if(!fl){ ctx.shadowBlur=24; ctx.shadowColor=lava; }
      const wg=ctx.createLinearGradient(0,0,R*2.6,-R*.7);
      wg.addColorStop(0,fire+'cc'); wg.addColorStop(.4,lava+'88'); wg.addColorStop(1,'transparent');
      ctx.beginPath();
      ctx.moveTo(R*.22,-R*.12); ctx.bezierCurveTo(R*.65,-R*.9,R*1.7,-R*1.3,R*2.6,-R*.8);
      ctx.bezierCurveTo(R*2.38,-R*.3,R*1.72,R*.14,R*1.08,R*.46);
      ctx.bezierCurveTo(R*.62,R*.58,R*.26,R*.36,R*.16,R*.12);
      ctx.fillStyle=wg; ctx.fill();
      ctx.shadowBlur=0;
      // 화염 깃털 (날카로운)
      if(!fl){ ctx.shadowBlur=16; ctx.shadowColor=gold; }
      for(let k=0;k<6;k++){
        const t=k/5, wx=R*(.22+t*2.4), wy=R*(-.12-t*.68);
        ctx.fillStyle=fl?'#aaa':gold+'cc';
        ctx.beginPath(); ctx.moveTo(wx,wy); ctx.lineTo(wx+R*.12,wy-R*.42); ctx.lineTo(wx+R*.26,wy); ctx.fill();
      }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 꼬리 화염 (3중)
    if(!fl){
      for(let k=0;k<3;k++){
        const off=(k-1)*R*.18;
        const tg=ctx.createLinearGradient(-R*.38+off,R*.24,-R*2.0+off,R*1.0);
        tg.addColorStop(0,[lava,fire,gold][k]); tg.addColorStop(1,'transparent');
        ctx.beginPath(); ctx.moveTo(-R*.3+off,R*.24); ctx.bezierCurveTo(-R*.8+off,R*.66,-R*1.45+off+Math.sin(T*2.2)*.08*R,R*1.08,-R*1.92+off,R*1.48);
        ctx.strokeStyle=tg; ctx.lineWidth=R*(k===1?.24:.14); ctx.lineCap='round'; ctx.stroke();
      }
    }

    // 몸통 (불꽃 조류)
    const bg=ctx.createRadialGradient(0,-R*.1,0,0,-R*.1,R*.82);
    bg.addColorStop(0,gold); bg.addColorStop(.32,fire); bg.addColorStop(.72,dark); bg.addColorStop(1,'#180400');
    ctx.beginPath(); ctx.ellipse(0,R*.05,R*.64,R*.48,0,0,Math.PI*2);
    ctx.fillStyle=bg; ctx.fill(); ctx.strokeStyle=fire+'bb'; ctx.lineWidth=2.5; ctx.stroke();
    // 가슴 불꽃 코어
    if(!fl){
      ctx.shadowBlur=38; ctx.shadowColor=gold;
      const cg=ctx.createRadialGradient(0,-R*.06,0,0,-R*.06,R*.28);
      cg.addColorStop(0,'#fff'); cg.addColorStop(.25,gold); cg.addColorStop(.7,fire+'55'); cg.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,-R*.06,R*.28,0,Math.PI*2); ctx.fillStyle=cg; ctx.fill();
      ctx.shadowBlur=0;
    }

    // 다리 (새 발)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.beginPath(); ctx.moveTo(R*.16,R*.34); ctx.lineTo(R*.12,R*.82); ctx.lineTo(R*.38,R*.92); ctx.lineTo(R*.44,R*.5);
      ctx.fillStyle=dark+'cc'; ctx.fill(); ctx.strokeStyle=fire+'88'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.shadowBlur=fl?0:16; ctx.shadowColor=lava;
      ctx.strokeStyle=fl?'#aaa':lava; ctx.lineWidth=2.8; ctx.lineCap='round';
      for(let k=-1;k<=1;k++){ ctx.beginPath(); ctx.moveTo(R*(.22+k*.1),R*.86); ctx.lineTo(R*(.2+k*.16),R*1.14); ctx.stroke(); }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 목
    ctx.beginPath(); ctx.moveTo(-R*.1,-R*.28); ctx.lineTo(R*.18,-R*.78); ctx.lineTo(R*.48,-R*.62); ctx.lineTo(R*.2,-R*.16);
    ctx.fillStyle=fire+'cc'; ctx.fill(); ctx.strokeStyle=gold+'88'; ctx.lineWidth=1.5; ctx.stroke();

    // 머리 (불꽃 왕관)
    const hg=ctx.createRadialGradient(R*.38,-R*.98,0,R*.38,-R*.98,R*.44);
    hg.addColorStop(0,gold); hg.addColorStop(.38,fire); hg.addColorStop(1,dark);
    ctx.beginPath(); ctx.ellipse(R*.4,-R*.98,R*.4,R*.3,0.2,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=fire+'bb'; ctx.lineWidth=2; ctx.stroke();
    // 불꽃 왕관 (머리 위)
    if(!fl){
      ctx.shadowBlur=28; ctx.shadowColor=gold;
      for(let k=0;k<5;k++){
        const bx=R*(.1+k*.18), by=-R*1.18;
        ctx.fillStyle=fl?'#aaa':[gold,fire,gold,fire,gold][k];
        ctx.beginPath(); ctx.moveTo(bx-R*.06,by); ctx.lineTo(bx,by-R*(.24+Math.sin(k)*.1)); ctx.lineTo(bx+R*.06,by); ctx.fill();
      }
      ctx.shadowBlur=0;
    }
    // 눈 (황금 불꽃)
    ctx.shadowBlur=fl?0:28; ctx.shadowColor=gold;
    ctx.fillStyle=fl?'#fff':gold;
    ctx.beginPath(); ctx.ellipse(R*.54,-R*1.02,R*.11,R*.13,0.15,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1a0500'; ctx.beginPath(); ctx.arc(R*.54,-R*1.02,R*.055,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffffffaa'; ctx.beginPath(); ctx.arc(R*.58,-R*1.06,R*.028,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // 부리
    ctx.fillStyle=fl?'#aaa':gold; ctx.beginPath(); ctx.moveTo(R*.78,-R*.94); ctx.lineTo(R*1.02,-R*.98); ctx.lineTo(R*.78,-R*1.02); ctx.fill();
  }

  // ══ GOLIATH — 어비스 거인 (Abyss Colossus) ════════════════
  _drawGoliath(ctx,R,fl){
    const T=Date.now()*.002;
    const stone='#0a1018', bright='#1a3a5a', neon=fl?'#88ddff':'#44ff88', void_='#050c14';

    // 심연 에너지 오라 (강렬한)
    if(!fl){
      for(let k=0;k<5;k++){
        const r=R*(1.5+k*.3);
        const ag=ctx.createRadialGradient(0,0,r*.5,0,0,r);
        ag.addColorStop(0,'transparent'); ag.addColorStop(.7,neon+['14','10','0c','08','05'][k]); ag.addColorStop(1,'transparent');
        ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fillStyle=ag; ctx.fill();
      }
      // 균열 방전
      ctx.shadowBlur=22; ctx.shadowColor=neon;
      for(let k=0;k<6;k++){
        const a=T*1.5+k*1.047;
        ctx.strokeStyle=neon+'55'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*1.0,Math.sin(a)*R*1.0); ctx.lineTo(Math.cos(a)*R*2.6,Math.sin(a)*R*2.6); ctx.stroke();
      }
      ctx.shadowBlur=0;
    }

    // 다리 (거대한 육중)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      const lg=ctx.createLinearGradient(R*.06,R*.32,R*.62,R*.88);
      lg.addColorStop(0,bright); lg.addColorStop(.5,stone); lg.addColorStop(1,void_);
      ctx.beginPath(); ctx.roundRect(R*.06,R*.28,R*.56,R*.72,R*.06); ctx.fillStyle=lg; ctx.fill(); ctx.strokeStyle=neon+'55'; ctx.lineWidth=2.5; ctx.stroke();
      // 무릎 에너지 보석
      ctx.shadowBlur=fl?0:28; ctx.shadowColor=neon;
      ctx.fillStyle=fl?'#888':neon+'dd'; ctx.beginPath(); ctx.arc(R*.34,R*.94,R*.17,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=void_; ctx.beginPath(); ctx.arc(R*.34,R*.94,R*.085,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      ctx.beginPath(); ctx.roundRect(R*.08,R*1.04,R*.46,R*.58,R*.05); ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=bright+'55'; ctx.lineWidth=2; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(R*.02,R*1.58,R*.62,R*.26,R*.04); ctx.fillStyle=bright+'88'; ctx.fill(); ctx.strokeStyle=neon+'44'; ctx.lineWidth=2; ctx.stroke();
      ctx.restore();
    }

    // 초거대 몸통
    const tg=ctx.createLinearGradient(-R*.78,-R*.88,R*.72,R*.48);
    tg.addColorStop(0,bright); tg.addColorStop(.32,stone); tg.addColorStop(.68,bright+'55'); tg.addColorStop(1,void_);
    ctx.beginPath();
    ctx.moveTo(-R*.76,-R*.42); ctx.lineTo(-R*.78,R*.36); ctx.lineTo(R*.78,R*.36); ctx.lineTo(R*.76,-R*.42);
    ctx.bezierCurveTo(R*.76,-R*.88,R*.42,-R*1.05,0,-R*1.05);
    ctx.bezierCurveTo(-R*.42,-R*1.05,-R*.76,-R*.88,-R*.76,-R*.42);
    ctx.fillStyle=tg; ctx.fill(); ctx.strokeStyle=neon+'88'; ctx.lineWidth=3.5; ctx.stroke();

    // 흉갑 수직 분절
    ctx.strokeStyle=neon+'33'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(-R*.74,-R*.1); ctx.lineTo(R*.74,-R*.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R*.72,R*.18); ctx.lineTo(R*.72,R*.18); ctx.stroke();

    // 가슴 에너지 코어 (크게!)
    if(!fl){
      const pulse=Math.sin(T*3.5)*.4+.6;
      ctx.shadowBlur=60+pulse*30; ctx.shadowColor=neon;
      const cg=ctx.createRadialGradient(0,-R*.26,0,0,-R*.26,R*.44);
      cg.addColorStop(0,'#ffffff'); cg.addColorStop(.15,neon); cg.addColorStop(.55,neon+'44'); cg.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,-R*.26,R*.44,0,Math.PI*2); ctx.fillStyle=cg; ctx.fill();
      // 정육각형 마법진
      ctx.strokeStyle=neon+'88'; ctx.lineWidth=2;
      for(let k=0;k<6;k++){
        const a=k*Math.PI/3+T*.5;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*R*.1,-R*.26+Math.sin(a)*R*.1); ctx.lineTo(Math.cos(a)*R*.4,-R*.26+Math.sin(a)*R*.4); ctx.stroke();
      }
      ctx.shadowBlur=0;
    }

    // 어깨 (초거대 거인 어깨)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.beginPath(); ctx.moveTo(R*.52,-R*.82); ctx.lineTo(R*1.18,-R*.68); ctx.lineTo(R*1.2,-R*.12); ctx.lineTo(R*.56,-R*.18); ctx.closePath();
      const sg=ctx.createLinearGradient(R*.52,-R*.82,R*1.18,-R*.12);
      sg.addColorStop(0,bright); sg.addColorStop(1,stone);
      ctx.fillStyle=sg; ctx.fill(); ctx.strokeStyle=neon+'aa'; ctx.lineWidth=3; ctx.stroke();
      // 어깨 에너지 결정
      ctx.shadowBlur=fl?0:22; ctx.shadowColor=neon;
      ctx.fillStyle=fl?'#888':neon; ctx.beginPath(); ctx.arc(R*.88,-R*.46,R*.14,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=void_; ctx.beginPath(); ctx.arc(R*.88,-R*.46,R*.07,0,Math.PI*2); ctx.fill();
      // 어깨 척추 돌기
      for(let k=0;k<3;k++){
        ctx.fillStyle=fl?'#777':neon+'aa';
        ctx.beginPath(); ctx.moveTo(R*(.56+k*.22),-R*.78); ctx.lineTo(R*(.62+k*.22),-R*1.12); ctx.lineTo(R*(.7+k*.22),-R*.78); ctx.fill();
      }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 팔 (초거대)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.strokeStyle=stone; ctx.lineWidth=R*.38; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(R*.74,-R*.38); ctx.lineTo(R*1.05,R*.38); ctx.stroke();
      ctx.strokeStyle=neon+'33'; ctx.lineWidth=2; ctx.stroke();
      // 거대 주먹
      ctx.fillStyle=bright; ctx.beginPath(); ctx.roundRect(R*.92,R*.3,R*.38,R*.38,R*.08); ctx.fill();
      ctx.strokeStyle=neon+'88'; ctx.lineWidth=2.5; ctx.stroke();
      ctx.shadowBlur=fl?0:16; ctx.shadowColor=neon;
      for(let k=0;k<4;k++){
        ctx.strokeStyle=fl?'#666':neon+'55'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(R*.94,R*(.32+k*.09)); ctx.lineTo(R*1.28,R*(.32+k*.09)); ctx.stroke();
      }
      ctx.shadowBlur=0; ctx.restore();
    }

    // 목
    ctx.beginPath(); ctx.roundRect(-R*.22,-R*1.06,R*.44,R*.22,R*.06); ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=neon+'44'; ctx.lineWidth=2; ctx.stroke();

    // 거대 머리 (거인족 두상)
    const hg=ctx.createRadialGradient(0,-R*1.3,0,0,-R*1.3,R*.64);
    hg.addColorStop(0,bright); hg.addColorStop(.45,stone); hg.addColorStop(1,void_);
    ctx.beginPath(); ctx.roundRect(-R*.52,-R*1.72,R*1.04,R*.96,R*.12); ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=neon+'88'; ctx.lineWidth=3; ctx.stroke();

    // 눈 (빛나는 거대 눈)
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(s,1);
      ctx.shadowBlur=fl?0:44; ctx.shadowColor=neon;
      const eg=ctx.createRadialGradient(R*.22,-R*1.36,0,R*.22,-R*1.36,R*.22);
      eg.addColorStop(0,'#fff'); eg.addColorStop(.3,neon); eg.addColorStop(1,'transparent');
      ctx.fillStyle=fl?'#888':eg; ctx.beginPath(); ctx.ellipse(R*.22,-R*1.36,R*.22,R*.18,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=void_; ctx.beginPath(); ctx.ellipse(R*.22,-R*1.36,R*.1,R*.1,0,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0; ctx.restore();
    }
    // 이마 균열 (에너지)
    if(!fl){
      ctx.shadowBlur=18; ctx.shadowColor=neon; ctx.strokeStyle=neon+'88'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(0,-R*1.7); ctx.lineTo(R*.12,-R*1.48); ctx.lineTo(-R*.08,-R*1.32); ctx.stroke();
      ctx.shadowBlur=0;
    }
    // 입 (이빨)
    ctx.strokeStyle=neon+'55'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-R*.32,-R*1.1); ctx.lineTo(R*.32,-R*1.1); ctx.stroke();
    ctx.fillStyle=fl?'#ccc':neon+'88';
    for(let k=-3;k<=3;k++){ ctx.beginPath(); ctx.rect(k*R*.1-R*.04,-R*1.1,R*.08,R*.1); ctx.fill(); }
  }
}

// ─── PROJECTILE ──────────────────────────
class Projectile {
  constructor(x,y,vx,vy,spell,ownerId){
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.spell=spell; this.ownerId=ownerId;
    this.radius=spell.radius; this.alive=true; this.age=0; this.trail=[];
  }
  update(dt,arena){
    this.age+=dt;
    if(this.age>4.5){this.alive=false;return;}
    this.trail.push({x:this.x,y:this.y});
    if(this.trail.length>12)this.trail.shift();
    this.x+=this.vx*60*dt; this.y+=this.vy*60*dt;
    if(this.x<arena.x||this.x>arena.x+arena.w||this.y<arena.y||this.y>arena.y+arena.h) this.alive=false;
  }
  draw(ctx){
    this.trail.forEach((t,i)=>{
      const a=i/this.trail.length;
      ctx.beginPath(); ctx.arc(t.x,t.y,this.radius*a*.6,0,Math.PI*2);
      ctx.fillStyle=this.spell.color+Math.floor(a*65).toString(16).padStart(2,'0'); ctx.fill();
    });
    ctx.save(); ctx.shadowBlur=20; ctx.shadowColor=this.spell.color;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.radius,0,Math.PI*2);
    const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.radius);
    g.addColorStop(0,'#fff'); g.addColorStop(.5,this.spell.color); g.addColorStop(1,this.spell.color+'00');
    ctx.fillStyle=g; ctx.fill(); ctx.restore();
  }
}

class ManaOrb {
  constructor(x,y){this.x=x;this.y=y;this.r=8;this.alive=true;this.age=0;this.bob=Math.random()*Math.PI*2;}
  update(dt){this.age+=dt;this.bob+=dt*2.8;if(this.age>18)this.alive=false;}
  draw(ctx){
    const y=this.y+Math.sin(this.bob)*3.5;
    ctx.save(); ctx.shadowBlur=18; ctx.shadowColor='#a855f7';
    const g=ctx.createRadialGradient(this.x,y,0,this.x,y,this.r);
    g.addColorStop(0,'#fff'); g.addColorStop(.4,'#c084fc'); g.addColorStop(1,'#a855f700');
    ctx.beginPath(); ctx.arc(this.x,y,this.r,0,Math.PI*2); ctx.fillStyle=g; ctx.fill(); ctx.restore();
  }
}

class Particle {
  constructor(x,y,col,vx,vy,sz,life){this.x=x;this.y=y;this.color=col;this.vx=vx;this.vy=vy;this.sz=sz;this.life=life;this.maxLife=life;this.alive=true;}
  update(dt){this.life-=dt;if(this.life<=0){this.alive=false;return;}this.x+=this.vx*dt*60;this.y+=this.vy*dt*60;this.vy+=.1;this.vx*=.97;}
  draw(ctx){const a=this.life/this.maxLife;ctx.beginPath();ctx.arc(this.x,this.y,this.sz*a,0,Math.PI*2);ctx.fillStyle=this.color+Math.floor(a*255).toString(16).padStart(2,'0');ctx.fill();}
}

// ══════════════════════════════════════════════
