const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('宋商界面脚本可在app.js之前加载，规则卡面不依赖尚未声明的esc',()=>{
 const context=vm.createContext({document:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync(require.resolve('../public/song-cards.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(require.resolve('../public/song-ui.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(require.resolve('../public/song-desk.js'),'utf8'),context);
 const players=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
 for(const player of players){
  context.seatPlayers=players;context.viewer=player.id;
  const seats=JSON.parse(vm.runInContext('JSON.stringify(songSeatPositions(seatPlayers,viewer))',context));
  assert.equal(seats[0].id,player.id);assert.deepEqual(seats.map(s=>s.position),['bottom','right','top','left']);assert.equal(new Set(seats.map(s=>s.id)).size,4);
 }
 assert.ok(vm.runInContext('songRules.shops.includes("关扑铺")',context));
 for(const [tab,words] of Object.entries({menus:['四品','掷骰','后厨'],guests:['等待钱','招待','已建'],events:['即时津贴','一整轮','不循环']})){
  for(const word of words)assert.ok(vm.runInContext('songRules.'+tab,context).includes(word),tab+' should explain '+word);
 }
 assert.ok(vm.runInContext('songImage("cover", "<img>").includes("&lt;img&gt;")',context));
 for(let value=1;value<=6;value++){
  const html=vm.runInContext('songDie('+value+',"卦肆")',context);
  assert.equal((html.match(/data-face="/g)||[]).length,6);assert.equal((html.match(/<i /g)||[]).length,21);
  assert.ok(html.includes('骰子'+value+'点'));assert.ok(html.includes('data-die-result="'+value+'"'));
 }
 assert.ok(vm.runInContext('songButton("menu",0,"开发").includes("data-song-move")',context));
 vm.runInContext('songSubmitting=true',context);assert.ok(vm.runInContext('songButton("menu",0,"开发").includes("disabled")',context));
});
