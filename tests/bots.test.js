const test=require('node:test'),assert=require('node:assert/strict');
const bots=require('../bots'),{createApp}=require('../server');
for(const gameId of ['carcassonne','incangold','song'])for(const level of Object.keys(bots.levels))test(`${gameId}: ${level} robots finish a legal match`,()=>{
 let seed=17;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 const players=Array.from({length:gameId==='incangold'?3:2},(_,i)=>({id:'p'+i,name:'玩家'+i,botLevel:level}));
 const engine=require(gameId==='carcassonne'?'../game':gameId==='incangold'?'../incan':'../song');
 const r={gameId,players,status:'playing',game:engine.start(players,random)};
 for(let steps=0;r.status==='playing'&&steps<5000;steps++){
  const p=players.find(p=>!(r.game.phase==='roundEnd'&&r.game.nextRoundConfirmed?.includes(p.id))&&bots.move(r,p,random));
  assert.ok(p,'there must be an actionable player');bots.apply(r,p,bots.move(r,p,random));
 }
 assert.equal(r.status,'finished');assert.ok(players.every(p=>Number.isFinite(p.score)));
});
test('bot decisions ignore concealed decks and simultaneous choices',()=>{
 const players=[{id:'a',botLevel:'hard',pocket:7},{id:'b',pocket:3}];
 const r={gameId:'incangold',players,game:{phase:'choosing',step:3,active:['a','b'],choices:{b:'return'},trail:[{kind:'hazard',hazard:'fire'}],deck:[{kind:'treasure',value:17}]}};
 const first=bots.move(r,players[0]);r.game.choices.b='continue';r.game.deck=[{kind:'hazard',hazard:'fire'}];assert.deepEqual(bots.move(r,players[0]),first);
});
test('HTTP scheduler submits bot choices and confirms the next expedition',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const token='scheduler-00000000000000000000';
 const request=async(action,extra={})=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/action`,{method:'POST',body:JSON.stringify({action,token,...extra})});const result=await response.json();assert.equal(response.status,200,result.error);return result;};
 try{
  let result=await request('create',{name:'新手',gameId:'incangold',maxPlayers:3,tutorial:true});const code=result.code;
  await request('choose',{code,choice:'return',step:result.room.game.step});
  const deadline=Date.now()+45000;
  do {await new Promise(r=>setTimeout(r,100));result=await request('join',{code});}while(result.room.game.phase!=='roundEnd'&&Date.now()<deadline);
  assert.equal(result.room.game.phase,'roundEnd');
  const round=result.room.game.round;await request('nextRound',{code,round});
  do {await new Promise(r=>setTimeout(r,100));result=await request('join',{code});}while(result.room.game.round===round&&Date.now()<deadline);
  assert.equal(result.room.game.round,round+1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('HTTP bot ownership, capacity, readiness and one-click tutorials',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const request=async(action,extra={},token='human-00000000000000000000')=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/action`,{method:'POST',body:JSON.stringify({action,token,...extra})});return {status:res.status,...await res.json()};};
 try{
  for(const gameId of ['carcassonne','incangold','song']){
   let result=await request('create',{gameId,name:'新手',maxPlayers:gameId==='incangold'?3:2,tutorial:true});
   assert.equal(result.status,200);assert.equal(result.room.status,'playing');assert.equal(result.room.tutorial,true);assert.ok(result.room.players.slice(1).every(p=>p.botLevel==='easy'&&p.ready));
   assert.equal((await request('addBot',{code:result.code,level:'hard'})).status,400);
   await request('leave',{code:result.code});
  }
  let result=await request('create',{name:'房主',maxPlayers:2}),code=result.code;
  assert.equal((await request('addBot',{code,level:'cheat'})).status,400);
  result=await request('addBot',{code,level:'hard'});assert.equal(result.status,200);assert.equal(result.room.players[1].ready,true);assert.equal(result.room.players[1].token,undefined);
  assert.equal((await request('addBot',{code,level:'easy'})).status,400);
  await request('kick',{code,playerId:result.room.players[1].id});
  await request('join',{code,name:'客人'},'guest-00000000000000000000');
  assert.equal((await request('addBot',{code,level:'easy'},'guest-00000000000000000000')).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
