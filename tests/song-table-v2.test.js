const test=require('node:test'),assert=require('node:assert/strict'),song=require('../song');
function setup(){const players=[{id:'a',name:'甲'},{id:'b',name:'乙'}],g=song.start(players,()=>.4);return {g,players,act(move,extra={}){song.act(g,players,g.players[g.turn].id,{move,step:g.step,...extra},()=>.4);}};}
test('dice waits for the actor, survives public refresh, and cannot be replayed or rolled by spectators',()=>{
 const {g,players,act}=setup();g.players[0].shops=[{...song.SHOPS[1],built:true}];g.queue[0].visits=['fortune'];g.queue[0].meals=2;
 act('purchaseDone');act('prepareDone');const cash=g.players[0].money;act('serve',{index:0});
 assert.equal(g.phase,'roll');assert.equal(g.turn,0);assert.equal(g.players[0].money,cash);assert.ok(song.publicGame(g,'visitor').pendingSettlement.dishes.length);
 const before=JSON.stringify(g),step=g.step;
 assert.throws(()=>song.act(g,players,'b',{move:'roll',step}));assert.equal(JSON.stringify(g),before);
 act('roll');assert.equal(g.lastSettlement.shops[0].roll,3);assert.equal(g.players[0].money,cash+g.lastSettlement.total);assert.equal(g.turn,1);assert.equal(g.pendingSettlement,undefined);assert.equal(song.publicGame(g,'visitor').pendingSettlement,undefined);
 assert.throws(()=>song.act(g,players,'a',{move:'roll',step}));
});
test('shop links and event bonuses reconcile with displayed money; hidden deck order stays hidden',()=>{
 const {g,act}=setup();g.players[0].shops=[{...song.SHOPS.find(s=>s.id==='tea'),built:true},{...song.SHOPS.find(s=>s.id==='story'),built:true}];g.activeEvent={name:'丰年',dish:1};g.queue[0].visits=['tea'];g.queue[0].meals=2;
 act('purchaseDone');act('prepareDone');act('serve',{index:0});const e=g.lastSettlement;
 assert.equal(e.shops[0].value,4);assert.match(e.shops[0].synergy,/说书场/);assert.equal(e.eventIncome,2);assert.equal(e.total,e.food+e.shopIncome+e.tip+e.eventIncome);
 const v=song.publicGame(g,'visitor');assert.equal(v.eventDeck,undefined);assert.equal(v.shopCounts.reduce((n,s)=>n+s.remaining+s.market,0),36);assert.ok(v.tableEvents.some(e=>e.text.includes('翻出')));
});
test('events turn over once per complete table round, pay every player, and finite deeds do not recycle',()=>{
 const {g,act}=setup();g.eventDeck=[{id:'grant',name:'商会',grant:2,rule:'每人2两'}];
 for(let i=0;i<2;i++){act('purchaseDone');act('prepareDone');act('serve',{index:0});while(g.phase==='roll')act('roll');}
 assert.equal(g.activeEvent.id,'grant');assert.equal(g.eventDeck.length,0);assert.equal(g.players[1].money,6+g.lastSettlement.total+2);
 g.shopDeck=[];g.market=[];act('purchaseDone');act('prepareDone');act('serve',{index:0});while(g.phase==='roll')act('roll');assert.equal(g.market.length,0);
});
test('public refill batches identify the new deed and combine new guest with round event',()=>{
 const {g,act}=setup();assert.equal(g.reveals.length,8);const seq=g.revealSeq;
 act('shop',{index:0});assert.ok(g.revealSeq>seq);assert.equal(g.reveals.length,1);assert.equal(g.reveals[0].kind,'shop');assert.deepEqual(g.reveals[0].card,g.market.at(-1));
 for(let i=0;i<2;i++){act('purchaseDone');act('prepareDone');act('serve',{index:0});while(g.phase==='roll')act('roll');}
 assert.deepEqual(g.reveals.map(v=>v.kind),['event','guest']);assert.equal(g.reveals[0].card.id,g.activeEvent.id);assert.deepEqual(song.publicGame(g,'visitor').reveals,g.reveals);
});
test('winning settlement stops before drawing any replacement cards or next event',()=>{
 const {g,act}=setup();g.turn=1;g.players[1].shops=Array.from({length:8},()=>({...song.SHOPS[0],built:true}));g.players[1].money=49;g.queue[0].meals=2;g.queue[0].visits=[];
 const sizes=[g.guestDeck.length,g.shopDeck.length,g.eventDeck.length],seq=g.revealSeq;
 act('purchaseDone');act('prepareDone');act('serve',{index:0});
 assert.equal(g.phase,'finished');assert.equal(g.queue.length,3);assert.deepEqual([g.guestDeck.length,g.shopDeck.length,g.eventDeck.length],sizes);assert.equal(g.revealSeq,seq);assert.deepEqual(g.reveals,[]);
});
