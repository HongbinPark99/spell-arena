// entities.js — Player, Creature, Projectile, ManaOrb, Particle

class Player {
  constructor(id,x,y,color,glow,isAI){
    this.id=id;this.x=x;this.y=y;this.vx=0;this.vy=0;
    this.radius=20;this.speed=215;
    this.hp=100;this.maxHp=100;this.mp=100;this.maxMp=100;this.mpRegen=14; // 마나 리젠 증가
    this.color=color;this.glow=glow;
    this.facing=id===1?1:-1;
    this.sdx=id===1?1:-1;this.sdy=0;
    this.selSpell=0;this.spellCDs=[0,0,0,0];this.summonCDs=[0,0];
    this.swordActive=false;this.swordTimer=0;this.swordCD=0;this.swordAngle=0;this.swordSwingDir=0;
    this.alive=true;this.stunTimer=0;this.slowTimer=0;this.flash=0;this.invincible=0;
    this.isAI=isAI||false;this.aiTimer=0;this.jx=0;this.jy=0;
    this.trail=[];this.spellsCast=0;this.summonsCast=0;
    this.invasionTimer=0;this.inEnemyTerritory=false;
    // 파티클 트레일용
    this._trailTimer=0;
  }

  update(dt,arena,opponent){
    if(!this.alive)return;
    if(this.stunTimer>0){this.stunTimer-=dt;return;}
    this.mp=Math.min(this.maxMp,this.mp+this.mpRegen*dt);
    const spd=this.speed*(this.slowTimer>0?.5:1)*dt;
    if(this.slowTimer>0)this.slowTimer-=dt;
    this.x+=this.vx*spd;this.y+=this.vy*spd;
    const pad=this.radius+arena.padding;
    this.x=Math.max(arena.x+pad,Math.min(arena.x+arena.w-pad,this.x));
    this.y=Math.max(arena.y+pad,Math.min(arena.y+arena.h-pad,this.y));

    const mv=Math.abs(this.vx)>.05||Math.abs(this.vy)>.05;
    if(mv){
      // facing은 항상 상대 진영 방향으로 고정 (P1=오른쪽, P2=왼쪽)
      this.facing=this.id===1?1:-1;
    } else if(opponent){
      this.facing=this.id===1?1:-1;
    }

    const midX=arena.x+arena.w/2;
    this.inEnemyTerritory=this.id===1?this.x>midX:this.x<midX;
    if(this.inEnemyTerritory){
      this.invasionTimer+=dt;
      const del=DIFF[difficulty].invasionDelay;
      if(this.invasionTimer>=del)this.hp=Math.max(0,this.hp-DIFF[difficulty].invasionDmg*dt);
      if(this.hp<=0)this.alive=false;
    } else this.invasionTimer=0;

    this.trail.push({x:this.x,y:this.y,t:1});
    if(this.trail.length>10)this.trail.shift();
    this.trail.forEach(t=>t.t-=dt*3.5);

    if(this.swordActive){this.swordTimer-=dt*1000;this.swordAngle+=this.swordSwingDir*dt*13;if(this.swordTimer<=0)this.swordActive=false;}
    if(this.swordCD>0)this.swordCD-=dt*1000;
    for(let i=0;i<4;i++){if(this.spellCDs[i]>0)this.spellCDs[i]-=dt*1000;}
    for(let i=0;i<2;i++){if(this.summonCDs[i]>0)this.summonCDs[i]-=dt*1000;}
    if(this.flash>0)this.flash-=dt*5;
    if(this.invincible>0)this.invincible-=dt;
    if(this.isAI&&opponent)this.updateAI(dt,arena,opponent);
  }

  updateAI(dt,arena,opponent){
    this.aiTimer-=dt;
    if(this.aiTimer>0)return;
    const diff=DIFF[difficulty];
    this.aiTimer=.12+Math.random()*.22;
    const dx=opponent.x-this.x,dy=opponent.y-this.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
    const midX=arena.x+arena.w/2;
    if(dist>240){const tx=Math.min(opponent.x-85,midX-8);const tdx=tx-this.x,tdy=opponent.y-this.y,td=Math.sqrt(tdx*tdx+tdy*tdy)||1;this.vx=tdx/td*diff.aiSpeed;this.vy=tdy/td*diff.aiSpeed;}
    else if(dist<100){this.vx=-dx/dist*diff.aiSpeed;this.vy=-dy/dist*diff.aiSpeed;}
    else{this.vx=(Math.random()-.5)*diff.aiSpeed;this.vy=(Math.random()-.5)*diff.aiSpeed*1.5;}
    if(this.x<midX-18)this.vx=Math.abs(this.vx);
    if(dist<360&&Math.random()<diff.aiAttackRate){
      const sp=SPELLS[this.selSpell];
      if(this.mp>=sp.cost&&this.spellCDs[this.selSpell]<=0){
        const pp=this.castSpell();if(pp&&GS)GS.projectiles.push(...pp);
      }
    }
    if(Math.random()<.06)this.selSpell=Math.floor(Math.random()*SPELLS.length);
    if(Math.random()<diff.aiSummonRate){const idx=Math.floor(Math.random()*SUMMONS.length);const c=this.summonCreature(idx);if(c&&GS)GS.creatures.push(c);}
    if(dist<72&&Math.random()<.32)this.startSword();
  }

  startSword(){
    if(this.swordCD>0)return;
    this.swordActive=true;this.swordTimer=340;this.swordCD=700;
    this.swordAngle=-Math.PI*.4;this.swordSwingDir=1;
  }

  castSpell(){
    const sp=SPELLS[this.selSpell];
    if(this.mp<sp.cost||this.spellCDs[this.selSpell]>0)return null;
    this.mp-=sp.cost;this.spellCDs[this.selSpell]=sp.cd;this.spellsCast++;
    // 항상 facing 방향(상대 진영)으로 발사 — 절대 뒤로 안 감
    const dir=this.facing; // +1 or -1
    if(sp.type==='nova'){
      return Array.from({length:sp.count||8},(_,i)=>{
        const a=(i/(sp.count||8))*Math.PI*2;
        return new Projectile(this.x,this.y,Math.cos(a)*sp.speed,Math.sin(a)*sp.speed,sp,this.id);
      });
    }
    return [new Projectile(this.x,this.y,dir*sp.speed,0,sp,this.id)];
  }

  summonCreature(idx){
    const def=SUMMONS[idx];
    if(!def||this.mp<def.cost||this.summonCDs[idx]>0)return null;
    this.mp-=def.cost;this.summonCDs[idx]=def.cd;this.summonsCast++;
    const angle=Math.random()*Math.PI*2,d=this.radius+def.radius+24;
    const c=new Creature(this.x+Math.cos(angle)*d,this.y+Math.sin(angle)*d,def,this.id);
    c.cid='c_'+this.id+'_'+Date.now()+'_'+idx;
    return c;
  }

