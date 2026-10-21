// 基础准备、购买与备菜规则；招待、骰子、事件和公开状态由 song.js 接入大厅。
const MENU={4:{cost:0,income:1},3:{cost:3,income:2},2:{cost:6,income:3},1:{cost:9,income:null}};
function assert(ok,message){if(!ok)throw new Error(message);}
function shuffle(cards,random=Math.random){const a=[...cards];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function start(players,random=Math.random){
 assert(players.length>=2&&players.length<=4,'基础版需要 2–4 人');
 assert(new Set(players.map(p=>p.id)).size===players.length&&players.every(p=>typeof p.id==='string'&&p.id),'玩家身份不能重复或为空');
 return {turn:0,step:1,phase:'purchase',boughtCard:false,retiredMenu:false,players:players.map((p,i)=>({id:p.id,money:5+i,shops:[],draw:shuffle([4,4,4,4,4,4,3,3],random),discard:[]}))};
}
function current(g,id,step,phase){
 assert(g.phase===phase,'当前阶段不能执行此操作');assert(step===g.step,'操作已过期，请刷新后重试');
 const p=g.players[g.turn];assert(p.id===id,'还没有轮到你');return p;
}
function spend(p,cost){assert(Number.isInteger(cost)&&cost>=0,'费用无效');assert(p.money>=cost,'银两不足');p.money-=cost;}
function buyMenu(g,id,step,grade,supply){
 const p=current(g,id,step,'purchase');assert(!g.boughtCard,'每回合最多买入一张牌');
 assert(Object.hasOwn(MENU,grade),'菜单品级无效');assert(Number.isInteger(supply[grade])&&supply[grade]>0,'该品级菜单已售罄');
 spend(p,MENU[grade].cost);supply[grade]--;p.discard.push(Number(grade));g.boughtCard=true;g.step++;
}
function acquireShop(g,id,step,index,market){
 const p=current(g,id,step,'purchase');assert(!g.boughtCard,'每回合最多买入一张牌');
 assert(p.shops.length<10,'空地已经用完');assert(Number.isInteger(index)&&index>=0&&index<market.length,'请选择展示区店铺');
 const card=market[index];assert(card&&typeof card.id==='string'&&Number.isInteger(card.cost)&&card.cost>=0,'店铺牌数据无效');
 spend(p,p.shops.length===0?0:p.shops.length+1);
 p.shops.push({...card,built:false});market.splice(index,1);g.boughtCard=true;g.step++;
}
function buildShop(g,id,step,index){
 const p=current(g,id,step,'purchase');assert(Number.isInteger(index)&&index>=0&&index<p.shops.length,'请选择自己的店铺');
 const shop=p.shops[index];assert(!shop.built,'这家店铺已经建成');spend(p,shop.cost);shop.built=true;g.step++;
}
function finishPurchase(g,id,step){current(g,id,step,'purchase');g.phase='prepare';g.step++;}
function retireMenu(g,id,step,index){
 const p=current(g,id,step,'prepare');assert(!g.retiredMenu,'每回合只能淘汰一次菜单');assert(p.draw.length+p.discard.length>6,'菜单总数不能少于 6 张');
 assert(Number.isInteger(index)&&index>=0&&index<p.discard.length,'请选择后厨的菜单');
 const grade=p.discard[index];spend(p,3);p.discard.splice(index,1);g.retiredMenu=true;g.step++;return grade;
}
function finishPrepare(g,id,step){current(g,id,step,'prepare');g.phase='serve';g.step++;}
function publicState(g,viewerId){return {...g,players:g.players.map(({draw,discard,...p})=>({...p,drawCount:draw.length,discardCount:discard.length,...(p.id===viewerId?{discard:[...discard]}:{})}))};}
module.exports={MENU,start,buyMenu,acquireShop,buildShop,finishPurchase,retireMenu,finishPrepare,publicState};
