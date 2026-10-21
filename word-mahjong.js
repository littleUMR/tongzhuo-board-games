const crypto=require('node:crypto');
const skills={
 ask:{name:'有问必答',branch:'问答干扰',cd:3,need:'吃过一次',stat:'chi',parent:null,level:1},
 follow:{name:'追根究底',branch:'问答干扰',cd:4,need:'成功回答一次',stat:'answers',parent:'ask',level:3},
 swap:{name:'推敲一字',branch:'换字整理',cd:3,need:'弃过两张牌',stat:'discards',count:2,parent:null,level:1},
 choose:{name:'字里挑一',branch:'换字整理',cd:4,need:'吃过一次',stat:'chi',parent:'swap',level:3},
 recover:{name:'旧字新用',branch:'吃碰策略',cd:3,need:'碰过一次',stat:'peng',parent:null,level:1},
 shield:{name:'沉着应答',branch:'吃碰策略',cd:4,need:'成功回答一次',stat:'answers',parent:'recover',level:3}
};
const phrases='一个人 一起走 好朋友 小朋友 我喜欢 你喜欢 他喜欢 我爱你 在家里 在学校 在路上 去上学 去工作 看电影 吃午饭 喝牛奶 好开心 很高兴 小白兔 大灰狼 天气好 下雨了 不知道 没关系 对不起 谢谢你 为什么 怎么了 早上好 晚上好 今天我 明天我 昨天我 很喜欢 真好看 是朋友 的朋友 好孩子 爱学习 做作业 打篮球 看星星 去旅行 大自然 真美丽 吃苹果 喝点水 向前走 一片云 一朵花 一条鱼 一只猫 一只狗 一棵树 一阵风 讲故事 听音乐'.split(' ');
const punctuation='，。？！、；：';
function profile(a){return a.wordMahjong??={xp:0,unlocked:[],equipped:[]};}
function level(p){return 1+Math.floor(p.xp/100);}
function points(p){return level(p)-p.unlocked.length;}
function learn(a,id){const p=profile(a),s=skills[id];if(!s||p.unlocked.includes(id)||points(p)<1||level(p)<s.level||s.parent&&!p.unlocked.includes(s.parent))throw Error('技能点、等级或前置技能不足');p.unlocked.push(id);if(p.equipped.length<3)p.equipped.push(id);}
function equip(a,ids){const p=profile(a);if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!p.unlocked.includes(id)))throw Error('最多装备三个已解锁技能');p.equipped=ids;}
function tile(char){return {id:crypto.randomUUID(),char};}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function start(players,profiles={}){
 if(players.length<2||players.length>6)throw Error('文字麻将需要2–6人');
 const chars=[...new Set([...phrases.join('')+'我你他她它们的了是在有不也和就都很想要会能让把给从到着过吗呢吧啊这那谁什么哪里时候为什么怎么今天明天昨天早晚春夏秋冬山水风雨花草树木月日星天空白大小多少上下左右来去走跑看听说读写吃喝玩笑哭爱喜欢学习工作生活世界家学校朋友爸爸妈妈猫狗鸟鱼红黄蓝绿黑白一二三四五六七八九十'])];
 const deck=shuffle(chars.flatMap(c=>Array.from({length:'我你他的了是在有不很想要去看吃和'.includes(c)?10:4},()=>tile(c))).concat([...punctuation].flatMap(c=>Array.from({length:12},()=>tile(c)))));
 const g={phase:'draw',turn:0,moves:0,round:1,deck,hands:{},states:{},melds:[],river:[],log:['文字麻将开始：标点也占一张，十三张连成句。'],pending:null,event:null,winner:null};
 for(const p of players){p.score=0;g.hands[p.id]=deck.splice(0,13);g.states[p.id]={chi:0,peng:0,answers:0,discards:0,turns:0,ready:{},equipped:[...(profiles[p.id]?.equipped||[])]};}return g;
}
function log(g,t){g.log.unshift(t);g.log=g.log.slice(0,80);}
function selected(g,id,ids){if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('请选择不重复的手牌');const h=g.hands[id];const cards=ids.map(x=>h.find(c=>c.id===x));if(cards.some(c=>!c))throw Error('只能使用自己的现有手牌');return cards;}
function take(g,id,ids){const cards=selected(g,id,ids);g.hands[id]=g.hands[id].filter(c=>!ids.includes(c.id));return cards;}
function draw(g,id){if(!g.deck.length){g.phase='finished';log(g,'牌堆耗尽，本局流局。');return false;}g.hands[id].push(g.deck.pop());return true;}
function judge(text){
 const chars=[...text],words=chars.filter(c=>!punctuation.includes(c));
 const reasons=[];if(words.length<5)reasons.push('有效汉字过少');if(punctuation.includes(chars[0]))reasons.push('句首为标点');if(/[，。？！、；：]{2}/u.test(text))reasons.push('连续标点');if(/(.)\1\1/u.test(text))reasons.push('连续重复三个字');
 if(!/[是有在去来走看听说吃喝爱想要会能喜欢学习工作玩笑做读写给让下]/u.test(text))reasons.push('缺少常见谓语');
 return {pass:!reasons.length,reason:reasons.join('；')||'字数和常见句式检查通过；语义仍需全桌复核',source:'本地规则初判（非语言模型）'};
}
function beginReview(g,players,pending){g.pending={...pending,id:crypto.randomUUID(),stage:pending.kind==='answer'?'vote':'review',votes:{},deadline:Date.now()+(pending.kind==='answer'?45000:20000)};g.phase='review';}
function finishWin(g,players,id,text){g.winner=id;g.sentence=text;g.phase='finished';players.forEach(p=>p.score=p.id===id?100:0);log(g,`${players.find(p=>p.id===id).name}以「${text}」获胜！`);}
function resume(g){g.pending=null;g.phase=g.resumePhase||'discard';delete g.resumePhase;}
function finishAnswer(g,players,pass){const q=g.question;if(pass){g.states[q.target].answers++;log(g,'回答投票通过。');}else if(g.states[q.target].protectedUntil!==undefined&&g.states[q.target].protectedUntil>=g.states[q.target].turns){delete g.states[q.target].protectedUntil;log(g,'沉着应答抵消本次换牌。');}else{
 const h=g.hands[q.target],old=h.splice(crypto.randomInt(h.length),1)[0];if(!draw(g,q.target)){g.river.push(old);g.pending=null;g.question=null;return;}
 log(g,`回答未通过，随机换掉「${old.char}」。`);
 if(q.actor){g.offer={actor:q.actor,card:old,deadline:Date.now()+30000};g.phase='offer';g.pending=null;g.question=null;return;}g.river.push(old);
 }g.question=null;g.pending=null;afterQuestion(g,players);}