  takeDamage(dmg){
    if(this.invincible>0||!this.alive)return;
    this.hp=Math.max(0,this.hp-dmg);this.flash=1;this.invincible=.13;
    if(this.hp<=0)this.alive=false;
  }

  draw(ctx){
    this.trail.forEach(t=>{
      if(t.t<=0)return;
      ctx.beginPath();ctx.arc(t.x,t.y,this.radius*t.t*.35,0,Math.PI*2);
      ctx.fillStyle=this.color+Math.floor(t.t*24).toString(16).padStart(2,'0');ctx.fill();
    });
    if(!this.alive)return;
    const fl=this.flash>0&&Math.floor(Date.now()/55)%2===0;
    const x=this.x,y=this.y,f=this.facing,R=this.radius;

    // Aura glow
    if(!fl){
      const ag=ctx.createRadialGradient(x,y,R*.3,x,y,R*2.8);
      ag.addColorStop(0,this.glow+'44');ag.addColorStop(1,this.glow+'00');
      ctx.beginPath();ctx.arc(x,y,R*2.8,0,Math.PI*2);ctx.fillStyle=ag;ctx.fill();
    }

    // Territory burn ring
    if(this.inEnemyTerritory&&this.invasionTimer>0){
      const pulse=Math.sin(Date.now()*.012)*.5+.5;
      ctx.save();ctx.shadowBlur=20;ctx.shadowColor='#ff2200';
      ctx.beginPath();ctx.arc(x,y,R+8+pulse*5,0,Math.PI*2);
      ctx.strokeStyle=`rgba(255,60,0,${.4+pulse*.45})`;ctx.lineWidth=2.5;ctx.stroke();ctx.restore();
    }

    ctx.save();ctx.translate(x,y);
    ctx.shadowBlur=fl?24:16;ctx.shadowColor=fl?'#ffffff':this.glow;
    ctx.scale(f,1);
    if(this.id===1) this._drawArcaneKnight(ctx,R,fl);
    else this._drawShadowSorcerer(ctx,R,fl);
    ctx.restore();

    if(this.slowTimer>0){
      ctx.beginPath();ctx.arc(x,y,R+6,0,Math.PI*2);
      ctx.strokeStyle='#80dfff88';ctx.lineWidth=2;ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);
    }

    if(this.swordActive){
      ctx.save();ctx.translate(x,y);ctx.rotate(this.swordAngle);
      ctx.shadowBlur=26;ctx.shadowColor=this.color;
      const sg=ctx.createLinearGradient(0,0,f*62,0);
      sg.addColorStop(0,this.color);sg.addColorStop(.45,'#ffffff');sg.addColorStop(1,this.color+'33');
      ctx.beginPath();ctx.moveTo(f*7,-1.5);ctx.lineTo(f*62,-1.5);
      ctx.strokeStyle=sg;ctx.lineWidth=5.5;ctx.lineCap='round';ctx.stroke();
      ctx.beginPath();ctx.moveTo(f*7,1.5);ctx.lineTo(f*62,1.5);
      ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=2.2;ctx.stroke();
      ctx.beginPath();ctx.moveTo(f*12,-13);ctx.lineTo(f*12,13);
      ctx.strokeStyle=this.color;ctx.lineWidth=4.5;ctx.lineCap='round';ctx.stroke();
      ctx.restore();
    }

