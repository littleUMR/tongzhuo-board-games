(()=>{
 const signature=document.createElement('dialog');signature.className='incan-signature-dialog';
 signature.innerHTML='<form><h2>写下你的寻宝签名</h2><p>百万撤离和第一名庆祝时，全房间都会看到这句话。</p><label>寻宝签名<input name="signature" maxlength="60" required placeholder="见好就收，满载而归！"></label><small>1–60字，可在个人信息或我的外观中修改</small><p data-error role="status"></p><button class="primary" type="submit">保存签名</button><button type="button" data-cancel>取消</button></form>';
 document.body.append(signature);let saving=false;
 function editSignature(){signature.querySelector('input').value=account.incanSignature||'';signature.querySelector('[data-cancel]').hidden=!account.incanSignature;if(!signature.open)signature.showModal();}
 signature.addEventListener('cancel',e=>{if(!account.incanSignature||saving)e.preventDefault();});
 signature.querySelector('[data-cancel]').onclick=()=>{if(!saving)signature.close();};
 signature.querySelector('form').onsubmit=async e=>{e.preventDefault();if(saving)return;saving=true;const button=signature.querySelector('[type=submit]');button.disabled=true;try{const response=await fetch('/api/cosmetics',{method:'POST',headers:{'X-Player-Token':token,'Content-Type':'application/json'},body:JSON.stringify({action:'incanSignature',text:signature.querySelector('input').value})});const data=await response.json();if(!response.ok)throw Error(data.error);updateWallet(data.wallet);signature.close();signature.querySelector('[data-error]').textContent='';toast('寻宝签名已保存');}catch(error){signature.querySelector('[data-error]').textContent=error.message;}finally{saving=false;button.disabled=false;}};
 document.addEventListener('click',e=>{if(e.target.closest('[data-incan-signature]'))editSignature();});
 const queue=[],seen=new Set();let playing=false;
 function enqueue(key,data){const storageKey='incan-honor:'+key;if(seen.has(key)||sessionStorage.getItem(storageKey))return;seen.add(key);sessionStorage.setItem(storageKey,'1');queue.push({...data,code:room.code,matchId:room.matchId});play();}
 function play(){if(playing||!queue.length)return;if(signature.open){setTimeout(play,500);return;}const show=queue.shift();if(room?.code!==show.code||room?.matchId!==show.matchId)return play();playing=true;
  const player=room.players.find(p=>p.id===show.playerId);if(!player){playing=false;return play();}
  const look={...player.look,equipped:{...player.look?.equipped}};delete look.equipped.background;
  const failure=show.kind==='failure',victory=show.kind==='victory',el=document.createElement('div');el.className='incan-honor '+show.kind;el.setAttribute('role','status');
  const heading=failure?'让你贪，后悔了吧！':victory?'恭喜获得第一名！':'百万撤离！';
  const line=failure?`${player.name} 的背包 ${show.amount} 颗宝石全部遗失 · 贪婪是魔鬼！`:victory?`恭喜 ${player.name} 获得印加寻宝第一名！`:`${player.name} 成功带回 ${show.amount} 颗宝石（含神器）！`;
  const taunts=['让你贪！','后悔了吧！','贪婪是魔鬼！','早该撤离啦！','宝石全掉啦！','见好就收啊！'];
  const bubbles=failure?`<div class="honor-taunts" aria-hidden="true">${taunts.map((text,i)=>`<span style="--delay:${i*.55}s;--x:${i%2?68:1}%;--y:${[65,72,49,56,36,42][i]}%">${text}</span>`).join('')}</div>`:'';
  el.innerHTML=`<div class="honor-stage"><button class="close" aria-label="关闭庆祝">×</button><div class="honor-scene"><img class="honor-art" src="/assets/incan/honors/${show.kind}.webp" alt="${failure?'神庙坍塌，背包宝石洒落':victory?'皇冠聚光与第一名领奖台':'黄金神庙与满载宝石'}"><div class="honor-doll">${window.cosmeticDoll?.(look)||''}${failure?'<img class="honor-emotion" src="/assets/incan/honors/cry.webp" alt="哭泣">':''}</div><h2>${heading}</h2>${bubbles}<div class="honor-particles" aria-hidden="true">${Array.from({length:8},(_,i)=>`<img src="/assets/incan/settlement/single-gem.png" style="--i:${i}" alt="">`).join('')}</div></div><div class="honor-copy"><strong>${esc(line)}</strong>${failure?'':`<blockquote class="honor-signature ${(player.look?.incanSignature?.length||0)>30?'long':''}"><span class="honor-signature-label">寻宝宣言</span><span>${esc(player.look?.incanSignature||'')}</span></blockquote>`}${show.kind==='escape'?'<small>本局结束后解锁「百万撤离成功」称号，可在我的外观中佩戴</small>':''}</div></div>`;
  document.body.append(el);let timer;const close=()=>{if(!el.isConnected)return;clearTimeout(timer);el.remove();playing=false;play();};el.querySelector('button').onclick=close;timer=setTimeout(close,6000);
 }
 function render(){
  const game=room?.game,incanRoom=room?.gameId==='incangold';
  document.querySelectorAll('#players [data-profile]').forEach(button=>button.classList.toggle('incan-sad',!!(incanRoom&&game?.phase==='finished'&&!game.winners?.includes(button.dataset.profile)&&room.players.some(p=>p.id===button.dataset.profile))));
  if(!incanRoom)return;if(room.players.some(p=>p.id===playerId)&&!account.incanSignature&&!signature.open)editSignature();if(!game||!room.matchId)return;
  for(const event of game.events||[]){if(!event.at||Date.now()-event.at>30000)continue;
   if(event.kind==='return')for(const p of event.departures.filter(p=>p.total>=40))enqueue(`${room.matchId}:${event.id}:${p.playerId}`,{kind:'escape',playerId:p.playerId,amount:p.total});
   if(event.kind==='collapse')for(const p of event.losses.filter(p=>p.amount>=40))enqueue(`${room.matchId}:${event.id}:${p.playerId}`,{kind:'failure',playerId:p.playerId,amount:p.amount});
  }
  if(game.phase==='finished'&&game.finishedAt&&Date.now()-game.finishedAt<30000)for(const id of game.winners||[])enqueue(`${room.matchId}:victory:${id}`,{kind:'victory',playerId:id});
 }
 new MutationObserver(render).observe($('players'),{childList:true});render();
})();
