const test=require('node:test'),assert=require('node:assert/strict'),{createApp}=require('../server');
test('host game selection resets readiness; 8-player Incan Gold commitments, privacy and five-round rematch work over HTTP',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const tokens=Array.from({length:8},(_,i)=>`testplayer-${i}-000000000000000000000000`);
 const request=async(action,i,extra={})=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action,token:tokens[i],...extra})});return {status:res.status,data:await res.json()};};
 try{
  assert.equal((await request('create',0,{name:'房主',gameId:'__proto__',maxPlayers:3})).status,400);
  let result=await request('create',0,{name:'房主',gameId:'carcassonne',maxPlayers:5}),code=result.data.code;
  await request('join',1,{code,name:'玩家1'});await request('ready',1,{code});assert.equal((await request('selectGame',1,{code,gameId:'incangold'})).status,400);
  result=await request('selectGame',0,{code,gameId:'incangold'});assert.equal(result.data.room.maxPlayers,8);assert.equal(result.data.room.players[1].ready,false);assert.equal((await request('start',0,{code})).status,400);
  for(let i=2;i<8;i++)assert.equal((await request('join',i,{code,name:`玩家${i}`})).status,200);
  assert.equal((await request('selectGame',0,{code,gameId:'carcassonne'})).status,400);
  for(let i=1;i<8;i++)await request('ready',i,{code});result=await request('start',0,{code});assert.equal(result.data.room.game.round,1);assert.equal(result.data.room.game.trail.length,1);
  const step=result.data.room.game.step;result=await request('choose',0,{code,choice:'return',step});assert.equal(result.data.room.game.ownChoice,'return');
  const reconnect=await request('join',1,{code});assert.equal(reconnect.data.room.game.ownChoice,null);assert.equal(reconnect.data.room.game.choices,undefined);assert.equal(reconnect.data.room.game.pool,undefined);assert.equal(reconnect.data.room.players[0].score,null);assert.equal(reconnect.data.room.players[1].score,0);
  assert.equal((await request('choose',0,{code,choice:'continue',step})).status,400);
  for(let i=1;i<8;i++)result=await request('choose',i,{code,choice:'return',step});assert.equal(result.data.room.game.phase,'roundEnd');
  assert.equal((await request('nextRound',1,{code,round:0})).status,400);assert.equal((await request('place',0,{code,x:0,y:0,rotation:0})).status,400);
  for(let round=2;round<=5;round++){for(let i=0;i<8;i++){result=await request('nextRound',i,{code,round:round-1});assert.equal(result.status,200);if(i<7){assert.equal(result.data.room.game.round,round-1);assert.equal(result.data.room.game.phase,'roundEnd');}}const step=result.data.room.game.step;for(let i=0;i<8;i++)result=await request('choose',i,{code,choice:'return',step});}
  assert.equal(result.data.room.status,'finished');assert.equal(result.data.room.game.round,5);assert.ok(result.data.room.players.every(p=>typeof p.score==='number'));assert.equal(result.data.room.results.length,8);
  const final=result.data.room.results;await request('leave',7,{code});const newcomer=await request('join',7,{code,name:'新来的人'});assert.deepEqual(newcomer.data.room.results,final);
  result=await request('rematch',0,{code});assert.equal(result.data.room.status,'waiting');assert.equal(result.data.room.gameId,'incangold');assert.equal(result.data.room.results,undefined);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
