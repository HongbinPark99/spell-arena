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
    this.hp=100; this.maxHp=100; this.mp=100; this.maxMp=100; this.mpRegen=8;
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

    // Update facing and shoot direction from movement
    const mv=Math.abs(this.vx)>0.05||Math.abs(this.vy)>0.05;
    if(mv){
      this.facing=this.vx>=0?1:-1;
      this.sdx=this.vx; this.sdy=this.vy; // remember last movement dir for shooting
    } else if(opponent){
      this.facing=opponent.x>this.x?1:-1;
      // When standing still keep last sdx/sdy so player can move+shoot directionally
    }

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

  // FIX #2: castSpell fires in sdx/sdy direction — NOT toward target
  castSpell(){
    const sp=SPELLS[this.selSpell];
    if(this.mp<sp.cost||this.spellCDs[this.selSpell]>0)return null;
    this.mp-=sp.cost; this.spellCDs[this.selSpell]=sp.cd; this.spellsCast++;
    const len=Math.sqrt(this.sdx**2+this.sdy**2)||1;
    const nx=this.sdx/len, ny=this.sdy/len;
    if(sp.type==='nova'){
      return Array.from({length:sp.count},(_,i)=>{
        const a=(i/sp.count)*Math.PI*2;
        return new Projectile(this.x,this.y,Math.cos(a)*sp.speed,Math.sin(a)*sp.speed,sp,this.id);
      });
    }
    return [new Projectile(this.x,this.y,nx*sp.speed,ny*sp.speed,sp,this.id)];
  }

  summonCreature(idx){
    const def=SUMMONS[idx];
    if(!def||this.mp<def.cost||this.summonCDs[idx]>0)return null;
    this.mp-=def.cost; this.summonCDs[idx]=def.cd; this.summonsCast++;
    const angle=Math.random()*Math.PI*2, d=this.radius+def.radius+22;
    return new Creature(this.x+Math.cos(angle)*d,this.y+Math.sin(angle)*d,def,this.id);
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
      case'Drake': this._drawDrake(ctx,R,fl); break;
      case'Specter': this._drawSpecter(ctx,R,fl); break;
      case'Golem': this._drawGolem(ctx,R,fl); break;
      case'Wisp': this._drawWisp(ctx,R,fl); break;
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

  _drawDrake(ctx,R,fl){
    const c=fl?'#fff':this.color, dark=fl?'#fff':'#441100', mid=fl?'#fff':'#662200';
    // Tail
    ctx.beginPath(); ctx.moveTo(-R*.5,R*.4); ctx.quadraticCurveTo(-R*1.5,R,- R*1.2,R*.2);
    ctx.strokeStyle=c; ctx.lineWidth=3; ctx.lineCap='round'; ctx.stroke();
    // Body
    ctx.beginPath(); ctx.ellipse(0,R*.1,R*1.05,R*.7,0,0,Math.PI*2);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.5; ctx.stroke();
    // Belly
    ctx.beginPath(); ctx.ellipse(R*.1,R*.18,R*.6,R*.42,0,0,Math.PI*2);
    ctx.fillStyle=fl?'#fff':'#882200'; ctx.fill();
    // Spine ridges
    if(!fl){ ctx.fillStyle='#aa3300'; for(let i=0;i<4;i++){ ctx.beginPath(); ctx.moveTo((-R*.4+i*R*.3),-R*.3); ctx.lineTo((-R*.25+i*R*.3),-R*.62); ctx.lineTo((-R*.1+i*R*.3),-R*.3); ctx.closePath(); ctx.fill(); } }
    // Wing
    ctx.beginPath(); ctx.moveTo(-R*.1,-R*.2); ctx.bezierCurveTo(0,-R*1.6,R*.8,-R*1.3,R*.5,-R*.5);
    ctx.bezierCurveTo(R*.3,-R*.35,R*.1,-R*.25,-R*.1,-R*.2);
    ctx.fillStyle=fl?'#fff':'#330e00bb'; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1; ctx.stroke();
    // Wing membrane lines
    if(!fl){ ctx.strokeStyle=c+'44'; ctx.lineWidth=.8; ['-.05,-1.4','0.3,-1.1','0.5,-.7'].forEach(p=>{ const[px,py]=p.split(',').map(Number); ctx.beginPath(); ctx.moveTo(-R*.1,-R*.2); ctx.lineTo(px*R,py*R); ctx.stroke(); }); }
    // Head
    ctx.beginPath(); ctx.ellipse(R*.88,-R*.2,R*.55,R*.44,-.15,0,Math.PI*2);
    ctx.fillStyle=mid; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.5; ctx.stroke();
    // Snout
    ctx.beginPath(); ctx.ellipse(R*1.32,-R*.28,R*.28,R*.17,0,0,Math.PI*2);
    ctx.fillStyle=fl?'#fff':'#882200'; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1; ctx.stroke();
    // Nostrils
    if(!fl){ ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(R*1.5,-R*.23,R*.04,0,Math.PI*2); ctx.fill(); }
    // Eye
    ctx.fillStyle=fl?'#fff':'#ffcc00'; ctx.shadowColor='#ffcc00'; ctx.shadowBlur=fl?0:8;
    ctx.beginPath(); ctx.arc(R*.95,-R*.35,R*.14,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(R*.98,-R*.36,R*.07,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(R*1.01,-R*.38,R*.03,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // Legs
    ctx.strokeStyle=mid; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-R*.35,R*.6); ctx.lineTo(-R*.45,R*1.08); ctx.lineTo(-R*.25,R*1.08); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(R*.25,R*.62); ctx.lineTo(R*.38,R*1.08); ctx.lineTo(R*.58,R*1.08); ctx.stroke();
    // Fire breath if attacking
    if(!fl&&this.shootTimer<300){
      ctx.save(); ctx.translate(R*1.5,-R*.28);
      for(let i=0;i<3;i++){
        const ft=Date.now()*.005+i*1.2;
        const fg=ctx.createRadialGradient(i*R*.2,0,0,i*R*.2,0,R*.26);
        fg.addColorStop(0,'#ffffffff'); fg.addColorStop(.4,'#ff8800aa'); fg.addColorStop(1,'transparent');
        ctx.beginPath(); ctx.arc(i*R*.2,Math.sin(ft)*R*.12,R*.18,0,Math.PI*2); ctx.fillStyle=fg; ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawSpecter(ctx,R,fl){
    const t=Date.now()*.004;
    // Ghostly gown — wavy bottom
    ctx.beginPath(); ctx.moveTo(-R,0);
    ctx.bezierCurveTo(-R,-R*1.6,R,-R*1.6,R,0);
    ctx.bezierCurveTo(R*.65,R*.7+Math.sin(t)*R*.18,R*.22,R*.52-Math.sin(t)*R*.14,0,R*.85);
    ctx.bezierCurveTo(-R*.22,R*.52+Math.sin(t)*R*.14,-R*.65,R*.7-Math.sin(t)*R*.18,-R,0);
    ctx.fillStyle=fl?'rgba(255,255,255,.9)':`rgba(160,130,255,0.72)`; ctx.fill();
    ctx.strokeStyle=fl?'#fff':this.color+'bb'; ctx.lineWidth=1.5; ctx.stroke();

    // Inner glow core
    if(!fl){
      const ig=ctx.createRadialGradient(0,-R*.4,0,0,-R*.4,R*.8);
      ig.addColorStop(0,'rgba(220,200,255,.5)'); ig.addColorStop(1,'transparent');
      ctx.beginPath(); ctx.ellipse(0,-R*.4,R*.8,R*.85,0,0,Math.PI*2); ctx.fillStyle=ig; ctx.fill();
    }

    // Face — eerie hollow eyes
    ctx.shadowBlur=fl?0:14; ctx.shadowColor='#cc88ff';
    ctx.fillStyle=fl?'#fff':'#ffffff';
    ctx.beginPath(); ctx.ellipse(-R*.28,-R*.5,R*.18,R*.22,-.1,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( R*.28,-R*.5,R*.18,R*.22,.1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=fl?'#aaa':'#7700cc';
    ctx.beginPath(); ctx.ellipse(-R*.28,-R*.5,R*.09,R*.12,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( R*.28,-R*.5,R*.09,R*.12,0,0,Math.PI*2); ctx.fill();

    // Spectral mouth
    ctx.beginPath(); ctx.arc(0,-R*.2,R*.2,0,Math.PI);
    ctx.strokeStyle=fl?'#fff':'#9944ff'; ctx.lineWidth=2; ctx.stroke();
    // Drip lines
    if(!fl){
      ctx.strokeStyle='#9944ff66'; ctx.lineWidth=1;
      for(let i=0;i<3;i++){
        ctx.beginPath(); ctx.moveTo(-R*.1+i*R*.1,-R*.2); ctx.lineTo(-R*.1+i*R*.1,-R*.05+Math.sin(t+i)*R*.04); ctx.stroke();
      }
    }

    // Wispy arms
    ctx.strokeStyle=fl?'#fff':this.color+'88'; ctx.lineWidth=2; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(-R*.8,-R*.4); ctx.quadraticCurveTo(-R*1.2,-R*.1,-R*1.0,R*.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( R*.8,-R*.4); ctx.quadraticCurveTo( R*1.2,-R*.1, R*1.0,R*.2); ctx.stroke();
    ctx.shadowBlur=0;
  }

  _drawGolem(ctx,R,fl){
    const c=fl?'#fff':this.color, stone=fl?'#fff':'#3a4f6a', dark=fl?'#fff':'#223347';
    // Shadow / base
    ctx.fillStyle='rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0,R*.9,R*.8,R*.22,0,0,Math.PI*2); ctx.fill();
    // Left fist
    ctx.beginPath(); ctx.ellipse(-R*1.18,R*.05,R*.38,R*.35,-.2,0,Math.PI*2);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.8; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-R*1.15,-R*.05,R*.28,R*.24,-.2,0,Math.PI*2);
    ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1; ctx.stroke();
    // Right fist
    ctx.beginPath(); ctx.ellipse( R*1.18,R*.05,R*.38,R*.35,.2,0,Math.PI*2);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1.8; ctx.stroke();
    ctx.beginPath(); ctx.ellipse( R*1.15,-R*.05,R*.28,R*.24,.2,0,Math.PI*2);
    ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=1; ctx.stroke();
    // Body
    ctx.beginPath(); ctx.roundRect(-R*.75,-R*.6,R*1.5,R*1.55,R*.18);
    ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2; ctx.stroke();
    // Chest crystal
    if(!fl){
      ctx.shadowBlur=18; ctx.shadowColor=this.glow;
      const cg=ctx.createRadialGradient(0,-R*.1,0,0,-R*.1,R*.38);
      cg.addColorStop(0,'#fff'); cg.addColorStop(.4,this.glow); cg.addColorStop(1,this.glow+'00');
      ctx.beginPath(); ctx.arc(0,-R*.1,R*.38,0,Math.PI*2); ctx.fillStyle=cg; ctx.fill();
      ctx.shadowBlur=0;
    }
    // Chest panel
    ctx.beginPath(); ctx.roundRect(-R*.42,-R*.48,R*.84,R*.78,R*.1);
    ctx.fillStyle=dark; ctx.fill(); ctx.strokeStyle=c+'88'; ctx.lineWidth=1; ctx.stroke();
    // Stone cracks
    if(!fl){
      ctx.strokeStyle=dark; ctx.lineWidth=1.8;
      ctx.beginPath(); ctx.moveTo(-R*.3,R*.1); ctx.lineTo(R*.05,R*.5); ctx.lineTo(R*.28,R*.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(R*.35,-R*.2); ctx.lineTo(R*.08,-R*.45); ctx.stroke();
    }
    // Head block
    ctx.beginPath(); ctx.roundRect(-R*.58,-R*1.6,R*1.16,R*.95,R*.12);
    ctx.fillStyle=stone; ctx.fill(); ctx.strokeStyle=c; ctx.lineWidth=2; ctx.stroke();
    // Crystal eyes
    ctx.shadowBlur=fl?0:16; ctx.shadowColor=this.glow;
    ctx.fillStyle=fl?'#fff':this.color;
    ctx.beginPath(); ctx.roundRect(-R*.38,-R*1.45,R*.28,R*.28,R*.06); ctx.fill();
    ctx.beginPath(); ctx.roundRect( R*.1,-R*1.45,R*.28,R*.28,R*.06); ctx.fill();
    ctx.shadowBlur=0;
    // Rivets on head
    if(!fl){
      ctx.fillStyle='#556677';
      [[-R*.45,-R*1.55],[R*.45,-R*1.55],[-R*.45,-R*.78],[R*.45,-R*.78]].forEach(([rx,ry])=>{
        ctx.beginPath(); ctx.arc(rx,ry,R*.06,0,Math.PI*2); ctx.fill();
      });
    }
  }

  _drawWisp(ctx,R,fl){
    const t=Date.now()*.003;
    // Outer glow halo
    if(!fl){
      const hg=ctx.createRadialGradient(0,0,R*.3,0,0,R*2.2);
      hg.addColorStop(0,this.glow+'60'); hg.addColorStop(1,this.glow+'00');
      ctx.beginPath(); ctx.arc(0,0,R*2.2,0,Math.PI*2); ctx.fillStyle=hg; ctx.fill();
    }
    // Orbiting energy trails
    if(!fl){
      for(let orbit=0;orbit<2;orbit++){
        const oa=t*(1+orbit*.5)+orbit*Math.PI;
        ctx.save(); ctx.rotate(oa);
        ctx.beginPath();
        for(let i=0;i<20;i++){
          const a=(i/20)*Math.PI*2, r=R*(orbit===0?.75:.55);
          const px=Math.cos(a)*r, py=Math.sin(a)*r*.4;
          i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
        }
        ctx.strokeStyle=this.color+(orbit===0?'88':'55'); ctx.lineWidth=1.5; ctx.stroke();
        ctx.restore();
      }
    }
    // Core
    const cg=ctx.createRadialGradient(0,0,0,0,0,R);
    cg.addColorStop(0,'#ffffff'); cg.addColorStop(.35,fl?'#fff':this.color); cg.addColorStop(.7,fl?'#fff':this.glow+'aa'); cg.addColorStop(1,'transparent');
    ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.fillStyle=cg; ctx.fill();
    // Orbiting motes
    if(!fl){
      ctx.shadowBlur=10; ctx.shadowColor=this.color;
      for(let i=0;i<4;i++){
        const ma=t+i*Math.PI*.5, mr=R*.72, ms=R*.18+Math.sin(t*2+i)*.04;
        ctx.beginPath(); ctx.arc(Math.cos(ma)*mr,Math.sin(ma)*mr,ms,0,Math.PI*2);
        ctx.fillStyle=i%2===0?this.color:this.glow; ctx.fill();
      }
      ctx.shadowBlur=0;
    }
    // Inner star
    ctx.strokeStyle=fl?'#fff':'#ffffffbb'; ctx.lineWidth=1.2;
    ctx.beginPath();
    for(let i=0;i<5;i++){
      const a=-Math.PI*.5+i*Math.PI*.4, ir=i%2===0?R*.55:R*.25;
      i===0?ctx.moveTo(Math.cos(a)*ir,Math.sin(a)*ir):ctx.lineTo(Math.cos(a)*ir,Math.sin(a)*ir);
    }
    ctx.closePath(); ctx.stroke();
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
