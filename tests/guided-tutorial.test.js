const test=require('node:test'),assert=require('node:assert/strict'),guided=require('../guided-tutorial'),{createApp}=require('../server');
function room(gameId){const r={gameId,hostId:'learner',status:'playing',players:Array.from({length:gameId==='incangold'?3:2},(_,i)=>({id:i?'bot'+i:'learner',name:i?'陪练':'新手',...(i?{botLevel:'easy'}:{})}))};guided.start(r);return r;}
function move(r,b){guided.act(r,r.players[0],b);}
function songMove(r,type,index){move(r,{action:'songMove',move:type,index,grade:index,step:r.game.step});}
test('real Carcassonne teaching plays rotation, follower, completed road, final city and victory',()=>{
 const r=room('carcassonne'),before=structuredClone(r);
 assert.throws(()=>move(r,{action:'place',x:1,y:0,rotation:0}),/旋转/);assert.deepEqual(r,before);
 move(r,{action:'place',x:1,y:0,rotation:1});assert.equal(r.game.phase,'meeple');
 assert.throws(()=>move(r,{action:'finish',feature:1}),/道路/);
 move(r,{action:'finish',feature:0});assert.equal(r.players[0].meeples,6);
 move(r,{action:'place',x:2,y:0,rotation:1});move(r,{action:'finish',feature:2});
 assert.equal(r.players[0].score,3);assert.equal(r.players[0].meeples,6);assert.equal(r.game.board['2,0'].meeple.feature,2);assert.equal(r.game.board['1,0'].meeple,undefined);assert.equal(r.guided.step,3);
 move(r,{action:'lessonNext',lessonStep:3});assert.throws(()=>move(r,{action:'lessonNext',lessonStep:3}),/更新/);
 move(r,{action:'place',x:0,y:1,rotation:0});move(r,{action:'finish',feature:null});
 assert.equal(r.players[0].score,7);assert.equal(r.players[1].score,5);assert.equal(r.status,'finished');
});
test('real Incan teaching shows repeat hazard, saves 8 with solo artifact and skips to fifth-round victory',()=>{
 const r=room('incangold');assert.equal(r.players[0].pocket,2);assert.equal(r.game.trail[0].leftover,1);
 for(let i=0;i<2;i++)move(r,{action:'choose',choice:'continue',step:r.game.step});
 assert.equal(r.players[0].pocket,0);assert.equal(r.game.phase,'roundEnd');
 move(r,{action:'nextRound',round:1});move(r,{action:'choose',choice:'return',step:r.game.step});
 assert.equal(r.players[0].score,8);assert.equal(r.players[0].artifacts.length,1);assert.equal(r.game.phase,'roundEnd');
 move(r,{action:'nextRound',round:2});assert.equal(r.game.round,5);assert.equal(r.status,'finished');assert.deepEqual(r.game.winners,['learner']);
});
test('real Song teaching buys, builds, develops, retires, serves and reaches eight shops and 52',()=>{
 const r=room('song');songMove(r,'shop',0);assert.equal(r.game.players[0].shops[0].built,false);
 songMove(r,'build',0);assert.equal(r.game.players[0].money,0);
 move(r,{action:'lessonNext',lessonStep:2});songMove(r,'menu',3);assert.equal(r.game.players[0].discard.at(-1),3);
 songMove(r,'purchaseDone');songMove(r,'retire',r.game.players[0].discard.indexOf(4));assert.equal(r.game.players[0].money,2);
 songMove(r,'prepareDone');songMove(r,'serve',1);assert.equal(r.game.lastSettlement.total,6);assert.equal(r.game.players[0].money,7);
 move(r,{action:'lessonNext',lessonStep:8});songMove(r,'serve',0);assert.equal(r.game.players[0].money,52);assert.equal(r.players[0].shopCount,8);assert.equal(r.status,'finished');
});
test('HTTP guided rooms use real actions, hide tokens, enforce identity and do not auto-play teaching stages',async()=>{
 const server=createApp({persist:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`,token='guided-000000000000000000000';
 const act=async(action,extra={})=>{const response=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action,token,...extra})});return {status:response.status,...await response.json()};};
 try{let result=await act('create',{name:'新手',gameId:'song',maxPlayers:4,tutorial:true,guided:true});const code=result.code;assert.equal(result.room.guided.step,0);assert.equal(result.room.players[1].token,undefined);
  result=await act('songMove',{code,move:'shop',index:0,step:result.room.game.step});assert.equal(result.status,200);assert.equal(result.room.guided.step,1);
  await new Promise(resolve=>setTimeout(resolve,1100));result=await act('join',{code});assert.equal(result.room.guided.step,1);
  const response=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action:'lessonNext',token:'outsider-0000000000000000000',code,lessonStep:1})});assert.equal(response.status,400);
  assert.equal((await act('kick',{code,playerId:result.room.players[1].id})).status,400);
  const play=async(move,index)=>{result=await act('songMove',{code,move,index,grade:index,step:result.room.game.step});assert.equal(result.status,200,result.error);};
  await play('build',0);result=await act('lessonNext',{code,lessonStep:2});await play('menu',3);await play('purchaseDone');await play('retire',result.room.game.players[0].discard.indexOf(4));await play('prepareDone');await play('serve',1);
  result=await act('lessonNext',{code,lessonStep:8});await play('serve',0);assert.equal(result.room.status,'finished');assert.deepEqual(result.room.coinResults,[]);assert.equal(result.wallet.coins,0);
  result=await act('rematch',{code});assert.equal(result.status,200);assert.equal(result.room.status,'playing');assert.equal(result.room.guided.step,0);assert.equal(result.room.game.players[0].money,5);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
