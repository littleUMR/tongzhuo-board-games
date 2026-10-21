const test=require('node:test'),assert=require('node:assert/strict'),goal=require('../public/tutorial-goals'),guided=require('../guided-tutorial');
function room(gameId){const r={gameId,hostId:'learner',status:'playing',players:Array.from({length:gameId==='incangold'?3:2},(_,i)=>({id:i?'bot'+i:'learner',name:'玩家',...(i?{botLevel:'easy'}:{})}))};guided.start(r);return r;}
test('Carcassonne explains the winning total and ties completing the occupied city to overtaking',()=>{
 const r=room('carcassonne');let data=goal(r,'learner');assert.match(data.win,/总分最高/);assert.match(data.why,/拼地图本身不加分/);
 r.guided.step=4;r.players[0].score=3;r.players[1].score=5;data=goal(r,'learner');assert.match(data.progress,/你 3 分.*5 分/);assert.match(data.why,/得4分.*反超/);
});
test('Incan distinguishes secured wealth from risky pocket and marks forced continuing as a counterexample',()=>{
 const r=room('incangold');r.guided.step=1;let data=goal(r,'learner');assert.match(data.win,/第5轮.*帐篷财富最多/);assert.match(data.why,/反例/);assert.match(data.progress,/帐篷 0 分.*背包 2/);
 r.guided.step=3;data=goal(r,'learner');assert.match(data.why,/2.*1.*5.*8/);
});
test('Song counts only built shops and teaches changing from investment to keeping fifty taels',()=>{
 const r=room('song');r.game.players[0].shops=[{built:false}];let data=goal(r,'learner');assert.match(data.win,/8个店铺且拥有50两现银/);assert.match(data.gap,/8 铺、45 两/);
 r.guided.step=9;r.game.players[0].shops=Array.from({length:8},()=>({built:true}));r.game.players[0].money=48;data=goal(r,'learner');assert.match(data.gap,/0 铺、2 两/);assert.match(data.why,/少花钱.*赚4两就能赢/);
});
test('Goals remain available in ordinary games and do not disclose other Incan tents',()=>{
 const r=room('incangold');delete r.guided;r.players[1].score=null;r.players[2].score=null;assert.match(goal(r,'learner').strategy,/现在能带回多少/);assert.equal(goal(r,'spectator'),null);
});