    const bw=46,bh=5,bx=x-bw/2,by=y-R-20;
    ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillRect(bx-1,by-1,bw+2,bh+2);
    const hp=this.hp/this.maxHp;
    ctx.fillStyle=hp>.5?this.color:hp>.25?'#ffaa00':'#ff2200';
    ctx.fillRect(bx,by,bw*hp,bh);
    ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(bx,by,bw*hp,bh*.5);
    ctx.strokeStyle=this.color+'55';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,bh);
  }

  // ─── P1: 아케인 나이트 (파란 판금갑옷 마법사) ───
  _drawArcaneKnight(ctx,R,fl){
    const c=fl?'#fff':'#4af0ff', dark=fl?'#fff':'#001833', armor=fl?'#fff':'#003366', bright=fl?'#fff':'#0066aa';
    const gold=fl?'#fff':'#f5c842', skin=fl?'#fff':'#f0d0a0';
    const t=Date.now()*.002;

    // Cape / cloak
    ctx.beginPath();
    ctx.moveTo(-R*.5,-R*.4);
    ctx.bezierCurveTo(-R*.9,R*.3,-R*.75,R*1.2,-R*.2,R*1.25);
    ctx.lineTo(R*.2,R*1.25);
    ctx.bezierCurveTo(R*.75,R*1.2,R*.9,R*.3,R*.5,-R*.4);
    ctx.fillStyle=fl?'#fff':dark+'ee';ctx.fill();
    ctx.strokeStyle=c+'44';ctx.lineWidth=1;ctx.stroke();

    // Armored legs
    ctx.beginPath();ctx.rect(-R*.38,R*.38,R*.3,R*.72);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c+'44';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.rect(R*.08,R*.38,R*.3,R*.72);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c+'44';ctx.lineWidth=1;ctx.stroke();
    // Boot shine
    ctx.fillStyle=bright+'66';ctx.fillRect(-R*.38,R*.38,R*.3,R*.12);
    ctx.fillRect(R*.08,R*.38,R*.3,R*.12);

    // Torso — plate armor
    ctx.beginPath();ctx.moveTo(-R*.52,-R*.5);ctx.lineTo(-R*.52,R*.42);ctx.lineTo(R*.52,R*.42);ctx.lineTo(R*.52,-R*.5);ctx.closePath();
    ctx.fillStyle=armor;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();

    // Chest plate highlight
    ctx.beginPath();ctx.moveTo(-R*.38,-R*.42);ctx.lineTo(R*.38,-R*.42);ctx.lineTo(R*.28,R*.22);ctx.lineTo(0,R*.36);ctx.lineTo(-R*.28,R*.22);ctx.closePath();
    ctx.fillStyle=bright;ctx.fill();ctx.strokeStyle=c+'88';ctx.lineWidth=1;ctx.stroke();

    // Chest rune
    if(!fl){
      ctx.shadowBlur=14;ctx.shadowColor=c;
      ctx.fillStyle=c;ctx.font=`bold ${R*.35}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('⚡',0,-R*.08);ctx.shadowBlur=0;
    }

    // Pauldrons (shoulder plates)
    ctx.beginPath();ctx.ellipse(-R*.62,-R*.32,R*.28,R*.2,-.3,0,Math.PI*2);
    ctx.fillStyle=bright;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
    ctx.beginPath();ctx.ellipse(R*.62,-R*.32,R*.28,R*.2,.3,0,Math.PI*2);
    ctx.fillStyle=bright;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();

    // Belt + waist
    ctx.fillStyle=dark;ctx.fillRect(-R*.52,R*.28,R*1.04,R*.16);
    ctx.fillStyle=gold;ctx.beginPath();ctx.arc(0,R*.36,R*.1,0,Math.PI*2);ctx.fill();

    // Neck + head
    ctx.beginPath();ctx.rect(-R*.14,-R*.6,R*.28,R*.2);ctx.fillStyle=skin;ctx.fill();
    ctx.beginPath();ctx.ellipse(0,-R*.84,R*.38,R*.38,0,0,Math.PI*2);
    ctx.fillStyle=skin;ctx.fill();ctx.strokeStyle=c+'55';ctx.lineWidth=1;ctx.stroke();

    // Eyes
    if(!fl){
      ctx.shadowBlur=10;ctx.shadowColor=c;
      ctx.fillStyle=c;
      ctx.beginPath();ctx.ellipse(-R*.12,-R*.84,R*.08,R*.1,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(R*.12,-R*.84,R*.08,R*.1,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';
      ctx.beginPath();ctx.arc(-R*.09,-R*.86,R*.03,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(R*.15,-R*.86,R*.03,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;
    }

    // Helmet
    ctx.beginPath();ctx.ellipse(0,-R*1.04,R*.44,R*.4,0,Math.PI,0);
    ctx.fillStyle=armor;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
    // Visor
    ctx.beginPath();ctx.rect(-R*.38,-R*1.02,R*.76,R*.14);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c+'66';ctx.lineWidth=1;ctx.stroke();
    // Visor glow slit
    if(!fl){ctx.fillStyle=c+'cc';ctx.fillRect(-R*.3,-R*.98,R*.6,R*.06);}
    // Plume
    if(!fl){
      ctx.shadowBlur=8;ctx.shadowColor=gold;
      ctx.strokeStyle=gold+'cc';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,-R*1.42);ctx.bezierCurveTo(R*.2,-R*1.9,R*.5,-R*1.7,R*.3,-R*1.3);ctx.stroke();
      ctx.shadowBlur=0;
    }

    // Staff (RIGHT side)
    ctx.beginPath();ctx.moveTo(R*.68,-R*.6);ctx.lineTo(R*.74,R*1.18);
    ctx.strokeStyle=fl?'#fff':'#5533aa';ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();
    if(!fl){
      ctx.shadowBlur=28;ctx.shadowColor=c;
      const og=ctx.createRadialGradient(R*.68,-R*.72,0,R*.68,-R*.72,R*.36);
      og.addColorStop(0,'#fff');og.addColorStop(.4,c);og.addColorStop(1,c+'00');
      ctx.beginPath();ctx.arc(R*.68,-R*.72,R*.36,0,Math.PI*2);ctx.fillStyle=og;ctx.fill();
      ctx.save();ctx.translate(R*.68,-R*.72);ctx.rotate(t);
      ctx.beginPath();ctx.ellipse(0,0,R*.48,R*.16,0,0,Math.PI*2);
      ctx.strokeStyle=c+'88';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
      ctx.shadowBlur=0;
    }
  }

  // ─── P2/AI: 섀도우 소서러 (어둠+불꽃 마법사) ───
  _drawShadowSorcerer(ctx,R,fl){
    const c=fl?'#fff':'#ff6b35', dark=fl?'#fff':'#1a0500', robe=fl?'#fff':'#2d0800', bright=fl?'#fff':'#771100';
    const gold=fl?'#fff':'#ff8800', skin=fl?'#fff':'#c87a50';
    const t=Date.now()*.0025;

    // Tattered cloak — flame-edged
    ctx.beginPath();
    ctx.moveTo(-R*.55,-R*.5);
    ctx.bezierCurveTo(-R,R*.2,-R*.85,R*1.15,-R*.28,R*1.28);
    ctx.lineTo(R*.28,R*1.28);
    ctx.bezierCurveTo(R*.85,R*1.15,R,R*.2,R*.55,-R*.5);
    ctx.fillStyle=fl?'#fff':dark+'dd';ctx.fill();
    ctx.strokeStyle=fl?'#fff':c+'33';ctx.lineWidth=1;ctx.stroke();
    // Flame fringe bottom
    if(!fl){
      ctx.strokeStyle='#ff440044';ctx.lineWidth=2;
      for(let i=0;i<5;i++){
        const fx=-R*.3+i*R*.15,ft=t*2+i;
        ctx.beginPath();ctx.moveTo(fx,R*1.18);ctx.lineTo(fx+Math.sin(ft)*R*.08,R*1.32+Math.abs(Math.sin(ft*1.3))*R*.12);ctx.stroke();
      }
    }

    // Robe body
    ctx.beginPath();ctx.ellipse(0,-R*.05,R*.52,R*.7,0,0,Math.PI*2);
    ctx.fillStyle=robe;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();

    // Chest sigil ⛧
    if(!fl){
      ctx.shadowBlur=18;ctx.shadowColor=c;
      ctx.fillStyle=c+'cc';ctx.font=`bold ${R*.42}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('⛧',0,-R*.08);ctx.shadowBlur=0;
    }

    // Horned pauldrons
    ctx.beginPath();ctx.ellipse(-R*.62,-R*.3,R*.26,R*.2,-.3,0,Math.PI*2);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
    // Left horn
    ctx.beginPath();ctx.moveTo(-R*.75,-R*.38);ctx.lineTo(-R*.92,-R*.72);ctx.lineTo(-R*.6,-R*.42);
    ctx.fillStyle=bright;ctx.fill();ctx.strokeStyle=c+'88';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.ellipse(R*.62,-R*.3,R*.26,R*.2,.3,0,Math.PI*2);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
    // Right horn
    ctx.beginPath();ctx.moveTo(R*.75,-R*.38);ctx.lineTo(R*.92,-R*.72);ctx.lineTo(R*.6,-R*.42);
    ctx.fillStyle=bright;ctx.fill();ctx.strokeStyle=c+'88';ctx.lineWidth=1;ctx.stroke();

    // Belt
    ctx.fillStyle=dark;ctx.fillRect(-R*.52,R*.28,R*1.04,R*.15);
    ctx.fillStyle=c;ctx.beginPath();ctx.arc(0,R*.35,R*.1,0,Math.PI*2);ctx.fill();

    // Neck + head
    ctx.beginPath();ctx.rect(-R*.13,-R*.58,R*.26,R*.2);ctx.fillStyle=skin;ctx.fill();
    ctx.beginPath();ctx.ellipse(0,-R*.82,R*.38,R*.4,0,0,Math.PI*2);
    ctx.fillStyle=skin;ctx.fill();ctx.strokeStyle=c+'44';ctx.lineWidth=1;ctx.stroke();

    // Face tattoo
    if(!fl){ctx.fillStyle=c+'88';ctx.fillRect(-R*.25,-R*.74,R*.5,R*.04);}

    // Demon eyes
    if(!fl){
      ctx.shadowBlur=14;ctx.shadowColor='#ff4400';
      ctx.fillStyle='#ff4400';
      ctx.beginPath();ctx.ellipse(-R*.13,-R*.84,R*.09,R*.12,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(R*.13,-R*.84,R*.09,R*.12,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#000';
      ctx.beginPath();ctx.ellipse(-R*.12,-R*.84,R*.05,R*.07,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(R*.14,-R*.84,R*.05,R*.07,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#ff8800';
      ctx.beginPath();ctx.arc(-R*.1,-R*.87,R*.025,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(R*.16,-R*.87,R*.025,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;
    }

    // Horned hood/cowl
    ctx.beginPath();ctx.ellipse(0,-R*1.02,R*.46,R*.4,0,Math.PI,0);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
    // Cowl horns
    if(!fl){
      ctx.fillStyle=bright;
      ctx.beginPath();ctx.moveTo(-R*.38,-R*1.38);ctx.lineTo(-R*.54,-R*1.8);ctx.lineTo(-R*.24,-R*1.4);ctx.closePath();ctx.fill();
      ctx.strokeStyle=c+'88';ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.moveTo(R*.38,-R*1.38);ctx.lineTo(R*.54,-R*1.8);ctx.lineTo(R*.24,-R*1.4);ctx.closePath();ctx.fill();
      ctx.stroke();
    }

    // Orb weapon (LEFT side, floating)
    if(!fl){
      const ox=R*.75, oy=-R*.5+Math.sin(t*2)*R*.08;
      ctx.shadowBlur=30;ctx.shadowColor=c;
      // Orbit rings
      ctx.save();ctx.translate(ox,oy);
      for(let ring=0;ring<3;ring++){
        ctx.save();ctx.rotate(t*(1+ring*.4)+ring*Math.PI*.66);
        ctx.beginPath();ctx.ellipse(0,0,R*.38,R*.12,0,0,Math.PI*2);
        ctx.strokeStyle=c+(ring===0?'cc':'55');ctx.lineWidth=1.5;ctx.stroke();
        ctx.restore();
      }
      // Core orb
      const og=ctx.createRadialGradient(0,0,0,0,0,R*.32);
      og.addColorStop(0,'#fff');og.addColorStop(.3,c);og.addColorStop(.7,gold);og.addColorStop(1,c+'00');
      ctx.beginPath();ctx.arc(0,0,R*.32,0,Math.PI*2);ctx.fillStyle=og;ctx.fill();
      ctx.restore();ctx.shadowBlur=0;
    }
  }
}

// ═══ CREATURE ═══
class Creature {
  constructor(x,y,def,ownerId){
    this.x=x;this.y=y;this.def=def;this.ownerId=ownerId;
    this.hp=def.hp;this.maxHp=def.hp;
    this.speed=def.speed;this.radius=def.radius;
    this.color=def.color;this.glow=def.glow;
    this.facing=ownerId===1?1:-1;
    this.vx=0;this.vy=0;this.alive=true;
    this.atkTimer=0;this.shootTimer=0;this.flash=0;this.invincible=0;
    this.trail=[];this.spawnScale=0.1;this.cid='';
  }

  update(dt,arena,players,creatures,projs){
    if(!this.alive)return;
    this.spawnScale=Math.min(1,this.spawnScale+dt*2.5);
    if(this.atkTimer>0)this.atkTimer-=dt*1000;
    if(this.shootTimer>0)this.shootTimer-=dt*1000;
    if(this.flash>0)this.flash-=dt*5;
    if(this.invincible>0)this.invincible-=dt;

    const enemy=players.find(p=>p.alive&&p.id!==this.ownerId);
    const enemyCreatures=creatures.filter(c=>c.alive&&c.ownerId!==this.ownerId);
    let target=null;
    if(enemyCreatures.length){
      let bestD=Infinity;
      enemyCreatures.forEach(c=>{const d=Math.hypot(c.x-this.x,c.y-this.y);if(d<bestD){bestD=d;target=c;}});
      if(enemy&&bestD>Math.hypot(enemy.x-this.x,enemy.y-this.y)*1.4)target=enemy;
    } else target=enemy;

    if(target){
      const dx=target.x-this.x,dy=target.y-this.y,dist=Math.sqrt(dx*dx+dy*dy)||1;
      this.facing=dx>0?1:-1;
      if(this.def.shootRange>0&&dist<this.def.shootRange&&this.shootTimer<=0){
        this.shootTimer=this.def.shootCd;
        projs.push(new Projectile(this.x,this.y,(dx/dist)*this.def.shootSpd,(dy/dist)*this.def.shootSpd,
          {name:'shot',color:this.def.color,dmg:this.def.shootDmg,speed:this.def.shootSpd,radius:this.def.shootR,pierce:this.def.pierce||false,slow:false},this.ownerId+'_c'));
      }
      if(dist<this.def.atkRange+this.radius&&this.atkTimer<=0){this.atkTimer=this.def.atkCd;if(target.takeDamage)target.takeDamage(this.def.dmg);}
      if(dist>this.def.atkRange+this.radius+4){this.vx=dx/dist;this.vy=dy/dist;}
      else{this.vx=this.vy=0;}
    } else {
      const own=players.find(p=>p.id===this.ownerId);
      if(own){const dx=own.x-this.x,dy=own.y-this.y,d=Math.sqrt(dx*dx+dy*dy);if(d>70){this.vx=dx/d*.5;this.vy=dy/d*.5;}else{this.vx*=.9;this.vy*=.9;}}
    }

    this.x+=this.vx*this.speed*dt;this.y+=this.vy*this.speed*dt;
    const pad=this.def.phase?-15:this.radius+arena.padding;
    this.x=Math.max(arena.x+pad,Math.min(arena.x+arena.w-pad,this.x));
    this.y=Math.max(arena.y+pad,Math.min(arena.y+arena.h-pad,this.y));
    this.trail.push({x:this.x,y:this.y,t:1});
    if(this.trail.length>6)this.trail.shift();
    this.trail.forEach(t=>t.t-=dt*5);
  }

  takeDamage(dmg){
    if(this.invincible>0)return;
    this.hp-=dmg;this.flash=1;this.invincible=.09;if(this.hp<=0)this.alive=false;
  }

  draw(ctx){
    const sc=this.spawnScale,x=this.x,y=this.y,f=this.facing;
    this.trail.forEach(t=>{if(t.t<=0)return;ctx.beginPath();ctx.arc(t.x,t.y,this.radius*t.t*.3,0,Math.PI*2);ctx.fillStyle=this.color+Math.floor(t.t*18).toString(16).padStart(2,'0');ctx.fill();});
    ctx.save();ctx.translate(x,y);ctx.scale(sc*f,sc);
    const fl=this.flash>0&&Math.floor(Date.now()/55)%2===0;
    const R=this.radius;
    ctx.shadowBlur=fl?20:14;ctx.shadowColor=fl?'#fff':this.glow;
    switch(this.def.id||this.def.name?.toLowerCase()){
      case'drake':    this._drawDrake(ctx,R,fl);break;
      case'specter':  this._drawSpecter(ctx,R,fl);break;
      case'golem':    this._drawGolem(ctx,R,fl);break;
      case'wisp':     this._drawWisp(ctx,R,fl);break;
      case'phoenix':  this._drawPhoenix(ctx,R,fl);break;
      case'goliath':  this._drawGoliath(ctx,R,fl);break;
      default:        this._drawWisp(ctx,R,fl);
    }
    ctx.restore();
    // HP bar
    const bw=46,bh=5,bx=x-bw/2,by=y-this.radius*sc-16;
    ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(bx-1,by-1,bw+2,bh+2);
    const hp=Math.max(0,this.hp/this.maxHp);
    ctx.fillStyle=hp>.6?this.color:hp>.3?'#ffaa00':'#ff3300';
    ctx.fillRect(bx,by,bw*hp,bh);
    ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(bx,by,bw*hp,bh*.5);
    ctx.strokeStyle=this.color+'55';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,bh);
    ctx.font='bold 8px Cinzel,serif';ctx.textAlign='center';ctx.fillStyle='#ffffffcc';
    ctx.fillText(`${Math.ceil(this.hp)}/${this.maxHp}`,x,by-2);
  }

  _drawDrake(ctx,R,fl){
    const c=fl?'#fff':this.color,dark=fl?'#fff':'#3a0800',mid=fl?'#fff':'#6a1800';
    // tail
    ctx.beginPath();ctx.moveTo(-R*.5,R*.4);ctx.quadraticCurveTo(-R*1.6,R*1.1,-R*1.1,R*.1);
    ctx.strokeStyle=c;ctx.lineWidth=3.5;ctx.lineCap='round';ctx.stroke();
    // tail spines
    if(!fl){ctx.fillStyle='#881100';for(let i=0;i<3;i++){const tx=-R*(.8+i*.25),ty=R*(.15-i*.08);ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(tx-R*.08,ty-R*.2);ctx.lineTo(tx+R*.08,ty);ctx.closePath();ctx.fill();}}
    // body
    ctx.beginPath();ctx.ellipse(R*.05,R*.08,R*1.1,R*.72,0,0,Math.PI*2);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.8;ctx.stroke();
    // underbelly
    ctx.beginPath();ctx.ellipse(R*.12,R*.18,R*.62,R*.42,0,0,Math.PI*2);
    ctx.fillStyle=fl?'#fff':'#991e00';ctx.fill();
    // dorsal spines
    if(!fl){ctx.fillStyle='#bb2200';for(let i=0;i<5;i++){const sx=-R*.55+i*R*.28,sy=-R*.35;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+R*.06,-R*.68-i*.02*R);ctx.lineTo(sx+R*.16,sy);ctx.closePath();ctx.fill();}}
    // wing
    ctx.beginPath();ctx.moveTo(-R*.05,-R*.22);ctx.bezierCurveTo(R*.1,-R*1.65,R*.9,-R*1.38,R*.58,-R*.55);
    ctx.bezierCurveTo(R*.38,-R*.38,R*.12,-R*.28,-R*.05,-R*.22);
    ctx.fillStyle=fl?'#fff':'#2a0600cc';ctx.fill();ctx.strokeStyle=c+'aa';ctx.lineWidth=1.2;ctx.stroke();
    if(!fl){ctx.strokeStyle=c+'44';ctx.lineWidth=.9;['.1,-1.5','.35,-1.12','.55,-.72'].forEach(p=>{const[px,py]=p.split(',').map(Number);ctx.beginPath();ctx.moveTo(-R*.05,-R*.22);ctx.lineTo(px*R,py*R);ctx.stroke();});}
    // head
    ctx.beginPath();ctx.ellipse(R*.9,-R*.2,R*.58,R*.46,-.12,0,Math.PI*2);
    ctx.fillStyle=mid;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.8;ctx.stroke();
    // horns
    if(!fl){ctx.fillStyle='#cc3300';ctx.beginPath();ctx.moveTo(R*.68,-R*.56);ctx.lineTo(R*.6,-R*.92);ctx.lineTo(R*.82,-R*.6);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(R*.88,-R*.58);ctx.lineTo(R*.84,-R*.96);ctx.lineTo(R*1.0,-R*.62);ctx.closePath();ctx.fill();}
    // snout
    ctx.beginPath();ctx.ellipse(R*1.36,-R*.28,R*.3,R*.18,0,0,Math.PI*2);
    ctx.fillStyle=fl?'#fff':'#8a1a00';ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1;ctx.stroke();
    if(!fl){ctx.fillStyle='#000';ctx.beginPath();ctx.arc(R*1.56,-R*.22,R*.046,0,Math.PI*2);ctx.fill();}
    // eye
    ctx.fillStyle=fl?'#fff':'#ffcc00';ctx.shadowColor='#ffcc00';ctx.shadowBlur=fl?0:10;
    ctx.beginPath();ctx.arc(R*.96,-R*.36,R*.15,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.beginPath();ctx.arc(R*.99,-R*.37,R*.075,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(R*1.02,-R*.39,R*.032,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    // legs
    ctx.strokeStyle=mid;ctx.lineWidth=3.5;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-R*.32,R*.62);ctx.lineTo(-R*.42,R*1.12);ctx.lineTo(-R*.2,R*1.12);ctx.stroke();
    ctx.beginPath();ctx.moveTo(R*.28,R*.62);ctx.lineTo(R*.4,R*1.12);ctx.lineTo(R*.6,R*1.12);ctx.stroke();
    // fire breath
    if(!fl&&this.shootTimer<400){
      ctx.save();ctx.translate(R*1.55,-R*.28);
      for(let i=0;i<4;i++){const ft=Date.now()*.006+i*1.1;const fg=ctx.createRadialGradient(i*R*.22,0,0,i*R*.22,0,R*.24);fg.addColorStop(0,'#ffffffff');fg.addColorStop(.35,'#ff8800cc');fg.addColorStop(1,'transparent');ctx.beginPath();ctx.arc(i*R*.22,Math.sin(ft)*R*.1,R*.19,0,Math.PI*2);ctx.fillStyle=fg;ctx.fill();}
      ctx.restore();
    }
  }

  _drawSpecter(ctx,R,fl){
    const t=Date.now()*.004;
    ctx.beginPath();ctx.moveTo(-R,0);
    ctx.bezierCurveTo(-R,-R*1.7,R,-R*1.7,R,0);
    ctx.bezierCurveTo(R*.62,R*.75+Math.sin(t)*R*.2,R*.2,R*.55-Math.sin(t)*R*.15,0,R*.9);
    ctx.bezierCurveTo(-R*.2,R*.55+Math.sin(t)*R*.15,-R*.62,R*.75-Math.sin(t)*R*.2,-R,0);
    ctx.fillStyle=fl?'rgba(255,255,255,.9)':'rgba(148,100,255,.72)';ctx.fill();
    ctx.strokeStyle=fl?'#fff':this.color+'bb';ctx.lineWidth=1.5;ctx.stroke();
    if(!fl){
      const ig=ctx.createRadialGradient(0,-R*.5,0,0,-R*.5,R*.9);
      ig.addColorStop(0,'rgba(200,170,255,.55)');ig.addColorStop(1,'transparent');
      ctx.beginPath();ctx.ellipse(0,-R*.5,R*.9,R*.9,0,0,Math.PI*2);ctx.fillStyle=ig;ctx.fill();
      // chains
      ctx.strokeStyle=this.glow+'44';ctx.lineWidth=1.2;
      for(let chain=0;chain<2;chain++){const cx=(chain-.5)*R*.6;ctx.beginPath();for(let i=0;i<5;i++){const cy=-R*.7+i*R*.35;ctx.arc(cx+Math.sin(t+i)*.03,cy,R*.06,0,Math.PI*2);}ctx.stroke();}
    }
    ctx.shadowBlur=fl?0:16;ctx.shadowColor='#cc88ff';
    ctx.fillStyle=fl?'#fff':'#fff';
    ctx.beginPath();ctx.ellipse(-R*.28,-R*.58,R*.2,R*.25,-.1,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(R*.28,-R*.58,R*.2,R*.25,.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=fl?'#aaa':'#6600bb';
    ctx.beginPath();ctx.ellipse(-R*.28,-R*.58,R*.1,R*.14,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(R*.28,-R*.58,R*.1,R*.14,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(0,-R*.22,R*.22,0,Math.PI);ctx.strokeStyle=fl?'#fff':'#8833ff';ctx.lineWidth=2.2;ctx.stroke();
    if(!fl){ctx.strokeStyle='#8833ff55';ctx.lineWidth=1;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-R*.08+i*R*.08,-R*.22);ctx.lineTo(-R*.08+i*R*.08,-R*.08+Math.sin(t+i)*R*.04);ctx.stroke();}}
    ctx.strokeStyle=fl?'#fff':this.color+'88';ctx.lineWidth=2.2;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-R*.85,-R*.45);ctx.quadraticCurveTo(-R*1.3,-R*.08,-R*1.05,R*.25);ctx.stroke();
    ctx.beginPath();ctx.moveTo(R*.85,-R*.45);ctx.quadraticCurveTo(R*1.3,-R*.08,R*1.05,R*.25);ctx.stroke();
    ctx.shadowBlur=0;
  }

  _drawGolem(ctx,R,fl){
    const c=fl?'#fff':this.color,stone=fl?'#fff':'#3a4f6a',dark=fl?'#fff':'#1e2f40';
    ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(0,R*.95,R*.82,R*.22,0,0,Math.PI*2);ctx.fill();
    // fists
    [[-1.22,1],[1.22,-1]].forEach(([ex,side])=>{
      ctx.beginPath();ctx.ellipse(R*ex*side,R*.06,R*.4,R*.36,side*.22,0,Math.PI*2);
      ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=2;ctx.stroke();
      ctx.beginPath();ctx.ellipse(R*ex*side*.98,-R*.04,R*.3,R*.26,side*.22,0,Math.PI*2);
      ctx.fillStyle=stone;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1;ctx.stroke();
      // knuckle lines
      if(!fl){ctx.strokeStyle=dark;ctx.lineWidth=1;for(let k=0;k<3;k++){const kx=R*ex*side+(k-.5)*R*.12;ctx.beginPath();ctx.moveTo(kx,-R*.06);ctx.lineTo(kx,R*.04);ctx.stroke();}}
    });
    ctx.beginPath();ctx.roundRect(-R*.78,-R*.64,R*1.56,R*1.62,R*.2);
    ctx.fillStyle=stone;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=2.2;ctx.stroke();
    // armor plates
    if(!fl){ctx.strokeStyle=dark;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-R*.78,-R*.1);ctx.lineTo(R*.78,-R*.1);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-R*.64);ctx.lineTo(0,R*.98);ctx.stroke();}
    if(!fl){
      ctx.shadowBlur=20;ctx.shadowColor=this.glow;
      const cg=ctx.createRadialGradient(0,-R*.12,0,0,-R*.12,R*.42);
      cg.addColorStop(0,'#fff');cg.addColorStop(.38,this.glow);cg.addColorStop(1,this.glow+'00');
      ctx.beginPath();ctx.arc(0,-R*.12,R*.42,0,Math.PI*2);ctx.fillStyle=cg;ctx.fill();ctx.shadowBlur=0;
    }
    ctx.beginPath();ctx.roundRect(-R*.44,-R*.52,R*.88,R*.82,R*.12);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c+'88';ctx.lineWidth=1;ctx.stroke();
    if(!fl){ctx.strokeStyle=dark;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-R*.26,R*.12);ctx.lineTo(R*.08,R*.52);ctx.lineTo(R*.3,R*.38);ctx.stroke();ctx.beginPath();ctx.moveTo(R*.38,-R*.22);ctx.lineTo(R*.1,-R*.48);ctx.stroke();}
    ctx.beginPath();ctx.roundRect(-R*.6,-R*1.65,R*1.2,R*1.0,R*.14);
    ctx.fillStyle=stone;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=2.2;ctx.stroke();
    // face plate
    ctx.beginPath();ctx.roundRect(-R*.44,-R*1.52,R*.88,R*.6,R*.08);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c+'55';ctx.lineWidth=1;ctx.stroke();
    ctx.shadowBlur=fl?0:18;ctx.shadowColor=this.glow;
    ctx.fillStyle=fl?'#fff':this.color;
    ctx.beginPath();ctx.roundRect(-R*.38,-R*1.48,R*.3,R*.28,R*.06);ctx.fill();
    ctx.beginPath();ctx.roundRect(R*.08,-R*1.48,R*.3,R*.28,R*.06);ctx.fill();
    ctx.shadowBlur=0;
    if(!fl){ctx.fillStyle='#556677';[[-R*.46,-R*1.6],[R*.46,-R*1.6],[-R*.46,-R*.78],[R*.46,-R*.78]].forEach(([rx,ry])=>{ctx.beginPath();ctx.arc(rx,ry,R*.065,0,Math.PI*2);ctx.fill();});}
    // mouth grill
    if(!fl){ctx.strokeStyle=c+'66';ctx.lineWidth=1;for(let m=0;m<4;m++){ctx.beginPath();ctx.moveTo(-R*.22+m*R*.14,-R*1.05);ctx.lineTo(-R*.22+m*R*.14,-R*.92);ctx.stroke();}}
  }

  _drawWisp(ctx,R,fl){
    const t=Date.now()*.003;
    if(!fl){const hg=ctx.createRadialGradient(0,0,R*.3,0,0,R*2.4);hg.addColorStop(0,this.glow+'55');hg.addColorStop(1,this.glow+'00');ctx.beginPath();ctx.arc(0,0,R*2.4,0,Math.PI*2);ctx.fillStyle=hg;ctx.fill();}
    if(!fl){
      for(let orbit=0;orbit<3;orbit++){
        const oa=t*(1+orbit*.4)+orbit*Math.PI*.66;
        ctx.save();ctx.rotate(oa);
        ctx.beginPath();for(let i=0;i<24;i++){const a=(i/24)*Math.PI*2,r=R*(.82-orbit*.16);i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r*.38):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r*.38);}
        ctx.strokeStyle=this.color+(orbit===0?'aa':orbit===1?'66':'44');ctx.lineWidth=1.8;ctx.stroke();ctx.restore();
      }
    }
    const cg=ctx.createRadialGradient(0,0,0,0,0,R);
    cg.addColorStop(0,'#ffffff');cg.addColorStop(.3,fl?'#fff':this.color);cg.addColorStop(.7,fl?'#fff':this.glow+'99');cg.addColorStop(1,'transparent');
    ctx.beginPath();ctx.arc(0,0,R,0,Math.PI*2);ctx.fillStyle=cg;ctx.fill();
    if(!fl){
      ctx.shadowBlur=12;ctx.shadowColor=this.color;
      for(let i=0;i<6;i++){const ma=t+i*Math.PI/3,mr=R*.78,ms=R*.16+Math.sin(t*2+i)*.04;ctx.beginPath();ctx.arc(Math.cos(ma)*mr,Math.sin(ma)*mr,ms,0,Math.PI*2);ctx.fillStyle=i%2===0?this.color:this.glow;ctx.fill();}
      ctx.shadowBlur=0;
    }
    ctx.strokeStyle=fl?'#fff':'#ffffffcc';ctx.lineWidth=1.4;ctx.beginPath();
    for(let i=0;i<5;i++){const a=-Math.PI*.5+i*Math.PI*.4,ir=i%2===0?R*.58:R*.28;i===0?ctx.moveTo(Math.cos(a)*ir,Math.sin(a)*ir):ctx.lineTo(Math.cos(a)*ir,Math.sin(a)*ir);}
    ctx.closePath();ctx.stroke();
  }

  _drawPhoenix(ctx,R,fl){
    const c=fl?'#fff':this.color,dark=fl?'#fff':'#441100',gold=fl?'#fff':'#ffaa00';
    const t=Date.now()*.005;
    // Flame aura
    if(!fl){for(let i=0;i<6;i++){const fa=t*1.5+i*Math.PI/3,fr=R*(.9+Math.sin(t+i)*.25);const fg=ctx.createRadialGradient(Math.cos(fa)*fr*.5,Math.sin(fa)*fr*.5,0,Math.cos(fa)*fr*.5,Math.sin(fa)*fr*.5,fr*.5);fg.addColorStop(0,'#ff8800cc');fg.addColorStop(1,'transparent');ctx.beginPath();ctx.arc(Math.cos(fa)*fr*.5,Math.sin(fa)*fr*.5,fr*.5,0,Math.PI*2);ctx.fillStyle=fg;ctx.fill();}}
    // Wings
    ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-R*1.2,-R*.6,-R*1.8,R*.2,-R*1.4,R*.5);ctx.bezierCurveTo(-R*.8,R*.4,-R*.4,R*.2,0,R*.2);
    ctx.fillStyle=fl?'#fff':'#882200cc';ctx.fill();ctx.strokeStyle=c+'88';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(R*1.2,-R*.6,R*1.8,R*.2,R*1.4,R*.5);ctx.bezierCurveTo(R*.8,R*.4,R*.4,R*.2,0,R*.2);
    ctx.fillStyle=fl?'#fff':'#882200cc';ctx.fill();ctx.strokeStyle=c+'88';ctx.lineWidth=1;ctx.stroke();
    // Wing feather tips
    if(!fl){[[-1.6,.35],[-1.3,-.4],[-1.0,-.7],[1.6,.35],[1.3,-.4],[1.0,-.7]].forEach(([wx,wy])=>{ctx.beginPath();ctx.arc(wx*R,wy*R,R*.12,0,Math.PI*2);ctx.fillStyle='#ff6600';ctx.fill();});}
    // Body
    ctx.beginPath();ctx.ellipse(0,-R*.1,R*.42,R*.62,0,0,Math.PI*2);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
    // Breast
    ctx.beginPath();ctx.ellipse(R*.08,R*.06,R*.28,R*.38,0,0,Math.PI*2);
    ctx.fillStyle=fl?'#fff':'#cc3300';ctx.fill();
    // Head
    ctx.beginPath();ctx.ellipse(0,-R*.72,R*.3,R*.3,0,0,Math.PI*2);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.2;ctx.stroke();
    // Crest
    if(!fl){ctx.fillStyle=gold;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-R*.08+i*R*.08,-R*.95);ctx.lineTo(-R*.06+i*R*.08,-R*(1.15+i*.08));ctx.lineTo(R*.06+i*R*.08,-R*.95);ctx.closePath();ctx.fill();}}
    // Eye
    ctx.fillStyle=fl?'#fff':gold;ctx.shadowColor=gold;ctx.shadowBlur=fl?0:8;
    ctx.beginPath();ctx.arc(R*.1,-R*.74,R*.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.beginPath();ctx.arc(R*.12,-R*.75,R*.05,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    // Beak
    ctx.beginPath();ctx.moveTo(R*.28,-R*.72);ctx.lineTo(R*.48,-R*.76);ctx.lineTo(R*.28,-R*.68);ctx.fillStyle=gold;ctx.fill();
  }

  _drawGoliath(ctx,R,fl){
    const c=fl?'#fff':this.color,dark=fl?'#fff':'#0a1f10',stone=fl?'#fff':'#1a4028';
    const bright=fl?'#fff':'#2a6040';
    // Shadow
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(0,R*1.1,R*1.0,R*.26,0,0,Math.PI*2);ctx.fill();
    // Giant arms
    ctx.beginPath();ctx.ellipse(-R*1.35,R*.1,R*.55,R*.42,-.25,0,Math.PI*2);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=2.2;ctx.stroke();
    ctx.beginPath();ctx.ellipse(R*1.35,R*.1,R*.55,R*.42,.25,0,Math.PI*2);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=2.2;ctx.stroke();
    // Hands
    ctx.beginPath();ctx.ellipse(-R*1.65,R*.15,R*.38,R*.3,-.1,0,Math.PI*2);
    ctx.fillStyle=stone;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
    ctx.beginPath();ctx.ellipse(R*1.65,R*.15,R*.38,R*.3,.1,0,Math.PI*2);
    ctx.fillStyle=stone;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=1.5;ctx.stroke();
    // Body
    ctx.beginPath();ctx.roundRect(-R*.92,-R*.72,R*1.84,R*1.82,R*.22);
    ctx.fillStyle=stone;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=2.5;ctx.stroke();
    // Plates
    if(!fl){ctx.strokeStyle=dark;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-R*.92,-R*.1);ctx.lineTo(R*.92,-R*.1);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-R*.72);ctx.lineTo(0,R*1.1);ctx.stroke();}
    // Core crystal
    if(!fl){ctx.shadowBlur=24;ctx.shadowColor=this.glow;const cg=ctx.createRadialGradient(0,-R*.16,0,0,-R*.16,R*.52);cg.addColorStop(0,'#fff');cg.addColorStop(.35,this.glow);cg.addColorStop(1,this.glow+'00');ctx.beginPath();ctx.arc(0,-R*.16,R*.52,0,Math.PI*2);ctx.fillStyle=cg;ctx.fill();ctx.shadowBlur=0;}
    // Chest armor
    ctx.beginPath();ctx.roundRect(-R*.52,-R*.6,R*1.04,R*1.0,R*.14);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c+'88';ctx.lineWidth=1.2;ctx.stroke();
    if(!fl){ctx.strokeStyle=bright;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-R*.3,R*.1);ctx.lineTo(R*.1,R*.6);ctx.lineTo(R*.38,R*.44);ctx.stroke();ctx.beginPath();ctx.moveTo(R*.44,-R*.26);ctx.lineTo(R*.12,-R*.55);ctx.stroke();}
    // Head (larger)
    ctx.beginPath();ctx.roundRect(-R*.72,-R*1.88,R*1.44,R*1.16,R*.16);
    ctx.fillStyle=stone;ctx.fill();ctx.strokeStyle=c;ctx.lineWidth=2.5;ctx.stroke();
    ctx.beginPath();ctx.roundRect(-R*.55,-R*1.74,R*1.1,R*.72,R*.1);
    ctx.fillStyle=dark;ctx.fill();ctx.strokeStyle=c+'55';ctx.lineWidth=1.2;ctx.stroke();
    ctx.shadowBlur=fl?0:22;ctx.shadowColor=this.glow;
    ctx.fillStyle=fl?'#fff':this.color;
    ctx.beginPath();ctx.roundRect(-R*.46,-R*1.7,R*.36,R*.32,R*.07);ctx.fill();
    ctx.beginPath();ctx.roundRect(R*.1,-R*1.7,R*.36,R*.32,R*.07);ctx.fill();
    ctx.shadowBlur=0;
    // Teeth grill
    if(!fl){ctx.strokeStyle=c+'55';ctx.lineWidth=1.2;for(let m=0;m<5;m++){ctx.beginPath();ctx.moveTo(-R*.3+m*R*.15,-R*1.15);ctx.lineTo(-R*.3+m*R*.15,-R*.97);ctx.stroke();}}
    if(!fl){ctx.fillStyle='#224433';[[-R*.55,-R*1.84],[R*.55,-R*1.84],[-R*.55,-R*.9],[R*.55,-R*.9]].forEach(([rx,ry])=>{ctx.beginPath();ctx.arc(rx,ry,R*.08,0,Math.PI*2);ctx.fill();});}
  }
}

