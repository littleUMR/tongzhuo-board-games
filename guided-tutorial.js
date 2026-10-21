const carc=require('./game'),incan=require('./incan'),song=require('./song');
const actions=new Set(['place','finish','choose','nextRound','songMove','lessonNext']);
function tileGame(r,final=false){
 const g=carc.start(r.players);g.board=final?{'0,0':{id:'E',x:0,y:0,rotation:2,meeple:{feature:0,playerId:r.hostId}}}:{'0,0':{id:'A',x:0,y:0,rotation:3}};
 g.turn=0;g.current=final?'E':'U';g.deck=final?[]:['B'];g.phase='tile';g.pending=null;g.legal=carc.placements(g.board,g.current);g.log=[final?'教学快进：最后一块地，完成城市可得4分。':'教学开始：先旋转直路，让道路连起来。'];
 if(final){r.players[0].score=3;r.players[0].meeples=6;r.players[1].score=5;}return g;
}
function expedition(r,returning=false){
 const g=incan.start(r.players);g.round=returning?2:1;g.step=returning?10:0;g.trail=[];g.choices={};g.phase='choosing';g.active=r.players.map(p=>p.id);g.events=[];g.eventSeq=0;g.log=[];g.roundHistory=[];g.roundDepartures=[];g.roundLosses=[];g.nextRoundConfirmed=[];
 g.deck=[{id:'lesson-spider2',kind:'hazard',hazard:'spiders'},{id:'lesson-spider1',kind:'hazard',hazard:'spiders'},{id:'lesson-seven',kind:'treasure',value:7}];
 r.players.forEach(p=>{p.score=0;p.pocket=0;p.artifacts=[];});incan.reveal(g,r.players);
 if(returning)g.trail.push({id:'lesson-artifact',kind:'artifact',art:0,leftover:0});
 return g;
}
function start(r){r.guided={step:0};if(r.gameId==='carcassonne')r.game=tileGame(r);else if(r.gameId==='incangold')r.game=expedition(r);else {r.game=song.start(r.players);r.game.market[0]={...song.SHOPS[0],cardId:'lesson-wheel'};}}
function assert(ok,message){if(!ok)throw Error(message);}
function act(room,p,b){
 const r=structuredClone(room),g=r.game,s=r.guided.step,id=p.id;
 assert(id===r.hostId,'教学由创建者操作');assert(r.status==='playing','教学已经结束');
 if(b.action==='lessonNext')assert(b.lessonStep===s,'教学已更新，请按当前提示操作');
 if(r.gameId==='carcassonne'){
  if(b.action==='place'){
   assert([0,2,4].includes(s),'先读完当前讲解，再继续');
   assert(s===4?b.x===0&&b.y===1&&b.rotation===0:b.y===0&&b.x===(s===0?1:2)&&(s===0?b.rotation%2===1:b.rotation===1),'请按气泡提示旋转并拼到高亮位置');
   carc.place(g,r.players,id,b.x,b.y,b.rotation);r.guided.step=s===0?1:s===2?21:41;
  }else if(b.action==='finish'){
   assert([1,21,41].includes(s),'先放置地块');if(s===1)assert(b.feature===0,'先试着占道路；农夫要等到终局才回来');else if(s===41)assert(b.feature==null,'本次结束回合，结算已占领的城市');
   carc.finishTurn(g,r.players,id,b.feature??null);
   if(s===1){g.turn=0;g.current='A';g.deck=['B'];g.legal=carc.placements(g.board,'A');r.guided.step=2;}
   else if(s===21){r.guided.step=3;g.turn=0;}
   else {r.guided.step=5;r.status='finished';}
  }else {assert(b.action==='lessonNext'&&s===3,'先完成当前棋盘操作');r.game=tileGame(r,true);r.guided.step=4;}
 }else if(r.gameId==='incangold'){
  if(b.action==='choose'){
   assert([0,1,3].includes(s),'请按当前阶段继续');assert(b.choice===(s===3?'return':'continue'),s===3?'这次点返回营地，保住宝石并独享神器':'这次点继续探险，演示危险如何发生');
   incan.choose(g,r.players,id,b.choice,b.step);
   for(const bot of r.players.filter(p=>p.botLevel))if(g.active.includes(bot.id)&&!Object.hasOwn(g.choices,bot.id))incan.choose(g,r.players,bot.id,'continue',g.step);
   if(s===3)for(const bot of r.players.filter(p=>p.botLevel))if(g.active.includes(bot.id))incan.choose(g,r.players,bot.id,'return',g.step);
   r.guided.step=s===0?1:s===1?2:4;
  }else {
   assert(b.action==='nextRound'&&[2,4].includes(s)&&b.round===g.round,'请点击当前轮次的下一轮按钮');
   if(s===2){r.game=expedition(r,true);r.guided.step=3;}
   else {g.round=5;g.phase='finished';g.winners=[id];r.players.forEach((p,i)=>p.score=[8,6,4][i]);g.log.unshift('教学快进到五轮结束：帐篷财富8／6／4，你获胜。');r.status='finished';r.guided.step=5;}
  }
 }else {
  if(b.action==='lessonNext'){
   assert([2,8].includes(s),'先完成当前按钮操作');
   if(s===2){g.turn=0;g.phase='purchase';g.boughtCard=false;g.retiredMenu=false;g.step++;g.players[0].money=8;g.log.unshift('教学快进到新回合：现银8两，试着开发三品菜单。');r.guided.step=3;}
   else {const state=g.players[0];g.turn=0;g.phase='serve';g.step++;state.money=48;state.shops=[{...song.SHOPS[0],built:true},...Array.from({length:7},()=>({...song.SHOPS[3],built:true}))];state.draw=[4,4];g.queue[0]={id:'lesson-final',name:'游学书生',art:'guest-scholar',meals:2,visits:['wheel'],tip:0};r.players[0].score=48;r.players[0].shopCount=8;g.log.unshift('教学快进：已建8铺、现银48两。招待第一位客人，赚4两获胜。');r.guided.step=9;}
  }else {
   const expected={0:'shop',1:'build',3:'menu',4:'purchaseDone',5:'retire',6:'prepareDone',7:'serve',9:'serve'};
   assert(b.action==='songMove'&&b.move===expected[s],'请先完成气泡指向的操作');
   if(s===0||s===1||s===9)assert(b.index===0,'请点击第一张高亮卡牌');
   if(s===3)assert(b.grade===3,'本次开发三品黄金豆腐');if(s===7)assert(b.index===1,'本次选第二位客人，学习等待钱');
   song.act(g,r.players,id,b,()=>0.5);
   r.guided.step={0:1,1:2,3:4,4:5,5:6,6:7,7:8,9:10}[s];
   if(s===4){const state=g.players[0],index=state.draw.indexOf(4);state.discard.push(state.draw.splice(index,1)[0]);g.log.unshift('教学示例：后厨有一张做过的四品菜，可以淘汰。');}
   if(s===6){const draw=g.players[0].draw;draw.splice(draw.indexOf(3),1);draw.splice(draw.indexOf(4),1);draw.push(4,3);g.queue[1]={id:'lesson-scholar',name:'游学书生',art:'guest-scholar',meals:2,visits:['wheel'],tip:1};}
   if(s===9)r.status='finished';
  }
 }
 if(r.gameId==='song')r.players.forEach(p=>{const state=r.game.players.find(v=>v.id===p.id);p.score=state.money;p.shopCount=state.shops.filter(s=>s.built).length;});
 Object.assign(room,r);
}
module.exports={start,act,actions};
