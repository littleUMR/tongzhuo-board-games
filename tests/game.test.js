const test=require('node:test');const assert=require('node:assert/strict');const E=require('../game');
const players=()=>[{id:'a',name:'甲',score:0,meeples:7},{id:'b',name:'乙',score:0,meeples:7}];
const tile=(id,x,y,rotation=0)=>({id,x,y,rotation});
const feature=(id,kind)=>E.catalog[id].features.findIndex(f=>f.kind===kind);
const game=board=>({board,log:[]});
test('every original base-game A-X quantity and connected shape matches the independent reference',()=>{
 const reference=require('./base-set.json');assert.equal(E.tiles.length,24);
 for(let i=0;i<24;i++){
  const t=E.catalog[String.fromCharCode(65+i)];assert.equal(t.count,reference.counts[i],`${t.id} count`);assert.equal(t.edges.join(''),reference.edges[i],`${t.id} edges`);
  for(const [kind,group] of [['city','cities'],['road','roads']])assert.deepEqual(t.features.filter(f=>f.kind===kind).map(f=>f.ports.map(([d])=>d)),reference[group][i],`${t.id} ${kind} connections`);
  assert.equal(t.features.filter(f=>f.kind==='field').length,reference.fields[i],`${t.id} field partitions`);
  assert.equal(t.features.reduce((v,f)=>v+(f.shield||0),0),reference.shields.includes(t.id)?1:0,`${t.id} shields`);
  assert.equal(t.features.filter(f=>f.kind==='monastery').length,reference.monasteries.includes(t.id)?1:0,`${t.id} monastery`);
 }
 const p=players(),g=E.start(p,()=>.5);assert.equal(g.board['0,0'].id,reference.start);
 const actual=[g.current,...g.deck,'D'];for(let i=0;i<24;i++)assert.equal(actual.filter(id=>id===String.fromCharCode(65+i)).length,reference.counts[i]);
 assert.equal(g.deck.length+1,71);
});
test('72 tiles with consistent feature ports and start tile distribution',()=>{
 assert.equal(E.tiles.reduce((n,t)=>n+t.count,0),72);
 for(const t of E.tiles)for(let e=0;e<4;e++){
  const center=t.features.filter(f=>f.ports.some(([d,s])=>d===e&&s===1));
  assert.equal(center.length,t.edges[e]==='F'?0:1,`${t.id} edge ${e}`);
  for(const s of [0,2])assert.equal(t.features.filter(f=>f.kind==='field'&&f.ports.some(([d,p])=>d===e&&p===s)).length,t.edges[e]==='C'?0:1,`${t.id} field port ${e}/${s}`);
 }
});
test('placement must touch a side, match every neighbor and use valid rotation',()=>{
 const board={'0,0':tile('D',0,0)};
 assert.equal(E.valid(board,tile('B',0,1),0,1),true);
 assert.equal(E.valid(board,tile('B',1,0),1,0),false);
 assert.equal(E.valid(board,tile('B',1,1),1,1),false);
 assert.equal(E.valid(board,tile('E',0,-1,2),0,-1),true);
 assert.equal(E.valid(board,tile('E',0,-1),0,-1),false);
});
test('monastery and field follower anchors remain visually distinct',()=>{
 for(const id of ['A','B']){
  const field=E.catalog[id].features.find(f=>f.kind==='field').anchor;
  assert.ok(Math.hypot(field[0]-.5,field[1]-.5)>.2);
 }
});
test('closed road returns followers and scores each tile once',()=>{
 const p=players(),b={'0,0':tile('A',0,0),'0,1':tile('A',0,1,2)};
 b['0,0'].meeple={feature:feature('A','road'),playerId:'a'};p[0].meeples--;
 const g=game(b);E.score(g,p);assert.equal(p[0].score,2);assert.equal(p[0].meeples,7);E.score(g,p);assert.equal(p[0].score,2);
});
test('connected city shields count, shared majority gets full points',()=>{
 const p=players(),b={'0,0':tile('F',0,0),'0,-1':tile('E',0,-1,2),'0,1':tile('E',0,1)};
 b['0,-1'].meeple={feature:0,playerId:'a'};b['0,1'].meeple={feature:0,playerId:'b'};p.forEach(p=>p.meeples--);
 E.score(game(b),p);assert.deepEqual(p.map(p=>p.score),[8,8]);assert.deepEqual(p.map(p=>p.meeples),[7,7]);
});
test('connected feature occupancy prevents placing own or opponent follower',()=>{
 const p=players(),g=E.start(p,()=>.5);g.board={'0,0':tile('U',0,0)};g.board['0,0'].meeple={feature:0,playerId:'b'};g.current='U';
 E.place(g,p,'a',0,1,0);assert.equal(E.available(g).find(f=>f.kind==='road').available,false);
 assert.throws(()=>E.finishTurn(g,p,'a',0),/已有随从/);assert.equal(g.phase,'meeple');
 assert.throws(()=>E.finishTurn(g,p,'b',null),/还没轮到你/);
});
test('monastery counts diagonals and scores partial monastery at end',()=>{
 const p=players(),b={'0,0':tile('B',0,0)};b['0,0'].meeple={feature:feature('B','monastery'),playerId:'a'};p[0].meeples--;
 b['-1,-1']=tile('B',-1,-1);E.score(game(b),p);assert.equal(p[0].score,0);E.score(game(b),p,true);assert.equal(p[0].score,2);
 const q=players(),c={'0,0':tile('B',0,0)};c['0,0'].meeple={feature:feature('B','monastery'),playerId:'a'};q[0].meeples--;
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)if(x||y)c[E.key(x,y)]=tile('B',x,y);
 E.score(game(c),q);assert.equal(q[0].score,9);assert.equal(q[0].meeples,7);
});
test('farmers stay until final scoring, count completed city only once',()=>{
 const p=players(),b={'0,0':tile('E',0,0),'0,-1':tile('E',0,-1,2),'1,0':tile('E',1,0)};
 b['0,0'].meeple={feature:feature('E','field'),playerId:'a'};p[0].meeples--;
 E.score(game(b),p);assert.equal(p[0].score,0);assert.equal(p[0].meeples,6);E.score(game(b),p,true);assert.equal(p[0].score,3);assert.equal(p[0].meeples,7);
});
test('a field wrapping both halves of a completed city deduplicates it and ties score in full',()=>{
 const p=players(),b={'0,0':tile('E',0,0),'0,-1':tile('E',0,-1,2)};
 for(let x=-1;x<=1;x++)for(let y=-2;y<=1;y++)if(!b[E.key(x,y)])b[E.key(x,y)]=tile('B',x,y);
 b['0,0'].meeple={feature:feature('E','field'),playerId:'a'};b['0,-1'].meeple={feature:feature('E','field'),playerId:'b'};p.forEach(v=>v.meeples--);
 const g=E.graph(b).groupByNode.get(`0,0:${feature('E','field')}`);
 assert.equal(g.meeples.length,2);assert.ok(g.nodes.filter(n=>n.feature.adjacentCities?.length).length>=2);
 E.score(game(b),p,true);assert.deepEqual(p.map(v=>v.score),[3,3]);
});
test('seeded complete games conserve 72 tiles and all followers',()=>{
 for(let seed=1;seed<=3;seed++){
  let s=seed;const random=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};const p=players();const g=E.start(p,random);
  let turns=0;
  while(g.phase!=='finished'){
   assert.ok(g.legal.length);const option=g.legal[Math.floor(random()*g.legal.length)],r=option.rotations[Math.floor(random()*option.rotations.length)],id=p[g.turn].id;
   E.place(g,p,id,option.x,option.y,r);const choices=E.available(g).filter(f=>f.available&&p[g.turn].meeples>0);const f=choices.length&&random()<.75?choices[Math.floor(random()*choices.length)].index:null;
   E.finishTurn(g,p,id,f);turns++;assert.ok(turns<=71);
   for(const person of p)assert.equal(person.meeples+Object.values(g.board).filter(t=>t.meeple?.playerId===person.id).length,7);
  }
  assert.equal(Object.keys(g.board).length+g.discarded,72);assert.deepEqual(p.map(p=>p.meeples),[7,7]);assert.ok(p.every(p=>p.score>=0));
 }
});
test('last placement records player and coordinates, survives turn end and changes only on legal placement',()=>{
 const p=players(),g=E.start(p,()=>.5),first=g.legal[0];E.place(g,p,'a',first.x,first.y,first.rotations[0]);assert.deepEqual(g.lastPlacement,{x:first.x,y:first.y,playerId:'a'});E.finishTurn(g,p,'a');assert.deepEqual(g.lastPlacement,{x:first.x,y:first.y,playerId:'a'});
 const second=g.legal[0];assert.throws(()=>E.place(g,p,'a',second.x,second.y,second.rotations[0]));assert.equal(g.lastPlacement.playerId,'a');E.place(g,p,'b',second.x,second.y,second.rotations[0]);assert.deepEqual(g.lastPlacement,{x:second.x,y:second.y,playerId:'b'});
});
test('closing an empty city or road blocks a new follower on that feature but leaves other features available',()=>{
 for(const kind of ['city','road']){
  const p=players(),g=E.start(p,()=>.5);if(kind==='city'){g.board={'0,-1':tile('E',0,-1,2)};g.current='E';E.place(g,p,'a',0,0,0);}else{g.board={'0,0':tile('A',0,0)};g.current='A';E.place(g,p,'a',0,1,2);}
  const options=E.available(g),closed=options.find(f=>f.kind===kind);assert.equal(closed.available,false);assert.match(closed.reason,/已完成/);assert.ok(options.some(f=>f.kind==='field'&&f.available));assert.throws(()=>E.finishTurn(g,p,'a',closed.index),/封口时不能放随从/);assert.equal(g.phase,'meeple');E.finishTurn(g,p,'a');assert.deepEqual(p.map(p=>p.score),[0,0]);
 }
});
test('joining separately occupied roads creates a shared road and tied players each score the whole road',()=>{
 const p=players(),g=E.start(p,()=>.5);g.board={'0,-1':tile('A',0,-1),'0,1':tile('A',0,1,2)};g.board['0,-1'].meeple={feature:feature('A','road'),playerId:'a'};g.board['0,1'].meeple={feature:feature('A','road'),playerId:'b'};p.forEach(v=>v.meeples--);g.current='U';E.place(g,p,'a',0,0,0);assert.equal(E.available(g).find(f=>f.kind==='road').available,false);E.finishTurn(g,p,'a');assert.deepEqual(p.map(v=>v.score),[3,3]);assert.deepEqual(p.map(v=>v.meeples),[7,7]);
});
test('a majority takes all completed city or road points and minority followers also return',()=>{
 for(const kind of ['city','road']){
  const p=players();const board=kind==='city'?{'0,-1':tile('E',0,-1,2),'0,0':tile('F',0,0),'0,1':tile('F',0,1),'0,2':tile('E',0,2)}:{'0,-2':tile('A',0,-2),'0,-1':tile('U',0,-1),'0,0':tile('U',0,0),'0,1':tile('U',0,1),'0,2':tile('A',0,2,2)};
  const positions=kind==='city'?['0,-1','0,0','0,2']:['0,-2','0,-1','0,2'];positions.forEach((key,i)=>{board[key].meeple={feature:feature(board[key].id,kind),playerId:i<2?'a':'b'};});p[0].meeples-=2;p[1].meeples--;const g=game(board);E.score(g,p);assert.deepEqual(p.map(v=>v.score),[kind==='city'?12:5,0]);assert.deepEqual(p.map(v=>v.meeples),[7,7]);E.score(g,p);assert.deepEqual(p.map(v=>v.score),[kind==='city'?12:5,0]);
 }
});
