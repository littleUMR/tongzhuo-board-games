let guidedRegion='road';
const guidedGoalSeen=new Set();
const songConceptStep=new Map();
function refreshGuidedTeaching(){if(typeof renderSong==='function'&&room.gameId==='song')renderSong();renderTutorial(room,playerId);}
function guidedTeachingHint(r){
 const key=r.code+':'+r.matchId,data=tutorialGoal(r,r.hostId);
 if(!guidedGoalSeen.has(key)&&r.status==='playing')return {title:'先知道怎么赢，再动手',text:data.win+'。你的回合要做什么？'+data.strategy,selector:'#turnContent',image:r.gameId==='song'?'/assets/song/shop-wheel.png':r.gameId==='incangold'?'/assets/incan/tent.png':'/assets/meeple-0.png',intro:true};
 if(r.gameId==='song'&&r.status==='playing'){const index=songConceptStep.get(key)??SONG_TEACHING.concepts.length;if(index<SONG_TEACHING.concepts.length)return {...SONG_TEACHING.concepts[index],concept:index};}
 const hint=guidedHint(r);
 // Each operation is attached to the reason it advances the win condition.
 if(r.status!=='finished'){
  hint.objective=data;
  if(r.gameId==='song')hint.text={0:'点高亮的“取地契”，看看它移到哪里。',1:'在你这一侧的商业街点“建造 5两”。',2:'点下方按钮，快进到学习菜谱的回合。',3:'点“开发 · 3两”，观察后厨的变化。',4:'点“结束购买 → 备菜”。',5:'点后厨四品菜下方的“淘汰 · 3两”。',6:'点“结束备菜 → 招待”。',7:'点第二位客人的招待按钮，看看净收入。',8:'在中央餐桌看刚翻出的两道菜和入账明细，再快进最后一单。',9:'点第一位客人的“招待这位客人”。'}[r.guided.step]||hint.text;
  else if(r.gameId==='incangold')hint.text=r.guided.step===3?'点“返回营地”，把这次收益存好。':[2,4].includes(r.guided.step)?'点“确认，准备下一轮”继续教学。':'点“继续探险”，观察本次选择的后果。';
  else if(hint.next)hint.text='点下方按钮，快进到最后一块地。';
  else if(hint.selector.includes('right'))hint.text='点“向右旋转”，让地块接口对齐。';
  else if(hint.selector.includes('legal-cell'))hint.text='点高亮虚线格，选择落点。';
  else if(hint.selector.includes('place'))hint.text='点“确认放置”。';
  else if(r.gameId==='carcassonne'&&r.guided.step===21)hint.text=selectedFeature===2?'点“放置随从并结束回合”，占修道院并结算道路。':'点修道院选项，再确认放置随从。道路封闭不影响其他独立区域。';
  else if(hint.selector.includes('skip'))hint.text='点“不放随从，结束回合”，看实际计分。';
  else hint.text=hint.selector.includes('finish')?'点“放置随从并结束回合”。':'点道路选项，再确认派出随从。可点下面四类区域，比较收益。';
 }
 return hint;
}
function guidedHint(r){
 const s=r.guided.step,g=r.game;
 if(r.status==='finished')return {title:r.gameId==='song'?'你赢了！8铺、52两':r.gameId==='carcassonne'?'你赢了！7比5':'你赢了！8分',text:'刚才操作的就是正式游戏界面。已完成短教学，可以退出或再练一次。',selector:'#turnContent',image:r.gameId==='song'?'/assets/song/shop-wheel.png':'/assets/meeple-0.png',exit:true};
 if(r.gameId==='song'){
  const data={
   0:['市集里的牌，还不是你的','先取地契：第一块地基免费。买下后会进入你这一侧的商业街。','[data-song-move="shop"][data-song-index="0"]'],
   1:['地契不赚钱，建店才赚钱','这张地契已到你的商业街。付5两开张；每回合买一张牌，但钱够时可建多间店。','[data-song-move="build"][data-song-index="0"]'],
   2:['店铺开张了，现银5→0','客人光顾关扑铺时赚2两。接下来快进到新回合，现银8两，学习开发菜谱。','.song-street.current',true],
   3:['菜单越好，每道菜赚得越多','四品赚1两，三品赚2两。点这里花3两开发黄金豆腐；每回合最多买一张菜单或地契。','[data-song-move="menu"][data-song-index="3"]'],
   4:['新菜单先到后厨，不立即抽到','雅阁是抽牌堆，后厨是弃牌区。雅阁用完，后厨才洗回去。现在进入备菜。','[data-song-move="purchaseDone"]'],
   5:['淘汰弱菜，之后更容易抽好菜','后厨示例已放入一张做过的四品菜。花3两淘汰；每回合最多一次，总菜单至少留6张。','[data-song-move="retire"][data-song-index="'+(g.players?.[0]?.discard?.indexOf(4)??0)+'"]:not(:disabled)'],
   6:['菜单9→8张，现银5→2两','淘汰减少了低收入菜单。此步可跳过；接下来必须招待一位客人。','[data-song-move="prepareDone"]'],
   7:['试着选第二位客人','跳过第一位要付1两。第二位吃2道菜、光顾关扑铺，还带有1两等待钱。点他看看结算。','[data-song-move="serve"][data-song-index="1"]'],
   8:['这一单净赚5两','菜品3＋店铺2＋原有等待钱1＝入账6。先付1两，现银2−1＋6＝7两。下一步快进到最后一单。','.song-receipt',true],
   9:['已建8铺，还差2两就赢','终局练习：现银48两。招待第一位，菜品2＋关扑铺2，赚4两。8铺和50两必须同时满足。','[data-song-move="serve"][data-song-index="0"]']
  }[s];return {title:data[0],text:data[1],selector:data[2],next:data[3],image:'/assets/song/shop-wheel.png'};
 }
 if(r.gameId==='incangold'){
  const data={0:['7颗宝石，3人怎么分？','每人背包2颗，路上剩1颗。背包还不安全：现在点继续，看看危险怎么发生。','[data-incan-choice="continue"]'],1:['第一张蜘蛛，暂时没有损失','再出现同一种危险，仍在神庙的人会丢掉背包。本次再点继续，亲眼看结果。','[data-incan-choice="continue"]'],2:['第二张蜘蛛，背包2→0','本轮立刻结束，帐篷财富不受影响。点正式的下一轮按钮，换个情境试试安全返回。','[data-next-round]'],3:['返回：保宝石，还能独享神器','背包2＋路上1＋神器5＝8分。只有独自返回才能拿神器；这次同伴会继续。点返回营地。','[data-incan-choice="return"]'],4:['8分已安全存入帐篷','返回先结算，之后的危险伤不到你。点下一轮，快进到第5轮结束，比帐篷财富获胜。','[data-next-round]']}[s];return {title:data[0],text:data[1],selector:data[2],image:'/assets/incan/'+(s===0?'treasure':s<3?'spiders':'return')+'.png'};
 }
 if(s===0||s===2||s===4){
  const x=s===0?1:s===2?2:0,y=s===4?1:0,correct=s===4?rotation===0:s===0?rotation%2===1:rotation===1;
  if(!correct)return {title:s===0?'地块可以旋转四个方向':'转到能匹配的方向',text:'路接路、城接城、田接田；所有相邻边都要匹配。点旋转，让接口对上。',selector:'[data-turn="right"]',image:'/assets/tile-'+g.current+'.png'};
  if(selection?.x===x&&selection?.y===y)return {title:'确认你选的落点',text:s===4?'最后半座城拼上，就能完成城市得4分，超过对手。':s===2?'两端都是修道院，中间不断、没有开口，这条路就完成。':'拼好后，再决定在刚放的地块上占哪个区域。',selector:'[data-turn="place"]',image:'/assets/tile-'+g.current+'.png'};
  return {title:s===4?'⏩ 最后一块：你3分，对手5分':s===2?'把路的另一端封住':'把直路接到已有道路上',text:s===4?'你的随从已占城市。点虚线格，再确认放置，围完整座城市。':s===2?'点右侧虚线格，再确认放置。修道院、路口和城市都可以是道路尽头。':'点高亮虚线格，再去右侧确认。正式对局也是这样拼地。',selector:`.legal-cell[data-x="${x}"][data-y="${y}"]`,image:'/assets/tile-'+g.current+'.png'};
 }
 if(s===1){const region=LESSON_SCENES.regions[guidedRegion];return {title:'占不同区域，收益不同',text:region.text+' '+region.note+' 本次选道路，再确认派随从。',selector:selectedFeature===0?'[data-turn="finish"]':'[data-feature="0"]',image:'/assets/tile-'+region.tile+'.png',regions:true};}
 if(s===21)return {title:'路已封闭，但修道院还能占',text:'这块地有独立的修道院，可以再派一名随从。结束回合时，道路得3分、道路随从回来；修道院随从留着等周围补满。',selector:selectedFeature===2?'[data-turn="finish"]':'[data-feature="2"]',image:'/assets/tile-A.png'};
 if(s===41)return {title:'已占领的城市现在可以结算',text:'城市两块都围好了。这次点“不放随从”结束，获得4分并终局结算；封闭的是城市，不代表整块地都不能占。',selector:'[data-turn="skip"]',image:'/assets/meeple-0.png'};
 return {title:'道路＋3分，分别计算两个区域',text:'道路随从已回来。如果占了修道院，那名随从继续留在院里；周围八格补满时得9分并归还。现在快进到最后一块城市地。',selector:'#gameLog',image:'/assets/meeple-0.png',next:true};
}
document.getElementById('tutorialGuide').addEventListener('click',async e=>{
 if(e.target.closest('[data-song-concept-next]')){const key=room.code+':'+room.matchId;songConceptStep.set(key,(songConceptStep.get(key)||0)+1);refreshGuidedTeaching();return;}
 if(e.target.closest('[data-song-concept-back]')){const key=room.code+':'+room.matchId;songConceptStep.set(key,Math.max(0,(songConceptStep.get(key)||0)-1));refreshGuidedTeaching();return;}
 if(e.target.closest('[data-song-concept-review]')){songConceptStep.set(room.code+':'+room.matchId,0);refreshGuidedTeaching();return;}
 if(e.target.closest('[data-teach-begin]')){guidedGoalSeen.add(room.code+':'+room.matchId);refreshGuidedTeaching();return;}
 const region=e.target.closest('[data-teach-region]');if(region){guidedRegion=region.dataset.teachRegion;refreshGuidedTeaching();return;}
 if(e.target.closest('[data-lesson-next]'))await action('lessonNext',{lessonStep:room.guided.step});
 if(e.target.closest('[data-lesson-exit]'))await action('leave');
});
