const $=s=>document.querySelector(s),app=$('#app');
let token=localStorage.getItem('tongzhuoToken');
let tutorial=null;
let roomList=[],roomListStatus='loading',roomListBusy=false;
let inkReminderKey=null;
let intelPlayer=null,intelAllDraws=false,intelHistoryOpen={};
let state=null,source=null,mode='paint',selected=null,secondSelected=null,busy=false,network=[];
// BEGIN SHARE ADDRESS
function shareAddresses(info={},origin=location.origin){
  const here=new URL(origin);
  const local=['localhost','127.0.0.1','[::1]'].includes(here.hostname);
  if(!local)return [here.origin];
  if(info.publicUrl)return [new URL(info.publicUrl).origin];
  return info.addresses?.length?[...new Set(info.addresses)]:[here.origin];
}
// END SHARE ADDRESS
let invitedRoom=new URLSearchParams(location.search).get('room')||'';
if(!/^[0-9]{6}$/.test(invitedRoom))invitedRoom='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}
async function api(endpoint,data={}){const r=await fetch('/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Player-Token':token},body:JSON.stringify({room:state?.code,...data})});const v=await r.json();if(!r.ok)throw Error(v.error||'连接失败');return v;}
function setState(v){const old=state;if(old?.code===v.code&&Number.isFinite(old.revision)&&Number.isFinite(v.revision)&&v.revision<old.revision)return;if(old?.game&&(old.game.active!==v.game?.active||old.game.round!==v.game?.round||!!old.game.draft!==!!v.game?.draft)){mode='paint';selected=null;secondSelected=null;}state=v;if(v.game&&!['paint','shield',...v.game.hand].includes(mode))mode='paint';if(v.game&&state.cards[mode]&&!skillAllowed(mode))mode='paint';render();}
// BEGIN ROOM SYNC
class RoomSync {
  constructor({onState,onStatus,onClosed,EventSourceImpl=globalThis.EventSource,fetchImpl=(...args)=>globalThis.fetch(...args),setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=id=>globalThis.clearTimeout(id),pollInterval=1000,connectTimeout=6000,idleTimeout=15000,probeInterval=30000,requestTimeout=8000}){
    Object.assign(this,{onState,onStatus,onClosed,EventSourceImpl,fetchImpl,setTimer,clearTimer,pollInterval,connectTimeout,idleTimeout,probeInterval,requestTimeout});
    this.generation=0;this.active=false;
  }
  start(room,token,mode='auto'){
    this.stop();this.room=room;this.token=token;this.mode=mode;this.active=true;this.lastRevision=-1;this.failures=0;
    this.onStatus('正在连接…');
    if(mode==='poll'||!this.EventSourceImpl)this.startPolling();else this.openSSE();
  }
  clear(name){this.clearTimer(this[name]);this[name]=null;}
  stop(){
    this.active=false;this.generation++;this.polling=false;
    for(const name of ['sseTimer','pollTimer','probeTimer'])this.clear(name);
    this.source?.close();this.source=null;this.pollController?.abort();this.pollController=null;
  }
  close(){this.stop();}
  receive(value){
    if(!value||value.code!==this.room||!Array.isArray(value.players))return false;
    if(Number.isFinite(value.revision)){
      if(value.revision<=this.lastRevision)return true;
      this.lastRevision=value.revision;
    }
    this.onState(value);return true;
  }
  closed(message){if(!this.active)return;this.stop();this.onClosed(message);}
  armSSE(source,delay){
    this.clear('sseTimer');this.sseTimer=this.setTimer(()=>{if(this.active&&source===this.source)this.failSSE(source);},delay);
  }
  openSSE(){
    if(!this.active||this.source)return;
    const generation=this.generation;let stream;
    try{stream=new this.EventSourceImpl(`/api/events?room=${encodeURIComponent(this.room)}&token=${encodeURIComponent(this.token)}`);}catch{this.startPolling();return;}
    this.source=stream;let ready=false;
    const current=()=>this.active&&this.generation===generation&&this.source===stream;
    stream.onmessage=event=>{
      if(!current())return;let value;try{value=JSON.parse(event.data);}catch{this.failSSE(stream);return;}
      if(!this.receive(value)){this.failSSE(stream);return;}
      ready=true;this.polling=false;this.clear('pollTimer');this.clear('probeTimer');this.pollController?.abort();
      this.onStatus('已连接 · 实时同步');
      // Older servers send comment-only heartbeats; keep their working SSE alive
      // until the backend has been restarted with versioned states and ping events.
      if(Number.isFinite(value.revision))this.armSSE(stream,this.idleTimeout);else this.clear('sseTimer');
    };
    stream.onerror=()=>{if(current())this.failSSE(stream);};
    stream.addEventListener('ping',()=>{if(current()&&ready)this.armSSE(stream,this.idleTimeout);});
    stream.addEventListener('room-closed',()=>{if(current())this.closed('房间已关闭，已返回首页');});
    this.armSSE(stream,this.connectTimeout);
  }
  failSSE(stream){
    if(stream!==this.source)return;this.clear('sseTimer');stream.close();this.source=null;
    this.startPolling();
  }
  scheduleProbe(){
    if(!this.active||!this.polling||this.mode==='poll'||!this.EventSourceImpl||this.probeTimer)return;
    this.probeTimer=this.setTimer(()=>{this.probeTimer=null;if(this.active&&this.polling)this.openSSE();},this.probeInterval);
  }
  startPolling(){
    if(!this.active)return;
    if(!this.polling){this.polling=true;this.onStatus('正在切换兼容连接…');this.poll();}
    this.scheduleProbe();
  }
  async poll(){
    if(!this.active||!this.polling||this.pollController)return;
    const generation=this.generation,controller=new AbortController();this.pollController=controller;
    const timeout=this.setTimer(()=>controller.abort(),this.requestTimeout);
    try{
      const response=await this.fetchImpl(`/api/state?room=${encodeURIComponent(this.room)}${this.lastRevision>=0?'&since='+this.lastRevision:''}`,{headers:{'X-Player-Token':this.token},cache:'no-store',signal:controller.signal});
      if(!this.active||generation!==this.generation||!this.polling)return;
      if(response.status===404&&response.headers&&!response.headers.get('content-type')?.includes('application/json'))throw Error('兼容接口暂不可用');
      if([401,404,410].includes(response.status)){this.closed(response.status===401?'身份已失效，请重新加入':'房间已关闭，已返回首页');return;}
      if(response.status===204){this.failures=0;this.onStatus('已连接 · 兼容模式');return;}
      if(!response.ok)throw Error('暂时无法同步');
      const value=await response.json();
      if(!this.active||generation!==this.generation||!this.polling)return;
      if(!this.receive(value))throw Error('无效同步数据');
      this.failures=0;this.onStatus('已连接 · 兼容模式');
    }catch{
      if(this.active&&generation===this.generation&&this.polling){this.failures++;this.onStatus('连接中断，正在重连…');}
    }finally{
      this.clearTimer(timeout);
      if(this.pollController===controller)this.pollController=null;
      if(this.active&&generation===this.generation&&this.polling){this.pollTimer=this.setTimer(()=>{this.pollTimer=null;this.poll();},Math.min(this.pollInterval*2**Math.min(this.failures,3),8000));this.scheduleProbe();}
    }
  }
}
// END ROOM SYNC

