const tiles = require('./public/assets/tiles.json');
const catalog = Object.fromEntries(tiles.map(t => [t.id,t]));
const directions = [[0,-1],[1,0],[0,1],[-1,0]];
const key = (x,y) => `${x},${y}`;
const labels = {city:'城市',road:'道路',field:'田野',monastery:'修道院'};
function assert(ok,message) { if (!ok) throw new Error(message); }
function edges(tile) { const e=catalog[tile.id].edges; return e.map((_,i)=>e[(i-tile.rotation+4)%4]); }
function port(feature,rotation) { return feature.ports.map(([e,s])=>[(e+rotation)%4,s]); }
function anchor(feature,rotation) {
 let [x,y]=feature.anchor;
 for(let i=0;i<rotation;i++) [x,y]=[1-y,x];
 return [x,y];
}
function valid(board,tile,x,y) {
 if(board[key(x,y)]) return false;
 let touching=false; const e=edges(tile);
 for(let d=0;d<4;d++) {
  const [dx,dy]=directions[d],n=board[key(x+dx,y+dy)];
  if(n) { touching=true;if(e[d]!==edges(n)[(d+2)%4])return false; }
 }
 return touching;
}
function placements(board,id) {
 const candidates=new Set();
 for(const t of Object.values(board))for(const [dx,dy] of directions)if(!board[key(t.x+dx,t.y+dy)])candidates.add(key(t.x+dx,t.y+dy));
 const result=[];
 for(const k of candidates) {
  const [x,y]=k.split(',').map(Number),rotations=[];
  for(let rotation=0;rotation<4;rotation++)if(valid(board,{id,rotation},x,y))rotations.push(rotation);
  if(rotations.length)result.push({x,y,rotations});
 }
 return result;
}
// Connected feature graph. Every border has city/road center or two field ports.
function graph(board) {
 const nodes=new Map(),groups=[],groupByNode=new Map();
 for(const [k,t] of Object.entries(board))catalog[t.id].features.forEach((f,i)=>nodes.set(`${k}:${i}`,{key:`${k}:${i}`,tile:t,index:i,feature:f,ports:port(f,t.rotation)}));
 function neighbors(n) {
  const result=[];
  for(const [d,s] of n.ports) {
   const [dx,dy]=directions[d],k=key(n.tile.x+dx,n.tile.y+dy),t=board[k];
   if(!t)continue;
   const i=catalog[t.id].features.findIndex(f=>f.kind===n.feature.kind&&port(f,t.rotation).some(([e,p])=>e===(d+2)%4&&p===2-s));
   if(i>=0)result.push(`${k}:${i}`);
  }
  return result;
 }
 for(const n of nodes.values()) {
  if(groupByNode.has(n.key))continue;
  const g={kind:n.feature.kind,nodes:[],tiles:new Set(),meeples:[],open:0,shields:0,id:n.key};
  groups.push(g);const stack=[n.key];groupByNode.set(n.key,g);
  while(stack.length) {
   const v=nodes.get(stack.pop());g.nodes.push(v);g.tiles.add(key(v.tile.x,v.tile.y));g.shields+=v.feature.shield||0;
   if(v.tile.meeple?.feature===v.index)g.meeples.push({tile:v.tile,playerId:v.tile.meeple.playerId});
   for(const [d] of v.ports) {
    const [dx,dy]=directions[d];if(!board[key(v.tile.x+dx,v.tile.y+dy)])g.open++;
   }
   for(const nk of neighbors(v))if(!groupByNode.has(nk)){groupByNode.set(nk,g);stack.push(nk);}
  }
  if(g.kind==='monastery') {
   const t=n.tile;g.surrounding=0;
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(board[key(t.x+dx,t.y+dy)])g.surrounding++;
   g.complete=g.surrounding===9;
  } else g.complete=g.kind!=='field'&&g.open===0;
 }
 return {groups,groupByNode};
}
function log(game,text) { game.log.unshift(text);game.log=game.log.slice(0,100); }
function score(game,players,final=false) {
 const {groups,groupByNode}=graph(game.board);
 for(const g of groups) {
  if(!g.meeples.length||(!final&&!g.complete))continue;
  let points=0;
  if(g.kind==='road')points=g.tiles.size;
  if(g.kind==='city')points=(g.tiles.size+g.shields)*(g.complete?2:1);
  if(g.kind==='monastery')points=g.surrounding;
  if(g.kind==='field') {
   const cities=new Set();
   for(const n of g.nodes)for(const i of n.feature.adjacentCities||[]) {
    const c=groupByNode.get(`${key(n.tile.x,n.tile.y)}:${i}`);if(c?.complete)cities.add(c.id);
   }
   points=cities.size*3;
  }
  const counts={};for(const m of g.meeples)counts[m.playerId]=(counts[m.playerId]||0)+1;
  const majority=Math.max(...Object.values(counts));
  const winners=players.filter(p=>counts[p.id]===majority);
  for(const p of winners)p.score+=points;
  log(game,`${final?'终局 · ':''}${labels[g.kind]}${g.complete?'完成':''}：${winners.map(p=>p.name).join('、')} 各得 ${points} 分`);
  for(const m of g.meeples) {const p=players.find(p=>p.id===m.playerId);if(p)p.meeples++;delete m.tile.meeple;}
 }
}
function draw(game) {
 game.current=null;
 while(game.deck.length) {
  const id=game.deck.pop();const legal=placements(game.board,id);
  if(legal.length) {game.current=id;game.legal=legal;return;}
  game.discarded++;log(game,`地块 ${id} 没有合法落点，弃置并重新抽取`);
 }
 game.legal=[];
}
function start(players,random=Math.random) {
 const deck=[];for(const t of tiles)for(let i=0;i<t.count-(t.id==='D'?1:0);i++)deck.push(t.id);
 for(let i=deck.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 players.forEach(p=>{p.score=0;p.meeples=7;});
 const game={board:{'0,0':{id:'D',x:0,y:0,rotation:0}},deck,turn:0,phase:'tile',pending:null,current:null,legal:[],discarded:0,log:['对局开始：每人 7 名随从，起始地块已放置。'],moves:0};
 draw(game);return game;
}
function available(game) {
 if(!game.pending)return [];
 const t=game.board[game.pending],{groupByNode}=graph(game.board);
 return catalog[t.id].features.map((f,i)=>{const group=groupByNode.get(`${game.pending}:${i}`),closed=['city','road'].includes(f.kind)&&group.complete;return {index:i,kind:f.kind,label:labels[f.kind],anchor:anchor(f,t.rotation),available:group.meeples.length===0&&!closed,reason:closed?'这片城／路已完成，封口时不能放随从':group.meeples.length?'相连区域已有随从，不能再次放置':''};});
}
function place(game,players,playerId,x,y,rotation) {
 assert(game.phase==='tile','请先结束随从放置步骤');assert(players[game.turn].id===playerId,'还没轮到你');
 assert(Number.isInteger(x)&&Number.isInteger(y)&&Math.abs(x)<100&&Math.abs(y)<100,'无效坐标');
 assert(Number.isInteger(rotation)&&rotation>=0&&rotation<4,'无效旋转');
 const t={id:game.current,x,y,rotation};assert(valid(game.board,t,x,y),'地块必须与相邻地块的城市、道路和田野匹配');
 game.board[key(x,y)]=t;game.pending=key(x,y);game.lastPlacement={x,y,playerId};game.phase='meeple';game.legal=[];
 log(game,`${players[game.turn].name} 放置地块 ${t.id}`);
}
function finishTurn(game,players,playerId,feature=null) {
 assert(game.phase==='meeple','请先放置地块');const player=players[game.turn];assert(player.id===playerId,'还没轮到你');
 const tile=game.board[game.pending];
 if(feature!==null) {
  assert(Number.isInteger(feature),'无效区域');const f=available(game).find(f=>f.index===feature);
  assert(f&&f.available,f?.reason||'无效区域');assert(player.meeples>0,'没有可用的随从');
  tile.meeple={feature,playerId};player.meeples--;log(game,`${player.name} 在${f.label}放置随从`);
 }
 score(game,players);game.moves++;game.pending=null;game.phase='tile';game.turn=(game.turn+1)%players.length;draw(game);
 if(!game.current) {score(game,players,true);game.phase='finished';log(game,'地块已用完，终局计分完成。');}
}
module.exports={catalog,tiles,key,edges,valid,placements,graph,score,start,place,available,finishTurn};
