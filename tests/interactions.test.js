const test=require('node:test'),assert=require('node:assert/strict'),{createInteractions,anchor}=require('../interactions'),{createApp}=require('../server');
const {pickSlice}=require('../public/vendor/table-interactions/wheel-geometry');
function fixture(){return {code:'DEMO',gameId:'carcassonne',matchId:'match',players:[{id:'a',token:'a-token',name:'<甲>'},{id:'b',token:'b-token',name:'乙'}],spectators:[{id:'s',token:'s-token',name:'观众'}],game:{board:{'0,0':{}},log:[]}};}
test('MIT wheel geometry selects all eight directions and keeps a centre cancel zone',()=>{
 assert.equal(pickSlice(0,0),-1);assert.equal(pickSlice(23,0),-1);
 for(let i=0;i<8;i++){const angle=(-90+i*45)*Math.PI/180;assert.equal(pickSlice(Math.cos(angle)*90,Math.sin(angle)*90),i);}
});
test('interactions derive identity, validate kinds/targets, enforce cooldowns and never mutate game state',()=>{
 const rawMake=createInteractions(),make=(r,token,b,now)=>rawMake(r,token,{gameId:r.gameId,matchId:r.matchId||null,...b},now),r=fixture(),before=structuredClone(r),at={space:'tile',x:.5,y:.5};
 const packet=make(r,'a-token',{kind:'question',at,from:{name:'forged'}},10000);
 assert.deepEqual(packet.from,{id:'a',name:'<甲>'});assert.equal(packet.expiresAt-packet.createdAt,4000);assert.ok(!JSON.stringify(packet).includes('token'));assert.deepEqual(r,before);
 assert.throws(()=>make(r,'b-token',{kind:'question',at,matchId:'old-match'}),/更新/);
 assert.throws(()=>make(r,'outsider',{kind:'question',at}),/加入/);
 assert.throws(()=>make(r,'b-token',{kind:'<script>',at}),/未知/);
 assert.throws(()=>make(r,'b-token',{kind:'tomato',at}),/玩家/);
 assert.throws(()=>make(r,'b-token',{kind:'rose',at:{space:'player',id:'left'}}),/离开/);
 assert.throws(()=>make(r,'b-token',{kind:'question',at:{space:'tile',x:Infinity,y:0}}),/坐标/);
 assert.throws(()=>make(r,'b-token',{kind:'arrow',at}),/位置或玩家/);
 assert.throws(()=>make(r,'a-token',{kind:'question',at},10200),e=>e.status===429);
 for(let i=1;i<6;i++)make(r,'a-token',{kind:'question',at},10000+i*700);
 assert.throws(()=>make(r,'a-token',{kind:'question',at},15000),e=>e.status===429);
 assert.equal(make(r,'a-token',{kind:'rose',at:{space:'player',id:'b'}},21000).kind,'rose');
 assert.equal(make(r,'s-token',{kind:'tomato',at:{space:'player',id:'a'}},21000).from.id,'s');
 assert.equal(make(r,'b-token',{kind:'arrow',at,to:{space:'tile',x:2,y:0}},21000).to.x,2);assert.deepEqual(r,before);
});
test('card anchors use stable card identities, reject stale rounds, and reject hidden/arbitrary targets',()=>{
 const r=fixture();r.gameId='incangold';r.game={round:2,trail:[{},{}]};
 assert.equal(anchor(r,{space:'card',key:'incan:2:1',u:.5,v:.5}).key,'incan:2:1');
 assert.throws(()=>anchor(r,{space:'card',key:'incan:1:1',u:.5,v:.5}),/更新/);
 r.gameId='song';r.game={queue:[{id:'g'}],market:[{cardId:'m'}],players:[{id:'a',shops:[{cardId:'s'}]}]};
 for(const key of ['guest:g','market:m','menu:3','shop:a:s'])assert.equal(anchor(r,{space:'card',key,u:0,v:1}).key,key);
 assert.throws(()=>anchor(r,{space:'card',key:'draw:a:0',u:.5,v:.5}),/更新/);
 assert.throws(()=>anchor(r,{space:'card',key:'guest:g',u:2,v:0}),/无效/);
});
test('HTTP SSE delivers only to the same room members, echoes once, does not replay and leaves play state intact',async()=>{
 const server=createApp({persist:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 let currentMatch;const tokens=['interact-a-000000000000000','interact-b-000000000000000','interact-s-000000000000000','interact-x-000000000000000'],controllers=[];
 const act=async(action,i,extra={})=>{const res=await fetch(base+'/api/action',{method:'POST',body:JSON.stringify({action,token:tokens[i],name:'玩家'+i,maxPlayers:2,...extra})});const data=await res.json();assert.equal(res.status,200,data.error);return data;};
 const stream=async(code,i)=>{const c=new AbortController();controllers.push(c);const res=await fetch(base+`/events?room=${code}&token=${tokens[i]}`,{signal:c.signal}),reader=res.body.getReader();const first=await reader.read();assert.ok(!new TextDecoder().decode(first.value).includes('event: interaction'));return reader;};
 const post=async(i,body)=>{const res=await fetch(base+'/api/interaction',{method:'POST',headers:{'X-Player-Token':tokens[i]},body:JSON.stringify({gameId:'carcassonne',matchId:currentMatch,...body})});return {status:res.status,...await res.json()};};
 try{
  const a=await act('create',0),code=a.code;const b=await act('join',1,{code});await act('watch',2,{code});await act('ready',1,{code});const start=await act('start',0,{code});currentMatch=start.room.matchId;const other=await act('create',3);
  const streams=await Promise.all([stream(code,0),stream(code,1),stream(code,2),stream(code,3),stream(other.code,3)]);
  assert.equal((await post(3,{code,kind:'question',at:{space:'tile',x:0,y:0}})).status,400);
  const result=await post(0,{code,kind:'tomato',at:{space:'player',id:b.playerId}});assert.equal(result.status,200);
  for(const reader of streams.slice(0,3)){const text=new TextDecoder().decode((await reader.read()).value);assert.equal((text.match(/event: interaction/g)||[]).length,1);const event=JSON.parse(text.split('data: ')[1]);assert.equal(event.id,result.id);assert.equal(event.from.id,a.playerId);assert.equal(event.at.id,b.playerId);}
  for(const reader of streams.slice(3)){const state=await Promise.race([reader.read().then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),60))]);assert.equal(state,false);}
  await stream(code,1);const joined=await act('join',0,{code});assert.deepEqual(joined.room.game,start.room.game);assert.deepEqual(joined.room.players.map(p=>[p.score,p.meeples]),start.room.players.map(p=>[p.score,p.meeples]));
  assert.equal((await post(0,{code,kind:'rose',at:{space:'player',id:'left'}})).status,400);
 }finally{controllers.forEach(c=>c.abort());server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