function connect(v){
  source?.close();
  if(!v.spectating)localStorage.removeItem('chroma-return-room');
  localStorage.setItem('chroma-role',v.spectating?'spectator':'player');invitedRoom='';
  const url=new URL(location.href);if(url.searchParams.has('room')){url.searchParams.delete('room');history.replaceState(null,'',url.pathname+url.search+url.hash);}
  setState(v);app.scrollIntoView({block:'start'});localStorage.setItem('chroma-room',v.code);
  const sync=new RoomSync({onState:value=>{if(source===sync)setState(value);},onStatus:message=>{if(source===sync)$('#connection').textContent=message;},onClosed:message=>{
    if(source!==sync)return;source=null;state=null;localStorage.removeItem('chroma-room');localStorage.removeItem('chroma-role');
    for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();$('#connection').textContent='局域网桌游';render();refreshRooms();toast(message);
  }});
  source=sync;sync.start(v.code,token,new URLSearchParams(location.search).get('sync')==='poll'?'poll':'auto');
}
async function run(endpoint,data){if(busy)return;busy=true;try{setState(await api(endpoint,data));}catch(e){toast(e.message);}finally{busy=false;}}
function player(id){return state.players.find(p=>p.id===id);}
function demo(){return `<div class="art"><div class="art-label"><span>A LITTLE COLOR. A BIG MOVE.</span><span>↗</span></div><div class="art-board">${Array.from({length:63},(_,i)=>{const x=i%9,y=Math.floor(i/9);let color=x<4&&y<4?'#d98557':x>4&&y>2?'#9bace0':x<4&&y>4?'#b8cc81':x>5&&y<2?'#b69bd0':null;return `<span class="art-cell" ${color?`style="background:${color}"`:''}>${[11,33,49].includes(i)?'◈':[20,43].includes(i)?'✳':''}</span>`;}).join('')}</div><div class="art-foot"><span>一张棋盘，无限可能</span><strong>YOUR COLOR, YOUR WORLD.</strong></div></div>`;}
function roomBrowser(){return `<section class="room-browser" id="room-browser" aria-labelledby="room-browser-title"><div class="room-browser-heading"><div><span class="eyebrow">FIND YOUR TABLE / 好友房间</span><h2 id="room-browser-title">选一桌，加入或观战。</h2><p>等待中的房间可直接加入 · 对局中可随时观战 · 每 5 秒自动更新</p></div><div class="room-browser-tools"><input id="rooms-name" aria-label="房间列表昵称" placeholder="你的昵称" maxlength="12" value="${esc(localStorage.getItem('chroma-name')||'')}"><button class="button ghost" id="refresh-rooms">刷新列表 ↻</button></div></div><div id="room-list-body" aria-live="polite">${roomRows()}</div></section>`;}
function roomRows(){
  if(roomListStatus==='loading')return '<p class="room-list-empty">正在寻找这台服务器上的房间…</p>';
  if(roomListStatus==='error')return '<p class="room-list-empty">暂时无法获取房间列表，请点击刷新重试。也可以使用下方的房间号加入。</p>';
  if(!roomList.length)return '<p class="room-list-empty">还没有房间，创建一桌邀请朋友吧。</p>';
  return `<div class="room-list-grid">${roomList.map(r=>`<article class="room-list-card"><div class="room-list-card-top"><div><span class="eyebrow">${r.test?'固定测试房间':'联机房间'}</span><h3>${esc(r.code)}</h3></div><span class="room-phase ${esc(r.phase)}">${r.phase==='lobby'?'等待开局':r.phase==='finished'?'已结算':`对局中 · ${r.round}/${r.maxRounds} 轮`}</span></div><p>房主 · ${esc(r.hostName)}</p><div class="room-list-card-bottom"><span>${r.players} / ${r.maxPlayers} 玩家 <small>· ${r.spectators} 人观战</small></span><div><button class="button primary" data-room-join="${esc(r.code)}" ${r.canJoin?'':'disabled'}>${r.canJoin?'加入房间':r.phase==='lobby'?'房间已满':'已开局'}</button><button class="button ghost" data-room-watch="${esc(r.code)}">观战</button></div></div></article>`).join('')}</div>`;
}
function bindRoomBrowser(){
  $('#refresh-rooms')?.addEventListener('click',refreshRooms);
  bindRoomRows();
}
function bindRoomRows(){
  for(const [selector,endpoint,attribute]of [['[data-room-join]','join','roomJoin'],['[data-room-watch]','watch','roomWatch']])document.querySelectorAll(selector).forEach(el=>el.onclick=()=>enter(endpoint,$('#rooms-name')?.value.trim()||localStorage.getItem('chroma-name')||'玩家',el.dataset[attribute]));
}
async function refreshRooms(){
  if(state||tutorial||roomListBusy||document.hidden)return;
  roomListBusy=true;const button=$('#refresh-rooms');if(button)button.disabled=true;
  try{const response=await fetch('/api/rooms',{cache:'no-store'});if(!response.ok)throw Error('无法获取房间');const data=await response.json();roomList=data.rooms;roomListStatus='ready';}catch{roomListStatus='error';}
  finally{roomListBusy=false;if(button)button.disabled=false;}
  if(!state&&!tutorial&&$('#room-list-body')){$('#room-list-body').innerHTML=roomRows();bindRoomRows();}
}
function spectatorLobby(){
  app.innerHTML=heading('LIVE SPECTATOR / 实时观战','先入座，看一场色彩博弈。')+`<section class="spectator-notice"><strong>正在观战 · 等待房主开局</strong><span>你不占玩家席位，也无需准备。开局后自动切换到棋盘。</span></section><div class="lobby-layout"><section class="panel"><div class="panel-title"><h2>玩家席位 ${state.players.length} / 8</h2><span class="hint">${state.spectatorCount} 人观战</span></div><div class="seat-grid">${state.players.map(p=>`<div class="seat">${playerAvatar(p)}<div><span class="seat-name">${esc(p.name)}</span><small>${p.bot?'机器人':p.id===state.host?'房主':p.ready?'已准备':'等待准备'}</small></div></div>`).join('')}</div><div class="lobby-actions"><button class="button primary" id="spectator-join" ${state.players.length>=8?'disabled':''}>${state.players.length>=8?'玩家席位已满':'加入游戏 →'}</button><button class="button ghost" data-leave-room>退出观战</button></div></section><aside class="panel"><h2>这一桌怎么玩</h2><p>${state.rounds} 轮对局 · 每 ${state.augmentEvery} 轮选择强化<br>普通地块 1 分，染井 4 分。最后一轮结束时，总积分最高者获胜。<br>观战可查看实时棋盘、手牌和强化记录。</p></aside></div>`;
  $('#spectator-join').onclick=()=>enter('join',localStorage.getItem('chroma-name'),state.code);
}
// BEGIN TUTORIAL MODEL
const TUTORIAL_STEPS=[
  {title:'染上第一块领地',mode:'paint',target:17,cost:1,text:'点击出生点右侧的高亮空地，再确认落色。普通染色只能向己方领地的上下左右扩张，每格消耗 1 墨。'},
  {title:'抢占高价值染井',mode:'paint',target:12,cost:1,text:'沿着刚染出的领地，染上带 ◈ 的高亮染井。染井每座 4 分，普通地块和出生点每格 1 分。'},
  {title:'主动结束回合',mode:'end',text:'这回合还剩 1 墨，也可以提前结束。点击「结束回合」；对手行动完后开始下一轮，墨水会重新补充，剩余墨水不会累积。'},
  {title:'抢夺对手的颜色',mode:'paint',target:18,cost:2,text:'点击右侧红色地块，抢成自己的颜色。普通抢色的基础费用是 2 墨；占领分也会随地块归属转移。带 ✳ 的出生点不能被抢夺。'},
  {title:'加固你的染井',mode:'shield',target:12,cost:1,text:'先选择「加固」，再点击自己的染井。加固消耗 1 墨，对手普通抢夺时要多付 1 墨。岩石不能染色，也不能加固。'},
  {title:'墨水用完，记得交棒',mode:'end',text:'墨水已经用完。确认提醒后点击「结束回合」，让对手行动；游戏不会自动替你结束回合，强化有时仍允许免费操作。'},
  {title:'飞染：跨过一段距离',mode:'leap',target:8,cost:2,text:'选择技能卡「飞染」，再点击高亮空地。飞染消耗 2 墨，基础距离为距任意己方领地 3 格以内，只能落在空地。'},
  {title:'破色：无视敌方加固',mode:'pierce',target:13,cost:1,text:'选择「破色」，夺取带护盾的红色地块。破色消耗 1 墨和一张手牌，可以无视加固，但仍不能攻击出生点。'},
  {title:'为下一次施法补充墨水',mode:'end',text:'两张技能牌已使用，墨水也已用完。结束回合后再学习泼墨；正式对局中，每回合开始还会抽取战术牌。'},
  {title:'泼墨：一次扩张一片',mode:'splash',target:3,cost:3,text:'选择「泼墨」，点击与你领地相邻的高亮空地。消耗 3 墨，同时染上中心及四邻空地；不会穿过岩石，也不会抢夺敌地。'},
  {title:'选择海克斯，改变打法',mode:'augment',text:'正式对局每隔若干完整轮次，会全员刷新同一品阶的三张强化，选一张持续整局。本次体验黄金阶，选完后看看你的最终积分。'}
];
function createTutorial(){
  const board=Array.from({length:25},()=>({owner:null,terrain:'plain',shield:false,home:false}));
  for(const n of [2,6,21])board[n].terrain='rock';board[12].terrain='well';
  board[16]={owner:'you',terrain:'plain',shield:true,home:true};
  board[24]={owner:'opponent',terrain:'plain',shield:true,home:true};
  board[18].owner='opponent';board[13].owner='opponent';board[13].shield=true;
  return {board,step:0,ink:3,round:1,mode:'paint',selected:null,hand:{leap:1,pierce:1,splash:1},augment:null,inkPrompted:-1,feedback:'从带 ✳ 的橙色出生点出发，跟着高亮学习。',cards:{basics:{name:'回归基本功',tier:'gold',desc:'不能使用泼墨、破色、飞染。普通染色 1 墨可连续染最多 2 格，第二格可手动选择；抢夺敌地仍可用，出生点除外。'},well_master:{name:'染井大亨',tier:'gold',desc:'你占领的每座染井由 4 分提高至 6 分。'},scholar:{name:'灵感迸发',tier:'gold',desc:'每回合额外抽取 1 张战术牌，手牌上限由 4 提高至 6。'}}};
}
function tutorialScore(t,id){return t.board.reduce((sum,c)=>sum+(c.owner===id?(c.terrain==='well'?(id==='you'&&t.augment==='well_master'?6:4):1):0),0);}
function tutorialMove(t,action,index){
  const lesson=TUTORIAL_STEPS[t.step];if(!lesson)throw Error('教程已完成');
  if(lesson.mode==='augment'){
    if(action!=='augment'||!Object.hasOwn(t.cards,index))throw Error('请选择一张黄金强化');
    t.augment=index;t.feedback='已选择「'+t.cards[index].name+'」。强化持续整局，注意它带来的收益和限制。';
  }else if(lesson.mode==='end'){
    if(action!=='end')throw Error('请点击「结束回合」继续');
    t.round++;t.ink=3;t.feedback='演练对手已结束回合，现在又轮到你。墨水补充至 3 点。';
  }else{
    if(action!==lesson.mode||index!==lesson.target)throw Error('请按引导选择技能和高亮地块');
    if(t.ink<lesson.cost)throw Error('墨水不足');
    if(['leap','pierce','splash'].includes(action)&&!t.hand[action])throw Error('缺少技能手牌');
    t.ink-=lesson.cost;
    if(action==='shield')t.board[index].shield=true;
    else{
      const targets=[index];if(action==='splash'){const x=index%5,y=Math.floor(index/5);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy;if(a>=0&&a<5&&b>=0&&b<5){const n=b*5+a;if(t.board[n].owner===null&&t.board[n].terrain!=='rock')targets.push(n);}}}
      for(const n of targets){t.board[n].owner='you';t.board[n].shield=false;}
    }
    if(Object.hasOwn(t.hand,action))t.hand[action]--;
    t.feedback=action==='shield'?'染井已加固。你保住了高价值地块，也用完了本回合墨水。':action==='pierce'?'成功无视加固抢色！这张破色手牌已消耗。':action==='splash'?'泼墨成功，中心和四邻空地一起染上了你的颜色。':action==='leap'?'飞染成功！这张飞染手牌已消耗。':'落色成功！你的当前领地分是 '+tutorialScore(t,'you')+' 分。';
  }
  t.step++;t.mode='paint';t.selected=null;return t;
}
// END TUTORIAL MODEL
function tutorialEntry(){return `<section class="panel tutorial-entry"><div><span class="eyebrow">LEARN BY PLAYING / 单人教学</span><h2>第一次染色？先练一局。</h2><p>约 3–5 分钟 · 高亮引导 · 染色、技能和海克斯实操 · 不占用联机房间</p></div><div>${localStorage.getItem('chroma-tutorial-complete')==='1'?'<span class="tutorial-completed-tag">✓ 已通关</span>':''}<button class="button primary" id="tutorial-start">新手教程 →</button></div></section>`;}
function startTutorial(){if(state||busy)return;for(const d of document.querySelectorAll('dialog[open]'))d.close();tutorial=createTutorial();$('#connection').textContent='单人新手教程';render();app.scrollIntoView({block:'start'});}
function exitTutorial(completed=false){if(completed)localStorage.setItem('chroma-tutorial-complete','1');tutorial=null;for(const d of document.querySelectorAll('dialog[open]'))d.close();$('#connection').textContent='局域网桌游';render();app.scrollIntoView({block:'start'});}
function advanceTutorial(action,index){try{tutorialMove(tutorial,action,index);renderTutorial();}catch(e){toast(e.message);}}
function renderTutorial(){
  const t=tutorial,lesson=TUTORIAL_STEPS[t.step],done=!lesson,score=tutorialScore(t,'you'),other=tutorialScore(t,'opponent');
  const expected=lesson?.mode,labels={paint:'染色 / 抢色',shield:'加固',leap:'飞染',pierce:'破色',splash:'泼墨'};
  const skillText={leap:'2 墨 · 3 格以内空地',pierce:'1 墨 · 无视加固',splash:'3 墨 · 中心及四邻空地'};
  const controls=done?'':expected==='end'?'<button class="button primary" id="tutorial-end">结束回合 →</button>':expected==='augment'?'<button class="button primary" id="tutorial-open-augment">选择黄金强化 →</button>':`<div class="tutorial-modes">${['paint','shield'].map(k=>`<button class="mode ${t.mode===k?'active':''} ${expected===k?'tutorial-mode-target':''}" data-tutorial-mode="${k}" ${expected!==k?'disabled':''}>${labels[k]}</button>`).join('')}</div><div class="tutorial-skills">${['leap','pierce','splash'].map(k=>`<button class="card ${t.mode===k?'selected-card':''} ${expected===k?'tutorial-mode-target':''}" data-tutorial-mode="${k}" ${expected!==k?'disabled':''}><b>${labels[k]} × ${t.hand[k]}</b><small>${skillText[k]}</small></button>`).join('')}</div><p class="tutorial-selection">${t.selected===lesson.target&&t.mode===expected?'已选中目标 · 本次消耗 '+lesson.cost+' 墨':t.mode!==expected?'先选择高亮的操作或技能，再点击棋盘目标。':'点击棋盘亮框目标，再确认操作。'}</p><button class="button primary" id="tutorial-confirm" ${t.selected!==lesson.target||t.mode!==expected?'disabled':''}>确认${expected==='shield'?'加固':expected==='paint'?'落色':labels[expected]} · ${lesson.cost} 墨</button>`;
  app.innerHTML=`<section class="tutorial-heading"><div><span class="eyebrow">YOUR FIRST COLOR / 新手教程</span><h1>${done?'这局，你已经会玩了。':'把第一抹颜色，变成胜利。'}</h1><p>固定教学场景 · 单人练习 · 不占用联机房间</p></div><div><button class="icon-button" id="tutorial-restart">重新开始</button><button class="button ghost" id="tutorial-home">返回同桌</button></div></section><div class="tutorial-progress" aria-label="教程进度"><span>第 ${Math.min(t.step+1,TUTORIAL_STEPS.length)} / ${TUTORIAL_STEPS.length} 步${done?' · 已完成':''}</span><progress max="${TUTORIAL_STEPS.length}" value="${t.step}"></progress></div><div class="tutorial-layout"><section class="board-shell tutorial-board-shell"><div class="board-top"><strong>YOUR PRACTICE FIELD</strong><span>第 ${t.round} 轮 · ${done?'教学结算':'你的回合'}</span></div><div class="board tutorial-board" style="--size:5" role="group" aria-label="教程棋盘">${t.board.map((c,i)=>`<button class="tile ${c.terrain} ${c.owner?'owned':''} ${c.shield?'shield':''} ${i===lesson?.target?'tutorial-target':''} ${i===t.selected?'selected':''}" style="${c.owner?'--color:'+(c.owner==='you'?'#e87748':'#bc6577'):''}" data-tutorial-cell="${i}" aria-label="第 ${Math.floor(i/5)+1} 行 ${i%5+1} 列，${c.home?'出生点':c.terrain==='rock'?'岩石':c.terrain==='well'?'染井':'地块'}，${c.owner==='you'?'己方':c.owner?'对手':'空地'}${c.shield?'，已加固':''}${i===lesson?.target?'，教学目标':''}">${c.home?'✳':c.terrain==='rock'?'▧':c.terrain==='well'?'◈':i===lesson?.target?'＋':''}</button>`).join('')}</div><div class="board-foot"><div class="legend"><span class="tutorial-you">● 你的颜色</span><span class="tutorial-opponent">● 演练对手</span><span>◈ 染井</span><span>▣ 加固</span></div><span>亮框为当前教学目标</span></div></section><aside class="tutorial-guide panel" aria-live="polite"><div class="tutorial-stats"><div><b>${t.ink}</b><span>剩余墨水</span></div><div><b>${score}</b><span>你的积分</span></div><div><b>${other}</b><span>对手积分</span></div></div>${done?`<span class="eyebrow">TUTORIAL COMPLETE / 教学通关</span><h2>✳ ${score} : ${other}，你赢了！</h2><p>正式对局要等设定的最后一轮结束才结算。总积分最高者获胜，同分并列。</p><ul class="tutorial-recap"><li>普通地块与出生点每格 1 分，染井每座 4 分。</li><li>领地分随归属转移，强化可能改变分值或增加永久积分。</li><li>留意手牌、墨水和强化限制，用完墨水记得结束回合。</li><li>全员完成回合算一轮；全员选完海克斯后才继续。</li></ul><p class="tutorial-picked">本次强化：${esc(t.cards[t.augment].name)}${t.augment==='well_master'?' · 染井现为 6 分':''}</p><button class="button primary" id="tutorial-finish">完成教程，返回同桌 →</button>`:`<span class="eyebrow">LESSON ${String(t.step+1).padStart(2,'0')}</span><h2>${lesson.title}</h2><p>${lesson.text}</p>${controls}`}</aside></div><div class="tutorial-feedback" role="status">✓ ${esc(t.feedback)}</div>`;
  $('#tutorial-home').onclick=()=>exitTutorial();$('#tutorial-restart').onclick=()=>{tutorial=createTutorial();renderTutorial();};$('#tutorial-finish')?.addEventListener('click',()=>exitTutorial(true));
  document.querySelectorAll('[data-tutorial-mode]').forEach(el=>el.onclick=()=>{t.mode=el.dataset.tutorialMode;t.selected=null;renderTutorial();});
  document.querySelectorAll('[data-tutorial-cell]').forEach(el=>el.onclick=()=>{if(done)return;const n=Number(el.dataset.tutorialCell);if(n!==lesson.target){toast(expected==='end'?'点击「结束回合」继续教学':expected==='augment'?'请先选择一张强化':'请点击亮框标记的教学目标');return;}if(t.mode!==expected){toast('先选择「'+labels[expected]+'」，再点击目标');return;}t.selected=n;renderTutorial();});
  $('#tutorial-confirm')?.addEventListener('click',()=>advanceTutorial(expected,t.selected));$('#tutorial-end')?.addEventListener('click',()=>advanceTutorial('end'));$('#tutorial-open-augment')?.addEventListener('click',openTutorialAugments);
  if(expected==='augment')openTutorialAugments();if(expected==='end'&&t.ink===0&&t.inkPrompted!==t.step){t.inkPrompted=t.step;$('#ink-empty').showModal();}
}
function openTutorialAugments(){
  const d=$('#tutorial-augment');d.innerHTML=`<section class="draft-panel gold"><div class="draft-heading"><div><span class="eyebrow">TUTORIAL / 黄金海克斯体验</span><h2>三选一，决定你的打法。</h2><p>正式对局中全员同阶，每次可重抽一次；本次教学请直接选择一张。</p></div><button class="icon-button" id="tutorial-peek">查看棋盘 ×</button></div><div class="augment-options">${Object.keys(tutorial.cards).map(k=>hexCard(k,{interactive:true,prefix:'tutorial'})).join('')}</div></section>`;d.querySelector('#tutorial-peek').onclick=()=>d.close();d.querySelectorAll('[data-augment]').forEach(el=>el.onclick=()=>{d.close();advanceTutorial('augment',el.dataset.augment);});if(!d.open)d.showModal();
}

