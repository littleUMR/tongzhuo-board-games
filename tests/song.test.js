const {test}=require('node:test'),assert=require('node:assert/strict'),song=require('../song'),{rewards}=require('../economy');
function setup(n=2){const players=Array.from({length:n},(_,i)=>({id:'p'+i,name:'少东家'+i}));return {players,g:song.start(players,()=>.4)};}
function move(g,players,move,extra={}){song.act(g,players,g.players[g.turn].id,{move,step:g.step,...extra},()=>.4);}
function playTurn(g,players){
 const p=g.players[g.turn];
 if(p.draw.length+p.discard.length<10&&p.shops.length<3&&p.money>=6&&g.supply[2])move(g,players,'menu',{grade:2});
 else if(p.shops.length<8){const cost=p.shops.length===0?0:p.shops.length+1,index=g.market.findIndex(s=>p.money>=cost+s.cost);if(index>=0)move(g,players,'shop',{index});}
 for(let i=0;i<g.players[g.turn].shops.length;i++){const s=g.players[g.turn].shops[i];if(!s.built&&g.players[g.turn].money>=s.cost)move(g,players,'build',{index:i});}
 if(g.phase==='finished')return;move(g,players,'purchaseDone');
 const active=g.players[g.turn],index=active.discard.findIndex(grade=>grade===4);
 if(index>=0&&active.money>=12&&active.draw.length+active.discard.length>6)move(g,players,'retire',{index});
 move(g,players,'prepareDone');
 const q=g.players[g.turn];const value=c=>c.meals*2+q.shops.filter(s=>s.built&&c.visits.includes(s.id)).reduce((n,s)=>n+(s.income==='buildings'?q.shops.filter(s=>s.built).length:s.income==='die'?3.5:s.income),0)+c.tip;
 let best=0;for(let i=1;i<g.queue.length&&i<=q.money;i++)if(value(g.queue[i])-i>value(g.queue[best])-best)best=i;
 move(g,players,'serve',{index:best});while(g.phase==='roll')move(g,players,'roll');
}
test('试玩卡池数量一致，初始牌从供应中扣除',()=>{
 for(const n of [2,3,4]){const {g}=setup(n);assert.equal(g.shopDeck.length+g.market.length,36);assert.equal(g.guestDeck.length+g.queue.length,72);assert.equal(Object.values(g.supply).reduce((a,b)=>a+b,0)+n*8,76);}
});
test('无效、越权、过期及资金不足的动作都不产生半次交易',()=>{
 const {g,players}=setup(),before=JSON.stringify([g,players]);
 for(const data of [{move:'menu',grade:1,step:g.step},{move:'shop',index:99,step:g.step},{move:'nonsense',step:g.step},{move:'purchaseDone',step:999}]){assert.throws(()=>song.act(g,players,'p0',data));assert.equal(JSON.stringify([g,players]),before);}
 assert.throws(()=>song.act(g,players,'p1',{move:'purchaseDone',step:1}));assert.equal(JSON.stringify([g,players]),before);
});
test('招待先给跳过的客人等待钱，收入明细与现银一致',()=>{
 const {g,players}=setup();move(g,players,'purchaseDone');move(g,players,'prepareDone');const before=g.players[0].money,queueIds=g.queue.map(c=>c.id);
 move(g,players,'serve',{index:2});const e=g.lastSettlement;assert.equal(e.waitingPaid,2);assert.equal(g.players[0].money,before-2+e.total);assert.equal(e.total,e.food+e.shopIncome+e.tip);
 for(const id of queueIds.slice(0,2))assert.equal(g.queue.find(c=>c.id===id).tip,1);assert.equal(g.turn,1);assert.equal(g.phase,'purchase');
});
test('骰子与同类店铺分别结算，未建地契不产生收入',()=>{
 const {g,players}=setup();g.players[0].shops=[{...song.SHOPS[1],built:true},{...song.SHOPS[1],built:true},{...song.SHOPS[1],built:false}];g.queue[0].visits=['fortune'];
 move(g,players,'purchaseDone');move(g,players,'prepareDone');move(g,players,'serve',{index:0});while(g.phase==='roll')move(g,players,'roll');assert.equal(g.lastSettlement.shops.length,2);assert.equal(g.lastSettlement.shopIncome,6);
});
test('雅阁耗尽会循环后厨，菜单守恒且一品掷骰计费',()=>{
 const {g,players}=setup();const p=g.players[0];p.draw=[1];p.discard=[4,4,3,3,2];g.queue[0].meals=4;
 move(g,players,'purchaseDone');move(g,players,'prepareDone');move(g,players,'serve',{index:0});while(g.phase==='roll')move(g,players,'roll');const q=g.players[0];assert.equal(q.draw.length+q.discard.length,6);assert.equal(g.lastSettlement.dishes[0].value,5);assert.equal(g.lastSettlement.dishes[0].roll,3);
});
test('公开菜牌组成但不泄露公共牌堆及雅阁抽取顺序',()=>{
 const {g}=setup(4);g.players[0].discard=[3];const v=song.publicGame(g,'p1');for(const key of ['guestDeck','guestDiscard','shopDeck','retired'])assert.equal(v[key],undefined);for(const p of v.players)assert.equal(p.draw,undefined);assert.deepEqual(v.players[0].discard,[3]);assert.deepEqual(v.players[1].discard,[]);
 const spectator=song.publicGame(g,'visitor');assert.ok(spectator.players.every(p=>Array.isArray(p.discard)));assert.deepEqual(spectator.players[0].menuDraw,[...g.players[0].draw].sort((a,b)=>a-b));spectator.players[0].menuDraw.pop();assert.equal(g.players[0].draw.length,8);
});
test('八铺与五十两需同时达到；胜者排名优先于现金更多的未达标玩家',()=>{
 const {g,players}=setup();g.players[0].shops=Array.from({length:8},()=>({...song.SHOPS[0],built:true}));g.players[0].money=49;g.players[1].money=100;g.queue[0].visits=['none'];
 move(g,players,'purchaseDone');assert.notEqual(g.phase,'finished');move(g,players,'prepareDone');move(g,players,'serve',{index:0});assert.equal(g.phase,'finished');assert.deepEqual(g.winners,['p0']);assert.equal(rewards('song',players).find(p=>p.playerId==='p0').rank,1);assert.equal(rewards('song',players).find(p=>p.playerId==='p1').rank,2);
 assert.throws(()=>move(g,players,'serve',{index:0}));
});
for(const n of [2,3,4])test(`${n}人完整经营可达到终局；菜单守恒且所有余额非负`,()=>{
 const {g,players}=setup(n);let turns=0;
 while(g.phase!=='finished'&&turns++<600){playTurn(g,players);assert.ok(g.players.every(p=>p.money>=0));assert.equal(Object.values(g.supply).reduce((a,b)=>a+b,0)+g.retired.length+g.players.reduce((n,p)=>n+p.draw.length+p.discard.length,0),76);}
 assert.equal(g.phase,'finished');assert.equal(g.winners.length,1);assert.ok(turns<600);
});
module.exports={playTurn};
