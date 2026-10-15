const test=require('node:test');const assert=require('node:assert/strict');const {createApp}=require('../server');
test('two LAN clients create, prepare, play and reconnect; private deck and tokens stay hidden',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const a='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 const request=async(action,token,extra={})=>{const r=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action,token,...extra})});return {status:r.status,data:await r.json()};};
 try{
  const created=await request('create',a,{name:'房主',title:'测试桌',maxPlayers:2});assert.equal(created.status,200);const code=created.data.code;
  const joined=await request('join',b,{code,name:'朋友'});assert.equal(joined.data.room.players.length,2);assert.equal(JSON.stringify(joined.data).includes(a),false);
  assert.equal((await request('start',a,{code})).status,400);
  await request('ready',b,{code});const started=await request('start',a,{code});assert.equal(started.data.room.status,'playing');assert.equal(started.data.room.game.deck,undefined);
  const legal=started.data.room.game.legal[0];assert.equal((await request('place',b,{code,...legal,rotation:legal.rotations[0]})).status,400);
  const placed=await request('place',a,{code,x:legal.x,y:legal.y,rotation:legal.rotations[0]});assert.equal(placed.data.room.game.phase,'meeple');
  const ended=await request('finish',a,{code,feature:null});assert.equal(ended.data.room.game.turn,1);
  const rejoined=await request('join',a,{code,name:'房主'});assert.equal(rejoined.data.playerId,created.data.playerId);assert.equal(rejoined.data.room.players.length,2);
  assert.equal((await request('leave',a,{code})).status,200);
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/assets/tile-A.png')).headers.get('content-type'),'image/png');
  assert.equal((await fetch(base+'/api/info')).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('room chat broadcasts to members, isolates rooms and preserves game state',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const a='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',c='cccccccc-cccc-cccc-cccc-cccccccccccc';
 const request=async(action,token,extra={})=>{const r=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action,token,...extra})});return {status:r.status,data:await r.json()};};
 const streams=[];
 const watch=async(code,token)=>{const controller=new AbortController();streams.push(controller);const res=await fetch(`${base}/events?room=${code}&token=${token}`,{signal:controller.signal});const reader=res.body.getReader();let pending='';return async()=>{while(!pending.includes('\n\n')){const part=await reader.read();assert.equal(part.done,false);pending+=new TextDecoder().decode(part.value);}const end=pending.indexOf('\n\n'),event=pending.slice(0,end);pending=pending.slice(end+2);return JSON.parse(event.slice(6));};};
 try{
  for(const gameId of ['carcassonne','incangold']){
   const created=await request('create',a,{name:'房主',maxPlayers:3,gameId}),code=created.data.code;
   await request('join',b,{code,name:'朋友'});
   const other=await request('create',c,{name:'另一桌',maxPlayers:3,gameId});
   const member=await watch(code,b),outsider=await watch(code,c),separate=await watch(other.data.code,c);
   await member();await outsider();await separate();
   const text='<img src=x onerror=alert(1)> 大家好';
   const sent=await request('chat',a,{code,text:'  '+text+'  ',name:'冒充朋友'});assert.equal(sent.status,200);assert.equal(sent.data.room.chat[0].name,'房主');assert.equal(sent.data.room.chat[0].text,text);
   assert.equal((await member()).room.chat[0].text,text);assert.deepEqual((await outsider()).room.chat,[]);assert.deepEqual((await separate()).room.chat,[]);
   for(const text of ['', '   ', '字'.repeat(301),null])assert.equal((await request('chat',a,{code,text})).status,400);
   assert.equal((await request('chat',c,{code,text:'串房间'})).status,400);
   if(gameId==='incangold'){const d='dddddddd-dddd-dddd-dddd-dddddddddddd';await request('join',d,{code,name:'第三位'});await request('ready',d,{code});}await request('ready',b,{code});await request('start',a,{code});const before=(await request('join',b,{code})).data.room.game;
   const playing=await request('chat',b,{code,text:'边玩边聊'});assert.equal(playing.status,200);assert.deepEqual(playing.data.room.game,before);
   const reconnect=await request('join',b,{code});assert.equal(reconnect.data.room.chat.length,2);
   for(let i=0;i<100;i++)await request('chat',a,{code,text:`消息 ${i}`});
   const history=await request('join',a,{code});assert.equal(history.data.room.chat.length,100);assert.equal(history.data.room.chat[0].text,'消息 0');assert.equal(history.data.room.chat.at(-1).text,'消息 99');assert.equal(JSON.stringify(history.data.room.chat).includes(a),false);
  }
 }finally{streams.forEach(c=>c.abort());server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('new players can join finished games without changing results and can play the rematch',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const tokens=['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc','dddddddd-dddd-dddd-dddd-dddddddddddd','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'];
 const request=async(action,token,extra={})=>{const r=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action,token,...extra})});return {status:r.status,data:await r.json()};};
 try{for(const gameId of ['carcassonne','incangold']){
  const count=gameId==='incangold'?3:2;const created=await request('create',tokens[0],{gameId,name:'房主',maxPlayers:count+1});const code=created.data.code;
  for(let i=1;i<count;i++){await request('join',tokens[i],{code,name:`玩家${i}`});await request('ready',tokens[i],{code});}
  const started=await request('start',tokens[0],{code});assert.equal(started.status,200,started.data.error);let room=started.data.room;
  assert.equal((await request('join',tokens[count],{code,name:'新朋友'})).status,400);
  let steps=0;while(room.status==='playing'){
   assert.ok(++steps<200);
   if(gameId==='carcassonne'){
    const token=tokens[room.game.turn],legal=room.game.legal[0];const placed=await request('place',token,{code,x:legal.x,y:legal.y,rotation:legal.rotations[0]});assert.equal(placed.status,200,placed.data.error);const finished=await request('finish',token,{code});assert.equal(finished.status,200,finished.data.error);room=finished.data.room;
   }else if(room.game.phase==='roundEnd'){const round=room.game.round;for(let i=0;i<count;i++)room=(await request('nextRound',tokens[i],{code,round})).data.room;}
   else{const step=room.game.step;for(let i=0;i<count;i++){const chosen=await request('choose',tokens[i],{code,choice:'return',step});assert.equal(chosen.status,200,chosen.data.error);room=chosen.data.room;}}
  }
  assert.equal(room.results.length,count);const results=room.results,game=room.game;
  const joined=await request('join',tokens[count],{code,name:'新朋友'});assert.equal(joined.status,200);assert.equal(joined.data.room.status,'finished');assert.equal(joined.data.room.players.length,count+1);assert.deepEqual(joined.data.room.results,results);assert.deepEqual(joined.data.room.game,game);assert.equal(JSON.stringify(results).includes(tokens[0]),false);
  assert.equal((await request('join',tokens[count+1],{code,name:'满员'})).status,400);
  assert.equal((await request('chat',tokens[count],{code,text:'下一局一起玩'})).status,200);
  const rematch=await request('rematch',tokens[0],{code});assert.equal(rematch.data.room.results,undefined);assert.equal(rematch.data.room.status,'waiting');
  for(let i=1;i<=count;i++)await request('ready',tokens[i],{code});assert.equal((await request('start',tokens[0],{code})).data.room.players.length,count+1);
 }}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('screenshots are shared only with room members, survive reconnect and expire with chat history',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,a=crypto.randomUUID(),b=crypto.randomUUID(),c=crypto.randomUUID();
 const request=async(action,token,extra={})=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action,token,...extra})});assert.equal(res.status,200);return res.json();};
 try{
  const {code}=await request('create',a,{name:'截图房主',maxPlayers:2});await request('join',b,{code,name:'朋友'});const other=await request('create',c,{name:'另一桌',maxPlayers:2});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8ioAAAAASUVORK5CYII=','base64');
  const upload=(token,body)=>fetch(`${base}/api/chat-image?room=${code}`,{method:'POST',headers:{'X-Player-Token':token,'Content-Type':'image/png'},duplex:'half',body:(async function*(){for(let i=0;i<body.length;i+=65536)yield body.subarray(i,i+65536);})()});
  assert.equal((await upload(c,png)).status,400);assert.equal((await upload(a,Buffer.from('<svg></svg>'))).status,400);assert.equal((await upload(a,Buffer.alloc(5*1024*1024+1))).status,400);
  assert.equal((await upload(a,png)).status,200);const joined=await request('join',b,{code}),id=joined.room.chat[0].image;assert.ok(id.endsWith('.png'));
  const image=(room,token)=>fetch(`${base}/api/chat-image?room=${room}&id=${id}`,{headers:{'X-Player-Token':token}});
  const res=await image(code,b);assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await res.arrayBuffer()),png);
  assert.equal((await image(code,c)).status,400);assert.equal((await image(other.code,c)).status,400);
  for(let i=0;i<100;i++)await request('chat',a,{code,text:'聊天 '+i});assert.equal((await image(code,b)).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('quoted replies use original room messages and keep a snapshot after history expires',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,a=crypto.randomUUID(),b=crypto.randomUUID();
 const request=async(action,token,extra={})=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action,token,...extra})});return {status:res.status,data:await res.json()};};
 try{
  const {data:{code}}=await request('create',a,{name:'原作者',maxPlayers:2});await request('join',b,{code,name:'回复者'});
  const original=(await request('chat',a,{code,text:'这一步怎么走？'})).data.room.chat[0];
  const reply=(await request('chat',b,{code,text:'可以向左旋转',replyTo:original.id,reply:{name:'伪造',text:'伪造'}})).data.room.chat.at(-1);assert.deepEqual(reply.reply,{id:original.id,name:'原作者',text:original.text});
  const other=(await request('create',a,{name:'另一桌',maxPlayers:2})).data.code;assert.equal((await request('chat',a,{code:other,text:'串房引用',replyTo:original.id})).status,400);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8ioAAAAASUVORK5CYII=','base64');
  const upload=await fetch(`${base}/api/chat-image?room=${code}`,{method:'POST',headers:{'X-Player-Token':b,'X-Reply-To':original.id},body:png});assert.equal(upload.status,200);
  let room=(await request('join',a,{code})).data.room;assert.equal(room.chat.at(-1).reply.text,original.text);const imageMessage=room.chat.at(-1);
  room=(await request('chat',a,{code,text:'截图收到了',replyTo:imageMessage.id})).data.room;assert.equal(room.chat.at(-1).reply.text,'[截图]');
  for(let i=0;i<97;i++)room=(await request('chat',a,{code,text:'后续 '+i})).data.room;
  assert.equal(room.chat.some(m=>m.id===original.id),false);assert.equal(room.chat.find(m=>m.id===reply.id).reply.text,original.text);
  assert.equal((await request('chat',b,{code,text:'过期引用',replyTo:original.id})).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('@ mentions identify only current room players and preserve exact names',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,tokens=Array.from({length:4},()=>crypto.randomUUID());
 const request=async(action,token,extra={})=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action,token,...extra})});assert.equal(res.status,200);return res.json();};
 try{
  const {code}=await request('create',tokens[0],{name:'房主',maxPlayers:4});const b=await request('join',tokens[1],{code,name:'小明'}),c=await request('join',tokens[2],{code,name:'A+B [1]'});
  const other=await request('create',tokens[3],{name:'外房玩家',maxPlayers:2});
  let sent=await request('chat',tokens[0],{code,text:'@小明 @A+B [1] 看看截图 @外房玩家',mentions:[{id:other.playerId,name:'外房玩家'}]});assert.deepEqual(sent.room.chat.at(-1).mentions,[{id:b.playerId,name:'小明'},{id:c.playerId,name:'A+B [1]'}]);
  sent=await request('chat',tokens[0],{code,text:'@小明同学 不是同一个名字'});assert.deepEqual(sent.room.chat.at(-1).mentions,[]);
  sent=await request('chat',tokens[0],{code,text:'@小明，轮到你了 @小明！'});assert.equal(sent.room.chat.at(-1).mentions.length,1);
  const original=sent.room.chat.at(-1);sent=await request('chat',tokens[2],{code,text:'收到',replyTo:original.id});assert.deepEqual(sent.room.chat.at(-1).mentions,[]);
  await request('leave',tokens[1],{code});await request('chatLeave',tokens[1],{code});sent=await request('chat',tokens[0],{code,text:'@小明'});assert.deepEqual(sent.room.chat.at(-1).mentions,[]);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('custom stickers support GIF, private libraries, reuse and removal without breaking sent messages',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,a=crypto.randomUUID(),b=crypto.randomUUID();
 const action=async(token,extra)=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({token,...extra})});return {status:res.status,data:await res.json()};};
 const sticker=async(method,token,body,id='')=>fetch(base+'/api/stickers'+(id?'?id='+id:''),{method,headers:{'X-Player-Token':token},...(body?{body}: {})});
 try{
  const {data:{code}}=await action(a,{action:'create',name:'收藏者',maxPlayers:2});await action(b,{action:'join',code,name:'朋友'});
  const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');const uploaded=await sticker('POST',a,gif);assert.equal(uploaded.status,200);const {id}=await uploaded.json();assert.ok(id.endsWith('.gif'));
  assert.equal((await (await sticker('GET',a)).json()).stickers.length,1);assert.equal((await (await sticker('GET',b)).json()).stickers.length,0);assert.equal((await sticker('GET',b,null,id)).status,400);
  assert.equal((await action(b,{action:'sticker',code,stickerId:id})).status,400);
  const sent=await action(a,{action:'sticker',code,stickerId:id});assert.equal(sent.status,200);const image=sent.data.room.chat.at(-1).image;assert.notEqual(image,id);
  assert.equal((await sticker('DELETE',b,null,id)).status,400);assert.equal((await sticker('DELETE',a,null,id)).status,200);
  const res=await fetch(`${base}/api/chat-image?room=${code}&id=${image}`,{headers:{'X-Player-Token':b}});assert.equal(res.headers.get('content-type'),'image/gif');assert.deepEqual(Buffer.from(await res.arrayBuffer()),gif);
  assert.equal((await sticker('POST',a,Buffer.from('<svg/>'))).status,400);assert.equal((await action(a,{action:'sticker',code,stickerId:id})).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('default Umaru GIF stickers are available to every player without personal uploads',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,a=crypto.randomUUID(),b=crypto.randomUUID();
 const action=async(token,extra)=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({token,...extra})});assert.equal(res.status,200);return res.json();};
 try{
  const {code}=await action(a,{action:'create',name:'默认表情测试',maxPlayers:2});await action(b,{action:'join',code,name:'朋友'});
  const library=await fetch(base+'/api/stickers',{headers:{'X-Player-Token':b}}).then(r=>r.json());assert.equal(library.defaults.length,6);assert.equal(library.stickers.length,0);
  for(const item of library.defaults){
   const staticRes=await fetch(`${base}/assets/umaru-gifs/${item.file}`);assert.equal(staticRes.headers.get('content-type'),'image/gif');const bytes=Buffer.from(await staticRes.arrayBuffer());assert.equal(bytes.subarray(0,6).toString(),'GIF89a');assert.equal(bytes.readUInt16LE(6),256);assert.equal(bytes.readUInt16LE(8),256);
   const sent=await action(b,{action:'sticker',code,stickerId:item.id});const message=sent.room.chat.at(-1);assert.equal(message.sticker,true);
   const received=await fetch(`${base}/api/chat-image?room=${code}&id=${message.image}`,{headers:{'X-Player-Token':a}});assert.equal(received.headers.get('content-type'),'image/gif');assert.deepEqual(Buffer.from(await received.arrayBuffer()),bytes);
  }
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('images and GIF stickers carry text and mentions in one message while keeping original bytes',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,a=crypto.randomUUID(),b=crypto.randomUUID();
 const action=async(token,extra)=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({token,...extra})});return {status:res.status,data:await res.json()};};
 try{
  const {data:{code}}=await action(a,{action:'create',name:'房主',maxPlayers:2});const friend=await action(b,{action:'join',code,name:'朋友'});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8ioAAAAASUVORK5CYII=','base64'),caption='@朋友 这张图看看 <文字> 😊';
  const upload=text=>fetch(`${base}/api/chat-image?room=${code}`,{method:'POST',headers:{'X-Player-Token':a,'X-Chat-Text':encodeURIComponent(text)},body:png});
  assert.equal((await upload(caption)).status,200);let room=(await action(b,{action:'join',code})).data.room;assert.equal(room.chat.length,1);assert.equal(room.chat[0].text,caption);assert.equal(room.chat[0].mentions[0].id,friend.data.playerId);
  const res=await fetch(`${base}/api/chat-image?room=${code}&id=${room.chat[0].image}`,{headers:{'X-Player-Token':b}});assert.deepEqual(Buffer.from(await res.arrayBuffer()),png);
  assert.equal((await upload('字'.repeat(301))).status,400);
  const sent=await action(a,{action:'sticker',code,stickerId:'umaru-laugh',text:'@朋友 哈哈，运气不错！'});assert.equal(sent.status,200);assert.equal(sent.data.room.chat.length,2);assert.equal(sent.data.room.chat.at(-1).text,'@朋友 哈哈，运气不错！');assert.equal(sent.data.room.chat.at(-1).mentions[0].id,friend.data.playerId);
  assert.equal((await action(a,{action:'sticker',code,stickerId:'umaru-laugh',text:'字'.repeat(301)})).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('placing with no followers automatically finishes the turn and final scoring',async()=>{
 const engine=require('../game'),originalStart=engine.start;
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,a=crypto.randomUUID(),b=crypto.randomUUID();
 const action=async(token,extra)=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({token,...extra})});return {status:res.status,data:await res.json()};};
 try{for(const finalTurn of [false,true]){
  // Set up the exhausted supply state without depending on a random full game.
  engine.start=players=>{const game=originalStart(players,()=>.5);players[0].meeples=0;if(finalTurn)game.deck=[];return game;};
  const {data:{code,playerId}}=await action(a,{action:'create',name:'无随从',maxPlayers:2});await action(b,{action:'join',code,name:'朋友'});await action(b,{action:'ready',code});const started=(await action(a,{action:'start',code})).data.room;
  const legal=started.game.legal[0];const placed=await action(a,{action:'place',code,x:legal.x,y:legal.y,rotation:legal.rotations[0]});assert.equal(placed.status,200);assert.equal(placed.data.skippedMeeple,true);assert.equal(placed.data.room.game.pending,null);assert.equal(placed.data.room.game.moves,1);assert.equal(placed.data.room.game.turn,1);assert.equal(placed.data.room.game.lastPlacement.playerId,playerId);assert.equal(placed.data.room.status,finalTurn?'finished':'playing');assert.equal(placed.data.room.game.phase,finalTurn?'finished':'tile');
  assert.equal((await action(a,{action:'finish',code})).status,400);
  if(!finalTurn){const next=placed.data.room.game.legal[0];const normal=await action(b,{action:'place',code,x:next.x,y:next.y,rotation:next.rotations[0]});assert.equal(normal.data.skippedMeeple,undefined);assert.equal(normal.data.room.game.phase,'meeple');}
 }}finally{engine.start=originalStart;server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('chat survives game departure and room deletion; chat departure does not remove game seats',async()=>{
 const server=createApp({persist:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,a=crypto.randomUUID(),b=crypto.randomUUID(),outsider=crypto.randomUUID();
 const action=async(token,extra)=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({token,...extra})});return {status:res.status,data:await res.json()};};
 const controller=new AbortController();
 try{
  const {data:{code}}=await action(a,{action:'create',name:'甲',maxPlayers:2});await action(b,{action:'join',code,name:'乙'});await action(a,{action:'chat',code,text:'旧消息'});
  const stream=await fetch(`${base}/chat-events?room=${code}&token=${b}`,{signal:controller.signal}),reader=stream.body.getReader();const first=new TextDecoder().decode((await reader.read()).value);assert.ok(first.includes('旧消息'));assert.equal(first.includes(a),false);
  assert.equal((await action(a,{action:'leave',code})).data.room,null);assert.equal((await action(a,{action:'chat',code,text:'退出游戏后仍能说话'})).status,200);
  await action(b,{action:'leave',code});assert.equal((await fetch(base+'/api/info').then(r=>r.json())).rooms.length,0);
  const reconnect=await action(a,{action:'chatJoin',code});assert.equal(reconnect.status,200);assert.equal(reconnect.data.chat.chat.length,2);assert.equal(reconnect.data.chat.players.length,2);assert.equal(reconnect.data.room,null);
  assert.equal((await action(a,{action:'sticker',code,stickerId:'umaru-hello',text:'游戏没人了，聊天还在'})).status,200);assert.equal((await action(outsider,{action:'chat',code,text:'越权'})).status,400);
  await action(a,{action:'chatLeave',code});assert.equal((await action(a,{action:'chat',code,text:'已退出聊天'})).status,400);await action(b,{action:'chatLeave',code});assert.equal((await action(b,{action:'chatJoin',code})).status,400);
  const newRoom=(await action(a,{action:'create',name:'甲',maxPlayers:2})).data.code;await action(b,{action:'join',code:newRoom,name:'乙'});await action(a,{action:'chatLeave',code:newRoom});const seats=await action(b,{action:'join',code:newRoom});assert.equal(seats.data.room.players.length,2);assert.equal((await action(a,{action:'chatJoin',code:newRoom})).status,200);
 }finally{controller.abort();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
