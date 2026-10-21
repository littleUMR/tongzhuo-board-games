// The original CHROMA renderer and tutorial are retained; only transport and navigation use Tongzhuo.
const platformParams=new URLSearchParams(location.search),platformCode=(platformParams.get('room')||'').toUpperCase();
const platformAnchors=location.pathname==='/chroma/anchors';
let platformMoving=false,platformCoinResults=[];
// BEGIN TONGZHUO SNAPSHOT
function chromaNativeSnapshot(r,you){
 const g=r.game,roster=[...r.players,...(r.results||[])],players=g?[...roster.filter((p,i)=>g.order.includes(p.id)&&roster.findIndex(q=>q.id===p.id)===i),...g.order.filter(id=>!roster.some(p=>p.id===id)).map(id=>({id,name:'已离房玩家',color:0}))]:r.players,viewer=players.find(p=>p.id===you)&&r.players.find(p=>p.id===you);
 const base={code:r.code,revision:r.updated,host:r.hostId,you:viewer?.id,phase:r.status==='waiting'?'lobby':r.status==='finished'?'finished':'playing',spectating:!viewer,spectatorCount:r.spectators.length,test:false,
 players:players.map(p=>({...p,color:p.chromaColor||g?.colors[p.color]||'#e87748',colorChoice:!!p.chromaColorChoice,bot:!!p.botLevel,online:r.players.some(q=>q.id===p.id)})),anchors:r.chromaAnchors||[],profile:r.chromaProfile||null,permissions:{gm:false}};
 if(!g)return {...base,game:null};const draft=g.draft;
 return {...base,rounds:g.maxRounds,augmentEvery:g.augmentEvery,cards:g.cards,augmentCards:g.augmentCards,tiers:g.tiers,game:{...g,matchId:r.matchId,hand:viewer?g.hands[you]:[],handCounts:Object.fromEntries(players.map(p=>[p.id,g.hands[p.id].length])),draft:draft?{...draft,offers:draft.offers[you]||[],rerolls:draft.rerolls[you]||0,allOffers:draft.offers,allRerolls:draft.rerolls}:null}};
}
// END TONGZHUO SNAPSHOT
function platformNavigate(path){if(platformMoving)return;platformMoving=true;source?.close();location.replace(path);}
function tutorialReturnPath(){const value=platformParams.get('returnTo')||'/?game=chroma',url=new URL(value,location.origin);return url.origin===location.origin&&['/','/chroma/play','/chroma/anchors'].includes(url.pathname)?url.pathname+url.search:'/?game=chroma';}
function consumePlatformRoom(r){if(!r){if(localStorage.getItem('tongzhuoRoom')===platformCode)localStorage.removeItem('tongzhuoRoom');platformNavigate('/?game=chroma');return null;}if(r.gameId!=='chroma'||r.status==='waiting'&&!platformAnchors){platformNavigate('/?room='+encodeURIComponent(r.code));return null;}if(platformAnchors&&r.status!=='waiting'){platformNavigate('/chroma/play?room='+encodeURIComponent(r.code));return null;}platformCoinResults=r.coinResults||[];const you=r.viewerId||r.players.find(p=>p.token===token)?.id;const snapshot=chromaNativeSnapshot(r,you);localStorage.setItem('tongzhuoRoom',r.code);localStorage.setItem('tongzhuoRole',snapshot.spectating?'spectator':'player');setState(snapshot);return snapshot;}
async function platformAction(action,data={}){const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,action,code:platformCode,token})});const value=await response.json();if(!response.ok)throw Error(value.error||'操作失败');return value;}
async function api(endpoint,data={}){const actions={action:'chromaMove',draft:'chromaMove',reset:'rematch',leave:'leave',anchor:'chromaAnchor'};if(!actions[endpoint])throw Error('请使用同桌房间中的对应操作');const value=await platformAction(actions[endpoint],{...data,...(endpoint==='draft'?{op:'draft'}:{})});if(endpoint==='leave'){localStorage.removeItem('tongzhuoRoom');localStorage.removeItem('tongzhuoRole');platformNavigate('/?game=chroma');return state;}return consumePlatformRoom(value.room)||state;}
async function refreshRooms(){}
async function leave(){if(busy)return;busy=true;try{await api('leave');}catch(e){localStorage.removeItem('tongzhuoRoom');localStorage.removeItem('tongzhuoRole');platformNavigate('/?game=chroma');}finally{busy=false;}}
function exitTutorial(completed=false){if(completed)localStorage.setItem('chroma-tutorial-complete','1');platformNavigate(tutorialReturnPath());}
function rewardSummary(){const result=platformCoinResults.find(p=>p.playerId===state.you);if(!state.game.finished)return '';return '<section class="reward-summary"><div><span>同桌 · 本局桌游币</span><strong>'+(result?'+'+result.coins:'本局不发币')+'</strong></div><p>完整对局依同桌既有排名规则给真人玩家发桌游币；机器人和教学局不领取。</p></section>';}
function openPlatformTutorial(){const back=location.pathname+location.search;location.assign('/chroma/tutorial?returnTo='+encodeURIComponent(back));}
async function init(){
 $('#tongzhuo-home').onclick=e=>{e.preventDefault();if(tutorial)exitTutorial();else if(platformAnchors)platformNavigate('/?room='+encodeURIComponent(platformCode));else leave();};
 $('#tongzhuo-tutorial').onclick=openPlatformTutorial;
 $('#tongzhuo-chat').onclick=()=>{if(state)window.open('/?room='+encodeURIComponent(state.code)+'&chat=1','tongzhuoChat_'+state.code,'popup=yes,width=520,height=680,resizable=yes,scrollbars=yes');};
 if(location.pathname==='/chroma/tutorial'){
  $('#tongzhuo-tutorial').hidden=true;$('#tongzhuo-chat').hidden=true;startTutorial();
  const back=new URL(tutorialReturnPath(),location.origin),code=back.searchParams.get('room');
  if(code&&token)source=new EventSource('/events?room='+encodeURIComponent(code)+'&token='+encodeURIComponent(token));
  return;
 }
 if(!/^[A-F0-9]{6}$/.test(platformCode)||!token||!localStorage.getItem('tongzhuoName')){platformNavigate('/?'+(platformCode?'room='+encodeURIComponent(platformCode):'game=chroma'));return;}
 try{
  const data={name:localStorage.getItem('tongzhuoName')};let value;
  try{value=await platformAction(localStorage.getItem('tongzhuoRole')==='spectator'?'watch':'join',data);}catch{value=await platformAction('watch',data);}
  if(!consumePlatformRoom(value.room))return;if(platformAnchors&&state.you){renderAnchorShop();$('#anchor-shop').showModal();}
  source=new EventSource('/events?room='+encodeURIComponent(platformCode)+'&token='+encodeURIComponent(token));
  source.onopen=()=>$('#connection').textContent='已连接 · 同桌实时同步';
  source.onerror=()=>$('#connection').textContent='连接中断，正在重连';
  source.onmessage=e=>consumePlatformRoom(JSON.parse(e.data).room);
  fetch('/api/info').then(r=>r.json()).then(info=>{network=['localhost','127.0.0.1'].includes(location.hostname)?info.addresses.map(ip=>location.protocol+'//'+ip+(location.port?':'+location.port:'')):[location.origin];}).catch(()=>{});
 }catch(e){app.innerHTML='<p>无法进入对局：'+esc(e.message)+'</p><button class="button primary" id="chroma-error-exit">返回同桌大厅</button>';$('#chroma-error-exit').onclick=()=>{localStorage.removeItem('tongzhuoRoom');localStorage.removeItem('tongzhuoRole');platformNavigate('/?game=chroma');};$('#connection').textContent='请返回同桌重新加入';}
}
addEventListener('pagehide',()=>source?.close());
init();

function render(){
 if(!platformAnchors){originalChromaRender();return;}
 app.dataset.view='lobby';if(!state?.you){app.textContent='请先在同桌房间入座，再选择个人锚点。';return;}
 app.innerHTML=heading('PERSONAL ANCHOR / 个人锚点','给你的颜色，一枚独有的印记。')+anchorEntry()+'<button class="button ghost" id="anchor-return-room">返回同桌房间 ↗</button>';
 $('#anchor-return-room').onclick=()=>platformNavigate('/?room='+encodeURIComponent(platformCode));
 $('#anchor-shop-button').onclick=()=>{renderAnchorShop();$('#anchor-shop').showModal();};
 $('#copy-room').onclick=copyRoomLink;
 if($('#anchor-shop').open)renderAnchorShop();
}
