const { randomInt } = require('node:crypto');
const {AUGMENTS}=require('./augments');
const COLORS = ['#e87748','#548bdb','#b28ae6','#52bba4','#dfb647','#e67d9c','#7b94a8','#9cae54'];
const PALETTE = [
  ['暖橙','#e87748'],['晴蓝','#548bdb'],['藤紫','#b28ae6'],['薄荷','#52bba4'],
  ['麦金','#dfb647'],['樱粉','#e67d9c'],['雾蓝','#7b94a8'],['青柠','#9cae54'],
  ['朱红','#cc4b55'],['砖红','#b8462c'],['琥珀','#ce8d2b'],['松绿','#3d8b62'],
  ['湖青','#208e99'],['钴蓝','#3b58ad'],['鸢紫','#774eb4'],['莓紫','#b24d91'],
  ['陶粉','#c59475'],['天青','#6faecb'],['橄榄','#72823a'],['蕨绿','#77aa71'],
  ['酒红','#853e5b'],['赤铜','#a96d45'],['岩蓝','#526b7d'],['墨玉','#37675c'],
  ['冰蓝','#a8d8ea'],['嫩薄荷','#a8dfc4'],['海盐','#b5e5da'],['晴雾','#bed5eb'],
  ['雾紫','#c4c9ed'],['浅青','#c4e5e9'],['抹茶','#c5dbac'],['开心果','#d3e4b3'],
  ['浅薰衣草','#d5c6ee'],['柠檬奶','#eee2a5'],['柔樱','#efc4d3'],['蜜桃','#f2c9b3']
].map(([name,color])=>({name,color})).sort((a,b)=>parseInt(a.color.slice(1),16)-parseInt(b.color.slice(1),16));
const CARDS = {
  splash: { name:'泼墨', cost:3, desc:'选择与你领地相邻的空地，同时染色它及四邻空地。' },
  pierce: { name:'破色', cost:1, desc:'夺取相邻敌方地块，无视加固，不能攻击出生点。' },
  leap: { name:'飞染', cost:2, desc:'染色距离任意己方地块 3 格以内的空地。' }
};
const EVENTS = [
  {id:'calm',name:'晴空',desc:'风平浪静，每位玩家获得 3 点墨水。'},
  {id:'rain',name:'丰墨之雨',desc:'本轮每位玩家获得 4 点墨水。'},
  {id:'clash',name:'撞色时刻',desc:'本轮普通抢色只需 1 点墨水，加固仍额外消耗 1 点。'},
  {id:'wind',name:'顺风挥洒',desc:'本轮「泼墨」只需 2 点墨水。'}
];
function neighbors(i,size){const x=i%size,y=Math.floor(i/size);return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([a,b])=>a>=0&&b>=0&&a<size&&b<size).map(([a,b])=>b*size+a);}
function draw(){return Object.keys(CARDS)[randomInt(3)];}
function startGame(players,rounds=10,augmentEvery=3){
  const size=players.length<=4?11:15;
  const board=Array.from({length:size*size},()=>({owner:null,terrain:'plain',shield:false,home:false}));
  const m=size-2,c=Math.floor(size/2);
  const positions=[[1,1],[m,m],[m,1],[1,m],[c,1],[c,m],[1,c],[m,c]];
  const seeds=positions.slice(0,players.length).map(([x,y])=>y*size+x);
  for(let i=0;i<board.length;i++){
    if(seeds.some(s=>Math.abs(s%size-i%size)+Math.abs(Math.floor(s/size)-Math.floor(i/size))<=2))continue;
    const r=randomInt(100);if(r<9)board[i].terrain='rock';else if(r<18)board[i].terrain='well';
  }
  board[c*size+c].terrain='well';
  seeds.forEach((s,p)=>{board[s]={owner:players[p].id,terrain:'plain',shield:true,home:true};});
  const order=players.map(p=>p.id);
  // Shuffle first-player order independently of seating and starting positions.
  for(let i=order.length-1;i>0;i--){const j=randomInt(i+1);[order[i],order[j]]=[order[j],order[i]];}
  const g={size,board,order,round:1,maxRounds:rounds,turn:0,ink:3,turnInk:3,event:EVENTS[0],hands:{},drawHistory:{},draftHistory:[],augments:{},progress:{},tierBag:[],augmentEvery,draft:null,draftStage:0,turnCaptures:0,turnStats:{paints:0,well:false,aid:false,skills:{}},log:['棋盘已生成，争夺染井，留下你的颜色。'],winner:[],finished:false};
  players.forEach(p=>g.hands[p.id]=[draw(),draw()]);
  players.forEach(p=>g.drawHistory[p.id]=[{round:1,turn:0,reason:'initial',cards:[...g.hands[p.id]]}]);
  players.forEach(p=>g.augments[p.id]=[]);
  players.forEach(p=>g.progress[p.id]={skills:0,bonusScore:0});
  return g;
}
function current(g){return g.order[g.turn];}
function has(g,id,key){return !!g.augments?.[id]?.includes(key);}
function canSkill(g,id,mode){return !has(g,id,'basics')&&!(mode==='leap'&&has(g,id,'sword'));}
function scores(g){return Object.fromEntries(g.order.map(id=>[id,g.board.reduce((n,c)=>n+(c.owner===id?(c.terrain==='well'?(has(g,id,'well_master')?6:4)+(has(g,id,'omni')?1:0):(has(g,id,'goliath')?2:1)):0),g.progress[id].bonusScore)]));}
function cost(g,mode,i,id=current(g)){
  const c=g.board[i],stats=g.turnStats;
  if(mode==='paint'){
    const execute=c.owner&&has(g,id,'executioner')&&g.board.filter(b=>b.owner===c.owner).length<=3;
    const pierce=has(g,id,'basics')||has(g,id,'sword')||execute;
    const base=c.owner===null||pierce?1:(g.event.id==='clash'||has(g,id,'glass')?1:2)+(c.shield?1+(has(g,c.owner,'fortress')?1:0):0);
    return Math.max(0,base-(has(g,id,'deft')&&stats.paints===0?1:0));
  }
  if(mode==='shield')return has(g,id,'first_aid')&&c.terrain==='well'&&!stats.aid?0:1;
  return Math.max(1,(mode==='splash'&&g.event.id==='wind'?2:CARDS[mode]?.cost)-(has(g,id,'spellcraft')&&['splash','leap'].includes(mode)?1:0));
}
function distance(g,a,b){return Math.abs(a%g.size-b%g.size)+Math.abs(Math.floor(a/g.size)-Math.floor(b/g.size));}
function paintReach(g,id,i){
  return g.board.some((c,n)=>c.owner===id&&distance(g,n,i)<=(has(g,id,'scoped')?2:1))||
    (has(g,id,'homeguard')&&g.board.some((c,n)=>c.owner===id&&c.home&&distance(g,n,i)<=2));
}
function handLimit(g,id){return has(g,id,'big_brain')||has(g,id,'eureka')?8:has(g,id,'scholar')?6:4;}
function rulesFor(g,id){return {paintCosts:g.board.map((_,i)=>cost(g,'paint',i,id)),shieldCosts:g.board.map((_,i)=>cost(g,'shield',i,id)),paintReach:g.board.map((_,i)=>paintReach(g,id,i)),skillCosts:Object.fromEntries(Object.keys(CARDS).map(key=>[key,cost(g,key,0,id)])),leapRange:has(g,id,'long_leap')?5:3,handLimit:handLimit(g,id),canShield:!has(g,id,'glass')};}
function eligibleAugments(g,id){const owned=g.augments[id];return Object.keys(AUGMENTS).filter(key=>!owned.includes(key)&&!owned.some(a=>AUGMENTS[key].excludes?.includes(a)||AUGMENTS[a].excludes?.includes(key)));}
function offerAugments(g,id,tier,previous=[]){
  const eligible=eligibleAugments(g,id).filter(k=>AUGMENTS[k].tier===tier);const fresh=eligible.filter(k=>!previous.includes(k));const pool=fresh.length>=3?fresh:eligible;
  const shuffled=[...pool];for(let i=shuffled.length-1;i>0;i--){const j=randomInt(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  const ranked=shuffled;
  if(previous.length&&fresh.length&&fresh.length<3){const newcomer=ranked.find(k=>!previous.includes(k));return [newcomer,...ranked.filter(k=>k!==newcomer)].slice(0,3);}
  return ranked.slice(0,3);
}
function beginTurn(g){
  const id=current(g),land=g.board.filter(c=>c.owner===id).length;
  g.turnCaptures=0;g.turnStats={paints:0,well:false,aid:false,skills:{}};
  const h=g.hands[id],limit=handLimit(g,id),count=has(g,id,'scholar')?2:1;
  const oldCount=h.length;
  if(has(g,id,'revolution')&&h.length<limit)h.push('splash');
  for(let i=0;i<count&&h.length<limit;i++)h.push(draw());
  g.drawHistory[id].push({round:g.round,turn:g.turn+1,reason:'turn',cards:h.slice(oldCount)});
  g.ink=Math.max(1,(g.event.id==='rain'?4:3)+(has(g,id,'ink_reserve')?1:0)+(has(g,id,'endless_ink')?2:0)+(has(g,id,'omni')?1:0)+(has(g,id,'empire')?Math.min(3,Math.floor(land/8)):0)+(has(g,id,'big_brain')&&h.length>=4?1:0)+(has(g,id,'eureka')?Math.min(3,Math.floor(h.length/2)):0)+(has(g,id,'evil')?Math.min(2,Math.floor(g.progress[id].skills/3)):0)-(has(g,id,'dual')?1:0)-(has(g,id,'goliath')?1:0));
  g.turnInk=g.ink;
}
function openDraft(g){
  const available=['silver','gold','prismatic'].filter(t=>g.order.every(id=>eligibleAugments(g,id).filter(k=>AUGMENTS[k].tier===t).length>=3));
  if(!available.length){g.log.unshift('强化候选不足，本次不刷新强化');return false;}
  g.draftStage++;
  if(!g.tierBag.length){g.tierBag=[...available];for(let i=g.tierBag.length-1;i>0;i--){const j=randomInt(i+1);[g.tierBag[i],g.tierBag[j]]=[g.tierBag[j],g.tierBag[i]];}}
  g.tierBag=g.tierBag.filter(t=>available.includes(t));
  const tier=g.tierBag.shift()||available[randomInt(available.length)];
  g.draft={stage:g.draftStage,tier,offers:{},picks:{},rerolls:{}};g.ink=0;
  for(const id of g.order){g.draft.offers[id]=offerAugments(g,id,tier);g.draft.rerolls[id]=1;}
  g.draftHistory.push({stage:g.draftStage,afterRound:g.round-1,tier,offers:structuredClone(g.draft.offers),rerolls:Object.fromEntries(g.order.map(id=>[id,[]])),picks:{}});
  return true;
}
function draftAction(g,id,{mode,key}){
  if(g.finished||!g.draft||!g.order.includes(id))throw Error('当前不在强化选牌阶段');
  const d=g.draft;if(d.picks[id])throw Error('你已经选择了强化');
  if(mode==='reroll'){
    if(!d.rerolls[id])throw Error('本次重抽次数已用完');
    d.offers[id]=offerAugments(g,id,d.tier,d.offers[id]);d.rerolls[id]--;
    g.draftHistory.at(-1).rerolls[id].push([...d.offers[id]]);return '重抽了强化牌';
  }
  if(mode!=='pick'||!d.offers[id].includes(key))throw Error('请选择本次提供的强化牌');
  g.augments[id].push(key);d.picks[id]=key;
  g.draftHistory.at(-1).picks[id]=key;
  if(g.order.every(p=>d.picks[p])){g.draft=null;beginTurn(g);}
  return `选择了「${AUGMENTS[key].name}」`;
}
function claim(g,id,index){const cell=g.board[index];cell.owner=id;cell.shield=has(g,id,'plated')||(cell.terrain==='well'&&has(g,id,'omni'));}
function extraTargets(g,id,index,enemy=false){return neighbors(index,g.size).filter(i=>{const c=g.board[i];return c.terrain!=='rock'&&!c.home&&(enemy?c.owner!==null&&c.owner!==id:c.owner===null);}).sort((a,b)=>Number(g.board[b].terrain==='well')-Number(g.board[a].terrain==='well')||a-b);}
function endEffects(g,id){
  if(has(g,id,'mind'))g.progress[id].bonusScore+=Math.min(2,g.ink);
  if(has(g,id,'quantum')){
    const wells=g.board.flatMap((c,i)=>c.owner===id&&c.terrain==='well'?[i]:[]);
    wells.sort((a,b)=>extraTargets(g,id,b).length-extraTargets(g,id,a).length||a-b);
    if(wells.length)for(const n of extraTargets(g,id,wells[0]))claim(g,id,n);
  }
}
function act(g,id,{mode,index,second}){
  if(g.finished)throw Error('本局已结束');
  if(g.draft)throw Error('请等待所有玩家完成强化选牌');
  if(current(g)!==id)throw Error('请等待你的回合');
  if(mode==='end'){endEffects(g,id);next(g);return '结束了回合';}
  if(!Number.isInteger(index)||index<0||index>=g.board.length)throw Error('请选择棋盘上的地块');
  const c=g.board[index],adj=neighbors(index,g.size).some(n=>g.board[n].owner===id);
  if(c.terrain==='rock')throw Error('岩石无法染色');
  if(!['paint','shield',...Object.keys(CARDS)].includes(mode))throw Error('未知操作');
  if(CARDS[mode]&&!canSkill(g,id,mode))throw Error('你的强化效果禁止使用此技能');
  if(CARDS[mode]&&!g.hands[id].includes(mode))throw Error('你没有这张战术牌');
  if(mode==='shield') {if(has(g,id,'glass'))throw Error('玻璃大炮禁止主动加固');if(c.owner!==id||c.shield)throw Error('请选择尚未加固的己方地块');}
  else {
    if(c.owner===id)throw Error('这已经是你的颜色');
    if(c.home)throw Error('出生点受保护');
    if(mode==='leap'){
      if(c.owner!==null)throw Error('飞染只能选择空地');
      const range=has(g,id,'long_leap')?5:3;
      if(!g.board.some((b,n)=>b.owner===id&&Math.abs(n%g.size-index%g.size)+Math.abs(Math.floor(n/g.size)-Math.floor(index/g.size))<=range))throw Error(`飞染最多跨越 ${range} 格`);
    } else if(mode==='paint'?!paintReach(g,id,index):!adj)throw Error('请选择与你领地相邻或强化染色范围内的地块');
    if(mode==='splash'&&c.owner!==null)throw Error('泼墨的中心必须是空地');
    if(mode==='pierce'&&c.owner===null)throw Error('破色需要选择敌方地块');
  }
  let extra=null;
  if(second!==undefined&&second!==null){
    if(mode!=='paint'||!has(g,id,'basics')||!Number.isInteger(second)||second<0||second>=g.board.length||second===index)throw Error('无效的第二个染色目标');
    const b=g.board[second];if(b.owner===id||b.home||b.terrain==='rock'||!neighbors(second,g.size).some(n=>n===index||g.board[n].owner===id))throw Error('第二格必须连接第一格或己方领地，且能够被染色');extra=second;
  }
  const price=cost(g,mode,index,id);if(g.ink<price)throw Error(`墨水不足，需要 ${price} 点`);
  g.ink-=price;
  let captured=false,gotWell=false;const stats=g.turnStats;
  const paint=n=>{const b=g.board[n];if(b.owner&&b.owner!==id)captured=true;if(b.terrain==='well')gotWell=true;claim(g,id,n);};
  if(mode==='shield'){
    if(has(g,id,'first_aid')&&c.terrain==='well'&&!stats.aid)stats.aid=true;
    c.shield=true;
    if(has(g,id,'mountain')){const extra=neighbors(index,g.size).filter(n=>g.board[n].owner===id&&!g.board[n].shield).sort((a,b)=>Number(g.board[b].terrain==='well')-Number(g.board[a].terrain==='well')||a-b)[0];if(extra!==undefined)g.board[extra].shield=true;}
  }
  else {paint(index);if(extra!==null)paint(extra);if(mode==='splash')neighbors(index,g.size).forEach(n=>{const b=g.board[n];if(b.owner===null&&b.terrain!=='rock')paint(n);});}
  if(mode==='paint'){
    stats.paints++;
    if(has(g,id,'dual')){const n=extraTargets(g,id,index)[0];if(n!==undefined)paint(n);}
    if(has(g,id,'erosion'))for(const n of neighbors(index,g.size)){const b=g.board[n];if(b.owner!==null&&b.owner!==id&&!b.home)b.shield=false;}
    if(has(g,id,'rhythm')&&stats.paints===3)g.ink++;
  }
  if(CARDS[mode]){
    const first=!stats.skills[mode];
    const firstSkill=Object.values(stats.skills).every(v=>!v);
    stats.skills[mode]=(stats.skills[mode]||0)+1;
    if(has(g,id,'evil'))g.progress[id].skills++;
    if(has(g,id,'missiles')){const n=extraTargets(g,id,index)[0];if(n!==undefined)paint(n);}
    if(has(g,id,'jeweled')&&randomInt(100)<25)for(const n of extraTargets(g,id,index))paint(n);
    if(has(g,id,'infernal')&&firstSkill){const n=extraTargets(g,id,index,true)[0];if(n!==undefined)paint(n);}
    if(mode==='splash'&&first&&has(g,id,'revolution'))g.ink++;
    if(!(first&&((mode==='splash'&&has(g,id,'bread_butter'))||(mode==='leap'&&has(g,id,'bread_cheese')))))g.hands[id].splice(g.hands[id].indexOf(mode),1);
  }
  if(gotWell&&has(g,id,'ocean')&&!stats.well){g.ink++;stats.well=true;}
  if(captured){if(has(g,id,'siphon')&&g.turnCaptures===0)g.ink++;g.turnCaptures++;}
  return mode==='shield'?'加固了领地':mode==='paint'?'染色了一块领地':`使用了「${CARDS[mode].name}」`;
}
function next(g){
  g.turn++;
  if(g.turn===g.order.length){g.turn=0;g.round++;if(g.round>g.maxRounds){g.round=g.maxRounds;g.finished=true;const s=scores(g),max=Math.max(...Object.values(s));g.winner=g.order.filter(id=>s[id]===max);return;}g.event=EVENTS[randomInt(EVENTS.length)];g.log.unshift(`第 ${g.round} 轮 · ${g.event.name}`);if(g.augmentEvery>0&&(g.round-1)%g.augmentEvery===0){if(openDraft(g))return;}}
  beginTurn(g);
}
module.exports={COLORS,PALETTE,CARDS,EVENTS,neighbors,startGame,current,scores,cost,act,next,has,canSkill,draftAction,eligibleAugments,rulesFor};