function afterQuestion(g,players){if(g.event?.kind==='relay'){g.event.index++;if(g.event.index<players.length){g.phase='eventAsk';g.event.deadline=Date.now()+60000;return;}g.event=null;}resume(g);}
function resolve(g,players){const p=g.pending;if(p.kind==='answer'){finishAnswer(g,players,Object.values(p.votes).filter(Boolean).length>Object.values(p.votes).filter(v=>!v).length);return;}
 const overturned=p.stage==='vote'&&Object.values(p.votes).filter(Boolean).length>Object.values(p.votes).filter(v=>!v).length;
 const pass=overturned?!p.verdict.pass:p.verdict.pass;
 log(g,`${p.kind==='win'?'成句':'吃牌'}${pass?'通过':'未通过'}${overturned?'（申诉成功）':''}：${p.text}`);
 if(p.kind==='win'&&pass){finishWin(g,players,p.actor,p.text);g.pending=null;return;}
 if(p.kind==='chi'&&pass){const cards=take(g,p.actor,p.ids);cards.push(g.last.card);g.hands[p.actor].push(...cards);g.melds.push({playerId:p.actor,kind:'吃',cards});g.river.pop();g.turn=players.findIndex(v=>v.id===p.actor);g.states[p.actor].chi++;g.states[p.actor].turns++;g.last=null;g.claims=null;g.pending=null;g.phase='discard';return;}
 if(p.kind==='chi'){g.claims[p.actor]='pass';g.pending=null;g.phase='claim';settleClaims(g,players);return;}resume(g);
}
function settleClaims(g,players){const candidates=players.filter(p=>p.id!==g.last.from),order=Array.from({length:players.length-1},(_,i)=>players[(g.turn+i+1)%players.length]);
 for(const p of order){if(g.claims[p.id]==='peng'){if(order.slice(0,order.indexOf(p)).some(v=>!g.claims[v.id]))return;const cards=take(g,p.id,g.claimCards[p.id]);cards.push(g.last.card);g.hands[p.id].push(...cards);g.river.pop();g.melds.push({playerId:p.id,kind:'碰',cards});g.states[p.id].peng++;g.states[p.id].turns++;g.turn=players.indexOf(p);g.last=null;g.claims=null;g.phase='discard';return;}}
 if(candidates.some(p=>!g.claims[p.id]))return;
 const chi=order.find(p=>g.claims[p.id]==='chi');if(chi){const ids=g.claimCards[chi.id],text=g.claimText;g.resumePhase='claim';beginReview(g,players,{kind:'chi',actor:chi.id,ids,text,verdict:{pass:phrases.includes(text),reason:phrases.includes(text)?'常用三字短语库命中':'短语库未收录，可由全桌申诉确认',source:'本地短语库'}});return;}
 g.last=null;g.claims=null;g.turn=(g.turn+1)%players.length;g.moves++;g.states[players[g.turn].id].turns++;g.phase='draw';g.round=1+Math.floor(g.moves/players.length);
 if(g.moves%(players.length*2)===0){g.resumePhase='draw';const kind=crypto.randomInt(2)?'exchange':'relay';g.event={kind,index:0,done:[],deadline:Date.now()+60000};if(kind==='exchange'){g.event.cards={};for(const p of players){if(!g.deck.length)break;g.event.cards[p.id]=g.deck.pop();}g.phase='eventExchange';}else g.phase='eventAsk';log(g,kind==='exchange'?'随机事件：全员摸一换一。':'随机事件：接力问答，依次向下家提问。');}
}
function act(g,players,id,b){
 if(g.phase==='finished')throw Error('本局已经结束');const state=g.states[id];if(!state)throw Error('旁观者不能操作');
 const current=players[g.turn].id,op=b.op;
 if(op==='vote'){const p=g.pending;if(!p||p.stage!=='vote'||b.reviewId!==p.id||typeof b.yes!=='boolean'||Object.hasOwn(p.votes,id))throw Error('投票已结束或你已投票');p.votes[id]=b.yes;if(Object.keys(p.votes).length===players.length)resolve(g,players);return;}
 if(op==='challenge'){const p=g.pending;if(!p||p.stage!=='review'||b.reviewId!==p.id)throw Error('当前不能申诉');p.stage='vote';p.votes={};p.deadline=Date.now()+45000;log(g,'有人发起质疑：同意票表示推翻初判。');return;}
 if(g.phase==='answer'){if(op!=='answer'||id!==g.question.target)throw Error('等待被提问者回答');const cards=selected(g,id,b.ids);beginReview(g,players,{kind:'answer',actor:id,text:cards.map(c=>c.char).join(''),question:g.question.text});return;}
 if(g.phase==='offer'){if(op!=='offer'||id!==g.offer.actor)throw Error('等待技能发动者选择旧牌');if(b.cardId){const cards=take(g,id,[b.cardId]);g.river.push(...cards);g.hands[id].push(g.offer.card);}else g.river.push(g.offer.card);g.offer=null;afterQuestion(g,players);return;}
 if(g.phase==='eventAsk'){const i=g.event.index;if(op!=='eventAsk'||id!==players[i].id)throw Error('等待接力提问');const text=typeof b.text==='string'?b.text.trim():'';if(!text||text.length>100)throw Error('问题为1–100字');g.question={target:players[(i+1)%players.length].id,text,deadline:Date.now()+60000};g.phase='answer';return;}
 if(g.phase==='eventExchange'){if(op!=='exchange'||g.event.done.includes(id))throw Error('你已选择或当前不能换牌');const card=g.event.cards[id];if(card){if(b.cardId){g.river.push(...take(g,id,[b.cardId]));g.hands[id].push(card);}else g.river.push(card);delete g.event.cards[id];}g.event.done.push(id);if(g.event.done.length===players.length){g.event=null;resume(g);}return;}
 if(g.phase==='claim'){
  if(id===g.last.from||g.claims[id])throw Error('你不能再响应这张弃牌');
  if(op==='pass')g.claims[id]='pass';
  else if(op==='peng'||op==='chi'){const cards=selected(g,id,b.ids);if(cards.length!==2)throw Error('请选择两张手牌');if(op==='peng'&&cards.some(c=>c.char!==g.last.card.char))throw Error('碰需要三个相同文字');if(op==='chi'){if(players[(g.turn+1)%players.length].id!==id)throw Error('只能吃上家的牌');if(typeof b.text!=='string'||[...b.text].length!==3||[...b.text].sort().join('')!==[...cards.map(c=>c.char).join('')+g.last.card.char].sort().join(''))throw Error('三字短语必须恰好使用所选两张和弃牌');g.claimText=b.text;}g.claims[id]=op;g.claimCards[id]=b.ids;
  }else throw Error('请选择吃、碰或过');settleClaims(g,players);return;
 }
 if(id!==current||!['draw','discard'].includes(g.phase))throw Error('当前不能操作');
 if(op==='draw'){if(g.phase!=='draw')throw Error('已经摸过牌');if(draw(g,id))g.phase='discard';return;}
 if(op==='win'){const cards=selected(g,id,b.ids);if(cards.length!==13||g.hands[id].length!==13)throw Error('请在13张手牌时，用全部牌排列成句');const text=cards.map(c=>c.char).join('');g.resumePhase=g.phase;beginReview(g,players,{kind:'win',actor:id,text,verdict:judge(text)});return;}
 if(op==='discard'){if(g.phase!=='discard'||g.hands[id].length!==14)throw Error('摸牌或吃碰后，选择一张弃牌');const [card]=take(g,id,[b.cardId]);g.river.push(card);g.last={card,from:id};g.claims={};g.claimCards={};g.claimDeadline=Date.now()+15000;state.discards++;g.phase='claim';log(g,`${players[g.turn].name}弃「${card.char}」。`);return;}
 if(op==='skill'){
  const s=skills[b.skill];if(!s||!state.equipped.includes(b.skill)||state[s.stat]<(s.count||1)||(state.ready[b.skill]||0)>state.turns)throw Error('技能未装备、条件未满足或仍在冷却');
  if(['ask','follow'].includes(b.skill)){if(!players.some(p=>p.id===b.target&&p.id!==id))throw Error('请选择其他玩家');const text=typeof b.text==='string'?b.text.trim():'';if(!text||text.length>100)throw Error('问题为1–100字');g.resumePhase=g.phase;g.question={actor:id,target:b.target,text,deadline:Date.now()+60000};g.phase='answer';}
  else if(b.skill==='shield')state.protectedUntil=state.turns+2;
  else if(b.skill==='recover'){if(!g.river.length)throw Error('弃牌区没有牌');const [old]=take(g,id,[b.cardId]);g.hands[id].push(g.river.pop());g.river.push(old);}
  else{selected(g,id,[b.cardId]);if(g.deck.length<(b.skill==='choose'?2:1))throw Error('牌堆不足');const [old]=take(g,id,[b.cardId]);if(b.skill==='choose'){g.resumePhase=g.phase;g.choices={actor:id,cards:[g.deck.pop(),g.deck.pop()],old,deadline:Date.now()+30000};g.phase='skillChoose';}else{g.river.push(old);draw(g,id);}}
  state.ready[b.skill]=state.turns+s.cd;log(g,`${players[g.turn].name}使用「${s.name}」。`);return;
 }throw Error('未知文字麻将操作');
}
// Two-card choices are resolved separately so normal actions cannot bypass the suspended turn.
function move(g,players,id,b){if(g.phase==='skillChoose'){if(b.op!=='skillChoose'||id!==g.choices.actor||!g.choices.cards.some(c=>c.id===b.cardId))throw Error('请选择技能摸到的一张牌');g.hands[id].push(g.choices.cards.find(c=>c.id===b.cardId));g.river.push(g.choices.old,...g.choices.cards.filter(c=>c.id!==b.cardId));g.choices=null;resume(g);return;}act(g,players,id,b);}
function tick(g,players,now=Date.now()){
 if(g.pending&&now>=g.pending.deadline){resolve(g,players);return true;}
 if(g.phase==='answer'&&now>=g.question.deadline){finishAnswer(g,players,false);return true;}
 if(g.phase==='claim'&&now>=g.claimDeadline){for(const p of players)if(p.id!==g.last.from&&!g.claims[p.id])g.claims[p.id]='pass';settleClaims(g,players);return true;}
 if(g.phase==='offer'&&now>=g.offer.deadline){move(g,players,g.offer.actor,{op:'offer'});return true;}
 if(g.phase==='skillChoose'&&now>=g.choices.deadline){move(g,players,g.choices.actor,{op:'skillChoose',cardId:g.choices.cards[0].id});return true;}
 if(g.phase==='eventAsk'&&now>=g.event.deadline){g.event.index++;if(g.event.index===players.length){g.event=null;resume(g);}else g.event.deadline=now+60000;return true;}
 if(g.phase==='eventExchange'&&now>=g.event.deadline){for(const p of players)if(!g.event?.done.includes(p.id)&&g.event)move(g,players,p.id,{op:'exchange'});return true;}return false;
}
function publicGame(g,id){const v=structuredClone(g);v.remaining=g.deck.length;delete v.deck;v.hands=Object.fromEntries(Object.entries(g.hands).map(([p,h])=>[p,p===id?h:{count:h.length}]));if(v.event?.cards)v.event.cards=id&&v.event.cards[id]?{[id]:v.event.cards[id]}:{};if(v.choices&&v.choices.actor!==id)v.choices={actor:v.choices.actor,deadline:v.choices.deadline};delete v.claimCards;return v;}
module.exports={start,act:move,tick,publicGame,judge,skills,profile,learn,equip,level,points,phrases};
