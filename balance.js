// Early-game balance: keep Wave 1 enemies below 10 HP while preserving the later ramp.
window.enemy=function(){
  const p=pos(),a=Math.random()*Math.PI*2,r=Math.max(canvas.clientWidth,canvas.clientHeight)*.58+30;
  const boss=state.wave%10===0&&state.spawned===waveSize()-1;
  const type=boss?'boss':Math.random()<.16?'tank':Math.random()<.18?'swift':'normal';
  let hp=(5+state.wave*3)*Math.pow(1.035,state.wave-1),speed=25+state.wave*1.8+Math.random()*9,reward=7+Math.floor(state.wave*1.5),rad=9;
  if(type==='tank'){hp*=3;speed*=.55;rad=15;reward*=2}
  if(type==='swift'){hp*=.55;speed*=1.8;rad=7;reward*=1.3}
  if(boss){hp*=18;speed*=.45;rad=27;reward*=15}
  hp=Math.max(1,Math.floor(hp));
  return {x:p.x+Math.cos(a)*r,y:p.y+Math.sin(a)*r,hp,maxHp:hp,speed,radius:rad,reward:Math.floor(reward*(1+perm.levels.income*.05)),type,wobble:Math.random()*7};
};
