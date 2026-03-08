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
    this.radius=20; this.speed=210;
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
        if(this.hp<=0)this.alive=false;
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
    const bw=44,bh=5,bx=x-bw/2,by=y-R-18;
    ctx.fillStyle='rgba(0,0,0,.65)'; ctx.fillRect(bx,by,bw,bh);
    const hpPct=this.hp/this.maxHp;
    ctx.fillStyle=hpPct>.5?this.color:hpPct>.25?'#ffaa00':'#ff2200';
    ctx.fillRect(bx,by,bw*hpPct,bh);
    ctx.fillStyle='rgba(255,255,255,.22)'; ctx.fillRect(bx,by,bw*hpPct,bh*.5);
    ctx.strokeStyle=this.color+'55'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
  }

  // BLUE ARCANE MAGE — detailed body
  _drawBlueMage(ctx,R,fl){
    const c=fl?'#ffffff':'#4af0ff';
    const dark=fl?'#fff':'#005577';
    const body=fl?'#fff':'#0088bb';
    const skin=fl?'#fff':'#f0d0a0';

    // Robe skirt
    ctx.beginPath();
    ctx.moveTo(-R*.52,R*.15);
    ctx.bezierCurveTo(-R*.7,R*.55,-R*.58,R*1.05,-R*.28,R*1.1);
    ctx.lineTo(R*.28,R*1.1);
    ctx.bezierCurveTo(R*.58,R*1.05,R*.7,R*.55,R*.52,R*.15);
    ctx.closePath();
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.2; ctx.stroke();

    // Robe body
    ctx.beginPath(); ctx.ellipse(0,-R*.05,R*.5,R*.68,0,0,Math.PI*2);
    ctx.fillStyle=body; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.2; ctx.stroke();

    // Chest rune plate
    ctx.beginPath(); ctx.ellipse(0,-R*.05,R*.28,R*.32,0,0,Math.PI*2);
    ctx.fillStyle=dark+'cc'; ctx.fill();
    if(!fl){ ctx.fillStyle=c+'99'; ctx.font=`${R*.28}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('✦',0,-R*.05); }

    // Belt
    ctx.fillStyle=fl?'#fff':'#003344';
    ctx.fillRect(-R*.5,R*.2,R,R*.12);
    ctx.fillStyle=fl?'#fff':this.glow;
    ctx.beginPath(); ctx.arc(0,R*.26,R*.09,0,Math.PI*2); ctx.fill();

    // Neck + head
    ctx.beginPath(); ctx.rect(-R*.12,-R*.5,R*.24,R*.18);
    ctx.fillStyle=skin; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0,-R*.76,R*.38,R*.4,0,0,Math.PI*2);
    ctx.fillStyle=skin; ctx.fill(); ctx.strokeStyle=c+'66'; ctx.lineWidth=1; ctx.stroke();

    // Eyes
    if(!fl){
      ctx.fillStyle=this.glow;
      ctx.shadowBlur=8; ctx.shadowColor=this.glow;
      ctx.beginPath(); ctx.ellipse(-R*.13,-R*.74,R*.075,R*.09,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( R*.13,-R*.74,R*.075,R*.09,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(-R*.1,-R*.76,R*.03,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( R*.16,-R*.76,R*.03,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }

    // Wizard hat
    ctx.beginPath();
    ctx.moveTo(-R*.46,-R*.9); ctx.lineTo(-R*.03,-R*1.78); ctx.lineTo(R*.46,-R*.9);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.2; ctx.stroke();
    // Hat brim
    ctx.beginPath(); ctx.ellipse(0,-R*.9,R*.56,R*.13,0,0,Math.PI*2);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1; ctx.stroke();
    // Animated hat star
    if(!fl){
      ctx.save(); ctx.translate(-R*.03,-R*1.38); ctx.rotate(Date.now()*.0015);
      ctx.shadowBlur=12; ctx.shadowColor=this.glow;
      ctx.fillStyle=this.glow; ctx.font=`${R*.45}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('✦',0,0); ctx.restore();
    }

    // Left arm (tucked)
    ctx.beginPath(); ctx.ellipse(-R*.62,-R*.15,R*.18,R*.38,.3,0,Math.PI*2);
    ctx.fillStyle=body; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1; ctx.stroke();

    // Right arm — STAFF
    ctx.beginPath(); ctx.ellipse(R*.58,-R*.15,R*.18,R*.38,-.3,0,Math.PI*2);
    ctx.fillStyle=body; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1; ctx.stroke();

    // Staff pole
    ctx.beginPath(); ctx.moveTo(R*.72,-R*.5); ctx.lineTo(R*.78,R*1.15);
    ctx.strokeStyle=fl?'#fff':'#8866bb'; ctx.lineWidth=3.5; ctx.lineCap='round'; ctx.stroke();
    // Staff orb
    if(!fl){
      ctx.shadowBlur=24; ctx.shadowColor=this.glow;
      const og=ctx.createRadialGradient(R*.72,-R*.62,0,R*.72,-R*.62,R*.3);
      og.addColorStop(0,'#fff'); og.addColorStop(.45,this.glow); og.addColorStop(1,this.glow+'00');
      ctx.beginPath(); ctx.arc(R*.72,-R*.62,R*.3,0,Math.PI*2); ctx.fillStyle=og; ctx.fill();
      // Orbit ring
      ctx.save(); ctx.translate(R*.72,-R*.62); ctx.rotate(Date.now()*.002);
      ctx.beginPath(); ctx.ellipse(0,0,R*.42,R*.15,0,0,Math.PI*2);
      ctx.strokeStyle=this.glow+'aa'; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore();
      ctx.shadowBlur=0;
    }
  }

  // FIRE WARLOCK (AI) — dark armored sorcerer
  _drawFireWarlock(ctx,R,fl){
    const c=fl?'#ffffff':'#ff6b35';
    const dark=fl?'#fff':'#1a0500';
    const armor=fl?'#fff':'#331000';
    const bright=fl?'#fff':'#662200';

    // Cape back
    ctx.beginPath();
    ctx.moveTo(-R*.58,-R*.5);
    ctx.bezierCurveTo(-R*.95,R*.2,-R*.82,R*1.1,-R*.25,R*1.12);
    ctx.lineTo(R*.25,R*1.12);
    ctx.bezierCurveTo(R*.82,R*1.1,R*.95,R*.2,R*.58,-R*.5);
    ctx.fillStyle=dark+'ee'; ctx.fill();
    ctx.strokeStyle=c+'55'; ctx.lineWidth=1; ctx.stroke();

    // Armored torso
    ctx.beginPath(); ctx.ellipse(0,-R*.05,R*.5,R*.68,0,0,Math.PI*2);
    ctx.fillStyle=armor; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.5; ctx.stroke();

    // Chest armor plate
    ctx.beginPath();
    ctx.moveTo(-R*.32,-R*.5); ctx.lineTo(R*.32,-R*.5);
    ctx.lineTo(R*.26,R*.18); ctx.lineTo(0,R*.3); ctx.lineTo(-R*.26,R*.18);
    ctx.closePath();
    ctx.fillStyle=bright; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1; ctx.stroke();

    // Chest sigil
    if(!fl){
      ctx.shadowBlur=10; ctx.shadowColor='#ff4400';
      ctx.fillStyle='#ff4400cc'; ctx.font=`${R*.26}px serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('⛧',0,-R*.14);
      ctx.shadowBlur=0;
    }

    // Pauldrons (shoulder armor)
    ctx.beginPath(); ctx.ellipse(-R*.58,-R*.28,R*.25,R*.18,-.3,0,Math.PI*2);
    ctx.fillStyle=bright; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse( R*.58,-R*.28,R*.25,R*.18,.3,0,Math.PI*2);
    ctx.fillStyle=bright; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.2; ctx.stroke();

    // Neck
    ctx.beginPath(); ctx.rect(-R*.11,-R*.5,R*.22,R*.16);
    ctx.fillStyle='#220800'; ctx.fill();

    // Helm / skull face
    ctx.beginPath(); ctx.ellipse(0,-R*.76,R*.36,R*.38,0,0,Math.PI*2);
    ctx.fillStyle='#220800'; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.5; ctx.stroke();

    // Visor slit
    ctx.beginPath(); ctx.rect(-R*.26,-R*.86,R*.52,R*.13);
    ctx.fillStyle='#000'; ctx.fill();
    if(!fl){
      ctx.shadowBlur=14; ctx.shadowColor='#ff4400';
      ctx.fillStyle='#ff6600';
      ctx.beginPath(); ctx.ellipse(-R*.14,-R*.8,R*.09,R*.06,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( R*.14,-R*.8,R*.09,R*.06,0,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }

    // Horns
    ctx.fillStyle=fl?'#fff':'#550000'; ctx.strokeStyle=c; ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.moveTo(-R*.28,-R*1.0); ctx.quadraticCurveTo(-R*.58,-R*1.55,-R*.18,-R*1.38); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( R*.28,-R*1.0); ctx.quadraticCurveTo( R*.58,-R*1.55, R*.18,-R*1.38); ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Right arm + orb
    ctx.beginPath(); ctx.ellipse(R*.6,-R*.1,R*.18,R*.42,-.35,0,Math.PI*2);
    ctx.fillStyle=armor; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.2; ctx.stroke();

    // Fire orb
    if(!fl){
      ctx.save(); ctx.translate(R*.72,R*.38);
      ctx.shadowBlur=26; ctx.shadowColor='#ff4400';
      const fg=ctx.createRadialGradient(0,0,0,0,0,R*.32);
      fg.addColorStop(0,'#ffffaa'); fg.addColorStop(.4,'#ff6600'); fg.addColorStop(1,'#ff000000');
      ctx.beginPath(); ctx.arc(0,0,R*.32,0,Math.PI*2); ctx.fillStyle=fg; ctx.fill();
      // Fire petals
      const ft=Date.now()*.004;
      for(let i=0;i<4;i++){
        const fa=ft+i*Math.PI*.5;
        ctx.beginPath(); ctx.arc(Math.cos(fa)*R*.18,Math.sin(fa)*R*.18-R*.05,R*.09+Math.sin(ft*2.5+i)*.04,0,Math.PI*2);
        ctx.fillStyle='#ff880099'; ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(R*.72,R*.38,R*.32,0,Math.PI*2);
      ctx.fillStyle='#fff'; ctx.fill();
    }

    // Left arm
    ctx.beginPath(); ctx.ellipse(-R*.6,-R*.1,R*.18,R*.42,.35,0,Math.PI*2);
    ctx.fillStyle=armor; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.2; ctx.stroke();
  }
}

class Creature {
  constructor(x,y,def,ownerId){
    this.x=x; this.y=y; this.def=def; this.ownerId=ownerId;
    this.hp=def.hp; this.maxHp=def.hp;
    this.radius=def.radius; this.speed=def.speed;
    this.color=def.color; this.glow=def.glow;
    this.alive=true; this.vx=0; this.vy=0;
    this.atkTimer=0; this.shootTimer=0;
    this.flash=0; this.invincible=0;
    this.facing=ownerId===1?1:-1;
    this.trail=[]; this.spawnScale=0.1; this.age=0;
  }

  update(dt,arena,players,creatures,projs){
    if(!this.alive)return;
    this.age+=dt; this.spawnScale=Math.min(1,this.spawnScale+dt*4);
    if(this.flash>0)this.flash-=dt*5;
    if(this.invincible>0)this.invincible-=dt;
    if(this.atkTimer>0)this.atkTimer-=dt*1000;
    if(this.shootTimer>0)this.shootTimer-=dt*1000;

    const enemyPlayer=players.find(p=>p.id!==this.ownerId&&p.alive);
    const enemyCreatures=creatures.filter(c=>c.ownerId!==this.ownerId&&c.alive);
    let target=null, bestD=Infinity;
    enemyCreatures.forEach(c=>{ const d=Math.hypot(c.x-this.x,c.y-this.y); if(d<bestD){bestD=d;target=c;} });
    if(!target&&enemyPlayer){ target=enemyPlayer; bestD=Math.hypot(enemyPlayer.x-this.x,enemyPlayer.y-this.y); }

    if(target){
      const dx=target.x-this.x, dy=target.y-this.y, dist=Math.sqrt(dx*dx+dy*dy)||1;
      this.facing=dx>0?1:-1;
      if(this.def.shootRange>0&&dist<this.def.shootRange&&this.shootTimer<=0){
        this.shootTimer=this.def.shootCd;
        projs.push(new Projectile(this.x,this.y,(dx/dist)*this.def.shootSpd,(dy/dist)*this.def.shootSpd,
          {name:'shot',color:this.def.color,dmg:this.def.shootDmg,speed:this.def.shootSpd,radius:this.def.shootR,pierce:this.def.pierce||false,slow:false},
          this.ownerId+'_c'));
      }
      if(dist<this.def.atkRange+this.radius&&this.atkTimer<=0){
        this.atkTimer=this.def.atkCd;
        if(target.takeDamage)target.takeDamage(this.def.dmg);
      }
      if(dist>this.def.atkRange+this.radius+4){ this.vx=dx/dist; this.vy=dy/dist; }
      else { this.vx=this.vy=0; }
    } else {
      const own=players.find(p=>p.id===this.ownerId);
      if(own){ const dx=own.x-this.x,dy=own.y-this.y,d=Math.sqrt(dx*dx+dy*dy); if(d>70){this.vx=dx/d*.5;this.vy=dy/d*.5;}else{this.vx*=.9;this.vy*=.9;} }
    }

    this.x+=this.vx*this.speed*dt; this.y+=this.vy*this.speed*dt;
    const pad=this.def.phase?-15:this.radius+arena.padding;
    this.x=Math.max(arena.x+pad,Math.min(arena.x+arena.w-pad,this.x));
    this.y=Math.max(arena.y+pad,Math.min(arena.y+arena.h-pad,this.y));
    this.trail.push({x:this.x,y:this.y,t:1});
    if(this.trail.length>6)this.trail.shift();
    this.trail.forEach(t=>t.t-=dt*5);
  }

  // FIX #1: No knockback
  takeDamage(dmg){
    if(this.invincible>0)return;
    this.hp-=dmg; this.flash=1; this.invincible=.09;
    if(this.hp<=0)this.alive=false;
  }

  draw(ctx){
    const sc=this.spawnScale, x=this.x, y=this.y, f=this.facing;
    this.trail.forEach(t=>{ if(t.t<=0)return; ctx.beginPath(); ctx.arc(t.x,t.y,this.radius*t.t*.32,0,Math.PI*2); ctx.fillStyle=this.color+Math.floor(t.t*20).toString(16).padStart(2,'0'); ctx.fill(); });
    ctx.save(); ctx.translate(x,y); ctx.scale(sc*f,sc);
    const fl=this.flash>0&&Math.floor(Date.now()/55)%2===0;
    const R=this.radius;
    ctx.shadowBlur=fl?18:12; ctx.shadowColor=fl?'#fff':this.glow;

    switch(this.def.name){
      case'Drake':   this._drawDrake(ctx,R,fl);   break;
      case'Specter': this._drawSpecter(ctx,R,fl); break;
      case'Golem':   this._drawGolem(ctx,R,fl);   break;
      case'Wisp':    this._drawWisp(ctx,R,fl);    break;
      case'Phoenix': this._drawPhoenix(ctx,R,fl); break;
      case'Goliath': this._drawGoliath(ctx,R,fl); break;
      default:       this._drawWisp(ctx,R,fl);
    }
    ctx.restore();

    // HP bar — 상세 표시
    const bw=44, bh=6, bx=x-bw/2, by=y-this.radius*sc-14;
    // Background
    ctx.fillStyle='rgba(0,0,0,.7)'; ctx.fillRect(bx-1,by-1,bw+2,bh+2);
    // Bar fill
    const hp=Math.max(0,this.hp/this.maxHp);
    const barCol=hp>0.6?this.color:hp>0.3?'#ffaa00':'#ff3300';
    ctx.fillStyle=barCol; ctx.fillRect(bx,by,bw*hp,bh);
    ctx.fillStyle='rgba(255,255,255,.18)'; ctx.fillRect(bx,by,bw*hp,bh*.5);
    // Sword hit tick marks (each sword hit = 40dmg)
    const swordDmg=40;
    const ticks=Math.floor(this.maxHp/swordDmg);
    ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.lineWidth=1;
    for(let t=1;t<ticks;t++){
      const tx=bx+bw*(t*swordDmg/this.maxHp);
      ctx.beginPath(); ctx.moveTo(tx,by); ctx.lineTo(tx,by+bh); ctx.stroke();
    }
    ctx.strokeStyle=this.color+'55'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
    // HP 숫자 + 검 횟수 표시
    ctx.font='bold 8px Cinzel,serif'; ctx.textAlign='center'; ctx.fillStyle='#ffffffcc';
    const hitsLeft=Math.ceil(this.hp/swordDmg);
    ctx.fillText(`${Math.ceil(this.hp)}/${this.maxHp}  ⚔️×${hitsLeft}`,x,by-2);
  }

  // ══ DRAKE — 화염 드래곤 ══════════════════
  _drawDrake(ctx,R,fl){
    const t=Date.now()*.004;
    const c=fl?'#fff':this.color;
    const sc=fl?'#fff':'#cc3300', dk=fl?'#fff':'#330a00', mid=fl?'#fff':'#882200', gold=fl?'#fff':'#ffaa00';

    // 살아있는 화염 오라
    if(!fl){
      const og=ctx.createRadialGradient(0,0,R*.2,0,0,R*2.4);
      og.addColorStop(0,'rgba(255,120,0,.18)'); og.addColorStop(1,'rgba(255,40,0,0)');
      ctx.beginPath(); ctx.arc(0,0,R*2.4,0,Math.PI*2); ctx.fillStyle=og; ctx.fill();
    }

    // 꼬리 (역동적 S자)
    if(!fl){
      const tg=ctx.createLinearGradient(-R*1.8,R*.3,0,R*.3);
      tg.addColorStop(0,'rgba(255,60,0,0)'); tg.addColorStop(.5,sc+'cc'); tg.addColorStop(1,sc+'00');
      ctx.beginPath();
      ctx.moveTo(-R*.6, R*.3);
      ctx.bezierCurveTo(-R*1.1,R*.8,-R*1.6,R*.1,-R*1.8,-R*.2);
      ctx.bezierCurveTo(-R*2.0,-R*.5,-R*1.5,-R*.8,-R*1.1,-R*.4);
      ctx.strokeStyle=tg; ctx.lineWidth=R*.28; ctx.lineCap='round'; ctx.stroke();
      // 꼬리 끝 뿔
      ctx.fillStyle=gold;
      ctx.beginPath(); ctx.moveTo(-R*1.8,-R*.2); ctx.lineTo(-R*2.1,-R*.5); ctx.lineTo(-R*1.7,-R*.3); ctx.fill();
    }

    // 뒷다리
    for(let s of[-1,1]){
      ctx.save(); ctx.scale(1,s);
      ctx.beginPath(); ctx.moveTo(-R*.3,R*.5); ctx.lineTo(-R*.5,R*1.1); ctx.lineTo(R*.0,R*1.2); ctx.lineTo(R*.1,R*.6);
      ctx.fillStyle=dk; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.restore();
    }

    // 날개 (뒤)
    if(!fl){
      for(let side of[-1,1]){
        ctx.save(); ctx.scale(side,1);
        // 날개막
        ctx.beginPath();
        ctx.moveTo(R*.1,0);
        ctx.bezierCurveTo(R*.6,-R*.7, R*1.5,-R*1.1, R*1.8,-R*.8);
        ctx.bezierCurveTo(R*2.0,-R*.6, R*1.8,-R*.2, R*1.4,R*.1);
        ctx.bezierCurveTo(R*1.1,R*.35, R*.6,R*.3, R*.2,R*.3);
        ctx.fillStyle=dk+'cc'; ctx.fill();
        // 날개뼈 줄기
        ctx.strokeStyle=sc+'88'; ctx.lineWidth=2.5; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(R*.1,0); ctx.lineTo(R*1.8,-R*.8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R*.5,-R*.3); ctx.lineTo(R*1.6,-R*.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R*.9,-R*.5); ctx.lineTo(R*1.5,-R*.3); ctx.stroke();
        ctx.restore();
      }
    }

    // 메인 몸통 (비늘 텍스처)
    const bg=ctx.createRadialGradient(-R*.2,-R*.1,R*.1,-R*.2,-R*.1,R*.9);
    bg.addColorStop(0,mid); bg.addColorStop(.5,dk); bg.addColorStop(1,'#1a0500');
    ctx.beginPath(); ctx.ellipse(0,R*.05,R*.88,R*.58,-0.1,0,Math.PI*2);
    ctx.fillStyle=bg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2; ctx.stroke();

    // 배 비늘
    ctx.fillStyle=sc+'55';
    for(let i=0;i<5;i++){
      ctx.beginPath(); ctx.ellipse(R*(-.3+i*.15),R*.2,R*.12,R*.07,0,0,Math.PI*2); ctx.fill();
    }

    // 어깨 장갑
    ctx.beginPath(); ctx.ellipse(-R*.5,-R*.25,R*.35,R*.28,-.3,0,Math.PI*2);
    ctx.fillStyle=dk; ctx.fill(); ctx.strokeStyle=c+'aa'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(R*.5,-R*.2,R*.3,R*.25,.3,0,Math.PI*2);
    ctx.fillStyle=dk; ctx.fill(); ctx.strokeStyle=c+'aa'; ctx.lineWidth=1.5; ctx.stroke();

    // 앞발 (무기처럼 보이는 발톱)
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      ctx.beginPath(); ctx.moveTo(R*.6,R*.3); ctx.lineTo(R*.9,R*.7); ctx.lineTo(R*.7,R*.8);
      ctx.fillStyle=mid; ctx.fill();
      // 발톱 3개
      ctx.strokeStyle=gold; ctx.lineWidth=1.8; ctx.lineCap='round';
      for(let i=-1;i<=1;i++){
        ctx.beginPath();
        ctx.moveTo(R*.8+i*.05,R*.7);
        ctx.lineTo(R*(.9+i*.12),R*.95);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 목
    const ng=ctx.createLinearGradient(0,-R*.4,R*.5,-R*1.0);
    ng.addColorStop(0,mid); ng.addColorStop(1,dk);
    ctx.beginPath(); ctx.moveTo(-R*.15,-R*.3); ctx.lineTo(R*.3,-R*.8); ctx.lineTo(R*.6,-R*.7); ctx.lineTo(R*.2,-R*.15);
    ctx.fillStyle=ng; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1.5; ctx.stroke();

    // 등 등뼈/가시
    ctx.fillStyle=gold;
    ctx.shadowBlur=fl?0:8; ctx.shadowColor=gold;
    for(let i=0;i<5;i++){
      const sx=-R*.5+i*R*.25, sy=-R*.42-Math.sin(i*.6)*.15*R;
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx-R*.04,sy-R*.22-i*.02*R); ctx.lineTo(sx+R*.04,sy-R*.04); ctx.fill();
    }
    ctx.shadowBlur=0;

    // 머리
    const hg=ctx.createRadialGradient(R*.4,-R*.95,R*.05,R*.4,-R*.95,R*.42);
    hg.addColorStop(0,mid); hg.addColorStop(1,dk);
    ctx.beginPath(); ctx.ellipse(R*.4,-R*.95,R*.4,R*.3,0.35,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.8; ctx.stroke();

    // 머리 뿔 2개
    if(!fl){
      ctx.fillStyle=gold; ctx.shadowBlur=10; ctx.shadowColor=gold;
      ctx.beginPath(); ctx.moveTo(R*.25,-R*1.15); ctx.lineTo(R*.1,-R*1.45); ctx.lineTo(R*.35,-R*1.2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(R*.45,-R*1.18); ctx.lineTo(R*.55,-R*1.5); ctx.lineTo(R*.6,-R*1.18); ctx.fill();
      ctx.shadowBlur=0;
    }

    // 눈 (빨간 불꽃)
    ctx.shadowBlur=fl?0:20; ctx.shadowColor='#ff2200';
    ctx.fillStyle=fl?'#fff':'#ff3300';
    ctx.beginPath(); ctx.ellipse(R*.55,-R*1.0,R*.09,R*.1,0.1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(R*.57,-R*1.01,R*.045,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(R*.6,-R*1.04,R*.022,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;

    // 콧구멍 연기
    if(!fl){
      ctx.shadowBlur=15; ctx.shadowColor='#ff6600';
      ctx.strokeStyle='rgba(255,120,0,.7)'; ctx.lineWidth=2; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(R*.72,-R*.9); ctx.quadraticCurveTo(R*.88,-R*.78,R*.8,-R*.65); ctx.stroke();
      ctx.shadowBlur=0;
    }

    // 턱 이빨
    ctx.fillStyle=fl?'#fff':'#ffe0a0';
    for(let i=0;i<3;i++){
      ctx.beginPath(); ctx.moveTo(R*(.25+i*.15),-R*.72); ctx.lineTo(R*(.32+i*.15),-R*.58); ctx.lineTo(R*(.38+i*.15),-R*.72); ctx.fill();
    }
  }

  // ══ SPECTER — 해골 마법사 ═════════════════
  _drawSpecter(ctx,R,fl){
    const t=Date.now()*.003;
    const c=fl?'#fff':this.color, ghost=fl?'#fff':'#c8aaff', dark=fl?'#fff':'#2a0a44', glow=fl?'#fff':this.glow;

    // 유령 빛 오라
    if(!fl){
      const og=ctx.createRadialGradient(0,0,R*.1,0,0,R*2.2);
      og.addColorStop(0,'rgba(128,64,255,.2)'); og.addColorStop(1,'rgba(64,0,128,0)');
      ctx.beginPath(); ctx.arc(0,0,R*2.2,0,Math.PI*2); ctx.fillStyle=og; ctx.fill();
    }

    // 로브 자락 (흔들리는)
    const sw=Math.sin(t)*0.08;
    ctx.beginPath();
    ctx.moveTo(-R*.55,R*.2);
    ctx.bezierCurveTo(-R*.7,R*.8+sw*R,-R*.4,R*1.3-sw*R,-R*.1,R*1.5);
    ctx.bezierCurveTo(R*.2,R*1.7,R*.4,R*1.7+sw*R,R*.5,R*1.4);
    ctx.bezierCurveTo(R*.8,R*.9,R*.65,R*.5,R*.5,R*.2);
    ctx.fillStyle=fl?'#fff':dark+'ee'; ctx.fill();
    ctx.strokeStyle=c+'55'; ctx.lineWidth=1.2; ctx.stroke();

    // 로브 내부 빛
    if(!fl){
      ctx.beginPath();
      ctx.moveTo(-R*.3,R*.6); ctx.bezierCurveTo(-R*.2,R*1.0,R*.2,R*1.0,R*.3,R*.6);
      ctx.fillStyle='rgba(140,80,255,.15)'; ctx.fill();
    }

    // 망토 어깨
    ctx.beginPath(); ctx.ellipse(-R*.6,-R*.1,R*.38,R*.28,-.4,0,Math.PI*2);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(R*.6,-R*.1,R*.38,R*.28,.4,0,Math.PI*2);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1.5; ctx.stroke();

    // 팔 (뼈대)
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      // 팔뚝
      ctx.beginPath(); ctx.moveTo(R*.5,R*.1); ctx.lineTo(R*.9,R*.4);
      ctx.strokeStyle=ghost+'88'; ctx.lineWidth=3.5; ctx.lineCap='round'; ctx.stroke();
      // 손가락 뼈
      ctx.strokeStyle=ghost+'cc'; ctx.lineWidth=1.8;
      for(let i=-1;i<=1;i++){
        ctx.beginPath(); ctx.moveTo(R*.9,R*.4); ctx.lineTo(R*(1.0+i*.06),R*.6+Math.abs(i)*.04*R); ctx.stroke();
      }
      // 관절
      ctx.fillStyle=ghost; ctx.beginPath(); ctx.arc(R*.9,R*.4,R*.06,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // 몸통 (로브)
    const bg=ctx.createLinearGradient(0,-R*.5,0,R*.3);
    bg.addColorStop(0,dark); bg.addColorStop(1,'#180830');
    ctx.beginPath(); ctx.ellipse(0,-R*.05,R*.5,R*.52,0,0,Math.PI*2);
    ctx.fillStyle=bg; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1.5; ctx.stroke();

    // 로브 중앙 룬 문양
    if(!fl){
      ctx.shadowBlur=12; ctx.shadowColor=glow;
      ctx.strokeStyle=glow+'88'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.arc(0,-R*.05,R*.28,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-R*.33); ctx.lineTo(0,R*.23); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-R*.28,-R*.05); ctx.lineTo(R*.28,-R*.05); ctx.stroke();
      ctx.shadowBlur=0;
    }

    // 해골 머리
    const sg=ctx.createRadialGradient(0,-R*.9,0,0,-R*.9,R*.4);
    sg.addColorStop(0,fl?'#fff':'#d4cce8'); sg.addColorStop(1,fl?'#aaa':'#8060a0');
    ctx.beginPath(); ctx.ellipse(0,-R*.88,R*.34,R*.38,0,0,Math.PI*2);
    ctx.fillStyle=sg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.8; ctx.stroke();

    // 턱뼈
    ctx.beginPath(); ctx.ellipse(0,-R*.62,R*.22,R*.14,0,0,Math.PI*2);
    ctx.fillStyle=fl?'#ccc':'#c0b8d8'; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1.2; ctx.stroke();
    // 이빨
    ctx.fillStyle=fl?'#fff':'#ffe8e8';
    for(let i=-1;i<=1;i++){
      ctx.beginPath(); ctx.rect(R*(i*.1-.035),-R*.68,R*.06,R*.08); ctx.fill();
    }

    // 눈 (보라 불꽃)
    ctx.shadowBlur=fl?0:25; ctx.shadowColor=glow;
    ctx.fillStyle=fl?'#fff':glow;
    ctx.beginPath(); ctx.ellipse(-R*.14,-R*.92,R*.1,R*.12,-.1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(R*.14,-R*.92,R*.1,R*.12,.1,0,Math.PI*2); ctx.fill();
    // 눈 내부 (어두운 동공)
    ctx.fillStyle=fl?'#666':'#1a0028';
    ctx.beginPath(); ctx.ellipse(-R*.14,-R*.9,R*.05,R*.07,-.1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(R*.14,-R*.9,R*.05,R*.07,.1,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;

    // 마법사 모자
    ctx.beginPath();
    ctx.moveTo(-R*.22,-R*1.18); ctx.lineTo(-R*.38,-R*1.18); ctx.lineTo(0,-R*1.85); ctx.lineTo(R*.38,-R*1.18); ctx.lineTo(R*.22,-R*1.18);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.5; ctx.stroke();
    // 모자 밴드
    ctx.strokeStyle=glow+'aa'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.moveTo(-R*.25,-R*1.22); ctx.lineTo(R*.25,-R*1.22); ctx.stroke();
    // 모자 별
    if(!fl){
      ctx.shadowBlur=10; ctx.shadowColor=glow;
      ctx.fillStyle=glow; ctx.font=`${R*.22}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('★',0,-R*1.48);
      ctx.shadowBlur=0;
    }

    // 마법 지팡이 (손 앞에)
    ctx.save(); ctx.rotate(-.2);
    ctx.strokeStyle=fl?'#fff':'#6a4020'; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(R*.85,R*.55); ctx.lineTo(R*.6,-R*.55); ctx.stroke();
    // 지팡이 끝 구슬
    if(!fl){
      ctx.shadowBlur=20; ctx.shadowColor=glow;
      const wg=ctx.createRadialGradient(R*.56,-R*.6,0,R*.56,-R*.6,R*.16);
      wg.addColorStop(0,'#fff'); wg.addColorStop(.5,glow); wg.addColorStop(1,glow+'00');
      ctx.beginPath(); ctx.arc(R*.56,-R*.6,R*.16,0,Math.PI*2); ctx.fillStyle=wg; ctx.fill();
      ctx.shadowBlur=0;
    }
    ctx.restore();
  }

  // ══ GOLEM — 바위 골렘 ════════════════════
  _drawGolem(ctx,R,fl){
    const t=Date.now()*.002;
    const c=fl?'#fff':this.color, stone=fl?'#888':'#3a4a5a', bright=fl?'#fff':'#5a7a9a', crack=fl?'#fff':'#1a2a3a';

    // 지면 충격 이펙트
    if(!fl){
      ctx.beginPath(); ctx.ellipse(0,R*1.0,R*1.1,R*.2,0,0,Math.PI*2);
      ctx.fillStyle='rgba(80,120,160,.15)'; ctx.fill();
    }

    // 뒷다리
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      ctx.beginPath(); ctx.rect(R*.15,R*.5,R*.36,R*.6);
      ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=c+'66'; ctx.lineWidth=1.5; ctx.stroke();
      // 발
      ctx.beginPath(); ctx.ellipse(R*.3,R*1.12,R*.32,R*.16,0,0,Math.PI*2);
      ctx.fillStyle=crack; ctx.fill(); ctx.strokeStyle=c+'66'; ctx.lineWidth=1.5; ctx.stroke();
      // 발가락 돌
      for(let i=0;i<3;i++){
        ctx.beginPath(); ctx.arc(R*(.12+i*.18),R*1.12,R*.07,0,Math.PI*2);
        ctx.fillStyle=bright; ctx.fill();
      }
      ctx.restore();
    }

    // 팔 (육중)
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      // 위팔
      ctx.beginPath(); ctx.rect(R*.55,-R*.3,R*.46,R*.55);
      ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=c+'66'; ctx.lineWidth=2; ctx.stroke();
      // 아래팔
      ctx.beginPath(); ctx.rect(R*.62,R*.25,R*.54,R*.55);
      ctx.fillStyle=crack; ctx.fill(); ctx.strokeStyle=c+'66'; ctx.lineWidth=2; ctx.stroke();
      // 주먹
      ctx.beginPath(); ctx.roundRect(R*.55,R*.78,R*.72,R*.5,R*.08);
      ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2.2; ctx.stroke();
      // 주먹 선
      ctx.strokeStyle=crack; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(R*.7,R*.78); ctx.lineTo(R*.7,R*1.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R*.88,R*.78); ctx.lineTo(R*.88,R*1.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R*1.06,R*.78); ctx.lineTo(R*1.06,R*1.28); ctx.stroke();
      ctx.restore();
    }

    // 몸통 (바위 판갑)
    const bg=ctx.createLinearGradient(-R*.7,-R*.5,R*.7,R*.6);
    bg.addColorStop(0,bright); bg.addColorStop(.5,stone); bg.addColorStop(1,crack);
    ctx.beginPath(); ctx.roundRect(-R*.62,-R*.5,R*1.24,R*1.15,R*.1);
    ctx.fillStyle=bg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2.5; ctx.stroke();

    // 바위 균열
    ctx.strokeStyle=crack; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-R*.25,-R*.35); ctx.lineTo(R*.05,R*.15); ctx.lineTo(R*.3,-R*.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(R*.38,-R*.2); ctx.lineTo(R*.22,R*.28); ctx.stroke();

    // 가슴 룬석 (빛나는)
    if(!fl){
      ctx.shadowBlur=24; ctx.shadowColor=this.glow;
      const rg=ctx.createRadialGradient(0,-R*.05,0,0,-R*.05,R*.38);
      rg.addColorStop(0,'#fff'); rg.addColorStop(.3,this.glow); rg.addColorStop(.7,this.color+'88'); rg.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,-R*.05,R*.38,0,Math.PI*2); ctx.fillStyle=rg; ctx.fill();
      // 맥동 링
      const p=Math.sin(t*2.5)*.5+.5;
      ctx.strokeStyle=this.glow+Math.floor(p*120+60).toString(16).padStart(2,'0');
      ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(0,-R*.05,R*(.38+p*.12),0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur=0;
    }

    // 어깨 가시
    ctx.fillStyle=bright;
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      ctx.beginPath(); ctx.moveTo(R*.62,-R*.42); ctx.lineTo(R*.88,-R*.78); ctx.lineTo(R*.72,-R*.4); ctx.fill();
      ctx.strokeStyle=c+'88'; ctx.lineWidth=1.2; ctx.stroke();
      ctx.restore();
    }

    // 목 연결부
    ctx.beginPath(); ctx.rect(-R*.28,-R*.52,R*.56,R*.1);
    ctx.fillStyle=stone; ctx.fill();

    // 머리 (각진 바위 블록)
    const hg=ctx.createLinearGradient(-R*.38,-R*1.5,R*.38,-R*.52);
    hg.addColorStop(0,bright); hg.addColorStop(.6,stone); hg.addColorStop(1,crack);
    ctx.beginPath(); ctx.roundRect(-R*.38,-R*1.52,R*.76,R*1.02,R*.08);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2.2; ctx.stroke();

    // 이마 룬
    if(!fl){
      ctx.shadowBlur=12; ctx.shadowColor=this.glow;
      ctx.strokeStyle=this.glow+'cc'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(0,-R*1.22,R*.16,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-R*.16,-R*1.22); ctx.lineTo(R*.16,-R*1.22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-R*1.38); ctx.lineTo(0,-R*1.06); ctx.stroke();
      ctx.shadowBlur=0;
    }

    // 눈 (에너지 결정)
    ctx.shadowBlur=fl?0:22; ctx.shadowColor=this.glow;
    ctx.fillStyle=fl?'#fff':this.color;
    ctx.beginPath(); ctx.rect(-R*.3,-R*1.15,R*.22,R*.16); ctx.fill();
    ctx.beginPath(); ctx.rect(R*.08,-R*1.15,R*.22,R*.16); ctx.fill();
    if(!fl){
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(-R*.22,-R*1.1,R*.055,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(R*.16,-R*1.1,R*.055,0,Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur=0;

    // 입 (돌 이빨)
    ctx.strokeStyle=crack; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-R*.22,-R*.72); ctx.lineTo(R*.22,-R*.72); ctx.stroke();
    ctx.fillStyle=bright;
    for(let i=-2;i<=2;i++){
      if(Math.abs(i)>.5){
        ctx.beginPath(); ctx.moveTo(R*(i*.09),-R*.72); ctx.lineTo(R*(i*.09+.04),-R*.58); ctx.lineTo(R*(i*.09+.08),-R*.72); ctx.fill();
      }
    }
  }

  // ══ WISP — 고블린 마법사 ══════════════════
  _drawWisp(ctx,R,fl){
    const t=Date.now()*.005;
    const c=fl?'#fff':this.color, skin=fl?'#fff':'#3a8a20', dark=fl?'#fff':'#1a4a0a', bright=fl?'#fff':'#55bb30';

    // 에너지 오라 (마법 피어오름)
    if(!fl){
      for(let i=0;i<4;i++){
        const oa=t+i*Math.PI*.5, or=R*(1.2+Math.sin(t+i)*.2);
        const og=ctx.createRadialGradient(Math.cos(oa)*or*.3,Math.sin(oa)*or*.3,0,Math.cos(oa)*or*.3,Math.sin(oa)*or*.3,or*.4);
        og.addColorStop(0,this.color+'44'); og.addColorStop(1,'transparent');
        ctx.beginPath(); ctx.arc(Math.cos(oa)*or*.3,Math.sin(oa)*or*.3,or*.4,0,Math.PI*2); ctx.fillStyle=og; ctx.fill();
      }
    }

    // 발 (커다란 고블린 발)
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      ctx.beginPath(); ctx.ellipse(R*.22,R*.95,R*.3,R*.15,0.1,0,Math.PI*2);
      ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1.2; ctx.stroke();
      // 발톱
      ctx.fillStyle=fl?'#fff':'#aacc88';
      for(let i=0;i<3;i++){
        ctx.beginPath(); ctx.moveTo(R*(.08+i*.18),R*.95); ctx.lineTo(R*(.04+i*.18),R*1.08); ctx.lineTo(R*(.14+i*.18),R*.98); ctx.fill();
      }
      ctx.restore();
    }

    // 다리
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      ctx.beginPath(); ctx.roundRect(R*.05,R*.45,R*.2,R*.52,R*.05);
      ctx.fillStyle=skin; ctx.fill(); ctx.strokeStyle=c+'66'; ctx.lineWidth=1.2; ctx.stroke();
      ctx.restore();
    }

    // 꼬리(없지만 찢어진 망토)
    ctx.beginPath(); ctx.moveTo(-R*.45,R*.35); ctx.lineTo(-R*.65,R*.85); ctx.lineTo(-R*.3,R*.75);
    ctx.lineTo(-R*.5,R*1.1); ctx.lineTo(-R*.15,R*.8); ctx.lineTo(-R*.2,R*.5);
    ctx.fillStyle=fl?'#555':dark+'cc'; ctx.fill();

    // 몸통 (고블린 특유의 구부정)
    const bg=ctx.createRadialGradient(0,R*.05,R*.1,0,R*.05,R*.55);
    bg.addColorStop(0,skin); bg.addColorStop(.6,dark); bg.addColorStop(1,'#0a2005');
    ctx.beginPath(); ctx.ellipse(0,R*.1,R*.48,R*.5,.05,0,Math.PI*2);
    ctx.fillStyle=bg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.8; ctx.stroke();

    // 배 문양 (고블린 부족 문신)
    if(!fl){
      ctx.strokeStyle=bright+'55'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(0,R*.2,R*.2,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-R*.2,R*.2); ctx.lineTo(R*.2,R*.2); ctx.stroke();
    }

    // 팔 (가늘고 긴)
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      // 위팔
      ctx.beginPath(); ctx.moveTo(R*.4,-R*.15); ctx.lineTo(R*.85,R*.25);
      ctx.strokeStyle=skin; ctx.lineWidth=8; ctx.lineCap='round'; ctx.stroke();
      ctx.strokeStyle=c+'44'; ctx.lineWidth=1; ctx.stroke();
      // 손 (마법 지팡이 들고 있는)
      ctx.beginPath(); ctx.arc(R*.85,R*.28,R*.12,0,Math.PI*2);
      ctx.fillStyle=skin; ctx.fill(); ctx.strokeStyle=c+'66'; ctx.lineWidth=1.2; ctx.stroke();
      ctx.restore();
    }

    // 마법 지팡이
    ctx.save(); ctx.rotate(.2);
    ctx.strokeStyle=fl?'#fff':'#88aa44'; ctx.lineWidth=4; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-R*.8,R*.3); ctx.lineTo(-R*.55,-R*.7); ctx.stroke();
    // 지팡이 끝 (에너지 크리스탈)
    if(!fl){
      ctx.shadowBlur=22; ctx.shadowColor=this.glow;
      const wg=ctx.createRadialGradient(-R*.52,-R*.75,0,-R*.52,-R*.75,R*.2);
      wg.addColorStop(0,'#fff'); wg.addColorStop(.4,this.glow); wg.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(-R*.52,-R*.75,R*.2,0,Math.PI*2); ctx.fillStyle=wg; ctx.fill();
      // 크리스탈 포인트
      ctx.fillStyle=this.color+'cc'; ctx.strokeStyle=this.glow;  ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-R*.52,-R*.95); ctx.lineTo(-R*.44,-R*.7); ctx.lineTo(-R*.6,-R*.7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
    }
    ctx.restore();

    // 목
    ctx.beginPath(); ctx.ellipse(0,-R*.4,R*.2,R*.18,0,0,Math.PI*2);
    ctx.fillStyle=skin; ctx.fill();

    // 머리 (고블린 두상: 크고 귀 뾰족)
    const hg=ctx.createRadialGradient(-R*.05,-R*.85,R*.05,-R*.05,-R*.85,R*.45);
    hg.addColorStop(0,bright); hg.addColorStop(.5,skin); hg.addColorStop(1,dark);
    ctx.beginPath(); ctx.ellipse(0,-R*.85,R*.4,R*.42,0,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.8; ctx.stroke();

    // 귀 (뾰족)
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      ctx.beginPath(); ctx.moveTo(R*.32,-R*.78); ctx.lineTo(R*.72,-R*1.08); ctx.lineTo(R*.35,-R*.95);
      ctx.fillStyle=skin; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.5; ctx.stroke();
      // 귀 내부
      ctx.beginPath(); ctx.moveTo(R*.36,-R*.82); ctx.lineTo(R*.64,-R*1.03); ctx.lineTo(R*.38,-R*.94);
      ctx.fillStyle=fl?'#fff':'#cc6644'; ctx.fill();
      ctx.restore();
    }

    // 눈 (황금빛)
    ctx.shadowBlur=fl?0:16; ctx.shadowColor=this.glow;
    ctx.fillStyle=fl?'#fff':this.glow;
    ctx.beginPath(); ctx.ellipse(-R*.14,-R*.88,R*.1,R*.12,.1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(R*.14,-R*.88,R*.1,R*.12,-.1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(-R*.14,-R*.87,R*.055,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(R*.14,-R*.87,R*.055,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-R*.1,-R*.9,R*.022,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(R*.18,-R*.9,R*.022,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;

    // 코 (커다란 고블린 코)
    ctx.fillStyle=fl?'#fff':'#2a7015';
    ctx.beginPath(); ctx.ellipse(0,-R*.72,R*.1,R*.07,0,0,Math.PI*2); ctx.fill();
    // 콧구멍
    ctx.fillStyle='#000';
    ctx.beginPath(); ctx.arc(-R*.04,-R*.72,R*.025,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(R*.04,-R*.72,R*.025,0,Math.PI*2); ctx.fill();

    // 입 (넓은 고블린 웃음 + 이빨)
    ctx.strokeStyle=c+'88'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(0,-R*.6,R*.22,0.15,Math.PI-.15,false); ctx.stroke();
    ctx.fillStyle=fl?'#eee':'#ffe0a0';
    for(let i=-1;i<=1;i+=2){
      ctx.beginPath(); ctx.moveTo(R*(i*.08),-R*.6); ctx.lineTo(R*(i*.14),-R*.48); ctx.lineTo(R*(i*.08+.06*i),-R*.6); ctx.fill();
    }
    // 중앙 뻐드렁니
    ctx.beginPath(); ctx.rect(-R*.03,-R*.6,R*.06,R*.1); ctx.fillStyle=fl?'#eee':'#fff'; ctx.fill();
  }

  // ══ PHOENIX — 불사조 ════════════════════
  _drawPhoenix(ctx,R,fl){
    const t=Date.now()*.005;
    const c=fl?'#fff':this.color, gold=fl?'#fff':'#ffcc00', dark=fl?'#fff':'#4a1500';

    // 살아있는 불꽃 오라
    if(!fl){
      for(let i=0;i<6;i++){
        const fa=t*1.4+i*Math.PI/3;
        const fr=R*(0.8+Math.sin(t*1.8+i)*.25);
        const fog=ctx.createRadialGradient(Math.cos(fa)*fr*.35,Math.sin(fa)*fr*.35,0,Math.cos(fa)*fr*.35,Math.sin(fa)*fr*.35,fr*.5);
        fog.addColorStop(0,'rgba(255,160,0,.55)'); fog.addColorStop(.5,'rgba(255,60,0,.25)'); fog.addColorStop(1,'transparent');
        ctx.beginPath(); ctx.arc(Math.cos(fa)*fr*.35,Math.sin(fa)*fr*.35,fr*.5,0,Math.PI*2);
        ctx.fillStyle=fog; ctx.fill();
      }
    }

    // 꼬리깃털 (불꽃 물결)
    if(!fl){
      const tailCols=['#ff7700','#ff9900','#ffbb00','#ff4400','#ff6600'];
      for(let i=0;i<5;i++){
        const len=R*(1.6+Math.sin(t+i*.7)*.3);
        const tg=ctx.createLinearGradient(0,R*.35,0,R*.35+len);
        tg.addColorStop(0,tailCols[i]+'cc'); tg.addColorStop(1,tailCols[i]+'00');
        ctx.save(); ctx.rotate(-.35+i*.18);
        ctx.beginPath();
        ctx.moveTo(R*(-.05+i*.02),R*.32);
        ctx.bezierCurveTo(R*(-.18+i*.1),R*(1.0+i*.1),R*(.08+i*.04),R*(1.3+i*.08),R*(-.04+i*.06),R*.35+len);
        ctx.strokeStyle=tg; ctx.lineWidth=4-i*.4; ctx.lineCap='round'; ctx.stroke();
        ctx.restore();
      }
    }

    // 날개 (양쪽)
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      // 날개 주요부
      ctx.beginPath();
      ctx.moveTo(0,-R*.05);
      ctx.bezierCurveTo(R*.5,-R*.9, R*1.5,-R*.6, R*1.6,R*.1);
      ctx.bezierCurveTo(R*1.2,R*.45, R*.5,R*.3, 0,R*.22);
      ctx.fillStyle=fl?'#fff':dark+'dd'; ctx.fill();
      ctx.strokeStyle=c+'77'; ctx.lineWidth=1; ctx.stroke();
      // 날개 깃털 상단 끝
      if(!fl){
        ctx.fillStyle=gold+'66';
        for(let f=0;f<5;f++){
          const fx=R*(0.55+f*.22), fy=R*(-0.55+f*.15);
          ctx.beginPath(); ctx.ellipse(fx,fy,R*.1,R*.2,f*.3-.3,0,Math.PI*2); ctx.fill();
        }
        // 날개줄기
        ctx.strokeStyle=this.color+'88'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(R*1.6,R*.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R*.3,-R*.35); ctx.lineTo(R*1.5,-R*.35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R*.6,-R*.6); ctx.lineTo(R*1.35,-R*.5); ctx.stroke();
      }
      ctx.restore();
    }

    // 몸통
    const bg=ctx.createRadialGradient(0,R*.02,R*.05,0,R*.02,R*.5);
    bg.addColorStop(0,fl?'#ffd':this.color); bg.addColorStop(.5,dark); bg.addColorStop(1,'#2a0800');
    ctx.beginPath(); ctx.ellipse(0,R*.04,R*.42,R*.58,0,0,Math.PI*2);
    ctx.fillStyle=bg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.8; ctx.stroke();

    // 가슴 불꽃 문양
    if(!fl){
      ctx.shadowBlur=22; ctx.shadowColor=gold;
      const fg=ctx.createRadialGradient(0,R*.06,0,0,R*.06,R*.28);
      fg.addColorStop(0,'#ffee88'); fg.addColorStop(.5,this.color); fg.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.arc(0,R*.06,R*.28,0,Math.PI*2); ctx.fillStyle=fg; ctx.fill();
      ctx.shadowBlur=0;
    }

    // 목
    ctx.beginPath(); ctx.rect(-R*.1,-R*.54,R*.2,R*.2);
    ctx.fillStyle=fl?'#fff':'#3a0e00'; ctx.fill();

    // 머리
    const hg=ctx.createRadialGradient(0,-R*.75,0,0,-R*.75,R*.32);
    hg.addColorStop(0,fl?'#ffd':this.color); hg.addColorStop(.5,dark); hg.addColorStop(1,'#200800');
    ctx.beginPath(); ctx.ellipse(0,-R*.76,R*.28,R*.3,0,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.5; ctx.stroke();

    // 왕관 깃털
    if(!fl){
      ctx.shadowBlur=12; ctx.shadowColor=gold;
      for(let i=0;i<5;i++){
        const ca=-0.4+i*0.2;
        ctx.strokeStyle=i===2?gold:this.color; ctx.lineWidth=2.5-i*.2; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(Math.sin(ca)*R*.2,-R*.96); ctx.lineTo(Math.sin(ca)*R*.32,-R*(1.2+i*.04)); ctx.stroke();
        if(i===2){
          ctx.fillStyle=gold; ctx.beginPath(); ctx.arc(Math.sin(ca)*R*.32,-R*1.26,R*.07,0,Math.PI*2); ctx.fill();
        }
      }
      ctx.shadowBlur=0;
    }

    // 눈
    ctx.shadowBlur=fl?0:16; ctx.shadowColor=gold;
    ctx.fillStyle=fl?'#fff':gold;
    ctx.beginPath(); ctx.ellipse(R*.1,-R*.78,R*.1,R*.12,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(R*.12,-R*.79,R*.05,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(R*.15,-R*.82,R*.022,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;

    // 부리
    ctx.beginPath(); ctx.moveTo(R*.26,-R*.76); ctx.lineTo(R*.46,-R*.82); ctx.lineTo(R*.26,-R*.7);
    ctx.fillStyle=fl?'#fff':gold; ctx.fill();
  }

  // ══ GOLIATH — 거인 전사 ════════════════════
  _drawGoliath(ctx,R,fl){
    const t=Date.now()*.002;
    const c=fl?'#fff':this.color, stone=fl?'#888':'#152b1a', bright=fl?'#fff':'#1e4a28', dark=fl?'#fff':'#0a1a0e';
    const metal=fl?'#bbb':'#2a5a3a', rust=fl?'#fff':'#44ff88';

    // 그림자
    ctx.fillStyle='rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(0,R*1.1,R*1.2,R*.28,0,0,Math.PI*2); ctx.fill();

    // 뒷다리
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      ctx.beginPath(); ctx.roundRect(R*.1,R*.45,R*.38,R*.62,R*.06);
      ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=c+'66'; ctx.lineWidth=2; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(R*.28,R*1.08,R*.3,R*.2,0,0,Math.PI*2);
      ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c+'66'; ctx.lineWidth=1.8; ctx.stroke();
      // 부츠 리벳
      ctx.fillStyle=rust;
      for(let i=0;i<3;i++){ ctx.beginPath(); ctx.arc(R*(.12+i*.18),R*1.06,R*.04,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    }

    // 팔 (먼저 - 몸 뒤)
    for(let side of[-1,1]){
      ctx.save(); ctx.scale(side,1);
      // 어깨 갑옷
      ctx.beginPath(); ctx.ellipse(R*.82,-R*.12,R*.44,R*.36,.15,0,Math.PI*2);
      ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2; ctx.stroke();
      // 어깨 가시
      ctx.fillStyle=rust; ctx.shadowBlur=fl?0:6; ctx.shadowColor=rust;
      ctx.beginPath(); ctx.moveTo(R*.7,-R*.38); ctx.lineTo(R*.82,-R*.62); ctx.lineTo(R*.96,-R*.38); ctx.fill();
      ctx.shadowBlur=0;
      // 팔뚝 갑옷
      ctx.beginPath(); ctx.roundRect(R*.68,R*.22,R*.44,R*.5,R*.06);
      ctx.fillStyle=metal; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.8; ctx.stroke();
      // 갑옷 줄
      ctx.strokeStyle=dark; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(R*.72,R*.38); ctx.lineTo(R*1.08,R*.38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R*.72,R*.54); ctx.lineTo(R*1.08,R*.54); ctx.stroke();
      // 주먹
      ctx.beginPath(); ctx.roundRect(R*.62,R*.7,R*.56,R*.45,R*.08);
      ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2.2; ctx.stroke();
      // 주먹 너클
      ctx.fillStyle=rust;
      for(let k=0;k<4;k++){
        ctx.beginPath(); ctx.arc(R*(.68+k*.14),R*.72,R*.06,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }

    // 몸통 갑옷
    const bg=ctx.createLinearGradient(-R*.85,-R*.7,R*.85,R*.7);
    bg.addColorStop(0,bright); bg.addColorStop(.4,stone); bg.addColorStop(1,dark);
    ctx.beginPath(); ctx.roundRect(-R*.84,-R*.72,R*1.68,R*1.2,R*.14);
    ctx.fillStyle=bg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2.5; ctx.stroke();

    // 갑옷 가로 줄
    ctx.strokeStyle=dark; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(-R*.84,-R*.1); ctx.lineTo(R*.84,-R*.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R*.84,R*.42); ctx.lineTo(R*.84,R*.42); ctx.stroke();
    // 세로 중앙선
    ctx.beginPath(); ctx.moveTo(0,-R*.72); ctx.lineTo(0,R*.48); ctx.stroke();

    // 가슴 에너지 코어
    if(!fl){
      ctx.shadowBlur=32; ctx.shadowColor=this.glow;
      const cg=ctx.createRadialGradient(0,-R*.08,0,0,-R*.08,R*.5);
      cg.addColorStop(0,'#fff'); cg.addColorStop(.2,this.glow); cg.addColorStop(.55,this.color); cg.addColorStop(1,this.glow+'00');
      ctx.beginPath(); ctx.arc(0,-R*.08,R*.5,0,Math.PI*2); ctx.fillStyle=cg; ctx.fill();
      const p=Math.sin(t*3)*.5+.5;
      ctx.strokeStyle=this.glow+Math.floor(p*100+80).toString(16).padStart(2,'0');
      ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(0,-R*.08,R*(.5+p*.12),0,Math.PI*2); ctx.stroke();
      ctx.shadowBlur=0;
    }

    // 갑옷 내부 패널
    ctx.beginPath(); ctx.roundRect(-R*.56,-R*.58,R*1.12,R*1.06,R*.08);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=rust+'55'; ctx.lineWidth=1.2; ctx.stroke();

    // 갑옷 균열
    if(!fl){
      ctx.strokeStyle=bright; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-R*.3,R*.08); ctx.lineTo(R*.1,R*.55); ctx.lineTo(R*.32,R*.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R*.4,-R*.28); ctx.lineTo(R*.15,-R*.5); ctx.stroke();
    }

    // 목
    ctx.beginPath(); ctx.rect(-R*.3,-R*.74,R*.6,R*.08);
    ctx.fillStyle=stone; ctx.fill();

    // 거대 머리
    const hg=ctx.createLinearGradient(-R*.72,-R*1.98,R*.72,-R*.72);
    hg.addColorStop(0,bright); hg.addColorStop(.5,stone); hg.addColorStop(1,dark);
    ctx.beginPath(); ctx.roundRect(-R*.72,-R*1.98,R*1.44,R*1.24,R*.16);
    ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2.5; ctx.stroke();

    // 이마 장식판
    ctx.beginPath(); ctx.roundRect(-R*.58,-R*1.84,R*1.16,R*.52,R*.1);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=rust+'55'; ctx.lineWidth=1.2; ctx.stroke();

    // 이마 룬
    if(!fl){
      ctx.shadowBlur=14; ctx.shadowColor=this.glow;
      ctx.fillStyle=this.glow; ctx.font=`bold ${R*.3}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('⚔',0,-R*1.6);
      ctx.shadowBlur=0;
    }

    // 눈 (강렬한 에너지)
    ctx.shadowBlur=fl?0:26; ctx.shadowColor=this.glow;
    ctx.fillStyle=fl?'#fff':this.color;
    ctx.beginPath(); ctx.roundRect(-R*.5,-R*1.22,R*.36,R*.32,R*.06); ctx.fill();
    ctx.beginPath(); ctx.roundRect(R*.14,-R*1.22,R*.36,R*.32,R*.06); ctx.fill();
    if(!fl){
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.arc(-R*.38,-R*1.12,R*.07,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(R*.26,-R*1.12,R*.07,0,Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur=0;

    // 입 그릴
    ctx.strokeStyle=c+'66'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-R*.4,-R*.86); ctx.lineTo(R*.4,-R*.86); ctx.stroke();
    // 이빨
    ctx.fillStyle=fl?'#eee':'#ccffcc';
    for(let i=-3;i<=3;i+=2){
      ctx.beginPath(); ctx.moveTo(R*(i*.1),-R*.86); ctx.lineTo(R*(i*.1+.08),-R*.72); ctx.lineTo(R*(i*.1+.16),-R*.86); ctx.fill();
    }

    // 리벳 장식
    if(!fl){
      ctx.fillStyle=rust;
      [[-R*.68,-R*1.94],[R*.68,-R*1.94],[-R*.68,-R*.88],[R*.68,-R*.88],[-R*.68,-R*.04],[R*.68,-R*.04]].forEach(([rx,ry])=>{
        ctx.beginPath(); ctx.arc(rx,ry,R*.08,0,Math.PI*2); ctx.fill();
      });
    }
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
