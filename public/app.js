const $=id=>document.getElementById(id);
const chatOnly=new URLSearchParams(location.search).get('chat')==='1';
if(chatOnly){document.body.classList.add('chat-only');document.title='同桌 · 独立聊天';chatWindow.querySelector('.chat-note').textContent='Enter 发送 · 拖动系统标题栏跨屏 · 拉动窗口边缘调整大小';}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=localStorage.getItem('tongzhuoToken')||(crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''));localStorage.setItem('tongzhuoToken',token);
let room=null,playerId=null,rooms=[],events=null,rotation=0,selection=null,selectedFeature=null,busy=false,toastTimer;
let account={coins:0,anyaUnlocked:false};
function updateWallet(value){if(!value)return;account=value;window.dispatchEvent(new Event('walletchange'));$('coinBalance').textContent=`🪙 桌游币 ${account.coins}`;$('chatCoins').textContent=`🪙 ${account.coins}`;}
let chatRoom=null,chatPlayerId=null,chatEvents=null;
let scale=1,panX=-44,panY=-44,drag=null,suppressClick=false,lastGame=null;
let catalog={};
let games={},selectedLobbyGame=new URLSearchParams(location.search).get('game')==='chroma'?'chroma':'carcassonne',rulesGameId='carcassonne';
$('coinBalance').onclick=e=>{e.stopPropagation();if(chatRoom){openChatWindow();showStickers('anya');}else toast('完成对局赚取桌游币；加入聊天室后可在表情中解锁阿尼亚。');};
$('nickname').value=localStorage.getItem('tongzhuoName')||'';
$('nickname').addEventListener('change',()=>localStorage.setItem('tongzhuoName',$('nickname').value.trim()));
function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').classList.remove('hidden');toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4500);}
function floatMeepleNotice(){const notice=document.createElement('div');notice.className='meeple-float-notice';notice.setAttribute('role','status');notice.textContent='你的随从已用完';document.body.appendChild(notice);notice.addEventListener('animationend',()=>notice.remove(),{once:true});}
function name(){const n=$('nickname').value.trim();if(!n){$('nickname').focus();throw new Error('先在右上角输入你的昵称');}localStorage.setItem('tongzhuoName',n);return n;}
async function action(type,extra={}) {
 if(busy)return null;busy=true;
 try {
  const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:type,token,code:room?.code,name:$('nickname').value.trim(),...extra})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'操作失败');updateWallet(data.wallet);
  if(type==='leave'){room=null;playerId=null;localStorage.removeItem('tongzhuoRoom');history.replaceState(null,'','/');connect('');showLobby();}
  else if(data.room){const changed=room?.code!==data.code;room=data.room;playerId=data.playerId;localStorage.setItem('tongzhuoRoom',data.code);localStorage.setItem('tongzhuoRole',room.players.some(p=>p.id===playerId)?'player':'spectator');history.replaceState(null,'',`/?room=${data.code}${chatOnly?'&chat=1':''}`);if(type==='place'||type==='finish'){selection=null;selectedFeature=null;}if(type==='finish')rotation=0;if(['start','join','create'].includes(type)&&room.game?.phase==='tile')rotation=room.game.legal.some(p=>p.rotations.includes(0))?0:room.game.legal[0].rotations[0];showRoom();if(changed||type==='join'||type==='watch'||type==='create')connect(data.code);renderRoom();}
  if(data.arrival)window.dispatchEvent(new CustomEvent('cosmeticarrival',{detail:data.arrival}));
  if(['join','watch','create'].includes(type)&&data.chat)connectChat(data.code,data.chat);
  if(data.skippedMeeple){rotation=0;floatMeepleNotice();}
  return data;
 } catch(e){toast(e.message,true);return null;}finally{busy=false;}
}
function connect(code){events?.close();events=new EventSource(`/events?room=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);const stream=events;
 events.addEventListener('interaction',e=>{if(events===stream&&room?.code===code)window.dispatchEvent(new CustomEvent('tableinteraction',{detail:JSON.parse(e.data)}));});
 events.addEventListener('arrival',e=>{if(events===stream&&room?.code===code)window.dispatchEvent(new CustomEvent('cosmeticarrival',{detail:JSON.parse(e.data)}));});
 events.onopen=()=>{$('connectionText').textContent='局域网已连接';$('connectionDot').style.background='#45a881';};
 events.onerror=()=>{$('connectionText').textContent='连接中断，正在重连';$('connectionDot').style.background='#d79540';};
 events.onmessage=e=>{if(events!==stream)return;const data=JSON.parse(e.data);updateWallet(data.wallet);rooms=data.rooms;renderLobby();if(code){if(data.room&&(data.room.viewerId||[...data.room.players,...(data.room.spectators||[])].some(p=>p.id===playerId))){playerId=data.room.viewerId||playerId;const phase=room?.game?.phase,turn=room?.game?.turn;room=data.room;if(phase!==room.game?.phase||turn!==room.game?.turn){selection=null;selectedFeature=null;rotation=room.game?.phase==='tile'&&!room.game.legal.some(p=>p.rotations.includes(0))?room.game.legal[0].rotations[0]:0;}renderRoom();}else{room=null;playerId=null;localStorage.removeItem('tongzhuoRoom');history.replaceState(null,'','/');showLobby();toast(data.room?'你已不在这个房间，请重新加入':'房间已解散');connect('');}}};
}
function showLobby(){$('readyReminderDialog').close();activeReadyReminder=null;$('lobby').classList.remove('hidden');$('roomView').classList.add('hidden');renderLobby();}
function showRoom(){$('lobby').classList.add('hidden');$('roomView').classList.remove('hidden');}
function connectChat(code,initial=null){
 chatEvents?.close();localStorage.setItem('tongzhuoChat',code);
 const update=chat=>{if(!chat){chatRoom=null;chatPlayerId=null;localStorage.removeItem('tongzhuoChat');$('chatWindow').classList.add('hidden');$('chatLobbyOpen').classList.add('hidden');return;}chatRoom=chat;chatPlayerId=chat.viewerId;$('chatTitle').textContent=`${chat.title} ✎`;$('chatLobbyOpen').classList.remove('hidden');$('chatWindowHeader').querySelector('small').textContent=`聊天室 ${code} · ${chat.players.length} 人`;if(chatOnly)document.title=`${chat.title} · 聊天室`;renderChat();};
 if(initial)update(initial);
 chatEvents=new EventSource(`/chat-events?room=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);const stream=chatEvents;chatEvents.onmessage=e=>{if(chatEvents!==stream)return;const data=JSON.parse(e.data);updateWallet(data.wallet);update(data.chat);};
}
async function joinChatRoom(code){try{const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'chatJoin',token,code,name:name()})}),data=await response.json();if(!response.ok)throw new Error(data.error);connectChat(data.code,data.chat);openChatWindow();return true;}catch(e){toast(e.message,true);return false;}}
function openChatWindow(){if(!chatRoom)return;$('chatWindow').classList.remove('hidden');$('chatMessages').scrollTop=$('chatMessages').scrollHeight;$('chatInput').focus();}
$('chatLobbyOpen').addEventListener('click',openChatWindow);
$('chatLeave').addEventListener('click',async()=>{if(!chatRoom||chatSending)return;try{const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'chatLeave',token,code:chatRoom.code})});const data=await response.json();if(!response.ok)throw new Error(data.error);chatEvents?.close();chatEvents=null;chatRoom=null;chatPlayerId=null;chatRoomCode=null;localStorage.removeItem('tongzhuoChat');clearChatAttachment();clearChatReply();$('chatWindow').classList.add('hidden');$('chatLobbyOpen').classList.add('hidden');toast('已退出聊天室，游戏座位保留');}catch(e){toast(e.message,true);}});
function renderLobby(){document.body.classList.remove('word-game','chroma-table');
 const def=games[selectedLobbyGame];if(!def)return;
 document.querySelector('.game-heading').classList.toggle('song-lobby-heading',selectedLobbyGame==='song');
 document.querySelectorAll('[data-lobby-game]').forEach(b=>b.classList.toggle('game-nav-active',b.dataset.lobbyGame===selectedLobbyGame));
 $('gameHeadingText').innerHTML=`<div class="eyebrow">${def.english} / ${def.edition}</div><h1>${def.name}</h1><p>${def.description}</p><div class="tags"><span>${def.minPlayers}–${def.maxPlayers} 人</span><span>${def.duration}</span><span>${def.category}</span><span>${selectedLobbyGame==='chroma'?'游戏提供者：ww':selectedLobbyGame==='wordmahjong'?'13 张成句':selectedLobbyGame==='song'?'八铺 · 五十两':selectedLobbyGame==='incangold'?'5 轮探险':'72 块地块'}</span></div>`;
 $('tutorialStart').classList.toggle('hidden',selectedLobbyGame==='wordmahjong');const query=$('roomSearch').value.trim().toLowerCase();const list=rooms.filter(r=>(r.title.toLowerCase().includes(query)||r.code.toLowerCase().includes(query)));$('roomCount').textContent=list.length;
 $('rooms').innerHTML=list.length?list.map(r=>{
  const own=localStorage.getItem('tongzhuoRoom')===r.code;const canJoin=own||(r.status!=='playing'&&r.count<r.maxPlayers);const label=r.status==='waiting'?'等待开局':r.status==='playing'?'正在对局':'对局结束';
  return `<div class="room-row"><div><strong>${esc(r.title)}</strong><small># ${r.code} · ${games[r.gameId||'carcassonne'].name}</small></div><span>${esc(r.host)}</span><span>${r.count} / ${r.maxPlayers}</span><span class="status-pill ${r.status}">${label}</span><button class="${canJoin?'outline':'quiet'}" data-join="${r.code}" ${canJoin?'':'disabled'}>${own?'返回房间':r.count>=r.maxPlayers?'已满':'加入'}</button><button class="outline" data-watch="${r.code}">观战</button><button class="outline" data-chat-join="${r.code}">加入聊天</button></div>`;
 }).join(''):`<div class="empty"><div class="empty-mark">▦</div><strong>${query?'没有找到房间':'第一张桌，等你来开'}</strong><p>${query?'试试其他名称或房间号':'创建房间，把链接发给同一网络下的朋友'}</p><button class="quiet" data-create>＋ 创建一间房</button></div>`;
}
function me(){return room?.players.find(p=>p.id===playerId);}
function isMyTurn(){if(room?.gameId==='chroma')return room.status==='playing'&&room.game.active===playerId&&!room.game.draft;return room?.gameId!=='incangold'&&room?.status==='playing'&&room.players[room.game.turn]?.id===playerId;}
let chatRoomCode=null,chatLastId=null,chatSending=false;
let chatReply=null,chatWindowDrag=null;
$('chatPopout').addEventListener('click',()=>{
 if(!chatRoom)return;const popup=window.open(`/?room=${encodeURIComponent(chatRoom.code)}&chat=1`,`tongzhuoChat_${chatRoom.code}`,'popup=yes,width=520,height=680,resizable=yes,scrollbars=yes');
 if(!popup){toast('浏览器拦截了独立窗口，请允许此网站弹出窗口后重试',true);return;}
 popup.focus();$('chatWindow').classList.add('hidden');closeChatPicker();
});
function clearChatReply(){chatReply=null;$('chatReplyDraft').classList.add('hidden');}
$('chatReplyCancel').addEventListener('click',clearChatReply);
$('chatOpen').addEventListener('click',async()=>{if(!room)return;if(chatRoom?.code===room.code){openChatWindow();return;}await joinChatRoom(room.code);});
$('chatTitle').addEventListener('click',async()=>{if(!chatRoom)return;const title=prompt('修改聊天室名称（最多 28 字）',chatRoom.title);if(title===null)return;try{const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'chatRename',token,code:chatRoom.code,title})});const data=await response.json();if(!response.ok)throw new Error(data.error);connectChat(data.code,data.chat);toast('聊天室名称已更新');}catch(e){toast(e.message,true);}});
$('chatMinimize').addEventListener('click',()=>{$('chatWindow').classList.add('hidden');closeChatPicker();});
function clampChatWindow(){
 if(chatOnly)return;
 const window=$('chatWindow');if(window.classList.contains('hidden'))return;const rect=window.getBoundingClientRect();
 if(window.style.left||rect.right>innerWidth||rect.bottom>innerHeight){window.style.left=Math.max(8,Math.min(rect.left,innerWidth-rect.width-8))+'px';window.style.top=Math.max(8,Math.min(rect.top,innerHeight-rect.height-8))+'px';window.style.bottom='auto';}
}
$('chatWindowHeader').addEventListener('pointerdown',e=>{if(chatOnly||e.button!==0||e.target.closest('button'))return;const rect=$('chatWindow').getBoundingClientRect();chatWindowDrag={x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};$('chatWindowHeader').setPointerCapture(e.pointerId);});
$('chatWindowHeader').addEventListener('pointermove',e=>{if(!chatWindowDrag)return;const window=$('chatWindow');window.style.left=Math.max(8,Math.min(chatWindowDrag.left+e.clientX-chatWindowDrag.x,innerWidth-window.offsetWidth-8))+'px';window.style.top=Math.max(8,Math.min(chatWindowDrag.top+e.clientY-chatWindowDrag.y,innerHeight-window.offsetHeight-8))+'px';window.style.bottom='auto';});
$('chatWindowHeader').addEventListener('pointerup',()=>{chatWindowDrag=null;});
$('chatWindowHeader').addEventListener('pointercancel',()=>{chatWindowDrag=null;});
window.addEventListener('resize',clampChatWindow);
const quickChats=['大家好，很高兴一起玩！','准备好了，开始吧！','稍等一下，马上回来。','轮到你啦～','快点吧，我等的花都谢了！','这步走得漂亮！','哈哈，运气不错！','别急，慢慢想。','就差一点点！','谢谢，合作愉快！','再来一局吧！'];
const chatEmojis=[['😀','开心'],['😂','笑哭'],['😊','微笑'],['😎','得意'],['🤔','思考'],['😮','惊讶'],['😭','大哭'],['😅','汗颜'],['😤','不服'],['🥳','庆祝'],['👍','赞'],['👏','鼓掌'],['🤝','握手'],['🙏','感谢'],['❤️','爱心'],['🎉','欢呼'],['🍀','好运'],['💪','加油'],['👀','围观'],['🎲','骰子']];
let chatPickerMode=null,mentionRange=null,unreadMentions=0;
function clearMentionReminder(){unreadMentions=0;$('chatOpen').textContent='💬 房间聊天 · 打开窗口';$('chatOpen').classList.remove('has-mention');}
$('chatOpen').addEventListener('click',clearMentionReminder);
$('chatInput').addEventListener('focus',clearMentionReminder);
function closeChatPicker(){chatPickerMode=null;mentionRange=null;$('chatPicker').classList.add('hidden');$('chatQuick').setAttribute('aria-expanded','false');$('chatEmoji').setAttribute('aria-expanded','false');$('chatMention').setAttribute('aria-expanded','false');}
function showMentionPicker(typed=false){
 if(!chatRoom)return;const input=$('chatInput'),start=input.selectionStart,end=input.selectionEnd,prefix=input.value.slice(0,start),match=prefix.match(/(?:^|\s)@([^\s@]*)$/u);
 if(typed&&!match){if(chatPickerMode==='mention')closeChatPicker();return;}
 const query=match?match[1]:'';mentionRange={start:match?start-query.length-1:start,end};
 chatPickerMode='mention';$('chatPicker').classList.remove('hidden','emoji-picker');$('chatQuick').setAttribute('aria-expanded','false');$('chatEmoji').setAttribute('aria-expanded','false');$('chatMention').setAttribute('aria-expanded','true');
 const players=chatRoom.players.filter(p=>p.id!==chatPlayerId&&p.name.toLowerCase().includes(query.toLowerCase()));
 $('chatPicker').innerHTML='<small>选择要提醒的同桌玩家</small>'+(players.length?players.map(p=>`<button type="button" data-chat-mention="${esc(p.id)}">@${esc(p.name)}</button>`).join(''):'<small>没有匹配的玩家</small>');
}
$('chatMention').addEventListener('click',()=>{if(chatPickerMode==='mention')closeChatPicker();else showMentionPicker();});
$('chatInput').addEventListener('input',()=>showMentionPicker(true));
function mentionText(message){
 const names=[...new Set((message.mentions||[]).map(p=>p.name))].sort((a,b)=>b.length-a.length);if(!names.length)return esc(message.text);
 const pattern=new RegExp('@(?:'+names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?=$|[\\s，。！？,!?：:；;])','gu');let html='',last=0;
 for(const match of message.text.matchAll(pattern)){html+=esc(message.text.slice(last,match.index))+`<span class="chat-mention-text">${esc(match[0])}</span>`;last=match.index+match[0].length;}
 return html+esc(message.text.slice(last));
}
function toggleChatPicker(mode){
 if(chatPickerMode===mode||mode==='emoji'&&chatPickerMode==='sticker'){closeChatPicker();return;}
 mentionRange=null;$('chatMention').setAttribute('aria-expanded','false');
 chatPickerMode=mode;$('chatPicker').classList.remove('hidden');$('chatPicker').classList.toggle('emoji-picker',mode==='emoji');
 $('chatQuick').setAttribute('aria-expanded',String(mode==='quick'));$('chatEmoji').setAttribute('aria-expanded',String(mode==='emoji'));
 $('chatPicker').innerHTML=mode==='quick'?'<small>点选即发送</small>'+quickChats.map((text,i)=>`<button type="button" data-chat-quick="${i}">${esc(text)}</button>`).join(''):'<div class="sticker-tabs"><button type="button" data-sticker-tab="emoji" class="active">Emoji</button><button type="button" data-sticker-tab="default">小埋 GIF</button><button type="button" data-sticker-tab="anya">阿尼亚 GIF · 500币</button><button type="button" data-sticker-tab="mine">我的表情包</button></div><small>点选加入输入框</small><div class="emoji-grid">'+chatEmojis.map(([emoji,label],i)=>`<button type="button" data-chat-emoji="${i}" aria-label="${label}" title="${label}">${emoji}</button>`).join('')+'</div>';
}
$('chatQuick').addEventListener('click',()=>toggleChatPicker('quick'));
$('chatEmoji').addEventListener('click',()=>{if(chatPickerMode==='sticker'||chatPickerMode==='emoji')closeChatPicker();else showStickers('default');});
let anyaStickers=[],myStickers=[],defaultStickers=[],stickerView='mine',stickerUploading=false;
function stickerUrl(id){return `/api/stickers?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;}
async function showStickers(view='mine'){
 stickerView=view;
 chatPickerMode='sticker';$('chatPicker').classList.remove('hidden','emoji-picker');$('chatQuick').setAttribute('aria-expanded','false');$('chatMention').setAttribute('aria-expanded','false');$('chatEmoji').setAttribute('aria-expanded','true');
 $('chatPicker').innerHTML='<small>正在加载我的表情包…</small>';
 try{const response=await fetch('/api/stickers',{headers:{'X-Player-Token':token}}),data=await response.json();if(!response.ok)throw new Error(data.error);myStickers=data.stickers;defaultStickers=data.defaults||[];anyaStickers=data.anya||[];updateWallet(data.wallet);if(chatPickerMode!=='sticker')return;renderStickers();}catch(e){toast(e.message,true);}
}
function renderStickers(){
 if(stickerView==='anya'){$('chatPicker').innerHTML='<div class="sticker-tabs"><button data-sticker-tab="default">小埋 GIF</button><button data-sticker-tab="anya" class="active">阿尼亚 GIF</button><button data-sticker-tab="mine">我的表情包</button></div><small>余额 '+account.coins+' 桌游币 · '+(account.anyaUnlocked?'已永久解锁':'500 币永久解锁整套 6 张动态 GIF')+'</small>'+(!account.anyaUnlocked?'<button class="primary" data-unlock-anya '+(account.coins<500?'disabled':'')+'>500 桌游币解锁</button>':'')+'<div class="sticker-grid">'+anyaStickers.map(s=>'<div><button data-sticker-send="'+s.id+'" '+(!account.anyaUnlocked?'disabled':'')+'><img src="/assets/anya/'+s.file+'" alt="阿尼亚 '+esc(s.name)+'"></button><small>'+esc(s.name)+'</small></div>').join('')+'</div>';return;}

 if(stickerView==='default'){
  $('chatPicker').innerHTML='<div class="sticker-tabs"><button type="button" data-sticker-tab="emoji">Emoji</button><button type="button" data-sticker-tab="default" class="active">小埋 GIF</button><button type="button" data-sticker-tab="anya">阿尼亚 GIF · 500币</button><button type="button" data-sticker-tab="mine">我的表情包</button></div><small>点图片加入草稿 · 写好文字后点发送</small><div class="sticker-grid default-sticker-grid">'+defaultStickers.map(s=>`<div><button type="button" data-sticker-send="${esc(s.id)}" aria-label="选择小埋 ${esc(s.name)}" title="${esc(s.name)}"><img src="/assets/umaru-gifs/${esc(s.file)}" alt="小埋 ${esc(s.name)} GIF"></button><small>${esc(s.name)}</small></div>`).join('')+'</div>';return;
 }
 $('chatPicker').innerHTML='<div class="sticker-tabs"><button type="button" data-sticker-tab="emoji">Emoji</button><button type="button" data-sticker-tab="default">小埋 GIF</button><button type="button" data-sticker-tab="anya">阿尼亚 GIF · 500币</button><button type="button" data-sticker-tab="mine" class="active">我的表情包</button><button type="button" data-sticker-add>＋ 添加</button></div><small>点图片加入草稿，再点发送 · PNG / JPG / GIF · 单个 2 MB · 最多 30 个</small>'+(myStickers.length?'<div class="sticker-grid">'+myStickers.map((s,i)=>`<div><button type="button" data-sticker-send="${esc(s.id)}" aria-label="选择表情包 ${i+1}"><img src="${esc(stickerUrl(s.id))}" alt="自定义表情包 ${i+1}"></button><button type="button" class="sticker-remove" data-sticker-remove="${esc(s.id)}" aria-label="移除表情包 ${i+1}" title="移出我的表情包">×</button></div>`).join('')+'</div>':'<p class="sticker-empty">还没有收藏，点击“＋ 添加”上传自己的表情包。</p>');
}
$('stickerFile').addEventListener('change',async()=>{
 const file=$('stickerFile').files[0];$('stickerFile').value='';if(!file||stickerUploading)return;
 if(!['image/png','image/jpeg','image/gif'].includes(file.type)){toast('请选择 PNG、JPG 或 GIF 图片',true);return;}if(file.size>2*1024*1024){toast('表情包不能超过 2 MB',true);return;}
 stickerUploading=true;try{const response=await fetch('/api/stickers',{method:'POST',headers:{'X-Player-Token':token,'Content-Type':file.type},body:file}),data=await response.json();if(!response.ok)throw new Error(data.error);toast('已添加到我的表情包');await showStickers();}catch(e){toast(e.message,true);}finally{stickerUploading=false;}
});
$('chatPicker').addEventListener('click',async e=>{
 if(e.target.closest('[data-unlock-anya]')){try{const response=await fetch('/api/economy',{method:'POST',headers:{'X-Player-Token':token}}),data=await response.json();if(!response.ok)throw new Error(data.error);updateWallet(data.wallet);renderStickers();toast('阿尼亚表情包已永久解锁');}catch(e){toast(e.message,true);}return;}
 const tab=e.target.closest('[data-sticker-tab]');if(tab){if(['mine','default','anya'].includes(tab.dataset.stickerTab))await showStickers(tab.dataset.stickerTab);else{chatPickerMode=null;toggleChatPicker('emoji');}return;}
 if(e.target.closest('[data-sticker-add]')){if(!stickerUploading)$('stickerFile').click();return;}
 const remove=e.target.closest('[data-sticker-remove]');if(remove){try{const response=await fetch(`/api/stickers?id=${encodeURIComponent(remove.dataset.stickerRemove)}`,{method:'DELETE',headers:{'X-Player-Token':token}}),data=await response.json();if(!response.ok)throw new Error(data.error);await showStickers();}catch(e){toast(e.message,true);}return;}
 const send=e.target.closest('[data-sticker-send]');if(!send||chatSending||!chatRoom)return;
 const id=send.dataset.stickerSend,anya=anyaStickers.find(s=>s.id===id);if(anya&&!account.anyaUnlocked){toast('请先解锁阿尼亚表情包',true);return;}const builtin=defaultStickers.find(s=>s.id===id);setChatAttachment({type:'sticker',id,url:anya?`/assets/anya/${anya.file}`:builtin?`/assets/umaru-gifs/${builtin.file}`:stickerUrl(id),label:anya?`阿尼亚 · ${anya.name}`:builtin?`小埋 · ${builtin.name}`:'自定义表情包'});
});
let chatAttachment=null;
function clearChatAttachment(){if(chatAttachment?.type==='image')URL.revokeObjectURL(chatAttachment.url);chatAttachment=null;$('chatAttachment').classList.add('hidden');$('chatAttachmentPreview').removeAttribute('src');}
function setChatAttachment(attachment){clearChatAttachment();chatAttachment={...attachment,code:chatRoom.code};$('chatAttachmentPreview').src=attachment.url;$('chatAttachmentLabel').textContent=`${attachment.label} · 待发送`;$('chatAttachment').classList.remove('hidden');closeChatPicker();$('chatInput').focus();}
$('chatAttachmentRemove').addEventListener('click',()=>{if(!chatSending)clearChatAttachment();});
function imageUrl(id){return `/api/chat-image?room=${encodeURIComponent(chatRoom.code)}&id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;}
function previewScreenshot(file){
 if(!chatRoom||chatSending)return;
 if(!['image/png','image/jpeg'].includes(file.type)){toast('请选择 PNG 或 JPG 图片',true);return;}if(file.size>5*1024*1024){toast('截图不能超过 5 MB',true);return;}
 setChatAttachment({type:'image',file,url:URL.createObjectURL(file),label:'截图'});
}
$('chatImageButton').addEventListener('click',()=>$('chatImageFile').click());
$('chatImageFile').addEventListener('change',()=>{const file=$('chatImageFile').files[0];if(file)previewScreenshot(file);$('chatImageFile').value='';});
$('chatInput').addEventListener('paste',e=>{const item=Array.from(e.clipboardData?.items||[]).find(v=>v.type.startsWith('image/'));if(item){e.preventDefault();const file=item.getAsFile();if(file)previewScreenshot(file);}});
$('chatImageDialog').addEventListener('close',()=>$('chatImagePreview').removeAttribute('src'));
$('chatMessages').addEventListener('click',e=>{const image=e.target.closest('[data-chat-image]');if(!image)return;$('chatImageTitle').textContent='查看原图';$('chatImagePreview').src=imageUrl(image.dataset.chatImage);$('chatImageDialog').showModal();});
$('chatMessages').addEventListener('click',e=>{const button=e.target.closest('[data-chat-reply]');if(!button)return;const message=chatRoom.chat?.find(m=>m.id===button.dataset.chatReply);if(!message)return;chatReply={id:message.id};$('chatReplyText').textContent=`回复 ${message.name}：${message.image?'[截图]':message.text}`;$('chatReplyDraft').classList.remove('hidden');closeChatPicker();$('chatInput').focus();});
$('chatPicker').addEventListener('click',e=>{
 const mention=e.target.closest('[data-chat-mention]');if(mention){const player=chatRoom.players.find(p=>p.id===mention.dataset.chatMention);if(!player||!mentionRange)return;const input=$('chatInput'),text=`@${player.name} `,{start,end}=mentionRange;if(input.value.length-(end-start)+text.length>300){toast('聊天内容最多 300 字',true);return;}input.setRangeText(text,start,end,'end');closeChatPicker();input.focus();return;}
 const quick=e.target.closest('[data-chat-quick]'),emoji=e.target.closest('[data-chat-emoji]');
 if(quick){if(chatSending)return;closeChatPicker();sendChat(quickChats[Number(quick.dataset.chatQuick)],false);}
 if(emoji){const input=$('chatInput'),value=chatEmojis[Number(emoji.dataset.chatEmoji)][0],start=input.selectionStart,end=input.selectionEnd;if(input.value.length-(end-start)+value.length>300){toast('聊天内容最多 300 字',true);return;}input.setRangeText(value,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
});
document.addEventListener('click',e=>{if(!e.composedPath().includes(chatWindow))closeChatPicker();});
$('chatInput').addEventListener('keydown',e=>{if(e.key==='Escape')closeChatPicker();});
$('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.isComposing)e.preventDefault();});
function renderChat(){
 if(!chatRoom)return;
 const changed=chatRoomCode!==chatRoom.code,list=$('chatMessages'),messages=chatRoom.chat||[],lastId=messages.at(-1)?.id||null;
 const looks=JSON.stringify(chatRoom.players.map(p=>p.look));if(!changed&&lastId===chatLastId&&looks===window.chatCosmeticLooks)return;window.chatCosmeticLooks=looks;
 const bottom=changed||list.scrollHeight-list.scrollTop-list.clientHeight<40;
 if(changed){$('chatInput').value='';clearChatAttachment();closeChatPicker();clearChatReply();clearMentionReminder();$('chatWindow').classList.toggle('hidden',!!room?.tutorial);clampChatWindow();}
 else{const previous=messages.findIndex(m=>m.id===chatLastId),fresh=messages.slice(previous<0?-1:previous+1),mentions=fresh.filter(m=>m.playerId!==chatPlayerId&&m.mentions?.some(p=>p.id===chatPlayerId));if(mentions.length){toast(`${mentions.at(-1).name} 在房间聊天中 @了你`);if($('chatWindow').classList.contains('hidden')||$('roomView').classList.contains('hidden')||!document.hasFocus()){unreadMentions+=mentions.length;$('chatOpen').textContent=`💬 房间聊天 · ${unreadMentions} 条 @我的消息`;$('chatOpen').classList.add('has-mention');}}}
 list.innerHTML=messages.length?messages.map(m=>`<div class="chat-message ${m.playerId===chatPlayerId?'mine':''} ${m.mentions?.some(p=>p.id===chatPlayerId)?'mentioned':''}"><div>${window.cosmeticAvatar?window.cosmeticAvatar(chatRoom.players.find(p=>p.id===m.playerId)||{id:m.playerId,name:m.name}):''}<strong>${esc(m.name)}</strong><time>${esc(new Date(m.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}))}</time><button type="button" class="chat-reply-button" data-chat-reply="${esc(m.id)}" aria-label="引用 ${esc(m.name)}的消息">↪ 引用</button></div>${m.reply?`<blockquote class="chat-quote"><strong>${esc(m.reply.name)}</strong><span>${esc(m.reply.text)}</span></blockquote>`:''}${m.image?`<button type="button" class="chat-image-thumb ${m.sticker?'chat-sticker':''}" data-chat-image="${esc(m.image)}" aria-label="查看截图"><img src="${esc(imageUrl(m.image))}" alt="${esc(m.name)}发送的截图"><small>点击看大图</small></button>${m.text?`<p>${mentionText(m)}</p>`:''}`:`<p>${mentionText(m)}</p>`}</div>`).join(''):'<p class="chat-empty">和同桌的朋友打个招呼吧</p>';
 if(bottom)list.querySelectorAll('img').forEach(img=>img.addEventListener('load',()=>{list.scrollTop=list.scrollHeight;},{once:true}));
 if(bottom)list.scrollTop=list.scrollHeight;
 chatRoomCode=chatRoom.code;chatLastId=lastId;
}
$('chatForm').addEventListener('submit',async e=>{
 e.preventDefault();await sendChat($('chatInput').value.trim());
});
async function sendChat(text,clearInput=true){
 const code=chatRoom?.code,attachment=clearInput?chatAttachment:null;if((!text&&!attachment)||!code||chatSending)return;
 if(attachment&&attachment.code!==code){toast('房间已切换，请重新选择附件',true);return;}
 chatSending=true;$('chatSend').disabled=true;$('chatSend').textContent='发送中…';
 // Free HTTP/1 connection slots when several game/chat windows have open SSE streams.
 const pausedEvents=events,pausedChatEvents=chatEvents,roomCode=room?.code||'';
 pausedEvents?.close();pausedChatEvents?.close();
 const replyId=chatReply?.id,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=attachment?.type==='image'?await fetch(`/api/chat-image?room=${encodeURIComponent(code)}`,{method:'POST',signal:controller.signal,headers:{'Content-Type':attachment.file.type,'X-Player-Token':token,'X-Chat-Text':encodeURIComponent(text),...(replyId?{'X-Reply-To':replyId}:{})},body:attachment.file}):await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({action:attachment?'sticker':'chat',stickerId:attachment?.id,token,code,text,replyTo:replyId})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'发送失败');
  if(chatRoom?.code===code){if(clearInput&&$('chatInput').value.trim()===text)$('chatInput').value='';if(attachment&&chatAttachment===attachment)clearChatAttachment();if(chatReply?.id===replyId)clearChatReply();closeChatPicker();$('chatMessages').scrollTop=$('chatMessages').scrollHeight;$('chatInput').focus();}
 }catch(e){toast(e.name==='AbortError'?'发送超时，请检查连接后重试；可先查看消息是否已送达。':e.message,true);}finally{clearTimeout(timeout);chatSending=false;$('chatSend').disabled=false;$('chatSend').textContent='发送';if(pausedEvents&&events===pausedEvents&&(room?.code||'')===roomCode)connect(roomCode);if(pausedChatEvents&&chatEvents===pausedChatEvents&&chatRoom?.code===code)connectChat(code);}
}
let activeReadyReminder=null,readyReminderTimer=null;
function renderReadyReminder(){const reminder=room?.readyReminder,dialog=$('readyReminderDialog');if(!reminder||room.status!=='waiting'||me()?.ready||!reminder.targets.includes(playerId)||reminder.expiresAt<=Date.now()){dialog.close();activeReadyReminder=null;clearTimeout(readyReminderTimer);return;}if(localStorage.getItem('tongzhuoReadyReminder')===reminder.id)return;localStorage.setItem('tongzhuoReadyReminder',reminder.id);activeReadyReminder=reminder.id;dialog.showModal();clearTimeout(readyReminderTimer);readyReminderTimer=setTimeout(()=>{dialog.close();activeReadyReminder=null;},reminder.expiresAt-Date.now());}
$('remindReadyButton').onclick=async()=>{if(await action('remindReady'))toast('已提醒未准备的玩家');};
$('readyReminderCancel').onclick=()=>{$('readyReminderDialog').close();activeReadyReminder=null;};
$('readyReminderConfirm').onclick=async()=>{if(!activeReadyReminder)return;const id=activeReadyReminder;$('readyReminderConfirm').disabled=true;try{if(await action('confirmReady',{reminderId:id})){$('readyReminderDialog').close();activeReadyReminder=null;}}finally{$('readyReminderConfirm').disabled=false;}};
function renderRoom(){
 if(!room||chatOnly)return;renderTutorial(room,playerId);renderReadyReminder();const gameId=room.gameId||'carcassonne',def=games[gameId],incan=gameId==='incangold',song=gameId==='song',word=gameId==='wordmahjong',chroma=gameId==='chroma';document.body.classList.toggle('chroma-table',chroma);selectedLobbyGame=gameId;document.body.classList.toggle('word-game',word);
 $('roomTitle').textContent=`${room.title} · ${def.name}`;$('roomCode').textContent=`房间号 ${room.code}`;$('seatCount').textContent=`${room.players.length} / ${room.maxPlayers} · ${room.spectators?.length||0} 人观战`;
 $('roomStatus').textContent=room.status==='waiting'?'等待玩家准备':room.status==='playing'?chroma?`第 ${room.game.round} / ${room.game.maxRounds} 轮`:song?`第 ${room.game.moves+1} 次经营` :incan?`第 ${room.game.round} / 5 轮探险`:`第 ${room.game.moves+1} 回合`:'对局已结束';
 $('playerHelp').textContent=chroma?'游戏提供者：ww。扩张领地、争夺染井；每回合结束后交给下一位，最终总积分最高者获胜。':word?'标点也占牌，恰好13张成句。吃碰公开后可重排；同意票大于不同意票才可推翻初判。':song?'先购买或建店，再备菜，最后招待客人。目标：建成八家店铺，持有至少五十两。方桌经营版；点击图片可看详细牌效。':incan?'选择同时揭晓。帐篷财富仅自己可见；带回营地的宝石安全，本轮背包在重复危险时会丢失。':'随从完成道路、城市或修道院后会归还。农夫留在田野，直到终局。';
 $('players').innerHTML=room.players.map(p=>{
  const active=room.status==='playing'&&(chroma?room.game.active===p.id:incan?room.game.active.includes(p.id):room.players[room.game.turn]?.id===p.id);
  const state=room.status==='waiting'?(p.ready?'已准备':'未准备'):incan?(active?(room.game.submitted.includes(p.id)?'已提交选择':'正在选择'):((room.game.roundDepartures||[]).find(d=>d.playerId===p.id)?'本轮已撤离':(room.game.roundLosses||[]).some(d=>d.playerId===p.id)?'逃离灾祸':'在营地')):active?'正在行动':'在这一桌';
  const avatar=chroma?'<span class="game-icon">染</span>':word?`<span class="game-icon">字</span>`:incan?explorerAvatar(p.id):`<img src="/assets/meeple-${p.color}.png" alt="${['红','蓝','黄','紫','绿'][p.color]}色随从">`;
  const stats=chroma&&room.game?`<div class="chroma-stats">${p.score} 分${active?' · 剩余墨水 '+room.game.ink:''}</div><small>领地 ${room.game.board.filter(c=>c.owner===p.id).length} 格</small>`:word&&room.game?`<small>手牌 ${Array.isArray(room.game.hands[p.id])?room.game.hands[p.id].length:room.game.hands[p.id].count} 张</small>`:song?`<div class="song-player-stats"><span>${p.shopCount||0} / 8 铺</span><b>${p.score} 两</b></div>`:incan?`<div class="score"><span>背包 ${p.pocket||0}</span><b>帐篷 ${p.score===null?'保密':p.score}</b></div><small>神器 ${p.artifacts?.length||0} 件</small>`:`<div class="score"><span>随从 ${p.meeples}/7</span><b>${p.score} 分</b></div>`;
  return `<div data-table-player="${esc(p.id)}" class="player-card ${song?'song-player':''} ${active?'active':''}">${window.cosmeticAvatar?window.cosmeticAvatar(p):avatar}<div class="player-info"><strong>${esc(p.name)}${p.botLevel?' 🤖':''}${p.id===playerId?' <small>你</small>':''}</strong><small>${p.id===room.hostId?'房主 · ':''}${state}</small>${chroma&&p.chromaColor?`<small class="chroma-player-color"><i style="background:${p.chromaColor}"></i>${esc(room.chromaPalette?.find(c=>c.color===p.chromaColor)?.name||p.chromaColor)}</small>`:''}${room.game?stats:''}</div>${room.hostId===playerId&&p.id!==playerId?`<button class="quiet" data-kick="${p.id}">踢出</button>`:''}</div>`;
 }).join('')+(room.spectators||[]).map(p=>`<div data-table-player="${esc(p.id)}" class="player-card">${window.cosmeticAvatar?window.cosmeticAvatar(p):''}<div class="player-info"><strong>${esc(p.name)}</strong><small>观战中</small>${p.id===playerId?'<button class="outline spectator-join" data-join-seat '+(room.status==='playing'||room.players.length>=room.maxPlayers?'disabled':'')+'>'+(room.status==='playing'?'对局结束后可加入':room.players.length>=room.maxPlayers?'房间已满':'加入房间')+'</button>':''}</div>${room.hostId===playerId?`<button class="quiet" data-kick="${p.id}">踢出</button>`:''}</div>`).join('');
 $('coinSettlement').innerHTML=room.coinResults?.length?'<div class="coin-settlement"><strong>本局桌游币结算</strong>'+room.coinResults.map(p=>`<p>第 ${p.rank} 名 · ${esc(p.name)} <b>+${p.coins} 币</b><small>排名 ${p.base} + 分差 ${p.gapBonus}</small></p>`).join('')+'</div>':'';
 const waiting=room.status==='waiting';$('waiting').classList.toggle('hidden',!waiting);$('boardViewport').classList.toggle('hidden',waiting||incan||song||word||chroma);$('songBoard').classList.toggle('hidden',waiting||!song);$('incanBoard').classList.toggle('hidden',waiting||!incan);
 $('chromaBoard').classList.toggle('hidden',!chroma||waiting);$('wordBoard').classList.toggle('hidden',!word||waiting);if(waiting){const host=room.hostId===playerId;$('botControls').innerHTML=host?'<p>人不够？添加机器人（自动准备）</p>'+Object.entries({easy:'简单',normal:'普通',hard:'困难'}).map(([level,label])=>`<button class="outline" data-add-bot="${level}" ${room.players.length>=room.maxPlayers?'disabled':''}>＋ ${label}机器人</button>`).join('')+'<small>简单：轻松练习 · 普通：基础策略 · 困难：评估收益与风险。'+(chroma?'染域完整对局给真人玩家发桌游币，教学局不发。':'机器人局、教学局不发桌游币。')+'</small>':'';$('remindReadyButton').classList.toggle('hidden',!host);$('remindReadyButton').disabled=!room.players.some(p=>p.id!==room.hostId&&!p.ready);$('waitingHint').textContent=`房间号 ${room.code} · ${def.name} · 邀请同一网络下的朋友加入`;$('readyButton').textContent=host?'开始游戏':me()?.ready?'取消准备':'我准备好了';$('readyButton').classList.toggle('hidden',!me());$('readyButton').disabled=host&&(room.players.length<def.minPlayers||!room.players.every(p=>p.ready));$('waitingNote').textContent=`${def.name}需要 ${def.minPlayers}–${def.maxPlayers} 人 · ${host?'更换桌游后大家需要重新准备':'等待房主选择桌游'}`;
  $('roomGamePicker').innerHTML=Object.entries(games).map(([id,d])=>`<button class="room-game-option ${id===gameId?'selected':''}" data-room-game="${id}" ${host&&room.players.length<=d.maxPlayers?'':'disabled'}><img src="${d.cover}" alt="${d.name}宣传图"><span><b>${d.name}</b><small>${d.minPlayers}–${d.maxPlayers} 人 · ${d.duration}</small></span>${id===gameId?'<em>已选</em>':''}</button>`).join('');
  $('turnContent').innerHTML=`${chroma?chromaWaiting():word?wordGrowthHTML():''}<div class="turn-eyebrow">一起上桌 / ${def.name}</div><h3 class="turn-title">先准备，再开始</h3><p class="turn-subtitle">你可以利用等待时间看看规则。</p><div class="turn-hint">${chroma?'染色或使用战术牌 → 结束回合 → 全员强化选牌。<br>最后一轮结束后，总积分最高者获胜。':word?'摸一弃一 → 吃碰换字 → 十三张成句。标点占牌；问答与申诉由全桌投票。':song?'购买／建店 → 备菜 → 招待客人。<br>率先建成八铺，并持有五十两。':incan?'发现宝石 → 同时选择继续或返回 → 一起揭晓。<br>五轮后，帐篷财富最多的人获胜。':'每回合：放置地块 → 可选放置一名随从 → 自动计分。<br>最终得分最高的人获胜。'}</div>`;$('gameLog').innerHTML='<p>房间已创建，等待玩家准备。</p>';lastGame=null;return;}
 if(chroma){renderChroma();return;}if(word){renderWordMahjong();return;}if(song){renderSong();$('gameLog').innerHTML=room.game.log.map(t=>`<p>${esc(t)}</p>`).join('');return;}
 if(incan){renderIncan();$('gameLog').innerHTML=room.game.log.map(t=>`<p>${esc(t)}</p>`).join('');return;}
 renderTurn();renderBoard();$('gameLog').innerHTML=room.game.log.map(t=>`<p>${esc(t)}</p>`).join('');
 if(lastGame!==room.game.board['0,0'].id+':'+room.code||room.game.moves===0&&lastGame===null){center();lastGame=room.game.board['0,0'].id+':'+room.code;}
}
function renderTurn(){
 const g=room.game;const mine=isMyTurn();const current=room.players[g.turn];
 if(room.status==='finished') {
  const sorted=[...(room.results||room.players)].sort((a,b)=>b.score-a.score);const winners=sorted.filter(p=>p.score===sorted[0].score);
  $('turnContent').innerHTML=`<div class="turn-eyebrow">终局计分已完成</div><h3 class="turn-title">${esc(winners.map(p=>p.name).join('、'))} 获胜</h3><p class="turn-subtitle">${winners.length>1?'同分并列获胜':'一起拼出的这片土地，值得留念。'}</p><div class="result-list">${sorted.map((p,i)=>`<div class="result-row"><span>${i+1}. ${esc(p.name)}</span><b>${p.score} 分</b></div>`).join('')}</div>${room.hostId===playerId?'<button class="primary full" data-turn="rematch">再来一局</button>':'<div class="turn-hint">等待房主开启下一局。</div>'}`;return;
 }
 const rest=`<div class="remaining"><span>牌堆剩余</span><b>${g.remaining} / 71</b></div>`;
 const heading=`<div class="turn-eyebrow">${mine?'轮到你了':'等待朋友行动'}</div><h3 class="turn-title">${esc(current.name)}的回合</h3>`;
 if(g.phase==='tile'){
  $('turnContent').innerHTML=`${heading}<p class="turn-subtitle">① 放置地块</p><div class="tile-preview"><img src="/assets/tile-${g.current}.png" style="transform:rotate(${rotation*90}deg)" alt="当前抽到的地块"></div>${mine?'<div class="rotation-buttons"><button data-turn="left">↶ 向左旋转</button><button data-turn="right">向右旋转 ↷</button></div>':''}<div class="turn-hint">${mine?selection?`已选择落点 (${selection.x}, ${selection.y})，${me()?.meeples===0?'随从已用完，确认后自动结束回合。':'确认后进入随从步骤。'}`:g.legal.some(p=>p.rotations.includes(rotation))?'点击棋盘上的虚线格选择落点。可旋转地块寻找更多落点。':'这个方向没有合法落点，请旋转地块。':'地块正在由朋友放置。你可以拖动或缩放棋盘。'}</div>${mine?`<button class="primary full" data-turn="place" ${selection?'':'disabled'}>确认放置</button>`:''}${rest}`;
 }else{
  const f=g.features;const possible=f.filter(v=>v.available&&me()?.meeples>0);
  if(!possible.some(f=>f.index===selectedFeature))selectedFeature=null;
  $('turnContent').innerHTML=`${heading}<p class="turn-subtitle">② 放置随从（可跳过）</p><div class="turn-hint">${mine?'只能放在刚放的地块上。已有人占据或刚封闭的城／路不能放随从；可先占独立区域，再拼接争夺。':'朋友正在选择随从位置，完成后自动计分。'}</div>${mine?`<div class="feature-options">${f.map((v,i)=>`<button data-feature="${v.index}" class="${selectedFeature===v.index?'selected':''}" ${v.available&&me()?.meeples>0?'':'disabled'}>${i+1} ${v.label}${v.reason?` · ${v.reason.includes('已完成')?'已完成':'已占据'}`:''}</button>`).join('')}</div><button class="primary full" data-turn="finish" ${selectedFeature===null?'disabled':''}>放置随从并结束回合</button><button class="outline full" style="margin-top:9px" data-turn="skip">不放随从，结束回合</button>${me()?.meeples===0?'<p class="turn-subtitle">你的随从已用完，可以跳过。</p>':''}`:''}${rest}`;
 }
}
function rotatedAnchor(feature,rotation){let [x,y]=feature.anchor;for(let i=0;i<rotation;i++)[x,y]=[1-y,x];return [x,y];}
function latestPlacement(){const g=room?.game;if(!g?.board)return null;if(g.lastPlacement)return {...g.lastPlacement,key:`${g.lastPlacement.x},${g.lastPlacement.y}`};const keys=Object.keys(g.board);if(keys.length<2)return null;const k=g.pending||keys.at(-1);return {...g.board[k],key:k};}
function renderBoard(){
 const g=room.game,latest=latestPlacement();let html='';
 $('latestTile').disabled=!latest;
 $('latestPlacementText').textContent=latest?`${room.players.find(p=>p.id===latest.playerId)?.name||'玩家'}刚放：地块 ${g.board[latest.key].id} · (${latest.x}, ${latest.y})`:'尚未放置新地块';
 for(const [k,t] of Object.entries(g.board)){
  const m=t.meeple;let marker='';
  if(m){const player=room.players.find(p=>p.id===m.playerId),f=catalog[t.id].features[m.feature],[x,y]=rotatedAnchor(f,t.rotation);marker=`<img class="placed-meeple ${f.kind==='field'?'farmer':''}" src="/assets/meeple-${player.color}.png" style="left:${x*100}%;top:${y*100}%" alt="${esc(player.name)}的${f.kind==='field'?'农夫':'随从'}">`;}
  const pending=k===g.pending;
  if(pending&&isMyTurn())for(const [i,f] of g.features.entries())if(f.available&&me().meeples>0)marker+=`<button class="feature-spot ${selectedFeature===f.index?'chosen':''}" style="left:${f.anchor[0]*100}%;top:${f.anchor[1]*100}%" data-feature="${f.index}" title="${f.label}" aria-label="在${f.label}放随从">${i+1}</button>`;
  html+=`<div class="tile ${pending?'pending':''} ${k===latest?.key?'latest':''}" style="left:${t.x*88}px;top:${t.y*88}px" data-tile="${k}" title="${k===latest?.key?'最新放置 · ':''}地块 ${t.id} (${t.x}, ${t.y})"><img class="tile-art" src="/assets/tile-${t.id}.png" style="transform:rotate(${t.rotation*90}deg)" alt="地块 ${t.id}">${k===latest?.key?'<span class="latest-tile-label">最新</span>':''}${marker}</div>`;
 }
 if(g.phase==='tile'&&isMyTurn())for(const p of g.legal)if(p.rotations.includes(rotation)){
  const selected=selection?.x===p.x&&selection?.y===p.y;
  html+=`<button class="legal-cell ${selected?'selected':''}" style="left:${p.x*88}px;top:${p.y*88}px" data-x="${p.x}" data-y="${p.y}" aria-label="在 ${p.x}, ${p.y} 放置地块">${selected?`<img src="/assets/tile-${g.current}.png" style="transform:rotate(${rotation*90}deg)" alt="落点预览">`:'＋'}</button>`;
 }
 $('board').innerHTML=html;transform();
}
function transform(){$('board').style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;}
function focusLatestTile(){const latest=latestPlacement();if(!latest)return;scale=Math.max(.9,scale);panX=-(latest.x+.5)*88*scale;panY=-(latest.y+.5)*88*scale;transform();}
function center(){if(!room?.game)return;const tiles=Object.values(room.game.board);const minX=Math.min(...tiles.map(t=>t.x)),maxX=Math.max(...tiles.map(t=>t.x)),minY=Math.min(...tiles.map(t=>t.y)),maxY=Math.max(...tiles.map(t=>t.y));const viewport=$('boardViewport');scale=Math.min(1.35,(viewport.clientWidth-150)/((maxX-minX+1)*88),(viewport.clientHeight-130)/((maxY-minY+1)*88));scale=Math.max(.28,scale);panX=-(minX+maxX+1)*44*scale;panY=-(minY+maxY+1)*44*scale;transform();}
function zoom(factor,x=0,y=0){const next=Math.min(2.8,Math.max(.25,scale*factor));panX=x-(x-panX)*next/scale;panY=y-(y-panY)*next/scale;scale=next;transform();}
const viewport=$('boardViewport');
viewport.addEventListener('wheel',e=>{if(e.target.closest('.board-tools'))return;e.preventDefault();const r=viewport.getBoundingClientRect();zoom(e.deltaY<0?1.1:1/1.1,e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2);},{passive:false});
viewport.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag={x:e.clientX,y:e.clientY,panX,panY,moved:false};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');});
viewport.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)drag.moved=true;panX=drag.panX+dx;panY=drag.panY+dy;transform();});
viewport.addEventListener('pointerup',()=>{suppressClick=!!drag?.moved;drag=null;viewport.classList.remove('dragging');setTimeout(()=>suppressClick=false,0);});
viewport.addEventListener('pointercancel',()=>{drag=null;viewport.classList.remove('dragging');});
$('zoomIn').onclick=()=>zoom(1.2);$('zoomOut').onclick=()=>zoom(1/1.2);$('centerBoard').onclick=center;
$('latestTile').onclick=focusLatestTile;
document.addEventListener('click',async e=>{
 const close=e.target.closest('[data-close]');if(close){close.closest('dialog').close();return;}
 const lobbyGame=e.target.closest('[data-lobby-game]');if(lobbyGame){selectedLobbyGame=lobbyGame.dataset.lobbyGame;renderLobby();return;}
 const roomGame=e.target.closest('[data-room-game]');if(roomGame&&!roomGame.disabled){if(roomGame.dataset.roomGame!==room.gameId)await action('selectGame',{gameId:roomGame.dataset.roomGame});return;}
 const shelfGame=e.target.closest('[data-shelf-game]');if(shelfGame){$('shelfDialog').close();openRules(shelfGame.dataset.shelfGame);return;}
 const choice=e.target.closest('[data-incan-choice]');if(choice&&!choice.disabled){await action('choose',{choice:choice.dataset.incanChoice,step:room.game.step});return;}
 if(e.target.closest('[data-settlement]')){showIncanSettlement(Number(e.target.closest('[data-settlement]').dataset.settlement));return;}
 if(e.target.closest('[data-join-seat]')){await action('join',{code:room.code});return;}
 if(e.target.closest('[data-next-round]')){await action('nextRound',{round:room.game.round});return;}
 const kick=e.target.closest('[data-kick]');if(kick){if(confirm('踢出成员？进行中的对局会回到等待状态。'))await action('kick',{playerId:kick.dataset.kick});return;}
 const chatJoin=e.target.closest('[data-chat-join]');if(chatJoin){await joinChatRoom(chatJoin.dataset.chatJoin);return;}
 const watch=e.target.closest('[data-watch]');if(watch){try{name();await action('watch',{code:watch.dataset.watch});}catch(e){toast(e.message,true);}return;}
 const join=e.target.closest('[data-join]');if(join){try{name();await action('join',{code:join.dataset.join});}catch(e){toast(e.message,true);}return;}
 if(e.target.closest('[data-create]')){openCreate();return;}
 const turn=e.target.closest('[data-turn]');if(turn){
  const t=turn.dataset.turn;
  if(t==='left'||t==='right'){rotation=(rotation+(t==='left'?3:1))%4;selection=null;renderTurn();renderBoard();}
  if(t==='place'&&selection)await action('place',{...selection,rotation});
  if(t==='finish')await action('finish',{feature:selectedFeature});
  if(t==='skip')await action('finish',{feature:null});
  if(t==='rematch'){lastGame=null;await action('rematch');}
  return;
 }
 const spot=e.target.closest('[data-feature]');if(spot&&!spot.disabled&&isMyTurn()){selectedFeature=Number(spot.dataset.feature);renderTurn();renderBoard();return;}
 const cell=e.target.closest('.legal-cell');if(cell&&!suppressClick){selection={x:Number(cell.dataset.x),y:Number(cell.dataset.y)};renderTurn();renderBoard();return;}
 const tab=e.target.closest('[data-rule]');if(tab)renderRules(tab.dataset.rule);
});
function updateCapacity(){const def=games[$('createGame').value];$('createCapacity').innerHTML=Array.from({length:def.maxPlayers-def.minPlayers+1},(_,i)=>def.maxPlayers-i).map(n=>`<option value="${n}">${n} 人</option>`).join('');}
function openCreate(){try{name();$('createGame').value=selectedLobbyGame;updateCapacity();$('createDialog').showModal();}catch(e){toast(e.message,true);}}
$('createGame').onchange=updateCapacity;
$('createButton').onclick=openCreate;$('joinCodeButton').onclick=()=>{try{name();$('joinDialog').showModal();}catch(e){toast(e.message,true);}};
$('roomSearch').oninput=renderLobby;
$('createForm').onsubmit=async e=>{e.preventDefault();const form=new FormData(e.target);if(await action('create',{title:form.get('title'),gameId:form.get('gameId'),maxPlayers:Number(form.get('maxPlayers'))}))$('createDialog').close();};
$('joinForm').onsubmit=async e=>{e.preventDefault();const code=new FormData(e.target).get('code').trim().toUpperCase();if(await action('join',{code}))$('joinDialog').close();};
async function openHistory(code=room?.code||''){$('historyDialog').showModal();$('historyContent').textContent='正在加载历史对局…';try{const response=await fetch('/api/history?room='+encodeURIComponent(code)),data=await response.json();if(!response.ok)throw new Error(data.error||'加载失败');$('historyContent').innerHTML=data.matches.length?data.matches.map((m,i)=>'<article class="history-match"><h3>'+esc(games[m.gameId]?.name||m.gameId)+' · '+esc(m.finishedAt?new Date(m.finishedAt).toLocaleString('zh-CN'):'旧对局 · 时间未记录')+'</h3><small>'+esc(m.title)+' · #'+esc(m.code)+' · '+(i===0?'最近一局':'此前对局')+'</small><table><thead><tr><th>排名</th><th>玩家</th><th>分数</th><th>桌游币</th></tr></thead><tbody>'+m.players.map(p=>'<tr><td>'+p.rank+'</td><td>'+esc(p.name)+'</td><td>'+p.score+(m.gameId==='incangold'?'（神器 '+p.artifacts+'）':'')+'</td><td>'+(p.coins===null?'未记录':'+'+p.coins)+'</td></tr>').join('')+'</tbody></table></article>').join(''):'<p class="muted">还没有已完成的对局记录。</p>';}catch(e){$('historyContent').textContent='历史对局加载失败，请关闭后重试。';toast(e.message,true);}}
$('roomHistory').onclick=()=>openHistory();$('lobbyHistory').onclick=()=>openHistory('');
$('readyButton').onclick=()=>action(room.hostId===playerId?'start':'ready');
$('backButton').onclick=async()=>{if(me()&&room.status==='playing'&&!confirm('退出会让本桌回到等待状态，确定退出？'))return;await action('leave');};
$('copyButton').onclick=async()=>{const info=await fetch('/api/info').then(r=>r.json());const host=['localhost','127.0.0.1'].includes(location.hostname)?info.addresses[0]||location.hostname:location.hostname;const link=`${location.protocol}//${host}${location.port?':'+location.port:''}/?room=${room.code}`;try{await navigator.clipboard.writeText(link);toast('邀请链接已复制');}catch{const dialog=$('networkDialog');$('networkAddresses').innerHTML=`<code>${esc(link)}</code>`;dialog.showModal();}};
$('networkButton').onclick=async()=>{const info=await fetch('/api/info').then(r=>r.json());$('networkAddresses').innerHTML=info.addresses.length?info.addresses.map(ip=>`<code>http://${ip}:${location.port||3000}</code>`).join(''):'<p>未检测到局域网地址，请先连接 Wi-Fi 或有线网络。</p>';$('networkDialog').showModal();};
const ruleSources='<div class="rule-source">本网站为非官方局域网实现，使用原创 PNG 美术。规则参考 <a href="https://www.hans-im-glueck.de/en/game/carcassonne/" target="_blank" rel="noopener">Hans im Glück 官方卡卡颂资料</a>；采用 72 块地块、每人 7 名随从，不包含河流、修道院长和其他扩展。本网站采用自定义规则：封口完成的城／路禁止新放随从。</div>';
const rules={
 quick:`<h3>目标：拼出土地，派出随从，争取得分</h3><p>轮流放置一块地块，将城市、道路和田野连接起来。占领并完成区域可获得分数，地块用完后还会进行终局计分。</p><div class="rule-steps"><div class="rule-step"><b>① 抽一块，接上去</b><img src="/assets/tile-D.png" alt="道路与城市地块"><p>必须与至少一块已有地块共边相邻。所有相接边都必须匹配：城市接城市，道路接道路，田野接田野。可以旋转，不能只碰角。</p></div><div class="rule-step"><b>② 可选派一名随从</b><img src="/assets/meeple-0.png" style="width:68px;object-fit:contain" alt="随从"><p>只可放在你刚放的地块上。相连区域有人占据时不能追加随从；可以先占附近独立的城／路，再拼接合并争夺。封口完成的城／路不能新放随从。</p></div><div class="rule-step"><b>③ 完成区域，自动计分</b><img src="/assets/tile-B.png" alt="修道院地块"><p>完成道路、城市或修道院时，服务器自动计分并归还随从。随后轮到下一位。农夫等到终局才计分。</p></div></div><div class="rule-tip">操作顺序：旋转地块 → 点击虚线格 → 确认放置 → 选择随从位置或跳过。只想先学会玩？记住“接对边，放一个，完成就得分”。</div>`,
 score:`<h3>随从在哪里，就为那片区域争取得分</h3><p>每人有 7 名可用随从。区域完成后，随从回到你的储备，之后的回合可以再使用。</p><table class="score-table"><thead><tr><th>区域</th><th>什么时候完成</th><th>完成时</th><th>终局未完成</th></tr></thead><tbody><tr><td>道路</td><td>无开放出口；城市、村庄、修道院或闭环封闭道路</td><td>每块地块 1 分</td><td>每块地块 1 分</td></tr><tr><td>城市</td><td>没有开放的城市边</td><td>每块地块 2 分<br>每个盾徽额外 2 分</td><td>每块地块 1 分<br>每个盾徽额外 1 分</td></tr><tr><td>修道院</td><td>周围 8 格都有地块</td><td>9 分</td><td>自身及周围已有地块各 1 分</td></tr><tr><td>田野（农夫）</td><td>只在终局计分</td><td>—</td><td>每座相邻的完整城市 3 分</td></tr></tbody></table><div class="rule-tip">后来的地块可能把原本独立的区域连在一起。此时随从数量最多的玩家得分；并列最多时，每位玩家都得全额分数，不平分。所有该区域随从都会归还。</div>`,
 field:`<h3>农夫是一次长期投资</h3><p>将随从放在草地上，它就成为农夫。网站把农夫横放，方便与其他随从区分。农夫整个对局都留在田野，直到最终计分才归还。</p><div class="rule-example"><img src="/assets/tile-J.png" alt="被道路与城市分开的田野"><div><h3>先看清是哪一片草地</h3><p>道路和城市会分割田野。连成一片的草地属于同一田野。相连田野已有随从时，也不能再派农夫。</p><p>田野内多数农夫的拥有者，为这片田野相邻的每座完整城市得 3 分。同一城市在同一田野里只算一次；未完成城市不计分。</p></div></div><div class="rule-tip">例：同一田野旁有 3 座完整城市、1 座未完成城市，你拥有最多农夫，就得 3 × 3 = 9 分。并列多数时，每位并列玩家都得 9 分。新手前几回合可以先不派农夫，熟悉计分后再选择。</div>`,
 faq:`<div class="faq-item"><b>能把随从放到以前的地块上吗？</b><p>不能。只能在本回合刚放置的地块上放至多一名随从。确认回合后不能撤销。</p></div><div class="faq-item"><b>我的随从也会阻止我再次占领相连区域吗？</b><p>会。只要整片相连区域已有任何随从，就不能再放。可以通过连接两片原先独立的区域，让它们合并。</p></div><div class="faq-item"><b>地块放下时区域就完成，还能派随从吗？</b><p>本房间采用封口规则：刚完成的城／路不能新派随从。已有随从按数量比较，多者独得全部分数；并列者各得完整分数。地块上的其他未完成区域仍可放随从。</p></div><div class="faq-item"><b>没有可用随从怎么办？</b><p>继续放地块，跳过随从步骤。等待自己占领的区域完成，随从就会归还。</p></div><div class="faq-item"><b>某块地完全放不下怎么办？</b><p>服务器检查所有位置和旋转。如果没有任何合法落点，自动弃置并重新抽取，弃置会记入对局记录。</p></div><div class="faq-item"><b>断网或关了网页怎么办？</b><p>用原来的浏览器再次打开网站即可返回座位。浏览器本地身份和服务器的对局存档支持重连；清除浏览器数据会失去原来的身份。</p></div><div class="faq-item"><b>怎么结束比赛？</b><p>最后一块可用地块放完后，自动结算未完成区域和农夫。最高分获胜，同分并列获胜。房主可点击“再来一局”。</p></div>`
};
function renderRules(tab='quick'){if(rulesGameId==='chroma'){$('rulesContent').innerHTML='<h3>染域 · 游戏提供者：ww</h3><button class="primary" type="button" data-chroma-tutorial>进入新手教学局</button><p>2–8 人。每回合通常获得 3 墨，点击相邻空地染色需 1 墨，抢夺敌方普通地块通常需 2 墨，加固需 1 墨。岩石不可染色，出生点不可抢夺。</p><p>普通地块与出生点每格 1 分，染井每格 4 分。强化可能改变费用、行动与分值。使用泼墨、破色、飞染前先选择战术牌，再点击目标。回归基本功可连续点选两格染色。</p><p>每回合点击结束回合。每隔若干轮全员选择强化，可免费重抽一次。所有人选好才继续，最后一轮结束按总积分判胜，同分并列。</p><p>房间、准备、观战、聊天、离场及再来一局使用同桌既有规则。真人完整对局按排名发放桌游币；机器人局和教学局不发币。</p>';return;}if(rulesGameId==='wordmahjong'){$('rulesContent').innerHTML=wordRules;return;}document.querySelectorAll('[data-rule]').forEach(b=>b.classList.toggle('active',b.dataset.rule===tab));if(rulesGameId==='song'){$('rulesContent').innerHTML=songRules[tab]||songRules.quick;return;}if(rulesGameId==='incangold'){$('rulesContent').innerHTML=incanRules[tab]+incanRuleSource;return;}const content=tab==='tiles'?`<h3>原版基础版：24 类形状，共 72 块</h3><p>包含起始地块 D × 1，其余 71 块进入牌堆。数量、城市与道路连接、田野分区及盾徽按基础版清单对齐；下图使用原创 PNG 美术。旋转方向不同仍属于同一种形状。</p><div class="tile-catalog">${Object.values(catalog).map(t=>`<div class="catalog-card"><img src="/assets/tile-${t.id}.png" alt="${t.id} 类地块"><div><b>${t.id}</b><span>× ${t.count}</span></div></div>`).join('')}</div>`:rules[tab];$('rulesContent').innerHTML=content+ruleSources;}
function openRules(gameId){rulesGameId=gameId;const def=games[gameId];$('rulesDialog').querySelector('h2').textContent=`${def.name} · 新手说明书`;const tabs=gameId==='chroma'?[['quick','玩法与房间规则']]:gameId==='song'?[['quick','经营入门'],['shops','店铺收益'],['menus','菜品卡'],['guests','客人卡'],['events','事件卡'],['cards','卡池与差异'],['faq','操作与联机']]:gameId==='incangold'?[['quick','三分钟上手'],['score','宝石与神器'],['danger','危险与轮次'],['faq','常见问题'],['cards','原版卡牌清单']]:[['quick','三分钟上手'],['score','计分与随从'],['field','农夫与田野'],['faq','常见问题'],['tiles','原版地块清单']];$('rulesDialog').querySelector('.rules-tabs').innerHTML=tabs.map(([id,label])=>`<button data-rule="${id}">${label}</button>`).join('');renderRules();$('rulesDialog').showModal();}
function openShelf(){$('gameShelf').innerHTML=Object.entries(games).map(([id,d])=>`<button class="shelf-game" data-shelf-game="${id}"><div class="shelf-cover"><img src="${d.cover}" alt="${d.name}宣传图"><span>${d.english}</span></div><div class="shelf-info"><h3>${d.name}<small>${d.edition}</small></h3><p>${d.description}</p><div class="shelf-meta"><span>${d.minPlayers}–${d.maxPlayers} 人</span><span>${d.duration}</span></div><div class="shelf-open">打开新手说明书 <b>↗</b></div></div></button>`).join('');$('shelfDialog').showModal();}
$('rulesButton').onclick=openShelf;$('introRules').onclick=()=>openRules(selectedLobbyGame);$('roomRules').onclick=()=>openRules(room.gameId||'carcassonne');
async function init(){try{
 const [data,definitions]=await Promise.all([fetch('/assets/tiles.json').then(r=>r.json()),fetch('/games.json').then(r=>r.json())]);catalog=Object.fromEntries(data.map(t=>[t.id,t]));games=definitions;renderLobby();connect('');
 fetch('/api/economy',{headers:{'X-Player-Token':token}}).then(async response=>{if(response.ok)updateWallet((await response.json()).wallet);}).catch(()=>{});
 const params=new URLSearchParams(location.search),chatCode=chatOnly?params.get('room')||localStorage.getItem('tongzhuoChat'):localStorage.getItem('tongzhuoChat');if(chatCode)connectChat(chatCode);
 if(chatOnly){if(chatCode){if(!$('nickname').value.trim()){$('nickname').value=prompt('输入昵称加入聊天室')||'';}if($('nickname').value.trim())await joinChatRoom(chatCode);else toast('请输入昵称后重新打开聊天链接。');}return;}
 const code=params.get('room')||localStorage.getItem('tongzhuoRoom');if(code){if($('nickname').value.trim())await action(localStorage.getItem('tongzhuoRoom')===code&&localStorage.getItem('tongzhuoRole')==='spectator'?'watch':'join',{code})||await action('watch',{code});else{$('joinDialog').querySelector('[name=code]').value=code;$('nickname').focus();toast('输入昵称后，点击“输入房间号”加入朋友的房间。');}}
 }catch(e){toast('无法连接服务，请检查服务窗口是否仍在运行。',true);}}
init();

$('botControls').onclick=e=>{const b=e.target.closest('[data-add-bot]');if(b)action('addBot',{level:b.dataset.addBot});};
$('tutorialStart').onclick=async()=>{if(selectedLobbyGame==='chroma'){openChromaTutorial();return;}if(!$('nickname').value.trim())$('nickname').value='新手';await action('create',{title:games[selectedLobbyGame].name+' · 实战教学',gameId:selectedLobbyGame,maxPlayers:games[selectedLobbyGame].maxPlayers,tutorial:true,guided:true});};
