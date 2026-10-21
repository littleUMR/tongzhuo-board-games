const base=require('./song-foundation');
// 试玩卡池：四种可核对的商铺。不是原版36张店铺/72张客人的完整还原。
const {shops:SHOPS,menus:MENUS,events:EVENTS,dishes:DISHES}=require('./public/song-cards');
function assert(ok,message){if(!ok)throw Error(message);}
function shuffle(a,random=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function die(random){return 1+Math.floor(random()*6);}
function log(g,t){g.log.unshift(t);g.log=g.log.slice(0,80);g.tableEvents??=[];g.eventSeq=(g.eventSeq||0)+1;g.tableEvents.push({seq:g.eventSeq,text:t,playerId:g.players[g.turn].id});g.tableEvents=g.tableEvents.slice(-24);}
function guests(){return Array.from({length:72},(_,i)=>({id:'guest-'+i,name:['游学书生','商贾','千金','行脚客','茶客','画师','贵公子','绣娘','老掌柜'][i%9],art:['guest-scholar','guest-merchant','guest-lady','guest-traveler','guest-tea','guest-painter','guest-gentleman','guest-embroiderer','guest-elder'][i%9],meals:2+i%3,visits:[SHOPS[i%12].id,SHOPS[(i+1+Math.floor(i/12))%12].id],tip:0}));}
function reveal(g,kind,card){g.reveals??=[];g.reveals.push({kind,card:structuredClone(card)});g.revealSeq=(g.revealSeq||0)+1;}
function refill(g,random){while(g.market.length<4&&g.shopDeck.length){const c=g.shopDeck.pop();g.market.push(c);reveal(g,'shop',c);}while(g.queue.length<4){if(!g.guestDeck.length){g.guestDeck=shuffle(g.guestDiscard,random);g.guestDiscard=[];}if(!g.guestDeck.length)break;const c=g.guestDeck.pop();g.queue.push(c);reveal(g,'guest',c);}}
function start(players,random=Math.random){
 const g=base.start(players,random);Object.assign(g,{edition:'table-v2',eventDeck:shuffle(EVENTS,random),eventDiscard:[],activeEvent:null,moves:0,supply:{1:8,2:12,3:20-players.length*2,4:36-players.length*6},market:[],queue:[],shopDeck:shuffle(SHOPS.flatMap(s=>Array.from({length:3},(_,i)=>({...s,cardId:s.id+'-'+i}))),random),guestDeck:shuffle(guests(),random),guestDiscard:[],retired:[],log:[],lastSettlement:null});
 players.forEach((p,i)=>{p.score=5+i;p.shopCount=0;});refill(g,random);log(g,'汴京开市。先投资，再备菜，最后招待一位客人。');return g;
}
function checkWin(g,players){if(g.phase==='finished')return;const winner=g.players.find(p=>p.shops.filter(s=>s.built).length>=8&&p.money>=50);if(winner){g.phase='finished';g.winners=[winner.id];log(g,`${players.find(p=>p.id===winner.id).name} 建成八家店铺，持有 ${winner.money} 两，获胜！`);}}
function synergy(shop,built){
 const has=id=>built.some(s=>s.id===id);
 if(shop.id==='fortune'&&has('wheel'))return {value:2,reason:'关扑铺联动 +2'};
 if(shop.id==='wheel'&&has('drink'))return {value:1,reason:'饮子铺联动 +1'};
 if(['tea','wine','drink'].includes(shop.id)&&has('story'))return {value:2,reason:'说书场联动 +2'};
 if(shop.id==='book'&&has('tea'))return {value:2,reason:'茶肆联动 +2'};
 if(['silk','porcelain'].includes(shop.id)&&has('jewelry'))return {value:1,reason:'首饰铺联动 +1'};
 return {value:0,reason:''};
}
function settle(g,players,random){
 const e=g.pendingSettlement,p=g.players[g.turn],event=g.activeEvent;
 e.food=e.dishes.reduce((n,d)=>n+d.value,0);e.shopIncome=e.shops.reduce((n,s)=>n+s.value,0);
 e.eventIncome=(event?.food||0)+(event?.dish||0)*e.dishes.length+(event?.shop||0)+(event?.visit||0)*e.shops.length+(event?.bonus||0);
 e.eventName=event?.name;e.total=e.food+e.shopIncome+e.tip+e.eventIncome;p.money+=e.total;
 e.seq=(g.settlementSeq||0)+1;g.settlementSeq=e.seq;g.lastSettlement=e;delete g.pendingSettlement;
 g.guestDiscard.push({...e.guest,tip:0});g.moves++;
 log(g,`${e.name} 招待${e.guest.name}：菜品 ${e.food}＋店铺 ${e.shopIncome}＋等待钱 ${e.tip}＋事件 ${e.eventIncome}＝收入 ${e.total} 两。`);
 checkWin(g,players);
 if(g.phase!=='finished'){
  g.turn=(g.turn+1)%g.players.length;g.phase='purchase';g.boughtCard=false;g.retiredMenu=false;
  if(g.turn===0&&g.eventDeck){
   if(g.activeEvent)g.eventDiscard.push(g.activeEvent);
   g.activeEvent=g.eventDeck.pop()||null;
   if(g.activeEvent){reveal(g,'event',g.activeEvent);if(g.activeEvent.grant)g.players.forEach(p=>p.money+=g.activeEvent.grant);log(g,'事件揭晓：'+g.activeEvent.name+' · '+g.activeEvent.rule);checkWin(g,players);}
  }
  if(g.phase!=='finished')refill(g,random);
 }
}
function perform(g,players,id,b,random){
 g.reveals=[];
 const p=g.players[g.turn],name=players.find(v=>v.id===id)?.name;
 assert(g.phase!=='finished','对局已经结束');assert(p.id===id,'还没有轮到你');assert(b.step===g.step,'操作已过期，请按当前阶段重新操作');
 if(b.move==='menu'){base.buyMenu(g,id,b.step,b.grade,g.supply);log(g,`${name} 开发${MENUS.find(m=>m.grade===Number(b.grade)).name}。`);}
 else if(b.move==='shop'){const card=g.market[b.index];base.acquireShop(g,id,b.step,b.index,g.market);refill(g,random);log(g,`${name} 清理地基，取得${card.name}地契。`);}
 else if(b.move==='build'){const card=p.shops[b.index];base.buildShop(g,id,b.step,b.index);log(g,`${name} 花 ${card.cost} 两建成${card.name}。`);}
 else if(b.move==='purchaseDone')base.finishPurchase(g,id,b.step);
 else if(b.move==='retire'){const grade=base.retireMenu(g,id,b.step,b.index);g.retired.push(grade);log(g,`${name} 花 3 两淘汰一张${grade}品菜单。`);}
 else if(b.move==='prepareDone')base.finishPrepare(g,id,b.step);
 else if(b.move==='roll'){
  assert(g.phase==='roll'&&g.pendingSettlement,'当前没有待掷骰子');
  const pending=[...g.pendingSettlement.dishes,...g.pendingSettlement.shops].find(d=>d.needsRoll&&!d.roll);
  assert(pending,'骰子已全部掷完');pending.roll=die(random);pending.value+=pending.roll;
  log(g,`${name} 为${pending.name}掷出 ${pending.roll} 点。`);
  if(![...g.pendingSettlement.dishes,...g.pendingSettlement.shops].some(d=>d.needsRoll&&!d.roll))settle(g,players,random);
  g.step++;
 }
 else if(b.move==='serve'){
  assert(g.phase==='serve','请先完成购买和备菜');assert(Number.isInteger(b.index)&&b.index>=0&&b.index<g.queue.length,'请选择排队的客人');assert(p.money>=b.index,'银两不足，无法支付前面客人的等待钱');
  const guest=g.queue[b.index];p.money-=b.index;for(let i=0;i<b.index;i++)g.queue[i].tip++;g.queue.splice(b.index,1);
  let food=0;const dishes=[];
  for(let i=0;i<guest.meals;i++){
   if(!p.draw.length){p.draw=shuffle(p.discard,random);p.discard=[];}
   assert(p.draw.length,'菜单牌库为空');const grade=p.draw.pop(),value=grade===1?2:base.MENU[grade].income;
   const menu=MENUS.find(m=>m.grade===grade),variant=(g.moves+i)%3;
   food+=value;dishes.push({grade,name:DISHES[grade][variant],art:variant?'dish-'+grade+'-'+variant:menu.art,value,roll:null,needsRoll:grade===1});p.discard.push(grade);
  }
  const built=p.shops.filter(s=>s.built),shops=built.filter(s=>guest.visits.includes(s.id)).map(s=>{const bonus=synergy(s,built);return {name:s.name,art:s.art,value:(s.income==='die'?0:s.income==='buildings'?built.length:s.income)+bonus.value,synergy:bonus.reason,roll:null,needsRoll:s.income==='die'};});
  g.pendingSettlement={mealId:g.moves+1,playerId:id,name,guest,dishes,shops,tip:guest.tip,waitingPaid:b.index};
  log(g,`${name} 请${guest.name}入席，翻出${dishes.map(d=>d.name).join('、')}，光顾${shops.map(s=>s.name).join('、')||'食肆'}。`);
  if([...dishes,...shops].some(d=>d.needsRoll))g.phase='roll';else settle(g,players,random);
  g.step++;
 }else throw Error('未知经营操作');
 checkWin(g,players);
}
function act(g,players,id,b,random=Math.random){
 const next=structuredClone(g);perform(next,players,id,b,random);for(const key of Object.keys(g))if(!Object.hasOwn(next,key))delete g[key];Object.assign(g,next);
 for(const player of players){const state=g.players.find(p=>p.id===player.id);player.score=state.money;player.shopCount=state.shops.filter(s=>s.built).length;}
}
function publicGame(g,viewerId){const {shopDeck,guestDeck,guestDiscard,retired,eventDeck,eventDiscard,...rest}=base.publicState(g,viewerId);rest.players=rest.players.map(p=>{const source=g.players.find(v=>v.id===p.id);return {...p,discard:[...source.discard],menuDraw:[...source.draw].sort((a,b)=>a-b)};});return {...rest,remainingShops:shopDeck.length,shopCounts:SHOPS.map(s=>({id:s.id,name:s.name,remaining:shopDeck.filter(c=>c.id===s.id).length,market:g.market.filter(c=>c.id===s.id).length})),remainingGuests:guestDeck.length,guestDiscardCount:guestDiscard.length,remainingEvents:eventDeck?.length||0,retiredCount:retired.length};}
module.exports={SHOPS,MENUS,start,act,publicGame};
