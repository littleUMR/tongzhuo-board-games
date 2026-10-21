const engine=require('./game');
const {AUGMENTS,TIERS}=require('./augments');
const bot=require('./bot');
const {ANCHORS,REWARD_RULES}=require('./anchors');
const {ProfileStore}=require('./profile-store');
const path=require('node:path'),crypto=require('node:crypto');
const profileToken=token=>crypto.createHash('sha256').update(token).digest('hex').slice(0,32);
const createProfiles=persist=>new ProfileStore({file:persist?path.join(__dirname,'data','tongzhuo-profiles.json'):null});
function ensureColors(players){
 const used=new Set();
 for(const p of players){if(engine.PALETTE.some(c=>c.color===p.chromaColor)&&!used.has(p.chromaColor))used.add(p.chromaColor);else {delete p.chromaColor;p.chromaColorChoice=false;}}
 for(const p of players)if(!p.chromaColor){p.chromaColor=[engine.COLORS[p.color],...engine.COLORS,...engine.PALETTE.map(c=>c.color)].find(c=>c&&!used.has(c));p.chromaColorChoice=false;used.add(p.chromaColor);}
}
function chooseColor(players,id,value){
 ensureColors(players);const p=players.find(p=>p.id===id);if(!p)throw Error('你不在玩家席位');
 if(value!==null&&!engine.PALETTE.some(c=>c.color===value))throw Error('请选择色盘中的颜色');
 const used=new Set(players.filter(p=>p.id!==id).map(p=>p.chromaColor));
 const color=value??[engine.COLORS[p.color],...engine.COLORS,...engine.PALETTE.map(c=>c.color)].find(c=>c&&!used.has(c));
 if(used.has(color))throw Error('该颜色已被其他玩家使用');p.chromaColor=color;p.chromaColorChoice=value!==null;
}
function sync(g,players){const scores=engine.scores(g);for(const p of players)p.score=scores[p.id];g.active=engine.current(g);g.phase=g.finished?'finished':'play';}
function start(players,settings={}){ensureColors(players);const g=engine.startGame(players,settings.rounds||10,settings.augmentEvery||3);g.moves=0;sync(g,players);return g;}
function act(g,players,id,b){const message=b.op==='draft'?engine.draftAction(g,id,b):engine.act(g,id,b);g.moves++;g.log.unshift(players.find(p=>p.id===id).name+' '+message);g.log=g.log.slice(0,30);sync(g,players);}
function publicGame(g,id){return {...g,tierBag:undefined,scores:engine.scores(g),cards:engine.CARDS,augmentCards:AUGMENTS,tiers:TIERS,colors:engine.COLORS,skillInfo:Object.fromEntries(g.order.map(playerId=>[playerId,Object.fromEntries(Object.keys(engine.CARDS).map(key=>[key,{cost:engine.cost(g,key,0,playerId),enabled:engine.canSkill(g,playerId,key)}]))])),rules:id?{...engine.rulesFor(g,id),basics:engine.has(g,id,'basics')}:null};}
function move(g,id){if(g.draft)return g.draft.picks[id]?null:{action:'chromaMove',op:'draft',mode:'pick',key:bot.chooseAugment(g,id)};return engine.current(g)===id?{action:'chromaMove',...(bot.chooseAction(g,id)||{mode:'end'})}:null;}
module.exports={start,act,publicGame,move,anchors:ANCHORS,rewardRules:REWARD_RULES,profileToken,createProfiles,ensureColors,chooseColor,palette:engine.PALETTE,catalog:{cards:AUGMENTS,tiers:TIERS}};
