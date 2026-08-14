(function(){
  const speeds=[0.5,1,1.5,2,2.5,3,3.5,4];
  let speed=1;
  let realLast=null;
  let virtualTime=null;
  const originalRAF=window.requestAnimationFrame.bind(window);

  window.towerSpeed=speed;
  window.setTowerSpeed=function(value){
    speed=Math.max(0.5,Math.min(4,Number(value)||1));
    window.towerSpeed=speed;
    const label=document.getElementById('speed-multiplier-value');
    if(label) label.textContent=speed.toFixed(1)+'×';
    document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===speed));
  };

  window.requestAnimationFrame=function(callback){
    return originalRAF(function(realNow){
      if(realLast===null){realLast=realNow;virtualTime=realNow;}
      else {virtualTime+=(realNow-realLast)*speed;realLast=realNow;}
      callback(virtualTime);
    });
  };

  function createControls(){
    const wrap=document.createElement('div');
    wrap.id='speed-controls';
    wrap.innerHTML='<span>GAME SPEED</span><div class="speed-buttons">'+speeds.map(s=>`<button type="button" data-speed="${s}">${s}×</button>`).join('')+'</div><strong id="speed-multiplier-value">1.0×</strong>';
    Object.assign(wrap.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'1000',padding:'10px 12px',border:'1px solid rgba(125,167,255,.25)',borderRadius:'12px',background:'rgba(9,17,31,.94)',backdropFilter:'blur(10px)',boxShadow:'0 10px 30px rgba(0,0,0,.25)',font:'600 11px system-ui',color:'#b5c1d1',textAlign:'center'});
    const buttons=wrap.querySelector('.speed-buttons');
    Object.assign(buttons.style,{display:'flex',gap:'4px',marginTop:'6px'});
    wrap.querySelectorAll('button').forEach(b=>{Object.assign(b.style,{border:'1px solid rgba(125,167,255,.2)',borderRadius:'7px',padding:'5px 7px',background:'#122033',color:'#b5c1d1',cursor:'pointer',font:'700 11px system-ui'});b.onclick=()=>window.setTowerSpeed(b.dataset.speed)});
    const style=document.createElement('style');
    style.textContent='#speed-controls button.active{background:#69e0c0!important;color:#07131a!important;border-color:#69e0c0!important}#speed-controls strong{display:block;margin-top:5px;color:#69e0c0;font-size:12px}';
    document.head.appendChild(style);document.body.appendChild(wrap);window.setTowerSpeed(1);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',createControls);else createControls();
})();
