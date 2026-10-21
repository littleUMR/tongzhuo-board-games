const engine=require('./game'),incan=require('./incan'),song=require('./song');
const word=require('./word-mahjong');
const levels={easy:'简单',normal:'普通',hard:'困难'};
const pick=(a,random)=>a[Math.floor(random()*a.length)];
// Decisions use visible board/market information, never deck order or other commitments.
function move(r,p,random=Math.random){
 const g=r.game,level=p.botLevel;
 if(r.gameId==='chroma')return require(require('node:path').resolve(__dirname,'../Codex/chroma-table-platform-0.5.1/tongzhuo-engine')).move(g,p.id);
 if(r.gameId==='wordmahjong'){const send=(op,x={})=>({action:'wordMove',op,...x});if(g.phase==='claim'&&g.last.from!==p.id&&!g.claims[p.id])return send('pass');if(g.pending?.stage==='vote'&&!Object.hasOwn(g.pending.votes,p.id))return send('vote',{reviewId:g.pending.id,yes:g.pending.kind==='answer'?false:!g.pending.verdict.pass&&level==='easy'});if(g.phase==='answer'&&g.question.target===p.id)return send('answer',{ids:[g.hands[p.id][0].id]});if(g.phase==='offer'&&g.offer.actor===p.id)return send('offer');if(g.phase==='eventAsk'&&r.players[g.event.index].id===p.id)return send('eventAsk',{text:'你现在想做什么？'});if(g.phase==='eventExchange'&&!g.event.done.includes(p.id))return send('exchange');if(g.phase==='skillChoose'&&g.choices.actor===p.id)return send('skillChoose',{cardId:g.choices.cards[0].id});if(r.players[g.turn].id===p.id){if(g.phase==='draw')return send('draw');if(g.phase==='discard')return send('discard',{cardId:pick(g.hands[p.id],random).id});}return null;} 
 if(r.gameId==='incangold'){
  if(g.phase==='roundEnd')return {action:'nextRound',round:g.round};
  if(!g.active.includes(p.id)||Object.hasOwn(g.choices,p.id))return null;
  const hazards=new Set(g.trail.filter(c=>c.kind==='hazard').map(c=>c.hazard)).size;
  const loot=g.trail.reduce((n,c)=>n+(c.leftover||0)+(c.kind==='artifact'&&!c.claimedBy?5:0),0);
  const retreat=level==='easy'?random()<0.28:level==='normal'?p.pocket>=8||hazards>=3&&p.pocket>0:(p.pocket+loot>=5&&hazards>=2)||p.pocket>=12||loot>=5&&g.active.length<=2;
  return {action:'choose',choice:retreat?'return':'continue',step:g.step};
 }
 if(r.players[g.turn]?.id!==p.id)return null;
 if(r.gameId==='carcassonne'){
  if(g.phase==='tile'){
   const options=g.legal.flatMap(v=>v.rotations.map(rotation=>({x:v.x,y:v.y,rotation})));
   if(level==='easy')return {action:'place',...pick(options,random)};
   let best=-Infinity,chosen;
   for(const option of options){
    const board={...g.board,[engine.key(option.x,option.y)]:{id:g.current,...option}};
    let value=0;
    for(const group of engine.graph(board).groups){
     const own=group.meeples.filter(m=>m.playerId===p.id).length,other=group.meeples.length-own;
     if(own)value+=(group.complete?8:1)*group.tiles.size;
     if(level==='hard'&&other&&group.complete)value-=group.tiles.size*6;
     if(group.nodes.some(n=>n.tile.x===option.x&&n.tile.y===option.y)&&!group.meeples.length&&group.kind!=='field')value+=group.tiles.size/(1+group.open||1);
    }
    if(value>best){best=value;chosen=option;}
   }
   return {action:'place',...chosen};
  }
  const available=p.meeples?engine.available(g).filter(f=>f.available):[];
  let feature=null;
  if(level==='easy'){if(available.length&&random()<0.65)feature=pick(available,random).index;}
  else {
   const ranked=available.map(f=>{const group=engine.graph(g.board).groupByNode.get(`${g.pending}:${f.index}`);return {f,value:f.kind==='field'?(level==='hard'&&p.meeples>3?1:-1):f.kind==='monastery'?group.surrounding:group.tiles.size*2-group.open*0.25};}).sort((a,b)=>b.value-a.value);
   if(ranked[0]?.value>0&&(p.meeples>1||ranked[0].value>=3))feature=ranked[0].f.index;
  }
  return {action:'finish',feature};
 }
 const state=g.players[g.turn],send=(move,extra={})=>({action:'songMove',move,step:g.step,...extra});
 if(g.phase==='roll')return send('roll');
 if(g.phase==='purchase'){
  const build=state.shops.map((s,index)=>({...s,index})).filter(s=>!s.built&&s.cost<=state.money);
  if(build.length)return send('build',{index:level==='hard'?build.sort((a,b)=>a.cost-b.cost)[0].index:build[0].index});
  if(!g.boughtCard){
   const built=state.shops.filter(s=>s.built).length;
   const buyMenu=level==='easy'?random()<0.3:level==='normal'?g.moves%4===0:state.draw.length+state.discard.length<10&&built<6;
   const grade=[1,2,3].find(grade=>g.supply[grade]>0&&({1:9,2:6,3:3})[grade]<=state.money);
   if(buyMenu&&grade)return send('menu',{grade});
   if(state.shops.length<8&&state.money>=(state.shops.length?state.shops.length+1:0)&&g.market.length){
    const index=level==='easy'?Math.floor(random()*g.market.length):g.market.reduce((best,s,i)=>s.cost<g.market[best].cost?i:best,0);
    return send('shop',{index});
   }
  }
  return send('purchaseDone');
 }
 if(g.phase==='prepare'){
  const index=state.discard.indexOf(4);
  if(level==='hard'&&!g.retiredMenu&&state.money>=8&&state.draw.length+state.discard.length>6&&index>=0)return send('retire',{index});
  return send('prepareDone');
 }
 const choices=g.queue.map((guest,index)=>({index,value:guest.meals*2+guest.tip-index+state.shops.filter(s=>s.built&&guest.visits.includes(s.id)).reduce((n,s)=>n+(typeof s.income==='number'?s.income:3),0)})).filter(c=>c.index<=state.money);
 return send('serve',{index:level==='easy'?pick(choices,random).index:choices.sort((a,b)=>b.value-a.value)[0].index});
}
function apply(r,p,b){
 const g=r.game;
 if(b.action==='chromaMove')require(require('node:path').resolve(__dirname,'../Codex/chroma-table-platform-0.5.1/tongzhuo-engine')).act(g,r.players,p.id,b);
 else if(b.action==='wordMove')word.act(g,r.players,p.id,b);
 else if(b.action==='place')engine.place(g,r.players,p.id,b.x,b.y,b.rotation);
 else if(b.action==='finish')engine.finishTurn(g,r.players,p.id,b.feature);
 else if(b.action==='choose')incan.choose(g,r.players,p.id,b.choice,b.step);
 else if(b.action==='nextRound')incan.confirmNextRound(g,r.players,p.id,b.round);
 else song.act(g,r.players,p.id,b);
 if(g.phase==='finished')r.status='finished';
}
module.exports={levels,move,apply};
