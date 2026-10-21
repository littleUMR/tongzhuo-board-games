const {test}=require('node:test');
const assert=require('node:assert/strict');
const song=require('../song-foundation');
const players=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
const supply=()=>({1:10,2:10,3:10,4:10}); // 测试库存，并非正式卡牌数量。
test('宋商准备：四位玩家依次获得5–8两及六张四品、两张三品',()=>{
 const g=song.start(players);assert.deepEqual(g.players.map(p=>p.money),[5,6,7,8]);
 for(const p of g.players)assert.deepEqual([...p.draw].sort(),[3,3,4,4,4,4,4,4]);
 assert.throws(()=>song.start(players.slice(0,1)));assert.throws(()=>song.start([{id:'a'},{id:'a'}]));
});
test('买入菜谱进入后厨，限一张；重放与越权不会扣款或减少库存',()=>{
 const g=song.start(players),s=supply();song.buyMenu(g,'a',1,3,s);
 assert.equal(g.players[0].money,2);assert.deepEqual(g.players[0].discard,[3]);assert.equal(s[3],9);
 const before=JSON.stringify([g,s]);
 assert.throws(()=>song.buyMenu(g,'a',1,3,s));assert.throws(()=>song.buyMenu(g,'a',g.step,4,s));assert.throws(()=>song.finishPurchase(g,'b',g.step));
 assert.equal(JSON.stringify([g,s]),before);
});
test('银两不足或售罄时不产生半次交易',()=>{
 const g=song.start(players),s=supply(),before=JSON.stringify([g,s]);
 assert.throws(()=>song.buyMenu(g,'a',1,1,s));assert.equal(JSON.stringify([g,s]),before);
 s[3]=0;assert.throws(()=>song.buyMenu(g,'a',1,3,s));assert.equal(g.players[0].money,5);
});
test('清理地基和建造分开结算；建造不再次收取卡牌费用',()=>{
 const g=song.start(players),market=[{id:'fixture-shop',name:'测试店铺',cost:5}];
 song.acquireShop(g,'a',1,0,market);assert.equal(g.players[0].money,5);assert.equal(g.players[0].shops[0].built,false);
 song.buildShop(g,'a',g.step,0);assert.equal(g.players[0].money,0);assert.equal(g.players[0].shops[0].built,true);
 assert.throws(()=>song.buildShop(g,'a',g.step,0));assert.equal(g.players[0].money,0);
});
test('已有未建店铺可以在购买菜单的同一阶段补建',()=>{
 const g=song.start(players),s=supply(),p=g.players[0];p.money=20;p.shops=[{id:'fixture-a',cost:5,built:false},{id:'fixture-b',cost:6,built:false}];
 song.buyMenu(g,'a',g.step,3,s);song.buildShop(g,'a',g.step,0);song.buildShop(g,'a',g.step,1);assert.equal(p.money,6);
});
test('第二块地基收2两，店铺卡面费用留到建造时才支付',()=>{
 const g=song.start(players),p=g.players[0];p.shops=[{id:'existing',cost:5,built:true}];
 song.acquireShop(g,'a',g.step,0,[{id:'fixture',cost:8}]);assert.equal(p.money,3);assert.equal(p.shops[1].built,false);
});
test('备菜只取后厨，每回合一次，支付3两，总菜单保留至少6张',()=>{
 const g=song.start(players),p=g.players[0];p.money=10;p.draw=[4,4,4,4,4,4];p.discard=[3,3];
 song.finishPurchase(g,'a',g.step);assert.equal(song.retireMenu(g,'a',g.step,0),3);
 assert.equal(p.money,7);assert.equal(p.draw.length+p.discard.length,7);
 const before=JSON.stringify(g);assert.throws(()=>song.retireMenu(g,'a',g.step,0));assert.equal(JSON.stringify(g),before);
 song.finishPrepare(g,'a',g.step);assert.equal(g.phase,'serve');assert.throws(()=>song.buyMenu(g,'a',g.step,4,supply()));
 const h=song.start(players);h.players[0].draw=[4,4,4,4,4];h.players[0].discard=[3];song.finishPurchase(h,'a',h.step);
 assert.throws(()=>song.retireMenu(h,'a',h.step,0));assert.equal(h.players[0].money,5);
});
test('公开状态不暴露任何玩家雅阁顺序或其他玩家后厨',()=>{
 const g=song.start(players);g.players[0].discard=[3];g.players[1].discard=[4];
 const view=song.publicState(g,'a');for(const p of view.players)assert.equal(p.draw,undefined);
 assert.deepEqual(view.players[0].discard,[3]);assert.equal(view.players[1].discard,undefined);
 view.players[0].discard.push(4);assert.deepEqual(g.players[0].discard,[3]);
});
