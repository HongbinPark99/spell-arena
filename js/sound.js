// ════════════════════════════════════════
//  sound.js — 게임 효과음
//  Web Audio API 절차적 사운드 생성
//  (별도 파일 없이 코드로 소리 합성)
//
//  사용법: playSFX('spell'), playSFX('hit') 등
//  BGM:    startBGM() / stopBGM()
// ════════════════════════════════════════

let _ac = null;
let _bgmNode = null;
let _masterGain = null;
let _sfxMuted = false;
let _bgmMuted = false;

function getAC(){
  if(!_ac){
    _ac = new (window.AudioContext||window.webkitAudioContext)();
    _masterGain = _ac.createGain();
    _masterGain.gain.value = 0.6;
    _masterGain.connect(_ac.destination);
  }
  // 브라우저 자동재생 정책: 첫 상호작용 후 resume
  if(_ac.state==='suspended') _ac.resume();
  return _ac;
}

// ─── 효과음 플레이 ────────────────────────
function playSFX(name, vol=0.5){
  if(_sfxMuted)return;
  try{
    const ac=getAC();
    switch(name){
      case 'spell':    _sfxSpell(ac,vol);    break;
      case 'frost':    _sfxFrost(ac,vol);    break;
      case 'lightning':_sfxLightning(ac,vol);break;
      case 'vortex':   _sfxVortex(ac,vol);   break;
      case 'hit':      _sfxHit(ac,vol);      break;
      case 'swordHit': _sfxSwordHit(ac,vol); break;
      case 'sword':    _sfxSwordSwing(ac,vol);break;
      case 'summon':   _sfxSummon(ac,vol);   break;
      case 'death':    _sfxDeath(ac,vol);    break;
      case 'mana':     _sfxMana(ac,vol);     break;
      case 'victory':  _sfxVictory(ac,vol);  break;
      case 'defeat':   _sfxDefeat(ac,vol);   break;
      default:         _sfxHit(ac,vol);
    }
  }catch(e){}
}

function _makeGain(ac,vol,mg){
  const g=ac.createGain(); g.gain.value=vol;
  g.connect(mg||_masterGain); return g;
}
function _osc(ac,type,freq,start,dur,g){
  const o=ac.createOscillator(); o.type=type; o.frequency.value=freq;
  o.connect(g); o.start(start); o.stop(start+dur); return o;
}
function _ramp(param,from,to,start,dur){
  param.setValueAtTime(from,start);
  param.exponentialRampToValueAtTime(Math.max(0.001,to),start+dur);
}

// 파이어볼 — 붐 + 사각 웨이브
function _sfxSpell(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol);
  // 발사음: 짧은 붐
  const o=ac.createOscillator(); o.type='sawtooth';
  o.frequency.setValueAtTime(280,t);
  o.frequency.exponentialRampToValueAtTime(80,t+0.18);
  o.connect(g); o.start(t); o.stop(t+0.2);
  // 노이즈 레이어
  _noiseShot(ac,_makeGain(ac,vol*0.3),t,0.15,1800);
  _ramp(g.gain, vol, 0.001, t, 0.2);
}

// 프로스트 — 얼음 크리스탈 고음
function _sfxFrost(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol*0.8);
  for(let i=0;i<3;i++){
    const o=ac.createOscillator(); o.type='sine';
    o.frequency.value=1200+i*320;
    o.connect(g); o.start(t+i*.04); o.stop(t+0.3+i*.02);
  }
  _ramp(g.gain,vol*0.8,0.001,t,0.35);
}

// 라이트닝 — 날카로운 크랙
function _sfxLightning(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol);
  _noiseShot(ac,g,t,0.08,4000);
  const o=ac.createOscillator(); o.type='square';
  o.frequency.setValueAtTime(600,t);
  o.frequency.exponentialRampToValueAtTime(50,t+0.12);
  o.connect(g); o.start(t); o.stop(t+0.15);
  _ramp(g.gain,vol,0.001,t,0.15);
}

// 보텍스 — 소용돌이 휘파람
function _sfxVortex(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol*0.7);
  const o=ac.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(200,t);
  o.frequency.linearRampToValueAtTime(900,t+0.4);
  o.frequency.linearRampToValueAtTime(300,t+0.7);
  o.connect(g); o.start(t); o.stop(t+0.8);
  _ramp(g.gain,vol*0.7,0.001,t+0.3,0.5);
}

// 피격
function _sfxHit(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol);
  _noiseShot(ac,g,t,0.1,800);
  const o=ac.createOscillator(); o.type='triangle';
  o.frequency.setValueAtTime(300,t);
  o.frequency.exponentialRampToValueAtTime(60,t+0.1);
  o.connect(g); o.start(t); o.stop(t+0.12);
  _ramp(g.gain,vol,0.001,t,0.12);
}

// 검 휘두르기
function _sfxSwordSwing(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol*0.5);
  _noiseShot(ac,g,t,0.12,3500);
  _ramp(g.gain,vol*0.5,0.001,t+0.02,0.1);
}

// 검 히트
function _sfxSwordHit(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol);
  // 금속 충돌 클랭크
  for(let i=0;i<2;i++){
    const o=ac.createOscillator(); o.type='square';
    o.frequency.value=i===0?800:1200;
    o.connect(g); o.start(t+i*.01); o.stop(t+0.18);
  }
  _noiseShot(ac,g,t,0.05,2000);
  _ramp(g.gain,vol,0.001,t,0.2);
}

