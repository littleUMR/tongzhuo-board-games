const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),teaching=require('../public/song-teaching'),song=require('../song');
test('Song introduces three distinct real card types before explaining income and turn flow',()=>{
 assert.equal(teaching.concepts.length,5);
 assert.match(teaching.concepts[0].selector,/shop/);assert.match(teaching.concepts[0].text,/先拿地契.*付造价建成/);
 assert.match(teaching.concepts[1].selector,/menu/);assert.match(teaching.concepts[1].text,/按客人的菜数抽菜谱/);
 assert.match(teaching.concepts[2].selector,/serve/);assert.match(teaching.concepts[2].text,/招待完客人离开/);
 assert.equal(teaching.concepts[3].relation,true);assert.equal(teaching.concepts[4].flow,true);
 for(const item of teaching.concepts)assert.ok(fs.existsSync(path.join(__dirname,'../public',item.image)));
});
test('concept tour supports forward, back, reviewing, and returns to live action without changing the game',async()=>{
 let handler;const r={code:'DEMO',matchId:'one',status:'playing',gameId:'song',guided:{step:0},game:{money:5}};
 const context={SONG_TEACHING:teaching,room:r,playerId:'learner',tutorialGoal:()=>({win:'8铺50两',strategy:'赚钱再扩店'}),document:{getElementById:()=>({addEventListener:(_,fn)=>handler=fn})},renderTutorial:()=>{}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/guided-ui.js'),'utf8'),context);
 assert.equal(vm.runInContext('guidedTeachingHint(room).intro',context),true);
 const click=async selector=>handler({target:{closest:value=>value===selector?{}:null}});
 await click('[data-teach-begin]');assert.equal(vm.runInContext('guidedTeachingHint(room).concept',context),undefined);assert.match(vm.runInContext('guidedTeachingHint(room).selector',context),/shop/);
 await click('[data-song-concept-review]');assert.equal(vm.runInContext('guidedTeachingHint(room).concept',context),0);
 for(let i=1;i<=4;i++){await click('[data-song-concept-next]');assert.equal(vm.runInContext('guidedTeachingHint(room).concept',context),i);}
 await click('[data-song-concept-back]');assert.equal(vm.runInContext('guidedTeachingHint(room).concept',context),3);
 await click('[data-song-concept-next]');await click('[data-song-concept-next]');assert.equal(vm.runInContext('guidedTeachingHint(room).concept',context),undefined);
 assert.match(vm.runInContext('guidedTeachingHint(room).selector',context),/shop/);
 await click('[data-song-concept-review]');assert.equal(vm.runInContext('guidedTeachingHint(room).concept',context),0);assert.equal(r.game.money,5);assert.equal(r.guided.step,0);
});
test('explained phase sequence matches actual purchase, prepare, serve and next player behavior',()=>{
 const players=[{id:'a',name:'新手'},{id:'b',name:'陪练'}],g=song.start(players,()=>0.5),phases=[g.phase];
 song.act(g,players,'a',{move:'purchaseDone',step:g.step});phases.push(g.phase);
 song.act(g,players,'a',{move:'prepareDone',step:g.step});phases.push(g.phase);
 assert.deepEqual(phases,teaching.phases.map(p=>p.id));assert.equal(g.turn,0);
 song.act(g,players,'a',{move:'serve',index:0,step:g.step},()=>0.5);assert.equal(g.turn,1);assert.equal(g.phase,'purchase');
});
