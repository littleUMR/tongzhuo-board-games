const test=require('node:test'),assert=require('node:assert/strict'),I=require('../incan');
const players=()=>[0,1,2].map(i=>({id:String(i),name:`玩家${i}`,score:0,pocket:0,artifacts:[]}));
const treasure=(value,id='t-test')=>({id,kind:'treasure',value});const hazard=(name,id)=>({id,kind:'hazard',hazard:name});const artifact=(art,id=`a${art}`)=>({id,kind:'artifact',art});
function fixture(cards){const p=players(),g=I.start(p,()=>.5);g.pool=cards.map(c=>({...c}));g.deck=cards.slice().reverse();g.trail=[];g.active=p.map(v=>v.id);g.choices={};g.phase='choosing';p.forEach(v=>v.pocket=0);I.reveal(g,p);return {g,p};}
function decide(g,p,choices){const step=g.step,active=[...g.active];for(const id of active)I.choose(g,p,id,choices[id]||'continue',step);}
test('classic 35-card inventory, duplicate treasure values, one artifact added per expedition',()=>{
 const base=I.baseDeck();assert.equal(base.length,30);assert.deepEqual(I.TREASURES,[1,2,3,4,5,5,7,7,9,11,11,13,14,15,17]);assert.equal(I.TREASURES.reduce((a,b)=>a+b,0),124);
 for(const h of I.HAZARDS)assert.equal(base.filter(c=>c.hazard===h).length,3);
 const p=players(),g=I.start(p,()=>.5);assert.equal(g.pool.length,31);assert.equal(g.pool.filter(c=>c.kind==='artifact').length,1);assert.equal(g.artifactOrder.length,5);
});
test('treasure shares and aggregated path remainder are divided among simultaneous returners',()=>{
 const {g,p}=fixture([treasure(7,'t7'),treasure(5,'t5'),hazard('spiders','spiders0')]);assert.deepEqual(p.map(v=>v.pocket),[2,2,2]);decide(g,p,{});assert.deepEqual(p.map(v=>v.pocket),[3,3,3]);
 decide(g,p,{'0':'return','1':'return'});assert.deepEqual(p.map(v=>v.score),[4,4,0]);assert.equal(g.trail.filter(c=>c.kind==='treasure').reduce((n,c)=>n+c.leftover,0),1);assert.deepEqual(g.active,['2']);
 decide(g,p,{'2':'return'});assert.equal(p[2].score,4);assert.equal(g.phase,'roundEnd');
});
test('private commitments wait for all active players and stale or duplicate requests cannot spill into next decision',()=>{
 const {g,p}=fixture([treasure(7),treasure(9,'next')]);const step=g.step;I.choose(g,p,'0','return',step);assert.equal(g.trail.length,1);assert.equal(I.publicGame(g,'1').ownChoice,null);assert.equal(I.publicGame(g,'0').ownChoice,'return');assert.equal(I.publicGame(g,'1').choices,undefined);assert.equal(I.publicGame(g,'1').deck,undefined);assert.equal(I.publicGame(g,'1').pool,undefined);
 assert.throws(()=>I.choose(g,p,'0','continue',step),/已经提交/);I.choose(g,p,'1','continue',step);assert.equal(g.trail.length,1);I.choose(g,p,'2','continue',step);assert.equal(g.trail.length,2);assert.throws(()=>I.choose(g,p,'1','return',step),/已揭晓/);assert.throws(()=>I.choose(g,p,'0','return',g.step),/已经返回/);
});
test('return is resolved before repeated hazard; only active backpacks are lost, second hazard permanently removed',()=>{
 const {g,p}=fixture([treasure(11),hazard('snakes','snakes0'),hazard('snakes','snakes1')]);p[2].score=20;decide(g,p,{});decide(g,p,{'0':'return'});
 assert.equal(p[0].score,5);assert.equal(p[1].score,0);assert.equal(p[2].score,20);assert.deepEqual(p.map(v=>v.pocket),[0,0,0]);assert.equal(g.phase,'roundEnd');assert.ok(g.pool.some(c=>c.id==='snakes0'));assert.ok(!g.pool.some(c=>c.id==='snakes1'));
});
test('several returners leave artifacts; lone later returner takes every remaining artifact',()=>{
 const {g,p}=fixture([artifact(0),artifact(1)]);decide(g,p,{'0':'return','1':'return'});assert.equal(p[0].artifacts.length,0);assert.equal(p[1].artifacts.length,0);assert.equal(g.trail.length,2);decide(g,p,{'2':'return'});assert.equal(p[2].score,10);assert.equal(p[2].artifacts.length,2);assert.equal(g.pool.length,0);
});
test('artifact value is global recovered order, not round or player order',()=>{
 const {g,p}=fixture([artifact(3),artifact(4),treasure(1)]);g.rescuedArtifacts=2;decide(g,p,{});decide(g,p,{'0':'return','1':'continue','2':'continue'});assert.deepEqual(p[0].artifacts.map(a=>a.value),[5,10]);assert.equal(p[0].score,15);assert.equal(g.rescuedArtifacts,4);
});
test('unclaimed revealed artifacts are lost; unseen artifacts remain in the next round pool',()=>{
 const {g,p}=fixture([artifact(0),artifact(1)]);g.artifactOrder=[artifact(0),artifact(2),artifact(3),artifact(4),artifact(9)];decide(g,p,{'0':'return','1':'return','2':'return'});assert.equal(g.pool.some(c=>c.id==='a0'),false);assert.equal(g.pool.some(c=>c.id==='a1'),true);I.nextRound(g,p,()=>.5);assert.ok(g.pool.some(c=>c.id==='a1'));assert.ok(g.pool.some(c=>c.id==='a2'));
});
test('five full seeded games finish, keep secured wealth and use artifact tie-break',()=>{
 for(let seed=1;seed<=5;seed++){let s=seed;const rand=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};const p=players(),g=I.start(p,rand);let turns=0;
  while(g.phase!=='finished'){if(g.phase==='roundEnd')I.nextRound(g,p,rand);else{const previous=p.map(v=>v.score),choices={};for(const id of g.active)choices[id]=rand()<.4?'return':'continue';decide(g,p,choices);p.forEach((v,i)=>assert.ok(v.score>=previous[i]));}assert.ok(++turns<200);}
  assert.equal(g.round,5);assert.ok(g.winners.length);assert.ok(p.every(v=>v.pocket===0));assert.ok(g.rescuedArtifacts<=5);
 }
 const {g,p}=fixture([treasure(1)]);g.round=5;p[0].score=10;p[1].score=10;p[1].artifacts=[{id:'a',value:5}];decide(g,p,{'0':'return','1':'return','2':'return'});assert.deepEqual(g.winners,['1']);
});
test('settlement snapshots retain returns, recovered artifacts and collapse losses without exposing bank totals',()=>{
 const {g,p}=fixture([treasure(11),artifact(0),hazard('snakes','s0'),hazard('snakes','s1')]);decide(g,p,{});decide(g,p,{});decide(g,p,{'0':'return'});
 const returned=g.events.findLast(e=>e.kind==='return').departures[0];assert.equal(returned.backpack,3);assert.equal(returned.pathShare,2);assert.equal(returned.total,10);assert.equal(returned.artifacts[0].value,5);assert.equal(returned.score,undefined);
 assert.deepEqual(g.roundLosses.map(p=>p.amount),[3,3]);assert.equal(g.events.at(-1).kind,'collapse');assert.deepEqual(g.roundDepartures,[returned]);assert.ok(g.events.every((e,i,a)=>!i||e.id>a[i-1].id));
 const view=I.publicGame(g,'1');assert.equal(view.remainingHazards,0);assert.equal(view.remaining,0);assert.equal(view.deck,undefined);
});
test('remaining hazard count follows the undrawn deck; partial secret choices produce no settlement',()=>{
 const {g,p}=fixture([treasure(7),hazard('fire','f0'),treasure(9,'t9')]);const before=g.eventSeq;assert.equal(I.publicGame(g,'0').remainingHazards,1);I.choose(g,p,'0','continue',g.step);assert.equal(g.eventSeq,before);assert.equal(g.events.at(-1).share,2);assert.equal(g.events.at(-1).leftover,1);
});
test('every player must confirm the next round; duplicate and stale confirmations cannot start it early',()=>{
 const {g,p}=fixture([treasure(7)]);decide(g,p,{'0':'return','1':'return','2':'return'});const round=g.round;
 I.confirmNextRound(g,p,'0',round);I.confirmNextRound(g,p,'0',round);assert.deepEqual(g.nextRoundConfirmed,['0']);assert.equal(g.phase,'roundEnd');I.confirmNextRound(g,p,'1',round);assert.equal(g.round,round);I.confirmNextRound(g,p,'2',round);assert.equal(g.round,round+1);assert.equal(g.phase,'choosing');assert.deepEqual(g.nextRoundConfirmed,[]);assert.throws(()=>I.confirmNextRound(g,p,'0',round));
});