// ═══ PROJECTILE ═══
class Projectile {
  constructor(x,y,vx,vy,spell,ownerId){
    this.x=x;this.y=y;this.vx=vx;this.vy=vy;
    this.spell=spell;this.ownerId=ownerId;
    this.radius=spell.radius;this.alive=true;this.age=0;this.trail=[];
  }
  update(dt,arena){
    this.age+=dt;if(this.age>5){this.alive=false;return;}
    this.trail.push({x:this.x,y:this.y});if(this.trail.length>14)this.trail.shift();
    this.x+=this.vx*60*dt;this.y+=this.vy*60*dt;
    if(this.x<arena.x||this.x>arena.x+arena.w||this.y<arena.y||this.y>arena.y+arena.h)this.alive=false;
  }
  draw(ctx){
    this.trail.forEach((t,i)=>{const a=i/this.trail.length;ctx.beginPath();ctx.arc(t.x,t.y,this.radius*a*.65,0,Math.PI*2);ctx.fillStyle=this.spell.color+Math.floor(a*70).toString(16).padStart(2,'0');ctx.fill();});
    ctx.save();ctx.shadowBlur=22;ctx.shadowColor=this.spell.color;
    ctx.beginPath();ctx.arc(this.x,this.y,this.radius,0,Math.PI*2);
    const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.radius);
    g.addColorStop(0,'#fff');g.addColorStop(.45,this.spell.color);g.addColorStop(1,this.spell.color+'00');
    ctx.fillStyle=g;ctx.fill();ctx.restore();
  }
}

