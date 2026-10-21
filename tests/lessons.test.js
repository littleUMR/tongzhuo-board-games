const test=require('node:test'),assert=require('node:assert/strict'),engine=require('../game'),scenes=require('../public/lesson-scenes');
test('lesson road rotates legally, completes at two monasteries and returns its follower for 3 points',()=>{
 const [first,middle,last]=scenes.road,board={[engine.key(first.x,first.y)]:structuredClone(first)};
 assert.equal(engine.valid(board,{...middle,rotation:0},middle.x,middle.y),false);
 assert.equal(engine.valid(board,middle,middle.x,middle.y),true);board[engine.key(middle.x,middle.y)]={...middle,meeple:{feature:0,playerId:'learner'}};
 assert.equal(engine.valid(board,last,last.x,last.y),true);board[engine.key(last.x,last.y)]={...last};
 const player={id:'learner',name:'新手',score:0,meeples:6},g={board,log:[]};engine.score(g,[player]);assert.equal(player.score,3);assert.equal(player.meeples,7);
});
test('last lesson tile closes the occupied two-tile city, taking learner from 3 to 7 and beating 5',()=>{
 const [first,last]=scenes.city,board={[engine.key(first.x,first.y)]:{...first,meeple:{feature:0,playerId:'learner'}}};
 assert.equal(engine.valid(board,last,last.x,last.y),true);board[engine.key(last.x,last.y)]={...last};
 const player={id:'learner',name:'新手',score:3,meeples:6};engine.score({board,log:[]},[player],true);assert.equal(player.score,7);assert.equal(player.meeples,7);assert.ok(player.score>5);
});
