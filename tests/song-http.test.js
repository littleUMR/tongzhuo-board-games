const {test}=require('node:test'),assert=require('node:assert/strict'),{createApp}=require('../server');
test('宋商HTTP联机：大厅、切换、四人开局、观战隐私、刷新、终局与重开',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`,tokens=Array.from({length:5},(_,i)=>`song-http-player-${i}-0000000000000000`);
 const call=async(action,i,extra={})=>{const response=await fetch(url+'/api/action',{method:'POST',body:JSON.stringify({action,token:tokens[i],...extra})});return {status:response.status,data:await response.json()};};
 try{
  assert.ok((await fetch(url+'/games.json').then(r=>r.json())).song);for(const asset of ['/song-ui.js','/song.css','/assets/song/cover.png','/assets/song/shop-wheel.png'])assert.equal((await fetch(url+asset)).status,200);
  let result=await call('create',0,{gameId:'song',name:'宋商甲',maxPlayers:4}),code=result.data.code;
  for(let i=1;i<4;i++){await call('join',i,{code,name:'宋商'+i});await call('ready',i,{code});}
  result=await call('start',0,{code});assert.equal(result.status,200);let room=result.data.room;
  const watch=await call('watch',4,{code,name:'看客'});assert.ok(watch.data.room.game.players.every(p=>Array.isArray(p.discard)&&Array.isArray(p.menuDraw)&&p.draw===undefined));assert.equal(watch.data.room.game.shopDeck,undefined);
  assert.equal((await call('songMove',4,{code,move:'purchaseDone',step:room.game.step})).status,400);
  const rejoin=await call('join',0,{code});assert.equal(rejoin.data.room.game.step,room.game.step);assert.equal((await call('choose',0,{code,choice:'return',step:1})).status,400);
  let turns=0;
  const move=async(i,move,extra={})=>{const r=await call('songMove',i,{code,move,step:room.game.step,...extra});assert.equal(r.status,200,JSON.stringify(r.data));room=r.data.room;};
  while(room.status!=='finished'&&turns++<600){
   const i=room.game.turn;room=(await call('join',i,{code})).data.room;let p=room.game.players[i];
   if(p.shops.length<8){const clearing=p.shops.length===0?0:p.shops.length+1,index=room.game.market.findIndex(s=>p.money>=clearing+s.cost);if(index>=0)await move(i,'shop',{index});}
   p=room.game.players[i];for(let j=0;j<p.shops.length;j++){if(!p.shops[j].built&&room.game.players[i].money>=p.shops[j].cost)await move(i,'build',{index:j});}
   if(room.status==='finished')break;await move(i,'purchaseDone');await move(i,'prepareDone');let best=0;const shops=room.game.players[i].shops.filter(s=>s.built),cash=room.game.players[i].money;
   const worth=c=>c.meals+shops.filter(s=>c.visits.includes(s.id)).reduce((n,s)=>n+(s.income==='buildings'?shops.length:s.income==='die'?3.5:s.income),0);
   for(let j=1;j<4&&j<=cash;j++)if(worth(room.game.queue[j])-j>worth(room.game.queue[best])-best)best=j;
   await move(i,'serve',{index:best});while(room.game.phase==='roll')await move(i,'roll');
  }
  assert.equal(room.status,'finished');assert.equal(room.game.winners.length,1);assert.equal(room.coinResults.length,4);assert.equal(room.results.length,4);
  assert.equal((await fetch(url+'/api/history?room='+code).then(r=>r.json())).matches.length,1);
  result=await call('rematch',0,{code});assert.equal(result.data.room.status,'waiting');assert.equal(result.data.room.gameId,'song');assert.equal(result.data.room.game,null);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
