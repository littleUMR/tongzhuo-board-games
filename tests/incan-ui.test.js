const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');const context=vm.createContext({esc:String});vm.runInContext(fs.readFileSync('public/incan-ui.js','utf8'),context);
test('every treasure value renders exactly that many individual PNG gems and dims only allocated gems',()=>{for(const value of require('../incan').TREASURES){const html=context.incanCard({kind:'treasure',value,leftover:value%3},0);assert.equal((html.match(/class="individual-gem /g)||[]).length,value);assert.equal((html.match(/gem-spent/g)||[]).length,value-value%3);}});
test('gem flights distribute one real gem per recipient per pass, conserving all card values for 2–8 players',()=>{for(const value of require('../incan').TREASURES)for(let count=2;count<=8;count++){const e={value,share:Math.floor(value/count),leftover:value%count,recipients:Array.from({length:count},(_,i)=>({playerId:String(i)}))};const order=context.gemDistribution(e);assert.equal(order.length+e.leftover,value);for(const p of e.recipients)assert.equal(order.filter(id=>id===p.playerId).length,e.share);assert.equal((context.gemTokens(value).match(/data-gem-index/g)||[]).length,value);}});
test('gem flight source maps to the actual trail treasure across rounds and settlement replays',()=>{
 const g={round:2,step:12,trail:[{kind:'hazard'},{kind:'treasure',value:13},{kind:'hazard'},{kind:'treasure',value:5}]};assert.equal(context.treasureTrailIndex({round:2,step:10},g),1);assert.equal(context.treasureTrailIndex({round:2,step:12},g),3);assert.equal(context.treasureTrailIndex({round:1,step:10},g),null);assert.equal(context.treasureTrailIndex({round:2,step:9},g),null);
 const html=context.incanCard({kind:'treasure',value:13,leftover:1},4);assert.ok(html.includes('data-trail-index="4"'));assert.equal((html.match(/data-gem-index=/g)||[]).length,13);
});
test('13 gems fly from the trail card to two backpacks, keeping the remainder on the card',()=>{
 const timers=[],flights=[];
 const classList=()=>{const values=new Set();return {remove(...names){names.forEach(n=>values.delete(n));},add(n){values.add(n);},toggle(n,on){on?values.add(n):values.delete(n);},contains(n){return values.has(n);}};};
 const gems=Array.from({length:13},(_,i)=>({src:'gem.png',classList:classList(),getBoundingClientRect:()=>({left:800+i*10,top:150,width:20,height:20})}));
 const source={querySelectorAll:()=>gems},status={};
 const cards=['a','b'].map((id,i)=>{const received={},pocket={},bag={getBoundingClientRect:()=>({left:450+i*200,top:500,width:30,height:30}),animate(){}};return {dataset:{gemRecipient:id},received,pocket,querySelector:s=>s==='.loot-backpack'?bag:s==='[data-gems-received]'?received:pocket};});
 const target={isConnected:true,dataset:{eventId:'1'},querySelectorAll:()=>cards,querySelector:s=>s==='[data-dealing-status]'?status:cards.find(c=>s.includes('"'+c.dataset.gemRecipient+'"'))};
 const board={querySelector:s=>s.includes('[data-gem-index=')?gems[Number(s.match(/data-gem-index="(\d+)"/)[1])]:source};
 const local=vm.createContext({esc:String,room:{game:{round:1,step:1,trail:[{kind:'treasure',value:13,leftover:1}]}},$:()=>board,matchMedia:()=>({matches:false}),setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},document:{body:{appendChild(){}},createElement(){const element={style:{},remove(){},animate(frames){element.frames=frames;return element.animation={};}};flights.push(element);return element;}}});
 vm.runInContext(fs.readFileSync('public/incan-ui.js','utf8'),local);
 local.animateGemDistribution({id:1,round:1,step:1,value:13,share:6,leftover:1,recipients:[{playerId:'a',pocket:6},{playerId:'b',pocket:6}]},target);
 timers.forEach((fn,i)=>{fn();assert.equal(flights[i].style.left,(810+i*10)+'px');assert.equal(flights[i].style.top,'150px');flights[i].animation.onfinish();});
 assert.equal(flights.length,12);for(const card of cards){assert.equal(card.received.textContent,'+6');assert.equal(card.pocket.textContent,6);}
 assert.equal(gems.filter(g=>!g.classList.contains('gem-spent')).length,1);assert.equal(gems[0].classList.contains('gem-spent'),false);assert.equal(status.textContent,'分配完成 · 剩余 1 颗留在牌上');
});
