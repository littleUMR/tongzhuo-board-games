const crypto=require('node:crypto');
const prizes=require('./public/cosmetics/catalog.json');
const catalog=[...prizes,{id:'title-million',name:'百万撤离成功',slot:'title',image:'/assets/incan/honors/title-million.png',achievement:true,description:'印加寻宝单次带回40及以上宝石（含神器），本局结束后解锁'}];
const byId=new Map(catalog.map(i=>[i.id,i]));
function init(a){a.cosmetics??={owned:[],equipped:{},fragments:0,draws:0,gender:'female',history:[]};a.cosmetics.gender='female';return a.cosmetics;}
function mutate(a,b,random=()=>crypto.randomInt(10000)/10000){const c=init(a);
 if(b.action==='incanSignature'){if(typeof b.text!=='string'||!b.text.trim()||b.text.trim().length>60)throw Error('寻宝签名请输入1–60字');a.incanSignature=b.text.trim();return {};}
 if(b.action==='draw'){
  if(![1,10].includes(b.count))throw Error('只能单抽或十连');
  const cost=b.count*100;if(a.coins<cost)throw Error('桌游币不足');
  a.coins-=cost;const results=[];
  for(let n=0;n<b.count;n++){c.draws++;let result;
   if(c.draws%10===0||random()<0.12){const item=prizes[Math.floor(random()*prizes.length)];const duplicate=c.owned.includes(item.id);if(duplicate)c.fragments+=20;else c.owned.push(item.id);result={type:'item',id:item.id,duplicate,guaranteed:c.draws%10===0};}
   else if(random()<0.75){const amount=5+Math.floor(random()*11);c.fragments+=amount;result={type:'fragments',amount};}
   else{const amount=10+Math.floor(random()*21);a.coins+=amount;result={type:'coins',amount};}
   results.push(result);
  }c.history=[{at:Date.now(),results},...c.history].slice(0,20);return {results};
 }
 if(b.action==='exchange'){const item=byId.get(b.id);if(!item)throw Error('外显不存在');if(item.achievement)throw Error('成就称号只能通过印加寻宝解锁');if(c.owned.includes(item.id))throw Error('已拥有此外显');if(c.fragments<item.price)throw Error('碎片不足');c.fragments-=item.price;c.owned.push(item.id);return {};}
 if(b.action==='gender')return {}; // Compatibility for older clients; the avatar is always female.
 if(b.action==='outfit'){
  if(!b.equipped||typeof b.equipped!=='object'||Array.isArray(b.equipped))throw Error('无效搭配');
  const equipped={};for(const [slot,id]of Object.entries(b.equipped)){const item=byId.get(id);if(!item||item.slot!==slot||!c.owned.includes(id))throw Error('搭配包含尚未拥有的外显');equipped[slot]=id;}
  if(equipped.dress&&(equipped.top||equipped.bottom))throw Error('连衣裙不能与上下装同时穿戴');c.equipped=equipped;return {};
 }
 if(b.action==='equip'){if(b.clear){if(!['avatar','frame','title','effect','hair','top','bottom','dress','background','hand'].includes(b.slot))throw Error('无效部位');delete c.equipped[b.slot];return {};}
  const item=byId.get(b.id);if(!item||!c.owned.includes(item.id))throw Error('尚未拥有此外显');c.equipped[item.slot]=item.id;if(item.slot==='dress'){delete c.equipped.top;delete c.equipped.bottom;}if(['top','bottom'].includes(item.slot))delete c.equipped.dress;return {};
 }throw Error('未知外显操作');
}
function publicLook(a){const c=init(a);return {gender:c.gender,equipped:{...c.equipped},collectionCount:c.owned.length,incanSignature:a.incanSignature||''};}
module.exports={catalog,init,mutate,publicLook};
