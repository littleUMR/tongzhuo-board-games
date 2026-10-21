let tutorialRoom=null,tutorialViewer=null,tutorialFrame=0,tutorialKey='',tutorialTarget=null,tutorialChatRoom='';
function renderTutorial(room,viewerId){
 tutorialRoom=room;tutorialViewer=viewerId;cancelAnimationFrame(tutorialFrame);tutorialFrame=requestAnimationFrame(updateTutorial);
}
function updateTutorial(){
 const room=tutorialRoom,panel=document.getElementById('tutorialGuide');
 tutorialTarget?.classList.remove('tutorial-target');tutorialTarget=null;
 panel.classList.toggle('hidden',!room?.tutorial);if(!room?.tutorial)return;
 if(tutorialChatRoom!==room.code){document.getElementById('chatWindow').classList.add('hidden');tutorialChatRoom=room.code;}
 const g=room.game,mine=room.players[g?.turn]?.id===tutorialViewer;
 let title='看机器人示范',text='轮到你时，手指会提示下一步。',selector='#gameLog',image='/assets/meeple-0.png';
 if(room.status==='waiting'){title='准备再练一局';text='点这里，开始练习。';selector='#readyButton';}
 else if(room.status==='finished'){title='完成一局！';text='看看得分，再练一次吧。';selector='[data-turn="rematch"]';}
 else if(room.gameId==='song'){
  image='/assets/song/shop-fortune.png';
  if(mine){
   if(g.phase==='purchase'){
    const build=document.querySelector('[data-song-move="build"]:not(:disabled)');
    if(build){title='让店铺开张';text='付建造费，地契变成店铺。';selector='[data-song-move="build"]:not(:disabled)';}
    else if(!g.boughtCard&&document.querySelector('[data-song-move="shop"]:not(:disabled)')){title='先拿一张地契';text='点这里。第一块地基免费！';selector='[data-song-move="shop"]:not(:disabled)';}
    else {title='进入备菜';text='这步完成了，点这里继续。';selector='[data-song-move="purchaseDone"]';}
   }else if(g.phase==='prepare'){title='先试一次招待';text='这次跳过淘汰，直接继续。';selector='[data-song-move="prepareDone"]';image='/assets/song/menu-rice.png';}
   else if(g.phase==='roll'){title='亲手掷骰';text='点高亮骰子按钮，所有人都能看到点数和收入。';selector='[data-song-move="roll"]:not(:disabled)';}
   else {title='招待这位客人';text='第一位免等待钱，点他赚银两。';selector='[data-song-move="serve"]:not(:disabled)';image='/assets/song/guest-scholar.png';}
  }
 }else if(room.gameId==='incangold'){
  image='/assets/incan/return.png';
  if(g.phase==='roundEnd'){title='下一轮出发';text='本轮已结算，点这里确认。';selector='[data-next-round]';}
  else if(!g.active.includes(tutorialViewer)){title='已经安全返回';text='宝石已存好，看看其他人吧。';selector='#incanBoard';}
  else if(g.ownChoice){title='等大家选完';text='所有人选好后，一起揭晓。';selector='#turnContent';}
  else {title='试试安全返回';text='带回背包宝石；继续则有风险。';selector='[data-incan-choice="return"]';}
 }else if(mine){
  image='/assets/tile-'+g.current+'.png';
  if(g.phase==='tile'){
   const confirm=document.querySelector('[data-turn="place"]:not(:disabled)');
   if(confirm){title='确认这块地';text='点这里，接着选择随从。';selector='[data-turn="place"]';}
   else {title='选一个虚线格';text='点这里拼地。路接路，城接城。';selector='#board button';if(!document.querySelector(selector)){title='转一下地块';text='换个方向，寻找可放的位置。';selector='[data-turn="right"]';}}
  }else {
   image='/assets/meeple-0.png';
   if(document.querySelector('[data-turn="finish"]:not(:disabled)')){title='派出随从';text='点这里确认，完成区域就得分。';selector='[data-turn="finish"]';}
   else if(document.querySelector('[data-feature]:not(:disabled)')){title='选择随从的位置';text='点一个区域，占住它来得分。';selector='[data-feature]:not(:disabled)';}
   else {title='这次不放随从';text='点这里结束回合。';selector='[data-turn="skip"]';}
  }
 }
 const lesson=room.guided?guidedTeachingHint(room):null;if(lesson){({title,text,selector,image}=lesson);}
 let target=document.querySelector(selector)||document.getElementById('turnContent');if(lesson?.card)target=target.closest('article')||target;
 const key=room.code+':'+g?.turn+':'+title;
 if(target&&key!==tutorialKey){target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});tutorialKey=key;}
 tutorialTarget=target;target?.classList.add('tutorial-target');
 panel.replaceChildren();
 const pic=document.createElement('img');pic.src=target?.closest('article')?.querySelector('img')?.getAttribute('src')||image;pic.alt='操作示意';
 const copy=document.createElement('div'),heading=document.createElement('strong'),line=document.createElement('p');heading.textContent=title;line.textContent=text;copy.append(heading,line);
 if(lesson?.objective){heading.textContent='小目标：'+lesson.objective.turn;const why=document.createElement('p');why.className='guided-reason';why.textContent=lesson.objective.why;copy.insertBefore(why,line);const progress=document.createElement('small');progress.className='guided-progress';progress.textContent=lesson.objective.progress;copy.append(progress);}
 const hand=document.createElement('span');hand.className='tutorial-hand';hand.textContent='👆';hand.setAttribute('aria-hidden','true');
 if(lesson?.intro){const b=document.createElement('button');b.type='button';b.dataset.teachBegin='';b.textContent='明白目标，开始练习';copy.append(b);}
 if(lesson?.concept!==undefined){
  if(lesson.relation){const row=document.createElement('div');row.className='song-teaching-relation';for(const [art,label] of [['guest-scholar','客人下单'],['menu-tofu','菜谱收入'],['shop-wheel','店铺收入']]){const item=document.createElement('span'),img=document.createElement('img'),name=document.createElement('small');img.src='/assets/song/'+art+'.png';img.alt=label;name.textContent=label;item.append(img,name);row.append(item);}copy.append(row);}
  if(lesson.flow){const list=document.createElement('div');list.className='song-teaching-flow';for(const phase of SONG_TEACHING.phases){const item=document.createElement('p'),name=document.createElement('strong'),detail=document.createElement('span');name.textContent=phase.name;detail.textContent=phase.detail;item.append(name,detail);list.append(item);}copy.append(list);}
  const controls=document.createElement('div');controls.className='song-concept-controls';if(lesson.concept>0){const back=document.createElement('button');back.type='button';back.dataset.songConceptBack='';back.textContent='上一项';controls.append(back);}const next=document.createElement('button');next.type='button';next.dataset.songConceptNext='';next.textContent=lesson.flow?'明白流程，开始这一回合':'看懂了，继续（'+(lesson.concept+1)+'/5）';controls.append(next);copy.append(controls);
 }
 if(room.guided&&room.gameId==='song'&&lesson?.concept===undefined&&!lesson?.intro&&room.status==='playing'){
  const flow=document.createElement('div');flow.className='song-teaching-phases';for(const phase of SONG_TEACHING.phases){const item=document.createElement('span');item.textContent=phase.name;item.classList.toggle('current',phase.id===g.phase);flow.append(item);}const review=document.createElement('button');review.type='button';review.dataset.songConceptReview='';review.className='song-concept-review';review.textContent='再看：三类牌与回合流程';copy.append(flow,review);
 }
 if(lesson?.regions){const tabs=document.createElement('div');tabs.className='guided-region-tabs';for(const [id,r] of Object.entries(LESSON_SCENES.regions)){const b=document.createElement('button');b.type='button';b.dataset.teachRegion=id;b.textContent=r.name;tabs.append(b);}copy.append(tabs);}
 if(lesson?.next||lesson?.exit){const b=document.createElement('button');b.type='button';b.textContent=lesson.exit?'完成教学，回大厅':'看懂了，快进到下一情境';b.dataset[lesson.exit?'lessonExit':'lessonNext']='';copy.append(b);}
 panel.append(pic,copy,hand);placeTutorial();requestAnimationFrame(placeTutorial);
}
function placeTutorial(){
 const panel=document.getElementById('tutorialGuide');if(!tutorialTarget||panel.classList.contains('hidden'))return;
 const r=tutorialTarget.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight;
 const left=r.left>w+24?r.left-w-18:Math.min(innerWidth-w-12,r.right+18);
 panel.dataset.side=left<r.left?'left':'right';panel.style.left=Math.max(12,left)+'px';panel.style.top=Math.max(90,Math.min(innerHeight-h-12,r.top+(r.height-h)/2))+'px';
 const hand=panel.querySelector('.tutorial-hand');hand.style.left=Math.max(6,Math.min(innerWidth-44,r.left+r.width/2-18))+'px';hand.style.top=Math.max(74,Math.min(innerHeight-44,r.bottom-8))+'px';
}
document.addEventListener('load',placeTutorial,true);window.addEventListener('resize',placeTutorial);document.addEventListener('scroll',placeTutorial,true);
new MutationObserver(records=>{const panel=document.getElementById('tutorialGuide');if(tutorialRoom?.tutorial&&records.some(r=>!panel.contains(r.target))){cancelAnimationFrame(tutorialFrame);tutorialFrame=requestAnimationFrame(updateTutorial);}}).observe(document.getElementById('roomView'),{childList:true,subtree:true});