class ManaOrb {
  constructor(x,y){this.x=x;this.y=y;this.r=9;this.alive=true;this.age=0;this.bob=Math.random()*Math.PI*2;}
  update(dt){this.age+=dt;this.bob+=dt*2.8;if(this.age>18)this.alive=false;}
  draw(ctx){
    const y=this.y+Math.sin(this.bob)*4;
    ctx.save();ctx.shadowBlur=22;ctx.shadowColor='#a855f7';
    const g=ctx.createRadialGradient(this.x,y,0,this.x,y,this.r);
    g.addColorStop(0,'#fff');g.addColorStop(.4,'#c084fc');g.addColorStop(1,'#a855f700');
    ctx.beginPath();ctx.arc(this.x,y,this.r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();ctx.restore();
  }
}

class Particle {
  constructor(x,y,col,vx,vy,sz,life){this.x=x;this.y=y;this.color=col;this.vx=vx;this.vy=vy;this.sz=sz;this.life=life;this.maxLife=life;this.alive=true;}
  update(dt){this.life-=dt;if(this.life<=0){this.alive=false;return;}this.x+=this.vx*dt*60;this.y+=this.vy*dt*60;this.vy+=.1;this.vx*=.97;}
  draw(ctx){const a=this.life/this.maxLife;ctx.beginPath();ctx.arc(this.x,this.y,this.sz*a,0,Math.PI*2);ctx.fillStyle=this.color+Math.floor(a*255).toString(16).padStart(2,'0');ctx.fill();}
}