// 소환
function _sfxSummon(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol*0.8);
  // 상승하는 마법 음계
  [200,320,480,640].forEach((f,i)=>{
    const o=ac.createOscillator(); o.type='sine';
    o.frequency.value=f;
    o.connect(g); o.start(t+i*.08); o.stop(t+i*.08+0.18);
  });
  _ramp(g.gain,vol*0.8,0.001,t+0.3,0.25);
}

// 사망
function _sfxDeath(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol);
  const o=ac.createOscillator(); o.type='sawtooth';
  o.frequency.setValueAtTime(400,t);
  o.frequency.exponentialRampToValueAtTime(40,t+0.6);
  o.connect(g); o.start(t); o.stop(t+0.7);
  _noiseShot(ac,g,t,0.3,600);
  _ramp(g.gain,vol,0.001,t+0.2,0.5);
}

// 마나 획득 — 영롱한 팅
function _sfxMana(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol*0.6);
  [880,1320,1760].forEach((f,i)=>{
    const o=ac.createOscillator(); o.type='sine';
    o.frequency.value=f;
    o.connect(g); o.start(t+i*.05); o.stop(t+i*.05+0.25);
  });
  _ramp(g.gain,vol*0.6,0.001,t,0.4);
}

// 승리 팡파레
function _sfxVictory(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol*0.7);
  [523,659,784,1047].forEach((f,i)=>{
    const o=ac.createOscillator(); o.type='square';
    o.frequency.value=f;
    o.connect(g); o.start(t+i*.1); o.stop(t+i*.1+0.2);
  });
  _ramp(g.gain,vol*0.7,0.001,t+0.38,0.22);
}

// 패배 음
function _sfxDefeat(ac,vol){
  const t=ac.currentTime, g=_makeGain(ac,vol*0.6);
  [440,350,280,210].forEach((f,i)=>{
    const o=ac.createOscillator(); o.type='sine';
    o.frequency.value=f;
    o.connect(g); o.start(t+i*.15); o.stop(t+i*.15+0.25);
  });
  _ramp(g.gain,vol*0.6,0.001,t+0.4,0.3);
}

// ─── 노이즈 헬퍼 ─────────────────────────
function _noiseShot(ac,destGain,start,dur,cutoff){
  const buf=ac.createBuffer(1,ac.sampleRate*dur,ac.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  const src=ac.createBufferSource(); src.buffer=buf;
  const filt=ac.createBiquadFilter(); filt.type='lowpass'; filt.frequency.value=cutoff||2000;
  src.connect(filt); filt.connect(destGain);
  src.start(start); src.stop(start+dur);
}

// ─── BGM — 앰비언트 아케인 루프 ───────────
function startBGM(){
  if(_bgmMuted||_bgmNode)return;
  try{
    const ac=getAC();
    const master=ac.createGain(); master.gain.value=0.08; master.connect(ac.destination);

    // 드론 레이어 1 — 저음 패드
    const d1=ac.createOscillator(); d1.type='sine'; d1.frequency.value=55;
    const d1g=ac.createGain(); d1g.gain.value=0.4;
    d1.connect(d1g); d1g.connect(master); d1.start();

    // 드론 레이어 2 — 5도 위
    const d2=ac.createOscillator(); d2.type='triangle'; d2.frequency.value=82.5;
    const d2g=ac.createGain(); d2g.gain.value=0.2;
    d2.connect(d2g); d2g.connect(master); d2.start();

    // 펄스 LFO — 드론 진폭 변조
    const lfo=ac.createOscillator(); lfo.type='sine'; lfo.frequency.value=0.15;
    const lfoG=ac.createGain(); lfoG.gain.value=0.15;
    lfo.connect(lfoG); lfoG.connect(d1g.gain);
    lfo.start();

    // 고음 shimmer
    const sh=ac.createOscillator(); sh.type='sine'; sh.frequency.value=440;
    const shg=ac.createGain(); shg.gain.value=0.05;
    sh.connect(shg); shg.connect(master); sh.start();

    _bgmNode={stop:()=>{ try{d1.stop();d2.stop();lfo.stop();sh.stop();}catch(e){} master.disconnect(); }};
  }catch(e){}
}

function stopBGM(){
  if(_bgmNode){ _bgmNode.stop(); _bgmNode=null; }
}

// ─── 뮤트 토글 ────────────────────────────
function toggleSFX(){ _sfxMuted=!_sfxMuted; }
function toggleBGM(){
  _bgmMuted=!_bgmMuted;
  if(_bgmMuted) stopBGM(); else startBGM();
}

// ─── 스펠 인덱스로 소리 ───────────────────
const SPELL_SOUNDS=['spell','frost','lightning','vortex'];
function playSFXForSpell(idx){ playSFX(SPELL_SOUNDS[idx]||'spell'); }

// 게임 시작 시 BGM 자동 시작 (첫 클릭 필요)
document.addEventListener('click', ()=>{ if(!_bgmNode&&!_bgmMuted) startBGM(); }, {once:true});
document.addEventListener('keydown',()=>{ if(!_bgmNode&&!_bgmMuted) startBGM(); }, {once:true});