function returnRoomPanel(){const code=localStorage.getItem('chroma-return-room');return /^[0-9]{6}$/.test(code||'')?`<section class="panel return-room-panel"><div><h2>误退出了？接着玩。</h2><p>房间 ${code} · 返回原来的颜色、领地、手牌与强化，接回机器人托管的席位。</p></div><button class="button primary" id="return-room">返回刚才的对局 →</button></section>`:'';}
function syncInkReminder(){
  const dialog=$('#ink-empty'),g=state?.game;
  if(!g||g.finished||g.draft||g.active!==state.you||g.ink>0){if(dialog.open)dialog.close();inkReminderKey=null;return;}
  const key=state.code+':'+g.round+':'+g.active;
  if(inkReminderKey!==key){inkReminderKey=key;dialog.showModal();}
}
function victoryIntro(){return `<section class="win-intro" aria-labelledby="win-intro-title"><div class="win-intro-heading"><div><span class="eyebrow">HOW TO WIN / 胜负规则</span><h2 id="win-intro-title">最后一轮结束，总积分最高者获胜。</h2></div><span class="win-tie">同分可并列获胜</span></div><div class="win-facts"><div><strong>1 <small>分 / 格</small></strong><span>普通地块，含出生点</span></div><div><strong>4 <small>分 / 座</small></strong><span>染井价值更高，值得争夺</span></div><div><strong>6 / 10 / 15 <small>轮</small></strong><span>房主选择局长，全员行动完算一轮</span></div></div><p class="win-score-note"><b>总积分 = 当前领地分 + 强化获得的永久积分。</b>地块被抢后，占领分随归属转移；永久积分保留。部分强化会改变地块分值，最终以局内总积分为准。</p></section>`;}
function entry(){app.innerHTML=`<section class="hero"><div><span class="eyebrow">A COLORFUL BATTLE OF WITS</span><h1>把世界，<br>染成<span style="color:#789450">你的颜色</span>。</h1><p>从一小块领地出发，用墨水扩张，用策略破局。<br>和朋友围坐一局，让每一抹颜色都成为你的下一步。</p><div class="hero-actions"><a class="button primary" href="#host-panel">开一桌，开始染色 ↗</a><a class="hero-secondary" href="#room-browser">寻找房间 <span>↓</span></a></div><div class="pills"><span class="pill">◉ 2–8 人同局</span><span class="pill">⌁ 好友联机</span><span class="pill">◷ 约 15–40 分钟</span></div></div>${demo()}</section>${returnRoomPanel()}<section class="entry-layout" id="host-panel"><div class="panel"><div class="panel-title"><h2>开一桌，等朋友。</h2><span class="eyebrow">01 / HOST</span></div><p>成为房主，邀请朋友打开分享链接加入。</p><form class="entry-form" id="create-form"><input id="create-name" aria-label="你的昵称" placeholder="你的昵称" maxlength="12" value="${esc(localStorage.getItem('chroma-name')||'')}"><button class="button primary" type="submit">创建房间 ↗</button></form></div><div class="panel"><div class="panel-title"><h2>朋友在等你。</h2><span class="eyebrow">02 / JOIN</span></div><p>${invitedRoom?`已收到房间 <strong>${invitedRoom}</strong> 的邀请，输入昵称即可加入。`:'输入朋友分享的 6 位房间号，加入这场色彩博弈。'}</p><form class="entry-form" id="join-form"><input id="join-name" aria-label="加入昵称" placeholder="你的昵称" maxlength="12" value="${esc(localStorage.getItem('chroma-name')||'')}"><input id="join-code" aria-label="6 位房间号" placeholder="6 位房间号" value="${invitedRoom}" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required><button class="button" type="submit">加入 →</button></form></div></section>${roomBrowser()}${tutorialEntry()}${victoryIntro()}<section class="panel test-entry"><div><span class="eyebrow">SOLO PLAYTEST / 000001</span><h2>先和机器人试一局。</h2><p>固定测试房间 · 自带 1 名已准备的机器人 · 一个人也能开局</p></div><button class="button primary" id="test-room">进入测试房间 →</button></section><div class="network"><span>让朋友打开：</span>${network.map(a=>`<a href="${esc(a)}">${esc(a)} ↗</a>`).join('')||'<span>正在获取服务器地址…</span>'}<span>然后输入你的房间号</span></div><div class="footer-note"><span>CHROMA / 染域 · 好友联机版</span><span>一点运气，几分策略，满桌颜色。</span></div>`;
  $('#return-room')?.addEventListener('click',()=>enter('join',localStorage.getItem('chroma-name'),localStorage.getItem('chroma-return-room')));
  bindRoomBrowser();
  $('#tutorial-start').onclick=startTutorial;
  $('#test-room').onclick=()=>enter('test',$('#create-name').value||'测试玩家');
  $('#create-form').onsubmit=async e=>{e.preventDefault();await enter('create',$('#create-name').value);};
  $('#join-form').onsubmit=async e=>{e.preventDefault();await enter('join',$('#join-name').value,$('#join-code').value);};
}
async function enter(endpoint,name,room){if(busy)return;busy=true;try{localStorage.setItem('chroma-name',name);connect(await api(endpoint,{name,room}));}catch(e){toast(e.message);}finally{busy=false;}}
function heading(label,title){return `<div class="page-heading"><div><span class="eyebrow">${label}</span><h1>${title}</h1></div><div class="room-tag">${state.test?'测试房间 · ':''}房间号 <strong>${state.code}</strong><button class="icon-button" id="copy-room">复制分享链接 ↗</button>${state.spectating?'<span class="spectator-badge">观战中 · '+state.spectatorCount+' 人</span>':''}${state.game?'<button class="icon-button leave-room-button" data-leave-room>'+(state.spectating?'退出观战':'退出房间')+'</button>':''}</div></div>`;}
// BEGIN GM ACCESS
const gmState={dialog:null,loading:null,room:null,you:null,last:'',busy:false};
function canUseGm(){
  const me=state?.players?.find(p=>p.id===state.you);
  return !!me&&!state.spectating&&!me.bot&&state.permissions?.gm===true&&(me.name==='ww'||me.name==='ww.');
}
function removeGmConsole(){
  gmState.loading?.abort();gmState.loading=null;
  if(gmState.dialog?.open)gmState.dialog.close();gmState.dialog?.remove();
  gmState.dialog=null;gmState.room=null;gmState.you=null;gmState.last='';
}
async function toggleGmConsole(){
  if(!canUseGm()){removeGmConsole();return;}
  if(gmState.dialog?.open){gmState.dialog.close();return;}
  if(gmState.loading)return;
  if(gmState.dialog&&gmState.room===state.code&&gmState.you===state.you){syncGmConsole();gmState.dialog.showModal();return;}
  const room=state.code,you=state.you,controller=new AbortController();let timedOut=false;gmState.loading=controller;gmState.room=room;gmState.you=you;const timer=setTimeout(()=>{timedOut=true;controller.abort();},8000);
  try{
    const response=await fetch('/api/gm/console?room='+encodeURIComponent(room),{headers:{'X-Player-Token':token},cache:'no-store',signal:controller.signal});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'GM 权限已失效');
    if(controller.signal.aborted||!canUseGm()||state.code!==room||state.you!==you)return;
    const dialog=document.createElement('dialog');dialog.id='gm-console';dialog.className='gm-console';dialog.setAttribute('aria-label','GM 控制台');dialog.innerHTML=data.html;
    gmState.dialog=dialog;gmState.room=room;gmState.you=you;document.body.append(dialog);
    dialog.querySelector('.gm-close').onclick=()=>dialog.close();
    dialog.querySelectorAll('[data-gm-form]').forEach(form=>form.onsubmit=e=>{e.preventDefault();submitGm(form);});
    dialog.querySelectorAll('[data-gm-target]').forEach(select=>select.onchange=syncGmConsole);
    syncGmConsole();dialog.showModal();
  }catch(error){if(canUseGm()&&state.code===room&&(timedOut||error.name!=='AbortError'))toast(timedOut?'GM 控制台加载超时，请检查连接后重试':error.message);}
  finally{clearTimeout(timer);if(gmState.loading===controller)gmState.loading=null;}
}
function syncGmConsole(){
  if(!canUseGm()||(gmState.dialog||gmState.loading)&&(gmState.room!==state.code||gmState.you!==state.you)){removeGmConsole();return;}
  const dialog=gmState.dialog;if(!dialog)return;
  const me=state.players.find(p=>p.id===state.you),targets=state.gm?.targets||[],playing=state.phase==='playing'&&!state.game?.finished;
  dialog.querySelector('[data-gm-session]').textContent=`操作者 ${me.name} · 房间 ${state.code} · ${state.phase==='lobby'?'等待开局':state.phase==='finished'?'已结算':'对局中'}`;
  if(gmState.last)dialog.querySelector('[data-gm-status]').textContent=gmState.last;
  dialog.querySelectorAll('[data-gm-target]').forEach(select=>{
    const mode=select.dataset.gmTarget,choices=mode==='points'?targets.filter(p=>p.points!==null):targets;
    const signature=JSON.stringify(choices.map(p=>[p.id,p.name]));
    if(select.dataset.signature!==signature){
      const value=select.value;select.innerHTML=choices.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.id===state.you?' · 你':''}</option>`).join('');
      select.value=choices.some(p=>p.id===value)?value:choices.find(p=>p.id===state.you)?.id||choices[0]?.id||'';select.dataset.signature=signature;
    }
    const target=choices.find(p=>p.id===select.value),note=dialog.querySelector(`[data-gm-note="${mode}"]`);
    note.textContent=!target?'暂无可用目标':mode==='points'?`当前余额：${target.points} 桌游币`:mode==='card'?`当前手牌 ${target.hand} / ${target.limit} 张${playing?'':' · 开局后可发牌'}`:`已持有 ${state.game?.augments[target.id]?.length||0} 张强化${state.game?.draft?' · 请先完成选牌':playing?'':' · 开局后可发牌'}`;
    const button=select.closest('form').querySelector('button[type="submit"]');button.disabled=gmState.busy||!target||(mode!=='points'&&!playing)||(mode==='augment'&&!!state.game?.draft);
  });
  dialog.querySelector('[data-gm-audit]').innerHTML=(state.gm?.audit||[]).slice(0,10).map(a=>`<div><time>${new Date(a.at).toLocaleTimeString('zh-CN',{hour12:false})}</time><span>${esc(a.actor)} · ${esc(a.message)}</span></div>`).join('')||'<p>暂无操作记录</p>';
}
async function submitGm(form){
  if(!canUseGm()||busy||gmState.busy||!gmState.dialog?.contains(form))return;
  const values=new FormData(form),mode=form.dataset.gmForm,room=state.code,you=state.you;
  const requestId=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
  const payload={mode,target:values.get('target'),requestId};
  if(mode==='points')payload.amount=Number(values.get('amount'));
  else{payload.key=values.get('key');if(mode==='card')payload.count=Number(values.get('count'));}
  busy=true;gmState.busy=true;syncGmConsole();
  try{
    const result=await api('gm',payload);
    if(canUseGm()&&state.code===room&&state.you===you){gmState.last=result.gmResult?.message||'操作完成';setState(result);}
  }catch(error){if(canUseGm()&&state.code===room&&state.you===you)gmState.last=error.message;}
  finally{busy=false;gmState.busy=false;syncGmConsole();}
}
function handleGmShortcut(event){
  if(!event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||(event.code!=='F1'&&event.key!=='F1'))return;
  const me=state?.players?.find(p=>p.id===state.you);
  if(!me||state.spectating||me.bot||(me.name!=='ww'&&me.name!=='ww.'))return;
  if(!canUseGm()){event.preventDefault();event.stopPropagation();if(!event.repeat)toast('GM 权限尚未同步，请刷新页面，并以 ww 或 ww. 作为玩家重新进入房间');return;}
  event.preventDefault();event.stopPropagation();if(!event.repeat)void toggleGmConsole();
}
// END GM ACCESS
document.addEventListener('keydown',handleGmShortcut,true);
let anchorPreview=null,anchorBoardMemory=null;
const anchorPaintImpacts=new Map();
const ANCHOR_GLYPHS={
  dew:'<path d="M32 8C28 21 17 28 17 39a15 15 0 0 0 30 0C47 28 36 20 32 8Z"/><path d="M23 38c0 7 3 10 9 11"/>',
  ripple:'<circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="10"/><path d="m32 25 7 7-7 7-7-7Z"/>',
  bloom:Array.from({length:6},(_,i)=>`<ellipse cx="32" cy="22" rx="6" ry="11" transform="rotate(${i*60} 32 32)"/>`).join('')+'<circle cx="32" cy="32" r="5"/>',
  frost:Array.from({length:6},(_,i)=>`<path d="M32 32V10m0 9-6-5m6 5 6-5" transform="rotate(${i*60} 32 32)"/>`).join('')+'<circle cx="32" cy="32" r="4"/>',
  stellar:'<path d="m32 11 5 15 16 6-16 5-5 16-5-16-16-5 16-6Z"/><circle cx="32" cy="32" r="4"/>',
  inferno:'<path d="M35 7c4 16 17 21 15 34a18 18 0 0 1-36-1c-1-8 4-16 12-22-1 9 2 12 5 14 5-8 7-14 4-25Z"/><path d="M33 33c-2 8-9 9-8 16a7 7 0 0 0 14-1c0-6-6-8-6-15Z"/>',
  crown:'<path d="m11 21 10 8 11-16 11 16 10-8-6 25H17Z"/><path d="M18 51h28M21 38h22m-11-9 4 5-4 5-4-5Z"/><circle cx="11" cy="18" r="2"/><circle cx="53" cy="18" r="2"/>',
  cosmos:'<path d="m32 16 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z"/><circle cx="32" cy="32" r="21"/><path d="M14 49h36M20 55h24"/>'
};
function anchorVisual(key,color,mini=false){
  const item=state?.anchors?.find(a=>a.id===key),glyph=ANCHOR_GLYPHS[key];if(!item||!glyph)return '';
  const ornaments=mini?'':`<g class="anchor-orbit"><ellipse cx="32" cy="32" rx="28" ry="18" transform="rotate(-30 32 32)"/><circle cx="57" cy="24" r="2"/><circle cx="7" cy="40" r="1.5"/></g>${item.tier==='mythic'?'<g class="anchor-orbit anchor-orbit-reverse"><ellipse cx="32" cy="32" rx="27" ry="13" transform="rotate(45 32 32)"/><circle cx="12" cy="17" r="2"/></g>':''}<g class="anchor-particles"><path d="M9 9v6M6 12h6M54 46v8M50 50h8"/><circle cx="48" cy="8" r="1.5"/><circle cx="13" cy="53" r="1"/></g>`;
  const high=!mini&&['epic','mythic'].includes(item.tier),mythic=item.tier==='mythic';
  const energy=high?`<g class="anchor-energy"><circle cx="32" cy="32" r="28"/><circle class="anchor-running-light" cx="32" cy="32" r="30" stroke-dasharray="15 32 3 12"/><g class="anchor-flare">${Array.from({length:mythic?12:8},(_,i)=>`<path d="M32 1v${i%3===0?7:4}" transform="rotate(${i*(mythic?30:45)} 32 32)"/>`).join('')}</g></g><g class="anchor-stardust">${Array.from({length:mythic?14:8},(_,i)=>{const angle=i*2.39996,radius=23+(i%3)*5,x=(32+Math.cos(angle)*radius).toFixed(2),y=(32+Math.sin(angle)*radius).toFixed(2);return `<g class="anchor-spark" style="--spark-delay:${-(i%7)*.41}s;--spark-duration:${2.2+(i%3)*.4}s"><path d="M${x} ${(Number(y)-2.7).toFixed(2)}v5.4m-2.7-2.7h5.4"/><circle cx="${x}" cy="${y}" r=".8"/></g>`;}).join('')}</g><g class="anchor-specular"><path d="M25 17v10m-5-5h10"/><path d="M43 38v8m-4-4h8"/></g>`:'';
  return `<span class="anchor-mark anchor-${key} anchor-tier-${item.tier} ${mini?'anchor-mini':''}" style="--anchor-color:${esc(color||'#b6d787')}" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${energy}${ornaments}<g class="anchor-core">${glyph}</g></svg></span>`;
}
function anchorImpact(i){
  const impact=anchorPaintImpacts.get(i);if(!impact||impact.until<Date.now())return '';
  return `<span class="anchor-impact-sparks" aria-hidden="true">${Array.from({length:impact.tier==='mythic'?10:6},(_,n)=>`<i style="--ray:${n*(impact.tier==='mythic'?36:60)}deg;--trail:${n%2?1:.65}"></i>`).join('')}</span>`;
}
function rememberAnchorBoard(g){
  const key=state.code+':'+(g.matchId||'legacy');
  if(anchorBoardMemory?.key===key){
    g.board.forEach((cell,i)=>{
      if(!cell.owner||anchorBoardMemory.owners[i]===cell.owner)return;
      const p=player(cell.owner),item=state.anchors?.find(a=>a.id===p?.anchor);
      if(item&&['epic','mythic'].includes(item.tier))anchorPaintImpacts.set(i,{until:Date.now()+1200,tier:item.tier});
    });
  }else anchorPaintImpacts.clear();
  for(const [i,effect] of anchorPaintImpacts)if(effect.until<Date.now())anchorPaintImpacts.delete(i);
  anchorBoardMemory={key,owners:g.board.map(c=>c.owner)};
}
function playerAvatar(p){
  const rgb=p.color.slice(1).match(/../g).map(v=>parseInt(v,16)),light=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000>170;
  return `<span class="avatar ${p.anchor?'has-anchor':''}" style="--color:${p.color};color:${light?'#304637':'#fff'}">${esc(p.name.slice(0,1))}${p.anchor?anchorVisual(p.anchor,p.color):''}</span>`;
}
function anchorEntry(){
  const me=player(state.you),profile=state.profile;if(!me||!profile||!state.anchors)return '';
  const item=state.anchors.find(a=>a.id===me.anchor);
  return `<section class="anchor-entry"><div class="anchor-entry-art">${item?anchorVisual(item.id,me.color):'<span class="anchor-none">◇</span>'}</div><div><span class="eyebrow">PERSONAL ANCHOR / 个人锚点</span><h3>${item?esc(item.name):'留一枚，属于你的印记。'}</h3><p>${item?'已佩戴 · '+esc(item.tierName):'当前未佩戴 · 外观不影响对局强度'}</p></div><div class="anchor-entry-actions"><span class="anchor-balance">✦ <b>${profile.coins}</b> 桌游币</span><button class="button ghost" id="anchor-shop-button">${item?'更换锚点':'前往锚点藏馆'} ↗</button></div></section>`;
}
function renderAnchorShop(){
  const dialog=$('#anchor-shop'),profile=state?.profile,items=state?.anchors||[],me=player(state?.you);if(!profile||!me)return;
  if(!items.some(a=>a.id===anchorPreview))anchorPreview=me.anchor||items[0]?.id;
  const item=items.find(a=>a.id===anchorPreview);if(!item)return;
  const owned=profile.unlocked.includes(item.id),equipped=me.anchor===item.id,canBuy=profile.coins>=item.cost;
  dialog.innerHTML=`<div class="dialog-head"><span class="eyebrow">THE ANCHOR ATELIER / 锚点藏馆</span><button class="icon-button" id="close-anchor-shop">关闭 ×</button></div><div class="anchor-shop-heading"><div><h2>给你的颜色，<br>一枚独有的印记。</h2><p>用同桌通用桌游币解锁，随时预览每一款外观。</p></div><span class="anchor-wallet">✦ <b>${profile.coins}</b><small>可用桌游币</small></span></div><div class="anchor-shop-layout"><section class="anchor-showcase anchor-showcase-${item.tier}"><div class="anchor-preview-stage"><span class="anchor-preview-grid"></span><span class="anchor-preview-tile" style="--color:${me.color}">${anchorVisual(item.id,me.color)}</span></div><span class="anchor-rarity ${item.tier}">${esc(item.tierName)}</span><h3>${esc(item.name)}</h3><p>${esc(item.desc)}</p><div class="anchor-showcase-note">出生点展示动态外观 · 普通领地展示简化印记</div><button class="button primary" id="anchor-purchase" ${equipped||(!owned&&!canBuy)?'disabled':''}>${equipped?'✓ 已佩戴':owned?'佩戴此锚点':canBuy?'解锁并佩戴 · '+item.cost+' 桌游币':'还需 '+(item.cost-profile.coins)+' 桌游币'}</button><button class="icon-button" id="anchor-unequip" ${!me.anchor?'disabled':''}>卸下锚点 · 不佩戴</button></section><section class="anchor-collection" aria-label="锚点收藏">${items.map(a=>`<button class="anchor-collection-card ${a.tier} ${a.id===item.id?'is-previewed':''}" data-anchor-preview="${a.id}" aria-pressed="${a.id===item.id}" aria-label="预览${esc(a.name)}，${esc(a.tierName)}，${a.cost}桌游币"><span class="anchor-collection-art">${anchorVisual(a.id,me.color)}</span><span class="anchor-collection-name">${esc(a.name)}</span><span class="anchor-collection-meta">${esc(a.tierName)} · ${me.anchor===a.id?'✓ 已佩戴':profile.unlocked.includes(a.id)?'已解锁':a.cost+' ✦'}</span></button>`).join('')}</section></div><div class="anchor-earn-note"><b>怎么获得桌游币？</b><span>完整对局依同桌既有排名规则给真人玩家发桌游币；机器人、教学局和提前结束的房间不发币。</span><small>与同桌所有游戏共用钱包，解锁图案直接扣除桌游币；收藏跟随同桌身份保存。解锁只改变外观。</small></div>`;
  $('#close-anchor-shop').onclick=()=>dialog.close();
  dialog.querySelectorAll('[data-anchor-preview]').forEach(el=>el.onclick=()=>{anchorPreview=el.dataset.anchorPreview;renderAnchorShop();});
  $('#anchor-purchase').onclick=()=>anchorCommand(owned?'equip':'unlock',item.id);
  $('#anchor-unequip').onclick=()=>anchorCommand('equip',null);
}
async function anchorCommand(mode,key){
  if(busy)return;busy=true;
  try{setState(await api('anchor',{mode,key}));toast(mode==='unlock'?'锚点已解锁并佩戴':key?'已更换锚点':'已卸下锚点');}
  catch(error){toast(error.message);}finally{busy=false;}
}
function rewardSummary(){
  const g=state.game;if(!state.you||!g?.finished||!state.profile)return '';
  const reward=g.rewards?.[state.you];
  return `<section class="reward-summary"><div><span>✦ 本局桌游币</span><strong>${reward===undefined?'结算中…':'+'+reward}</strong></div><p>${g.rewardStatus==='pending'?'积分存档暂不可用，正在等待重试。':`最终得分 ${g.scores[state.you]} + 完赛 ${state.rewardRules.completion}${g.winner.includes(state.you)?' + 获胜 '+state.rewardRules.win:''} · 当前余额 ${state.profile.coins}`}</p><span>返回大厅后，可在「锚点藏馆」解锁外观。</span></section>`;
}
function colorPalette(){
  const me=player(state.you),palette=state.palette;
  if(!me||!palette?.length)return '';
  const selectedColor=palette.find(c=>c.color===me.color);
  return `<section class="color-palette" aria-labelledby="color-palette-title"><div class="palette-heading"><div><span class="eyebrow">CHOOSE YOUR COLOR / ${palette.length} 色可选</span><h3 id="color-palette-title">这一局，用你的颜色。</h3></div><button class="palette-default ${!me.colorChoice?'active':''}" id="default-color" aria-pressed="${!me.colorChoice}">✓ ${me.colorChoice?'恢复默认分配':'默认分配中'}</button></div><p class="palette-sort-note">R 值从低到高 · 相同 R 值按完整色号排序</p><div class="palette-grid" role="group" aria-label="选择玩家颜色">${palette.map(c=>{
    const owner=state.players.find(p=>p.id!==me.id&&p.color===c.color),selected=me.color===c.color;
    const rgb=c.color.slice(1).match(/../g).map(v=>parseInt(v,16)),light=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000>170;
    return `<button class="palette-swatch ${selected?'is-selected':''} ${owner?'is-taken':''}" style="--swatch:${c.color};--swatch-text:${light?'#304637':'#ffffff'};--swatch-text-shadow:${light?'none':'0 1px 4px #0008'}" data-player-color="${c.color}" aria-label="${esc(c.name)}，${c.color}${owner?'，'+esc(owner.name)+'正在使用':''}" aria-pressed="${selected}" title="${esc(c.name)} · ${owner?esc(owner.name)+'正在使用':c.color}" ${owner?'disabled':''}><span class="swatch-mark">${selected?'✓':owner?'×':''}</span><span class="swatch-name">${esc(c.name)}</span><span class="swatch-hex">${c.color.toUpperCase()}</span></button>`;
  }).join('')}</div><p class="palette-hint"><span style="--swatch:${me.color}" class="palette-current"></span>当前：${esc(selectedColor?.name||'默认色')} · ${me.colorChoice?'已自选':'系统默认'}<span>颜色不可重复，开局后锁定。</span></p></section>`;
}
function lobby(){if(state.spectating){spectatorLobby();return;}const host=state.host===state.you;app.innerHTML=heading('THE TABLE IS SET','好颜色，等你入座。')+`<div class="lobby-layout"><section class="panel"><div class="panel-title"><h2>玩家席位 <span style="color:#919a85;font-size:13px">${state.players.length} / 8</span></h2><span class="eyebrow">LOBBY</span></div><div class="seat-grid">${Array.from({length:8},(_,i)=>{const p=state.players[i];return p?`<div class="seat">${playerAvatar(p)}<div><span class="seat-name">${esc(p.name)} ${p.id===state.you?'· 你':''}</span><small>${p.bot?'机器人 / BOT':p.id===state.host?'房主 / HOST':'玩家 / PLAYER'}${!p.online?' · 离线':''}</small></div><span class="seat-status">${p.bot?'自动行动':p.id===state.host?'✳':p.ready?'已准备':'等待准备'}</span></div>`:`<div class="seat empty"><span class="avatar" style="--color:#e5e8dc;color:#a2a994">+</span>等待朋友入座</div>`;}).join('')}</div>${colorPalette()}${anchorEntry()}<div class="lobby-actions">${host?`<button class="button primary" id="start" ${state.players.length<2?'disabled':''}>开始染色 →</button>`:`<button class="button primary" id="ready">${player(state.you)?.ready?'取消准备':'我准备好了 ✓'}</button>`}<button class="button ghost" id="leave">离开房间</button></div><p class="hint">${host?(state.test?'固定包含 1 名测试机器人，已自动准备，你可以直接开局。':'至少 2 人，其他玩家上线并准备后即可开局。'):'准备好后，等待房主开始对局。'}</p></section><aside class="panel"><span class="eyebrow">MAKE IT YOUR GAME</span><h2 style="margin-top:15px">这桌怎么玩</h2><div class="setup-row"><span>对局长度</span><select id="rounds" aria-label="对局轮数" ${!host?'disabled':''}>${[6,10,15].map(n=>`<option value="${n}" ${state.rounds===n?'selected':''}>${n} 轮 / ${n===6?'轻快':n===10?'标准':'深入'}</option>`).join('')}</select></div><div class="setup-row"><span>强化选牌间隔</span><select id="augment-every" aria-label="强化选牌间隔" ${!host?'disabled':''}>${[2,3,5].map(n=>`<option value="${n}" ${state.augmentEvery===n?'selected':''}>每 ${n} 轮</option>`).join('')}</select></div><div class="setup-row"><span>棋盘大小</span><b>${state.players.length<=4?'11 × 11':'15 × 15'}</b></div><div class="setup-row"><span>地形与天气</span><b>随机生成</b></div><div class="setup-row"><span>获胜条件</span><b>最终总积分最高</b></div><p class="hint" style="margin-top:24px">◈ 染井每块 4 分，是值得争夺的要地。<br>✳ 出生点受保护，随时可以卷土重来。<br>⌁ 打开同一个服务器地址，加入同一个房间。</p><div class="network">${network.map(a=>`<a href="${esc(a)}">${esc(a)}</a>`).join('')}</div></aside></div>`;
  document.querySelectorAll('[data-player-color]').forEach(el=>el.onclick=()=>run('color',{color:el.dataset.playerColor}));$('#default-color')?.addEventListener('click',()=>run('color',{color:null}));$('#anchor-shop-button')?.addEventListener('click',()=>{renderAnchorShop();$('#anchor-shop').showModal();});$('#start')?.addEventListener('click',()=>run('start'));$('#ready')?.addEventListener('click',()=>run('ready'));$('#rounds').onchange=e=>run('settings',{rounds:Number(e.target.value)});$('#augment-every').onchange=e=>run('settings',{augmentEvery:Number(e.target.value)});$('#leave').onclick=leave;
}
async function leave(){if(busy)return;busy=true;source?.close();source=null;try{const roomCode=state.code;const result=await api('leave');if(!state.spectating){if(result.rejoinAvailable)localStorage.setItem('chroma-return-room',roomCode);else localStorage.removeItem('chroma-return-room');}source?.close();source=null;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();state=null;selected=null;secondSelected=null;intelPlayer=null;intelAllDraws=false;intelHistoryOpen={};mode='paint';localStorage.removeItem('chroma-room');localStorage.removeItem('chroma-role');$('#connection').textContent='局域网桌游';render();refreshRooms();}catch(e){if(state)connect(state);toast(e.message);}finally{busy=false;}}
function adjacent(i){const g=state.game,s=g.size,x=i%s,y=Math.floor(i/s);return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([a,b])=>a>=0&&b>=0&&a<s&&b<s).map(([a,b])=>b*s+a);}
function tilePoints(c){const id=c.owner||state.you;return c.terrain==='well'?(hasAug('well_master',id)?6:4)+(hasAug('omni',id)?1:0):(hasAug('goliath',id)?2:1);}
function hasAug(key,id=state.you){return !!state.game?.augments?.[id]?.includes(key);}
function skillAllowed(key){return !hasAug('basics')&&!(key==='leap'&&hasAug('sword'));}
function skillPrice(key){if(state.game.rules)return state.game.rules.skillCosts[key];return Math.max(1,(key==='splash'&&state.game.event.id==='wind'?2:state.cards[key].cost)-(hasAug('spellcraft')&&['splash','leap'].includes(key)?1:0));}
function price(i){const g=state.game,c=g.board[i];if(g.rules)return mode==='paint'?g.rules.paintCosts[i]:mode==='shield'?g.rules.shieldCosts[i]:g.rules.skillCosts[mode];if(mode==='paint'){if(hasAug('basics')||hasAug('sword'))return 1;return c.owner===null?1:(g.event.id==='clash'?1:2)+(c.shield?1+(hasAug('fortress',c.owner)?1:0):0);}if(mode==='shield')return 1;return skillPrice(mode);}
function legal(i){const g=state.game,c=g.board[i];if(g.finished||g.draft||g.active!==state.you||c.terrain==='rock'||g.ink<price(i)||(state.cards[mode]&&!skillAllowed(mode)))return false;if(mode==='shield')return (g.rules?.canShield??true)&&c.owner===state.you&&!c.shield;if(c.owner===state.you||c.home)return false;if(mode==='leap')return c.owner===null&&g.board.some((b,n)=>b.owner===state.you&&Math.abs(n%g.size-i%g.size)+Math.abs(Math.floor(n/g.size)-Math.floor(i/g.size))<=(g.rules?.leapRange??(hasAug('long_leap')?5:3)));if(mode==='paint'&&g.rules){if(!g.rules.paintReach[i])return false;}else if(!adjacent(i).some(n=>g.board[n].owner===state.you))return false;return mode==='splash'?c.owner===null:mode==='pierce'?c.owner!==null:true;}
function secondLegal(i){const c=state.game.board[i];return mode==='paint'&&hasAug('basics')&&selected!==null&&legal(selected)&&i!==selected&&c.owner!==state.you&&!c.home&&c.terrain!=='rock'&&adjacent(i).some(n=>n===selected||state.game.board[n].owner===state.you);}
// Open-source edition: original inline SVG emblems, with no third-party images.
const AUGMENT_ICONS={};
const AUGMENT_VISUALS={
  blade:{label:'进攻',keys:['sword','erosion','executioner','glass','infernal'],path:'M54 144 126 52 151 34 145 67 74 151 64 161 43 143 51 133 75 153 M65 131 82 146 M55 154 42 168'},
  wings:{label:'机动',keys:['long_leap','homeguard','scoped','bread_cheese'],path:'M45 124 77 91 102 109 145 62 M112 62H145V95 M50 145 71 124 M83 151 103 131'},
  shield:{label:'守护',keys:['fortress','mountain','first_aid','plated'],path:'M100 41 148 62V102C148 130 128 150 100 166 72 150 52 130 52 102V62Z M100 66V139 M75 101H125'},
  drop:{label:'经营',keys:['ink_reserve','endless_ink','ocean','siphon','omni'],path:'M100 38C94 67 57 94 57 121A43 43 0 0 0 143 121C143 94 106 67 100 38Z M79 119C79 132 85 141 98 144'},
  book:{label:'法术',keys:['scholar','big_brain','eureka','evil','spellcraft','bread_butter'],path:'M40 61Q70 48 100 66 130 48 160 61V144Q130 131 100 149 70 131 40 144Z M100 66V149 M58 80Q73 76 84 83 M58 99Q73 95 84 102 M116 83Q130 76 144 80 M116 102Q130 95 144 99'},
  star:{label:'爆发',keys:['jeweled','missiles','revolution','rhythm'],path:'M100 37 115 81 161 82 125 109 139 154 100 128 61 154 75 109 39 82 85 81Z M157 43V65 M146 54H168'},
  realm:{label:'领地',keys:['empire','well_master','goliath','quantum','mind'],path:'M45 133V84L74 106 100 49 126 106 155 84V133Z M53 149H147 M77 127 100 100 123 127'},
  orbit:{label:'综合',keys:['basics','dual'],path:'M120 40 77 104 105 103 80 162 136 91 105 93Z M75 59C46 76 43 115 65 139 M128 145C158 128 161 89 139 65'}
};
function augmentVisual(key){return Object.values(AUGMENT_VISUALS).find(v=>v.keys.includes(key))||AUGMENT_VISUALS.orbit;}
function hexFrame(tier,uid){
  const colors=tier==='gold'?['#6d4a1c','#f9e6ae','#b58c47','#f8e9b7','#785529']:tier==='silver'?['#526a7c','#e6f2ff','#8dabc0','#d4e6ec','#607c96']:['#72539f','#dfc5ff','#a0e9e4','#f5e8b6','#9772d4'];
  return `<svg class="hex-frame" viewBox="0 0 300 450" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="frame-${uid}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset=".18" stop-color="${colors[1]}"/><stop offset=".4" stop-color="${colors[2]}"/><stop offset=".65" stop-color="${colors[3]}"/><stop offset="1" stop-color="${colors[4]}"/></linearGradient><linearGradient id="rim-${uid}" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${colors[1]}" stop-opacity=".8"/><stop offset=".4" stop-color="${colors[0]}"/><stop offset=".75" stop-color="${colors[2]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient><radialGradient id="ink-${uid}" cx=".5" cy=".12" r=".85"><stop stop-color="#101c30"/><stop offset=".65" stop-color="#050c18"/><stop offset="1" stop-color="#030813"/></radialGradient></defs><rect x="5" y="4" width="290" height="442" rx="17" fill="#101524" stroke="${colors[0]}" stroke-width="5"/><path d="M20 14H98L106 6H194L202 14H280L288 24V303L296 312V423L280 440H203L195 447H105L97 440H20L5 423V312L13 303V24Z" fill="url(#frame-${uid})" stroke="${colors[0]}" stroke-width="2"/><path d="M35 22H102L109 14H191L198 22H266L281 37V300L288 311V417L270 431H198L191 439H109L102 431H30L13 417V311L20 300V37Z" fill="url(#ink-${uid})" stroke="url(#rim-${uid})" stroke-width="2"/><path d="M35 22H102L109 14H191L198 22H266L281 37V299M20 299V37L35 22M20 319V414L34 428H101L108 435H192L199 428H266L280 414V319" fill="none" stroke="${colors[1]}" stroke-opacity=".5" stroke-width="1"/><path d="M20 320 13 311V418L30 434H98L105 442M280 320 288 311V418L271 434H202L195 442" fill="none" stroke="${colors[0]}" stroke-width="3"/></svg>`;
}
function hexIcon(key,tier,uid){
  if(AUGMENT_ICONS[key])return `<svg class="hex-icon hex-icon-original" viewBox="0 0 200 200" aria-hidden="true"><defs><filter id="matte-${uid}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 1 1 1 0 -.4"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs><image href="${AUGMENT_ICONS[key]}" x="12" y="12" width="176" height="176" preserveAspectRatio="xMidYMid meet" filter="url(#matte-${uid})"/></svg>`;
  const v=augmentVisual(key),stops=tier==='prismatic'?['#fff5b9','#a7f6f5','#e9c0ff','#f2a5df']:tier==='gold'?['#fff3bd','#e9c16c','#9e762f','#ffe6a3']:['#ecf7ff','#9dc9dd','#8095b5','#e3edf6'];
  return `<svg class="hex-icon" viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="emblem-${uid}" x1="0" y1="0" x2="1" y2="1">${stops.map((color,i)=>`<stop offset="${i/3}" stop-color="${color}"/>`).join('')}</linearGradient></defs><path d="M92 17A83 83 0 0 0 32 150L49 128A56 56 0 0 1 102 45Q122 38 112 23Z M111 183A83 83 0 0 0 167 48L151 72A56 56 0 0 1 98 154Q78 162 90 178Z" fill="${tier==='prismatic'?'#665a92':tier==='gold'?'#73643e':'#4f637c'}" opacity=".52"/><path d="${v.path}" fill="none" stroke="url(#emblem-${uid})" stroke-width="8" stroke-linecap="square" stroke-linejoin="miter"/><circle cx="34" cy="63" r="2" fill="${stops[0]}" opacity=".75"/><circle cx="157" cy="149" r="2" fill="${stops[1]}" opacity=".65"/></svg>`;
}
function hexCard(key,{interactive=false,picked=false,prefix='library'}={}){
  const c=state?.augmentCards?.[key]||catalog?.cards?.[key]||tutorial?.cards?.[key],v=augmentVisual(key),uid=prefix+'-'+key,tag=interactive?'button':'article';
  return `<${tag} class="hex-card ${c.tier} ${interactive?'augment-option':'catalog-card'} ${picked?'hex-picked':''} ${c.desc.length>48?'hex-long-copy':''}" ${interactive?`data-augment="${key}" aria-label="选择${esc(c.name)}：${esc(c.desc)}"`:''}>${hexFrame(c.tier,uid)}<span class="hex-card-content">${hexIcon(key,c.tier,uid)}<h3 class="hex-card-title">${esc(c.name)}</h3><span class="hex-card-category">${v.label}</span><span class="hex-divider"><i></i><b>◆</b><i></i></span><span class="hex-card-description">${esc(c.desc)}</span><span class="hex-card-prompt">${picked?'已锁定此强化':interactive?'选择此强化':'永久强化'}</span></span></${tag}>`;
}
let draftDismissedKey=null,draftMarkupSignature=null;
function draftPanel(){
  const d=state.game.draft;if(!d)return '';
  const picked=d.picks[state.you],waiting=state.players.filter(p=>!d.picks[p.id]);
  return `<section class="draft-panel ${d.tier}"><div class="draft-heading"><div><span class="eyebrow">CHOOSE YOUR AUGMENT / 第 ${d.stage} 次强化</span><h2>${picked?'强化已锁定':state.tiers[d.tier]+'强化 · 选择你的力量'}</h2><p>第 ${state.game.round-1} 轮结束 · 全场同阶 · 效果持续整局</p></div><div class="draft-tools"><button class="button ghost" id="reroll" ${picked||!d.rerolls?'disabled':''}>↻ 重抽 (${d.rerolls}/1)</button><button class="icon-button" id="peek-board">查看棋盘 ×</button></div></div>${picked?`<div class="draft-lock"><div class="draft-selected-card">${hexCard(picked,{picked:true,prefix:'locked-'+d.stage})}</div><div><span class="eyebrow">A NEW WAY TO PLAY</span><h3>${esc(state.augmentCards[picked].name)}</h3><p>等待 ${waiting.map(p=>esc(p.name)).join('、')} 选择强化。<br>全员完成后自动继续。</p><button class="button ghost" id="peek-board-wait">查看棋盘</button></div></div>`:`<div class="augment-options">${d.offers.map(key=>hexCard(key,{interactive:true,prefix:'draft-'+d.stage})).join('')}</div><p class="draft-swipe-note">← 左右滑动查看三张候选牌 →</p>`}<div class="draft-status">${state.players.map(p=>`<span class="${d.picks[p.id]?'is-picked':''}"><i style="background:${p.color}"></i>${esc(p.name)} ${d.picks[p.id]?'✓ 已选':'· 选牌中'}</span>`).join('')}</div>${state.host===state.you&&waiting.some(p=>!p.online)?'<button class="icon-button" id="draft-skip">为离线满 15 秒的玩家自动选牌</button>':''}</section>`;
}
function syncDraftModal(){
  const dialog=$('#augment-draft'),d=state?.spectating?null:state?.game?.draft;
  if(!d){if(dialog.open)dialog.close();draftDismissedKey=null;draftMarkupSignature=null;return;}
  const key=state.code+':'+d.stage,signature=JSON.stringify([key,d,state.players.map(p=>[p.id,p.online])]);
  if(signature!==draftMarkupSignature){
    const focused=document.activeElement?.getAttribute('data-augment'),focusId=document.activeElement?.id;
    dialog.innerHTML=draftPanel();draftMarkupSignature=signature;
    if(dialog.open){if(focused)dialog.querySelector(`[data-augment="${focused}"]`)?.focus({preventScroll:true});else if(focusId)dialog.querySelector('#'+focusId)?.focus({preventScroll:true});}
  }
  if(!dialog.open&&draftDismissedKey!==key){$('#player-history').close();$('#card-library').close();dialog.showModal();}
}
function bindDraft(){
  document.querySelectorAll('[data-leave-room]').forEach(el=>el.onclick=leave);
  document.querySelectorAll('[data-augment]').forEach(el=>el.onclick=()=>run('draft',{mode:'pick',key:el.dataset.augment}));
  if($('#reroll'))$('#reroll').onclick=()=>run('draft',{mode:'reroll'});
  if($('#draft-skip'))$('#draft-skip').onclick=()=>run('skip');
  for(const id of ['peek-board','peek-board-wait'])if($('#'+id))$('#'+id).onclick=()=>{draftDismissedKey=state.code+':'+state.game.draft.stage;$('#augment-draft').close();};
  document.querySelectorAll('[data-open-draft]').forEach(el=>el.onclick=()=>{draftDismissedKey=null;syncDraftModal();bindDraft();});
}
function activePlayerSidebar(){
  const g=state.game,p=player(g.active),mine=p.id===state.you,myTurn=mine&&!g.finished&&!g.draft;
  const hand=g.hands?.[p.id]||(mine?g.hand:[]),owned=g.augments[p.id]||[],land=g.board.filter(c=>c.owner===p.id).length;
  const counts=Object.fromEntries(Object.keys(state.cards).map(k=>[k,hand.filter(v=>v===k).length]));
  const lastDraw=(g.drawHistory?.[p.id]||[]).at(-1);
  return `<section class="panel active-player-panel ${myTurn?'is-my-turn':''}" style="--player-color:${p.color}" id="active-player-panel" aria-label="当前回合玩家信息" data-current-player="${p.id}"><div class="current-player-heading">${playerAvatar(p)}<div><span class="eyebrow">${g.draft?'全员选牌':g.finished?'对局结束':myTurn?'轮到你行动':'当前行动玩家'}</span><h2 class="current-player-name">${esc(p.name)}${mine?' · 你':''}</h2></div><span class="follow-turn">自动跟随回合</span></div><div class="current-player-stats"><div><b>${g.draft||g.finished?'—':g.ink}</b><span>剩余墨水</span></div><div><b>${g.scores[p.id]}</b><span>总积分</span></div><div><b>${land}</b><span>领地</span></div></div><div class="current-section-heading"><b>技能手牌</b><span>${hand.length} 张</span></div><div class="cards current-player-cards">${Object.entries(counts).filter(([,n])=>n).map(([key,n])=>{
    const c=state.cards[key],info=g.skillInfo?.[p.id]?.[key],enabled=info?.enabled??(mine?skillAllowed(key):true),price=info?.cost??c.cost;
    const tag=myTurn?'button':'article';
    return `<${tag} class="card ${mine&&mode===key?'active':''} ${!enabled?'skill-unavailable':''}" ${myTurn?`data-mode="${key}" ${!enabled?'disabled':''}`:''} title="${esc(c.desc)}" aria-label="${c.name}，${n} 张，${enabled?price+' 墨':'强化禁用'}：${esc(c.desc)}"><span class="card-symbol">${key==='splash'?'✺':key==='leap'?'↗':'ϟ'}</span><span class="current-skill-text"><b>${c.name} <small>× ${n}</small></b><span>${c.desc}</span></span><span class="card-cost">${enabled?price+' 墨':'禁用'}</span></${tag}>`;
  }).join('')||'<p class="hint">当前手牌已用尽</p>'}</div><div class="current-draw"><span>${lastDraw?.reason==='gm'?'GM 补发':lastDraw?.reason==='initial'?'开局手牌':lastDraw?'第 '+lastDraw.round+' 轮抽牌':'本轮抽牌'}</span><b>${lastDraw?lastDraw.cards.length?lastDraw.cards.map(k=>state.cards[k].name).join('、'):'手牌已满，未抽新牌':'暂无'}</b></div><div class="current-section-heading"><b>已选强化</b><span>${owned.length} 张</span></div><div class="current-augments">${owned.length?owned.map(k=>intelAugment(k,true)).join(''):'<span class="hint">尚未获得强化</span>'}</div><button class="current-details-link" data-open-player-history="${p.id}">查看效果、刷新与选牌记录 ↗</button>${g.draft&&!state.spectating?'<button class="button draft-return-button" data-open-draft>返回强化选牌 ↗</button>':''}${myTurn?`<div class="turn-controls"><div class="modes"><button class="mode ${mode==='paint'?'active':''}" data-mode="paint">◉ 染色 / 抢色</button><button class="mode ${mode==='shield'?'active':''}" data-mode="shield">▣ 加固</button></div><div class="action-box" id="selection-info">${selectionText()}</div><div class="action-buttons"><button class="button primary" id="confirm" ${selected===null||!legal(selected)?'disabled':''}>确认${mode==='shield'?'加固':'落色'}</button><button class="button ghost" id="end">结束回合 →</button></div></div>`:`<div class="watching-turn">${g.draft?'所有玩家选完强化后继续':g.finished?'本局已结算':p.bot?'机器人正在行动，信息实时更新':esc(p.name)+' 正在行动'}${!g.draft&&!g.finished?' · 下一回合自动切换':''}</div>`}${state.host===state.you&&!g.finished&&!g.draft&&!p.online?'<button class="icon-button" id="skip">跳过离线玩家（离线满 15 秒）</button>':''}</section>`;
}
function intelAugment(key,picked=false){const c=state.augmentCards[key];if(!c)return '';return `<span class="intel-augment ${c.tier} ${picked?'picked':''}" title="${esc(c.desc)}"><span class="tier-badge">${state.tiers[c.tier]}</span>${esc(c.name)}${picked?' ✓':''}</span>`;}
function playerIntel(){
  const g=state.game;if(!g)return '';
  if(!player(intelPlayer))intelPlayer=state.players.find(p=>p.id!==state.you)?.id||state.you;
  const p=player(intelPlayer),id=p.id,hand=g.hands?.[id]||[],owned=g.augments[id]||[],stats=g.board.filter(c=>c.owner===id);
  const counts=Object.fromEntries(Object.keys(state.cards).map(k=>[k,hand.filter(v=>v===k).length]));
  const draws=[...(g.drawHistory?.[id]||[])].reverse(),shownDraws=intelAllDraws?draws:draws.slice(0,4);
  const histories=[...(g.draftHistory||[])].reverse();
  const status=g.finished?'对局已结束':g.draft?(g.draft.picks[id]?'强化已选定':'正在选择强化'):g.active===id?'正在行动':'等待回合';
  const now=g.draft?.allOffers?.[id];
  return `<section class="player-intel" id="player-intel"><div class="intel-heading"><div><span class="eyebrow">MULTIPLAYER / LIVE INTEL</span><h2>联机玩家信息</h2></div><span class="hint">技能手牌、刷新记录与强化选择全场可见</span></div><div class="intel-tabs" role="tablist" aria-label="查看玩家">${state.players.map(q=>`<button role="tab" aria-selected="${q.id===id}" aria-controls="intel-content" class="intel-tab ${q.id===id?'active':''}" data-intel-player="${q.id}"><span class="intel-dot" style="--color:${q.color}"></span>${esc(q.name)}${q.id===state.you?' · 你':''}<small>${q.online?'在线':'离线'}</small></button>`).join('')}</div><div id="intel-content" role="tabpanel" aria-label="${esc(p.name)}的信息"><div class="intel-summary">${playerAvatar(p)}<div><b>${esc(p.name)}</b><p>${p.bot?'测试机器人':p.id===state.host?'房主':'玩家'} · ${p.online?'在线':'离线'} · ${status}</p></div><div class="intel-stat"><b>${g.scores[id]}</b><span>总积分</span></div><div class="intel-stat"><b>${stats.length}</b><span>领地 / ${stats.filter(c=>c.terrain==='well').length} 染井</span></div><div class="intel-stat"><b>${!g.finished&&!g.draft&&g.active===id?g.ink:'—'}</b><span>本回合剩余墨水</span></div></div><div class="intel-columns"><section class="intel-block"><h3>当前技能手牌 <span>${hand.length} 张</span></h3><div class="intel-skills">${Object.entries(counts).filter(([,n])=>n).map(([key,n])=>{const c=state.cards[key],info=g.skillInfo?.[id]?.[key];return `<article class="intel-skill ${info?.enabled===false?'unavailable':''}"><div><b>${c.name} × ${n}</b><span>${info?.enabled===false?'强化禁用':(info?.cost??c.cost)+' 墨'}</span></div><p>${c.desc}</p></article>`;}).join('')||'<p class="hint">手牌已用尽</p>'}</div><h3>每轮技能刷新</h3><div class="intel-draws">${shownDraws.map(e=>`<div><span>${e.reason==='gm'?'GM 补发':e.reason==='initial'?'开局手牌':`第 ${e.round} 轮 · 第 ${e.turn} 手`}</span><b>${e.cards.length?e.cards.map(k=>esc(state.cards[k].name)).join('、'):'手牌已满，未获得新牌'}</b></div>`).join('')||'<p class="hint">尚无刷新记录</p>'}</div>${draws.length>4?`<button class="icon-button" id="intel-all-draws">${intelAllDraws?'收起':'查看全部 '+draws.length+' 条'}刷新记录</button>`:''}</section><section class="intel-block"><h3>已选择的强化 <span>${owned.length} 张</span></h3><div class="intel-owned">${owned.map(key=>{const c=state.augmentCards[key];return `<article class="intel-owned-card ${c.tier}">${intelAugment(key,true)}<p>${esc(c.desc)}</p></article>`;}).join('')||'<p class="hint">尚未获得强化</p>'}</div>${now?`<div class="intel-live-offers"><h3>本次刷新 · ${state.tiers[g.draft.tier]}</h3><p class="hint">${g.draft.picks[id]?'已选：'+esc(state.augmentCards[g.draft.picks[id]].name):'选牌中'} · 剩余重抽 ${g.draft.allRerolls[id]} 次</p><div class="intel-offers">${now.map(k=>intelAugment(k,g.draft.picks[id]===k)).join('')}</div></div>`:''}</section><section class="intel-block"><h3>强化刷新与选牌记录</h3><div class="intel-history">${histories.map((h,i)=>{const selectedKey=h.picks[id],expanded=intelHistoryOpen[id+':'+h.stage]??i===0;return `<details data-intel-history="${id+':'+h.stage}" ${expanded?'open':''}><summary>第 ${h.stage} 次 · ${state.tiers[h.tier]} <small>第 ${h.afterRound} 轮后</small></summary><div class="intel-history-body"><span class="hint">首次候选</span><div class="intel-offers">${(h.offers[id]||[]).map(k=>intelAugment(k,selectedKey===k)).join('')}</div>${(h.rerolls[id]||[]).map((offers,j)=>`<span class="hint">第 ${j+1} 次重抽</span><div class="intel-offers">${offers.map(k=>intelAugment(k,selectedKey===k)).join('')}</div>`).join('')}<p class="intel-pick">${selectedKey?'最终选择：'+esc(state.augmentCards[selectedKey].name):'尚未选择'}</p></div></details>`;}).join('')||'<p class="hint">第一轮强化选牌后将在这里显示</p>'}</div></section></div></div></section>`;
}
function bindIntel(){
  document.querySelectorAll('[data-intel-player]').forEach(el=>el.onclick=()=>{intelPlayer=el.dataset.intelPlayer;intelAllDraws=false;render();});
  document.querySelectorAll('[data-inspect-player]').forEach(el=>el.onclick=()=>openPlayerHistory(el.dataset.inspectPlayer));
  document.querySelectorAll('[data-open-player-history]').forEach(el=>el.onclick=()=>openPlayerHistory(el.dataset.openPlayerHistory));
  document.querySelectorAll('[data-intel-history]').forEach(el=>el.ontoggle=()=>{intelHistoryOpen[el.dataset.intelHistory]=el.open;});
  if($('#intel-all-draws'))$('#intel-all-draws').onclick=()=>{intelAllDraws=!intelAllDraws;render();};
}
function renderPlayerHistory(){
  $('#player-history').innerHTML=`<div class="dialog-head"><span class="eyebrow">PLAYER DETAILS / HISTORY</span><button class="icon-button" id="close-player-history">关闭 ×</button></div>${playerIntel()}`;
  $('#close-player-history').onclick=()=>$('#player-history').close();
}
function openPlayerHistory(id){intelPlayer=id;intelAllDraws=false;renderPlayerHistory();if(!$('#player-history').open)$('#player-history').showModal();bindIntel();}
function game(){const g=state.game;rememberAnchorBoard(g);const myTurn=g.active===state.you&&!g.finished&&!g.draft,active=player(g.active),host=state.host===state.you;const ranks=[...state.players].sort((a,b)=>g.scores[b.id]-g.scores[a.id]);
  app.innerHTML=heading('EVERY MOVE LEAVES A MARK','每一步，都留下颜色。')+(state.spectating?'<section class="spectator-notice"><strong>正在实时观战</strong><span>棋盘和右侧信息随回合更新，可点击积分榜查看玩家的手牌与选牌记录。</span></section>':'')+(g.finished?`<div class="result-banner"><div><h2>✳ ${g.winner.map(id=>esc(player(id).name)).join('、')}${g.winner.length>1?' 并列获胜':' 赢得了这片色彩'}</h2><p>${g.maxRounds} 轮染色结束 · 最高 ${g.scores[g.winner[0]]} 分 · 好一场色彩博弈</p></div>${host?'<button class="button" id="reset">再来一局 ↗</button>':'<span class="hint">等待房主开启下一局</span>'}</div>`:'')+rewardSummary()+`<div class="game-layout"><div><section class="board-shell"><div class="round-progress" role="meter" aria-label="对局轮次进度" aria-valuemin="0" aria-valuemax="${g.maxRounds}" aria-valuenow="${g.round}" style="--progress:${Math.min(100,g.round/g.maxRounds*100)}%"><span></span></div><div class="board-top"><strong>THE COLOR FIELD</strong><span>第 ${g.round.toString().padStart(2,'0')} / ${g.maxRounds} 轮 · ${g.finished?'已结算':g.draft?'全员强化选牌':esc(active.name)+' 的回合'}</span></div><div class="board-viewport"><div class="board ${g.size>11?'large':''}" style="--size:${g.size}" role="group" aria-label="染色棋盘">${g.board.map((c,i)=>{const p=player(c.owner),symbol=c.home?'✳':c.terrain==='rock'?'▧':c.terrain==='well'?'◈':'';return `<button class="tile ${c.terrain} ${c.home?'home':''} ${anchorPaintImpacts.has(i)?'anchor-impact anchor-impact-'+anchorPaintImpacts.get(i).tier:''} ${p?'owned':''} ${c.shield?'shield':''} ${selected===i||secondSelected===i?'selected':''} ${(secondLegal(i)||legal(i))?'legal':''}" style="${p?'--color:'+p.color:''}" data-cell="${i}" aria-label="第 ${Math.floor(i/g.size)+1} 行 ${i%g.size+1} 列，${c.terrain==='rock'?'岩石':c.home?'出生点':c.terrain==='well'?'染井':'地块'}，${p?esc(p.name):'未占领'}${c.shield?'，已加固':''}" title="${p?esc(p.name):'空地'} · ${c.terrain==='rock'?'无法染色':tilePoints(c)+' 分'}">${c.home&&p?.anchor?anchorVisual(p.anchor,p.color):symbol}${p?.anchor&&!c.home?anchorVisual(p.anchor,p.color,true):''}${anchorImpact(i)}</button>`;}).join('')}</div></div><div class="board-foot"><div class="legend"><span>◈ 染井 ${tilePoints({terrain:'well'})} 分</span><span>✳ 出生点</span><span>▧ 岩石</span><span>▣ 加固</span></div><span>${myTurn?'亮边地块可行动 · 点击选中':'规划下一步，等待你的回合'}</span></div></section><div class="game-bottom"><div class="instruction"><b>${g.finished?'这张棋盘，记录了你们的故事。':myTurn?'轮到你了，让颜色蔓延。':'观察棋盘，机会藏在下一步。'}</b><br>${hasAug('basics')?'回归基本功：1 墨最多连染 2 格':hasAug('sword')?'亮出你的剑：普通抢色 1 墨，无视加固':'行动范围与墨水费用以选格提示为准'}<br>墨水用尽后，点击「结束回合」交给下一位。</div><div class="log">${g.log.slice(0,3).map(l=>`<div>${esc(l)}</div>`).join('')}</div></div></div><aside class="sidebar">${activePlayerSidebar()}<div class="weather"><strong>${g.event.id==='rain'?'☂':g.event.id==='wind'?'≋':g.event.id==='clash'?'✶':'☀'} ${g.event.name}</strong><p>${g.event.desc}</p></div><section class="panel score-panel"><div class="panel-title"><span class="eyebrow">COLOR RANKING</span><span class="hint">总积分</span></div><div class="score-list">${ranks.map(p=>`<button class="score-row score-inspect ${p.id===g.active&&!g.finished?'active-player':''}" data-inspect-player="${p.id}" title="查看 ${esc(p.name)} 的手牌与强化"><span class="swatch" style="--color:${p.color}"></span><span>${esc(p.name)}${p.id===state.you?' · 你':''}</span><small>${!p.online?'离线':`${g.handCounts[p.id]} 牌 · ${g.augments[p.id].length} 强化`}</small><b>${g.scores[p.id]}</b></button>`).join('')}</div></section></aside></div>`;
  document.querySelectorAll('[data-cell]').forEach(el=>el.onclick=()=>{if(state.spectating)return;const i=Number(el.dataset.cell);if(secondLegal(i)){secondSelected=secondSelected===i?null:i;}else{selected=i;secondSelected=null;}render();});document.querySelectorAll('[data-mode]').forEach(el=>el.onclick=()=>{mode=el.dataset.mode;selected=null;secondSelected=null;render();});if($('#confirm'))$('#confirm').onclick=async()=>{const index=selected;await run('action',{mode,index,second:secondSelected});selected=null;secondSelected=null;render();};if($('#end'))$('#end').onclick=()=>run('action',{mode:'end'});$('#skip')?.addEventListener('click',()=>run('skip'));$('#reset')?.addEventListener('click',()=>{selected=null;mode='paint';run('reset');});
}
function selectionText(){const g=state.game;if(g.finished)return '积分已结算，看看你留下的色彩。';if(g.draft)return '请先在上方选择强化，所有人选完后继续。';if(g.active!==state.you)return '现在是其他玩家的回合，可以先查看行动范围。';if(selected===null)return mode==='paint'?(hasAug('basics')?'先选第一格，再选可选的第二格，1 墨最多染两格。':'选择亮边地块，染上你的颜色。'):mode==='shield'?'选择己方地块，加固关键领地。':state.cards[mode].desc;const c=g.board[selected];return `${Math.floor(selected/g.size)+1} 行 ${selected%g.size+1} 列 · ${c.terrain==='well'?`染井（${tilePoints(c)} 分）`:c.terrain==='rock'?'岩石':'普通地块'}<br>${legal(selected)?`此次行动消耗 <b>${price(selected)} 点墨水</b>${hasAug('basics')&&mode==='paint'?` · 已选 ${secondSelected===null?1:2} 格`:''}`:'此处无法执行当前行动，请选择亮边地块。'}`;}
async function copyRoomLink(){
  const url=new URL('/',network[0]||shareAddresses()[0]);url.searchParams.set('room',state.code);const link=url.href;
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);toast('分享链接已复制，打开后自动填入房间号');return;}}catch{}
  // LAN HTTP often lacks the modern Clipboard API; retain native copy support.
  const input=document.createElement('textarea');input.value=link;input.readOnly=true;input.style.cssText='position:fixed;left:-9999px;top:0';document.body.append(input);
  const focused=document.activeElement;let copied=false;try{input.select();copied=document.execCommand('copy');}catch{}finally{input.remove();focused?.focus({preventScroll:true});}
  if(copied){toast('分享链接已复制，打开后自动填入房间号');return;}
  let dialog=$('#share-room-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='share-room-dialog';dialog.setAttribute('aria-label','分享房间');document.body.append(dialog);}
  dialog.innerHTML=`<div class="dialog-head"><h2>邀请朋友加入</h2><button class="icon-button" id="close-share-room">关闭 ×</button></div><p class="hint">浏览器未允许自动复制，请复制下方链接。朋友打开后，房间号会自动填好。</p><input aria-label="房间分享链接" readonly value="${esc(link)}" style="width:100%"><p class="hint">局域网地址需要连接同一网络；外网地址需由主机先配置访问入口。</p>`;
  $('#close-share-room').onclick=()=>dialog.close();dialog.showModal();const field=dialog.querySelector('input');field.focus();field.select();
}
function render(){syncGmConsole();app.dataset.view=tutorial?'tutorial':!state?'home':state.phase==='lobby'?'lobby':'game';if(tutorial){renderTutorial();return;}if(!state)entry();else if(state.phase==='lobby')lobby();else game();syncDraftModal();bindDraft();syncInkReminder();if($('#player-history').open){if(state?.game)renderPlayerHistory();else $('#player-history').close();}if($('#anchor-shop').open){if(state?.phase==='lobby'&&!state.spectating)renderAnchorShop();else $('#anchor-shop').close();}bindIntel();$('#copy-room')?.addEventListener('click',copyRoomLink);}
$('#ink-continue').onclick=()=>$('#ink-empty').close();
$('#ink-end').onclick=()=>{if(busy)return;$('#ink-empty').close();if(tutorial){advanceTutorial('end');return;}run('action',{mode:'end'});};
$('#rules-button').onclick=()=>$('#rules').showModal();$('#close-rules').onclick=()=>$('#rules').close();$('#rules').onclick=e=>{if(e.target===$('#rules')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
async function init(){render();refreshRooms();try{network=shareAddresses(await(await fetch('/api/network')).json());if(!state)render();}catch{}if(tutorial)return;if(invitedRoom){$('#join-form').scrollIntoView({block:'center'});$('#join-name').focus({preventScroll:true});return;}const room=localStorage.getItem('chroma-room');if(room){try{const v=await api(localStorage.getItem('chroma-role')==='spectator'?'watch':'join',{room,name:localStorage.getItem('chroma-name')});connect(v);}catch{localStorage.removeItem('chroma-room');}}}

setInterval(refreshRooms,5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshRooms();});

let catalog=null,catalogTier='silver';
function catalogConflicts(key){return Object.keys(catalog.cards).filter(k=>catalog.cards[key].excludes?.includes(k)||catalog.cards[k].excludes?.includes(key));}
function renderCatalog(){
  const cards=Object.entries(catalog.cards).filter(([,c])=>c.tier===catalogTier);
  $('#card-library').innerHTML=`<div class="dialog-head"><span class="eyebrow">THE AUGMENT ARCHIVE / 36 CARDS</span><button class="icon-button" id="close-catalog">关闭 ×</button></div><h2>选择你的<br>染色流派。</h2><p class="catalog-intro">全场每次刷新同一个随机品阶 · 重抽不换阶 · 强化持续整局</p><div class="catalog-tabs">${Object.entries(catalog.tiers).map(([key,name])=>`<button class="mode ${catalogTier===key?'active':''}" data-catalog-tier="${key}">${name} · ${Object.values(catalog.cards).filter(c=>c.tier===key).length} 种</button>`).join('')}</div><div class="catalog-grid">${cards.map(([key])=>hexCard(key,{prefix:'archive'})).join('')}</div>`;
  $('#close-catalog').onclick=()=>$('#card-library').close();
  document.querySelectorAll('[data-catalog-tier]').forEach(el=>el.onclick=()=>{catalogTier=el.dataset.catalogTier;renderCatalog();});
}
$('#catalog-button').onclick=async()=>{try{if(!catalog){const r=await fetch('/chroma/catalog');if(!r.ok)throw Error('牌库加载失败，请稍后重试');catalog=await r.json();}renderCatalog();$('#card-library').showModal();}catch(e){toast(e.message);}};

$('#augment-draft').addEventListener('cancel',()=>{if(state?.game?.draft)draftDismissedKey=state.code+':'+state.game.draft.stage;});

const originalChromaRender=render;
