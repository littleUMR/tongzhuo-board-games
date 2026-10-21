(function(){
 const $=id=>document.getElementById(id),base='/vendor/table-interactions/';
 const choices=[['question','问号'],['arrow','指方向'],['danger','小心'],['like','点赞'],['clap','鼓掌'],['rose','送玫瑰'],['heart','比心'],['tomato','扔西红柿']];
 const menu=document.createElement('section');menu.id='tableInteractionMenu';menu.className='hidden';menu.setAttribute('aria-label','同桌互动轮盘');
 const wheel=document.createElement('div');wheel.className='table-interaction-wheel';
 choices.forEach(([kind,label],i)=>{const b=document.createElement('button');b.type='button';b.dataset.interactionKind=kind;b.setAttribute('aria-label',label);b.style.setProperty('--wx',Math.cos((-90+i*45)*Math.PI/180)*92+'px');b.style.setProperty('--wy',Math.sin((-90+i*45)*Math.PI/180)*92+'px');const img=document.createElement('img');img.src=base+kind+'.png';img.alt='';const text=document.createElement('span');text.textContent=label;b.append(img,text);wheel.append(b);});
 const cancel=document.createElement('button');cancel.type='button';cancel.className='interaction-wheel-cancel';cancel.textContent='取消';cancel.dataset.interactionCancel='';wheel.append(cancel);
 const help=document.createElement('small');help.textContent='选择互动，再点棋盘或玩家 · Esc 取消';const mute=document.createElement('button');mute.type='button';mute.className='interaction-mute';
 let muted=localStorage.getItem('tongzhuoInteractionMuted')==='1';function muteLabel(){mute.textContent=muted?'显示互动：关':'显示互动：开';mute.setAttribute('aria-pressed',String(muted));}muteLabel();
 mute.onclick=()=>{muted=!muted;localStorage.setItem('tongzhuoInteractionMuted',muted?'1':'0');muteLabel();if(muted)clearEffects();};
 menu.append(wheel,help,mute);document.body.append(menu);
 const hint=document.createElement('div');hint.id='tableInteractionHint';hint.className='hidden';hint.setAttribute('role','status');document.body.append(hint);
 const layer=document.createElement('div');layer.id='tableInteractionEffects';layer.setAttribute('aria-hidden','true');document.body.append(layer);
 let interactionContext=null,origin=null,gesture=false,centre=null,hot=-1,mode=null,blockClick=0,sending=false;
 const seen=new Set(),effects=new Set();
 function active(){return room&&!$('roomView').classList.contains('hidden')&&!chatOnly;}
 function hideMenu(){menu.classList.add('hidden');gesture=false;hot=-1;wheel.querySelectorAll('.hot').forEach(e=>e.classList.remove('hot'));}
 function stop(){hideMenu();mode=null;hint.classList.add('hidden');document.body.classList.remove('interaction-aiming');}
 function point(target,x,y){
  const player=target.closest('[data-table-player]');if(player)return {space:'player',id:player.dataset.tablePlayer};
  const card=target.closest('[data-table-anchor]'),trail=target.closest('[data-trail-index]');
  if(card||trail){const el=card||trail,r=el.getBoundingClientRect();return {space:'card',key:card?card.dataset.tableAnchor:`incan:${room.game.round}:${trail.dataset.trailIndex}`,u:Math.max(0,Math.min(1,(x-r.left)/r.width)),v:Math.max(0,Math.min(1,(y-r.top)/r.height))};}
  if(target.closest('#boardViewport')&&room.gameId==='carcassonne'&&room.game){const r=$('board').getBoundingClientRect();return {space:'tile',x:(x-r.left)/(88*scale),y:(y-r.top)/(88*scale)};}
  const section=target.closest('.board-section');if(section){const r=section.getBoundingClientRect();return {space:'table',u:(x-r.left)/r.width,v:(y-r.top)/r.height};}
  return null;
 }
 function locate(a){
  let el;
  if(a.space==='player')el=[...document.querySelectorAll('#players [data-table-player]')].find(e=>e.dataset.tablePlayer===a.id)?.querySelector('[data-profile]');
  if(a.space==='player'&&!el)el=[...document.querySelectorAll('#players [data-table-player]')].find(e=>e.dataset.tablePlayer===a.id);
  if(a.space==='tile'){const v=$('boardViewport'),r=$('board').getBoundingClientRect();if(v.classList.contains('hidden'))return null;return visiblePoint({x:r.left+a.x*88*scale,y:r.top+a.y*88*scale},v);}
  if(a.space==='card'){
   if(a.key.startsWith('incan:')){const [,round,index]=a.key.split(':');if(Number(round)!==room.game?.round)return null;el=[...document.querySelectorAll('#incanBoard [data-trail-index]')].find(e=>e.dataset.trailIndex===index);}
   else el=[...document.querySelectorAll('#songBoard [data-table-anchor]')].find(e=>e.dataset.tableAnchor===a.key);
  }
  if(a.space==='table')el=document.querySelector('.board-section');
  if(!el)return null;const r=el.getBoundingClientRect(),p={x:r.left+(a.u??.5)*r.width,y:r.top+(a.v??.5)*r.height};
  return visiblePoint(p,el.closest('.song-market-zone,.song-private-zone,#incanBoard,.players-panel')||el);
 }
 function visiblePoint(p,container){const r=container.getBoundingClientRect();return p.x>=Math.max(0,r.left)&&p.x<=Math.min(innerWidth,r.right)&&p.y>=Math.max(0,r.top)&&p.y<=Math.min(innerHeight,r.bottom)?p:null;}
 function open(x,y,at=null,drag=false){if(!active())return;stop();interactionContext={code:room.code,gameId:room.gameId,matchId:room.matchId||null};origin=at;gesture=drag;centre={x:Math.max(150,Math.min(innerWidth-150,x)),y:Math.max(150,Math.min(innerHeight-210,y))};menu.style.left=centre.x+'px';menu.style.top=centre.y+'px';menu.classList.remove('hidden');}
 function aim(kind,at=null){hideMenu();mode={kind,at};document.body.classList.add('interaction-aiming');hint.textContent=kind==='arrow'?(at?'再点终点画箭头 · Esc 取消':'点箭头起点，再点终点 · Esc 取消'):['tomato','rose'].includes(kind)?'点一位玩家的头像或名牌 · Esc 取消':'点棋盘、卡牌或玩家进行标记 · Esc 取消';hint.classList.remove('hidden');}
 async function send(kind,at,to){if(sending||!active())return;if(!interactionContext||interactionContext.code!==room.code||interactionContext.gameId!==room.gameId||interactionContext.matchId!==(room.matchId||null)){stop();toast('对局已更新，请重新选择互动位置',true);return;}const code=room.code;sending=true;stop();try{const response=await fetch('/api/interaction',{method:'POST',headers:{'Content-Type':'application/json','X-Player-Token':token},body:JSON.stringify({...interactionContext,kind,at,...(to?{to}:{})})});const data=await response.json();if(!response.ok)throw Error(data.error);if(room?.code===code){if(data.event)receive(data.event);hint.textContent='已发送给同桌';hint.classList.remove('hidden');setTimeout(()=>{if(!mode)hint.classList.add('hidden');},900);}}catch(e){toast(e.message,true);}finally{sending=false;}}
 function choose(kind){if(kind==='arrow'){aim(kind,origin);return;}if(origin&&(!['tomato','rose'].includes(kind)||origin.space==='player'))send(kind,origin);else aim(kind);}
 function usePoint(at){if(!at){toast('请选择棋盘、卡牌或玩家',true);return;}if(['tomato','rose'].includes(mode.kind)&&at.space!=='player'){toast('请点击玩家头像或名牌',true);return;}if(mode.kind==='arrow'&&!mode.at){aim('arrow',at);return;}send(mode.kind,mode.at||at,mode.kind==='arrow'?at:undefined);}
 $('tableInteractionOpen').onclick=()=>{if(!menu.classList.contains('hidden')){stop();return;}const r=$('tableInteractionOpen').getBoundingClientRect();open(r.right-140,r.bottom+150);};
 menu.addEventListener('click',e=>{const b=e.target.closest('[data-interaction-kind]');if(b)choose(b.dataset.interactionKind);if(e.target.closest('[data-interaction-cancel]'))stop();});
 document.addEventListener('pointerdown',e=>{if(!active()||e.button!==0||e.target.closest('#tableInteractionMenu,dialog,input,textarea,select'))return;if(e.altKey&&$('roomView').contains(e.target)){const at=point(e.target,e.clientX,e.clientY);if(!at)return;e.preventDefault();e.stopImmediatePropagation();open(e.clientX,e.clientY,at,true);}else if(mode){e.preventDefault();e.stopImmediatePropagation();}},true);
 document.addEventListener('pointermove',e=>{if(!gesture)return;e.preventDefault();e.stopImmediatePropagation();hot=TableWheelGeometry.pickSlice(e.clientX-centre.x,e.clientY-centre.y);wheel.querySelectorAll('[data-interaction-kind]').forEach((b,i)=>b.classList.toggle('hot',i===hot));},true);
 document.addEventListener('pointerup',e=>{if(gesture){e.preventDefault();e.stopImmediatePropagation();blockClick=Date.now()+350;const selected=TableWheelGeometry.pickSlice(e.clientX-centre.x,e.clientY-centre.y);if(selected<0)stop();else choose(choices[selected][0]);}else if(mode&&!e.target.closest('#tableInteractionMenu,#tableInteractionOpen')){e.preventDefault();e.stopImmediatePropagation();blockClick=Date.now()+350;usePoint(point(e.target,e.clientX,e.clientY));}},true);
 document.addEventListener('click',e=>{if(Date.now()<blockClick){e.preventDefault();e.stopImmediatePropagation();}},true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(mode||!menu.classList.contains('hidden'))){e.preventDefault();e.stopImmediatePropagation();stop();}},true);
 document.addEventListener('contextmenu',e=>{if(gesture||mode){e.preventDefault();stop();}},true);
 window.addEventListener('blur',()=>{if(gesture||mode)stop();});
 function clearEffects(){for(const effect of [...effects])effect.cancelEffect();effects.clear();layer.replaceChildren();}
 function receive(event){
  if(!active()||muted||event.code!==room.code||event.gameId!==room.gameId||(event.matchId||null)!==(room.matchId||null)||seen.has(event.id)||!choices.some(c=>c[0]===event.kind))return;
  seen.add(event.id);if(seen.size>200)seen.delete(seen.values().next().value);
  const point=locate(event.at),end=event.to&&locate(event.to);if(!point||event.kind==='arrow'&&!end){hint.textContent=event.from.name+' 发了一个不在当前视野中的互动';hint.classList.remove('hidden');setTimeout(()=>{if(!mode)hint.classList.add('hidden');},1600);return;}
  if(effects.size>=12)effects.values().next().value.cancelEffect();
  const wrap=document.createElement('div');wrap.className='table-interaction-effect '+event.kind;wrap.dataset.interactionId=event.id;const image=document.createElement('img');image.src=base+event.kind+'.png';image.alt='';const label=document.createElement('small');label.textContent=event.from.name+' · '+choices.find(c=>c[0]===event.kind)[1];wrap.append(image,label);layer.append(wrap);effects.add(wrap);
  const flight=['tomato','rose'].includes(event.kind),from=flight?locate({space:'player',id:event.from.id})||{x:innerWidth/2,y:innerHeight-60}:point;
  function position(){if(!active()||event.code!==room.code||(event.matchId||null)!==(room.matchId||null)){remove();return;}const at=locate(event.at),to=event.to&&locate(event.to);if(!at||event.kind==='arrow'&&!to){wrap.style.visibility='hidden';return;}wrap.style.visibility='';wrap.style.left=at.x+'px';wrap.style.top=at.y+'px';if(to){const dx=to.x-at.x,dy=to.y-at.y;wrap.style.setProperty('--arrow-length',Math.hypot(dx,dy)+'px');const angle=Math.atan2(dy,dx);wrap.style.setProperty('--arrow-angle',angle+'rad');label.style.transform='translateX(-50%) rotate('+(-angle)+'rad)';}}
  let frame,timer;function remove(){cancelAnimationFrame(frame);clearTimeout(timer);effects.delete(wrap);wrap.remove();}
  wrap.cancelEffect=remove;
  function tick(){position();if(effects.has(wrap))frame=requestAnimationFrame(tick);}position();
  if(flight&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const dx=from.x-point.x,dy=from.y-point.y;wrap.animate([{transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(-30deg)`,opacity:1},{transform:`translate(-50%,-50%) translate(${dx/2}px,${dy/2-110}px) rotate(90deg)`,opacity:1,offset:.5},{transform:'translate(-50%,-50%) rotate(0deg)',opacity:1}],{duration:650,easing:'ease-in-out'});setTimeout(()=>{if(wrap.isConnected)wrap.classList.add('landed');},650);}
  else wrap.classList.add('landed');
  frame=requestAnimationFrame(tick);timer=setTimeout(remove,4000);
 }
 window.addEventListener('tableinteraction',e=>receive(e.detail));
 // The room controls are replaced on every SSE update; the toolbar and effects stay outside them.
 new MutationObserver(()=>{if(!active()){stop();clearEffects();}}).observe($('roomView'),{attributes:true,attributeFilter:['class']});
})();
