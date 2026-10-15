const TREASURES=[1,2,3,4,5,5,7,7,9,11,11,13,14,15,17];
const HAZARDS=['spiders','snakes','fire','rocks','mummy'];
const LABELS={spiders:'巨型蜘蛛',snakes:'毒蛇',fire:'烈焰',rocks:'落石',mummy:'木乃伊'};
function assert(ok,message){if(!ok)throw new Error(message);}
function baseDeck(){return [...TREASURES.map((value,i)=>({id:`t${i}`,kind:'treasure',value})),...HAZARDS.flatMap(hazard=>[0,1,2].map(i=>({id:`${hazard}${i}`,kind:'hazard',hazard})))];}
function shuffle(cards,random=Math.random){const a=cards.map(c=>({...c}));for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function log(g,text){g.log.unshift(text);g.log=g.log.slice(0,100);}
function event(g,data){g.eventSeq=(g.eventSeq||0)+1;g.events=[...(g.events||[]),{id:g.eventSeq,round:g.round,step:g.step,...data}].slice(-60);}
function remove(g,id){g.pool=g.pool.filter(c=>c.id!==id);}
function endRound(g,players,reason){
 const lost=g.trail.filter(c=>c.kind==='artifact'&&!c.claimedBy);
 for(const c of lost)remove(g,c.id);
 if(lost.length)log(g,`${lost.length} 件遗留神器丢失，永久移出游戏。`);
 if(g.removedHazard){g.roundLosses=players.filter(p=>g.active.includes(p.id)).map(p=>({playerId:p.id,name:p.name,amount:p.pocket}));event(g,{kind:'collapse',hazard:g.removedHazard,losses:g.roundLosses,lostArtifacts:lost.length});}
 for(const p of players)p.pocket=0;
 g.active=[];g.choices={};g.phase=g.round===5?'finished':'roundEnd';g.roundReason=reason;g.nextRoundConfirmed=[];
 g.roundHistory.push({round:g.round,reason,lostArtifacts:lost.length,removedHazard:g.removedHazard||null});
 log(g,`第 ${g.round} 轮结束：${reason}`);
 if(g.phase==='finished'){
  const best=Math.max(...players.map(p=>p.score));const tied=players.filter(p=>p.score===best);const mostArtifacts=Math.max(...tied.map(p=>p.artifacts.length));g.winners=tied.filter(p=>p.artifacts.length===mostArtifacts).map(p=>p.id);
  log(g,`五轮结束，${players.filter(p=>g.winners.includes(p.id)).map(p=>p.name).join('、')} 获胜。`);
 }
}
function reveal(g,players){
 const card=g.deck.pop();assert(card,'探险牌堆异常');g.step++;g.choices={};g.trail.push({...card,leftover:0});const visible=g.trail[g.trail.length-1];
 if(card.kind==='treasure'){
  const share=Math.floor(card.value/g.active.length);visible.leftover=card.value%g.active.length;
  for(const p of players)if(g.active.includes(p.id))p.pocket+=share;
  event(g,{kind:'treasure',value:card.value,share,leftover:visible.leftover,recipients:players.filter(p=>g.active.includes(p.id)).map(p=>({playerId:p.id,name:p.name,pocket:p.pocket}))});
  log(g,`发现 ${card.value} 颗宝石：${g.active.length} 人各拿 ${share}，${visible.leftover} 颗留在路上。`);
 }else if(card.kind==='hazard'){
  const count=g.trail.filter(c=>c.kind==='hazard'&&c.hazard===card.hazard).length;
  if(count===2){remove(g,card.id);g.removedHazard=card.hazard;log(g,`${LABELS[card.hazard]}第二次出现！仍在神庙的玩家失去本轮背包宝石。`);endRound(g,players,`${LABELS[card.hazard]}重复出现`);return;}
  log(g,`遇到${LABELS[card.hazard]}，再次出现就会失败。`);
 }else log(g,'发现神器，只有一次选择中独自返回的玩家才能带走。');
 g.phase='choosing';
}
function nextRound(g,players,random=Math.random){
 assert(g.phase==='roundEnd'||g.round===0,'当前探险尚未结束');assert(g.round<5,'五轮探险已结束');
 g.round++;g.pool.push({...g.artifactOrder[g.round-1]});g.deck=shuffle(g.pool,random);g.trail=[];g.active=players.map(p=>p.id);g.choices={};g.lastDecisions=[];g.removedHazard=null;g.roundReason=null;g.roundDepartures=[];g.roundLosses=[];
 for(const p of players)p.pocket=0;
 log(g,`第 ${g.round} 轮探险开始，加入 1 张新神器牌。`);reveal(g,players);
}
function start(players,random=Math.random){
 players.forEach(p=>{p.score=0;p.pocket=0;p.artifacts=[];});
 const g={round:0,step:0,pool:baseDeck(),artifactOrder:shuffle([0,1,2,3,4].map(art=>({id:`a${art}`,kind:'artifact',art})),random),deck:[],trail:[],active:[],choices:{},lastDecisions:[],roundHistory:[],rescuedArtifacts:0,log:[],phase:'roundEnd'};
 nextRound(g,players,random);return g;
}
function choose(g,players,playerId,choice,step){
 assert(g.phase==='choosing','当前不在决策步骤');assert(g.step===step,'这一轮选择已揭晓，请根据新牌重新选择');assert(g.active.includes(playerId),'你已经返回营地，请等待下一轮');assert(choice==='continue'||choice==='return','请选择继续探险或返回营地');assert(!Object.hasOwn(g.choices,playerId),'你已经提交选择，请等待其他玩家');
 g.choices[playerId]=choice;
 if(!g.active.every(id=>Object.hasOwn(g.choices,id)))return;
 g.lastDecisions=g.active.map(id=>({playerId:id,choice:g.choices[id]}));const returning=g.active.filter(id=>g.choices[id]==='return');
 if(returning.length){
  const departures=returning.map(id=>{const p=players.find(p=>p.id===id);return {playerId:id,name:p.name,backpack:p.pocket,artifacts:[]};});
  const leftovers=g.trail.filter(c=>c.kind==='treasure').reduce((n,c)=>n+c.leftover,0),share=Math.floor(leftovers/returning.length),rest=leftovers%returning.length;
  g.trail.filter(c=>c.kind==='treasure').forEach(c=>c.leftover=0);const first=g.trail.find(c=>c.kind==='treasure');if(first)first.leftover=rest;
  for(const id of returning){const p=players.find(p=>p.id===id);const secured=p.pocket+share;p.score+=secured;p.pocket=0;log(g,`${p.name} 返回营地，保存 ${secured} 颗宝石（含路上分得 ${share} 颗）。`);}
  if(returning.length===1){const p=players.find(p=>p.id===returning[0]);for(const c of g.trail.filter(c=>c.kind==='artifact'&&!c.claimedBy)){const value=g.rescuedArtifacts<3?5:10;g.rescuedArtifacts++;p.score+=value;p.artifacts.push({id:c.id,art:c.art,value});c.claimedBy=p.id;c.artifactValue=value;remove(g,c.id);log(g,`${p.name} 独自带回神器，价值 ${value} 分。`);}}
  for(const d of departures){d.pathShare=share;d.artifacts=g.trail.filter(c=>c.kind==='artifact'&&c.claimedBy===d.playerId).map(c=>({art:c.art,value:c.artifactValue}));d.total=d.backpack+share+d.artifacts.reduce((n,a)=>n+a.value,0);}
  g.roundDepartures=[...(g.roundDepartures||[]),...departures];event(g,{kind:'return',departures,pathBefore:leftovers,pathLeft:rest});
 }
 g.active=g.active.filter(id=>!returning.includes(id));g.choices={};
 if(!g.active.length){endRound(g,players,'所有玩家安全返回');return;}
 reveal(g,players);
}
function confirmNextRound(g,players,playerId,round){
 assert(g.phase==='roundEnd','当前不在轮次结算阶段');assert(g.round===round,'轮次已经更新，请刷新后确认');assert(players.some(p=>p.id===playerId),'你不在这一桌');
 g.nextRoundConfirmed=g.nextRoundConfirmed||[];
 if(!g.nextRoundConfirmed.includes(playerId))g.nextRoundConfirmed.push(playerId);
 if(players.every(p=>g.nextRoundConfirmed.includes(p.id))){g.nextRoundConfirmed=[];nextRound(g,players);}
}
function publicGame(g,viewerId){const {deck,pool,artifactOrder,choices,...rest}=g;return {...rest,remaining:deck.length,remainingHazards:deck.filter(c=>c.kind==='hazard').length,submitted:Object.keys(choices),ownChoice:choices[viewerId]||null};}
module.exports={TREASURES,HAZARDS,LABELS,baseDeck,start,nextRound,choose,reveal,confirmNextRound,publicGame};
