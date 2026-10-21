const crypto=require('node:crypto');
const KINDS=new Set(['question','arrow','tomato','rose','danger','like','clap','heart']);
function assert(ok,message){if(!ok)throw Error(message);}
function anchor(r,a){
 assert(a&&typeof a==='object','请选择棋盘位置或玩家');
 const unit=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
 if(a.space==='player'){
  assert([...r.players,...r.spectators].some(p=>p.id===a.id),'玩家已离开房间');return {space:'player',id:a.id};
 }
 if(a.space==='tile'){
  assert(r.gameId==='carcassonne'&&r.game,'当前没有卡卡颂棋盘');
  assert([a.x,a.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100),'无效棋盘坐标');return {space:'tile',x:a.x,y:a.y};
 }
 assert(unit(a.u)&&unit(a.v),'无效标记位置');
 if(a.space==='table')return {space:'table',u:a.u,v:a.v};
 assert(a.space==='card'&&typeof a.key==='string'&&a.key.length<150,'无效卡牌');
 const g=r.game;assert(g,'对局尚未开始');let keys=[];
 if(r.gameId==='incangold')keys=g.trail.map((_,i)=>`incan:${g.round}:${i}`);
 if(r.gameId==='song')keys=[...g.queue.map(c=>'guest:'+c.id),...g.market.map(c=>'market:'+c.cardId),...[1,2,3,4].map(grade=>'menu:'+grade),...g.players.flatMap(p=>p.shops.map(c=>`shop:${p.id}:${c.cardId}`))];
 assert(keys.includes(a.key),'卡牌已经更新，请重新标记');return {space:'card',key:a.key,u:a.u,v:a.v};
}
function createInteractions(){
 const limits=new WeakMap();
 return function make(r,token,b,now=Date.now()){
  const p=[...r.players,...r.spectators].find(p=>p.token===token);assert(p,'请先加入房间或观战');assert(b.gameId===r.gameId&&(b.matchId??null)===(r.matchId||null),'对局已经更新，请重新选择互动位置');assert(KINDS.has(b.kind),'未知互动类型');
  const at=anchor(r,b.at),to=b.kind==='arrow'?anchor(r,b.to):undefined;
  if(['tomato','rose'].includes(b.kind))assert(at.space==='player','西红柿和玫瑰请选择一位玩家');
  let roomLimit=limits.get(r);if(!roomLimit){roomLimit=new Map();limits.set(r,roomLimit);}
  const recent=(roomLimit.get(p.id)||[]).filter(t=>now-t<10000);
  if(recent.length&&(now-recent.at(-1)<650||recent.length>=6)){const error=Error('互动太快了，稍等一下再发');error.status=429;throw error;}
  roomLimit.set(p.id,[...recent,now]);
  return {id:crypto.randomUUID(),code:r.code,gameId:r.gameId,matchId:r.matchId||null,kind:b.kind,from:{id:p.id,name:p.name},at,...(to?{to}:{}),createdAt:now,expiresAt:now+4000};
 };
}
module.exports={createInteractions,anchor};
