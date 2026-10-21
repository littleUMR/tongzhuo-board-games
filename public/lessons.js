(function(){
 let game,step=0,rotation=0,read=new Set(),region='road',placed=false,notice='';
 const dialog=document.createElement('dialog');dialog.id='rulesLesson';document.body.append(dialog);
 const tile=(t,extra='')=>`<div class="lesson-tile ${extra}" style="--tx:${t.x||0};--ty:${t.y||0}"><img src="/assets/tile-${t.id}.png" style="transform:rotate(${t.rotation*90}deg)" alt="地块 ${t.id}"></div>`;
 const art=(src,alt)=>`<img class="lesson-art" src="/assets/${src}.png" alt="${alt}">`;
 const button=(action,label,disabled=false)=>`<button type="button" data-lesson="${action}" ${disabled?'disabled':''}>${label}</button>`;
 const meeple=(x,y,farmer=false)=>`<img class="lesson-meeple ${farmer?'farmer':''}" style="left:${x*100}%;top:${y*100}%" src="/assets/meeple-0.png" alt="你的随从">`;
 function board(tiles,extra='',vertical=false){return `<div class="lesson-board ${vertical?'vertical':''}">${tiles.map(t=>tile(t)).join('')}${extra}</div>`;}
 function carc(){
  const s=LESSON_SCENES;
  if(step===0)return {title:'先学拼地：可以旋转',text:'地块能转四个方向。路接路、城接城、田接田；所有相邻边都要匹配。',hint:rotation%2?'方向对了！点虚线格，把道路接上。':'👆 点旋转，把竖路转成横路。',visual:board([s.road[0]],`<button class="lesson-slot" style="--tx:1;--ty:0" data-lesson="place" ${rotation%2?'':'disabled'}><img src="/assets/tile-U.png" style="transform:rotate(${rotation*90}deg)" alt="待拼接的直路"><span>${rotation%2?'👆 拼在这里':'先旋转 ↻'}</span></button>`),controls:button('rotate','↻ 旋转地块'),tag:'拼接规则'};
  if(step===1){const f=s.regions[region];return {title:'占哪里，得分方式就不同',text:f.text,hint:f.note,visual:`<div class="lesson-feature-tile">${art('tile-'+f.tile,f.name+'示例')}${meeple(...f.anchor,region==='field')}<span class="lesson-location">${f.name}</span></div>`,controls:`<div class="lesson-region-tabs">${Object.entries(s.regions).map(([id,f])=>`<button data-region="${id}" class="${region===id?'selected':''}">${read.has(id)?'✓ ':''}${f.name}</button>`).join('')}</div>`+button('next',read.size===4?'都看明白了，试着放随从':`看看四种区域 · ${read.size}/4`,read.size<4),tag:'得分区别'};}
  if(step===2)return {title:placed?'道路有主人了':'现在占住这条路',text:placed?'随从占的是整条相连道路。有人占着的相连区域，不能直接再放随从。':'随从只能放在刚拼的地块上。这次选道路，练习完成后收回随从。',hint:notice||(placed?'你还有6名随从。接下来把这条路封完整。':'👆 选道路上的圆点。也可以不放随从，留着以后用。'),visual:board(s.road.slice(0,2),placed?`<div class="lesson-token" style="--tx:1;--ty:0">${meeple(.5,.5)}</div>`:`<button class="lesson-spot" style="left:50%;top:50%" data-lesson="claim">👆 占道路</button>`),controls:placed?button('next','试着完成道路'):button('farmer','如果放在田里呢？'),tag:'放置随从'};
  if(step===3)return {title:placed?'道路完成，得到3分！':'怎样算一条完整的路？',text:placed?'这条路经过3块地，所以得到3分。随从返回手里，下次还能再用。':'从左侧修道院走到右侧修道院，中间不断、两端没有开口，这条路就完成了。',hint:placed?'随从：6 → 7　　得分：0 → 3':'👆 拼上右边这块，封住最后一个开口。',visual:board(placed?s.road:s.road.slice(0,2),placed?'<div class="lesson-score-pop">＋3 分 · 随从回来了</div>':`<button class="lesson-slot" style="--tx:2;--ty:0" data-lesson="close-road"><img src="/assets/tile-A.png" style="transform:rotate(90deg)" alt="道路尽头的修道院"><span>👆 封住路口</span></button><div class="lesson-token" style="--tx:1;--ty:0">${meeple(.5,.5)}</div>`),controls:placed?button('next','⏩ 快进到最后一块'): '',tag:'完成与计分'};
  if(step===4)return {title:'⏩ 快进：只剩最后一块',text:'这是预设的终局练习：你3分，对手5分。你的随从已占住这座城市，只差最后半座城。',hint:'👆 拼上最后一块，围完整座城市。',visual:board([s.city[0]],`<div class="lesson-token" style="--tx:0;--ty:0">${meeple(.5,.85)}</div><button class="lesson-slot" style="--tx:0;--ty:1" data-lesson="win"><img src="/assets/tile-E.png" alt="最后一块城市地块"><span>👆 完成城市</span></button>`,true),controls:'',tag:'牌堆剩余 1 块'};
  return {title:'你赢了！7 : 5',text:'两块城市围完整，每块2分，共得4分。你的3分变成7分，超过了对手！',hint:'地块用完就结束；未完成的区域与农夫也会进行终局计分。',visual:board(s.city,'<div class="lesson-score-pop">🏆 ＋4 分 · 教学胜利</div>',true),controls:button('restart','再练一次')+button('exit','学会了，回大厅'),tag:'教学完成'};
 }
 function incan(){
  const cards=(items)=>`<div class="lesson-expedition">${items.map(([image,label])=>`<div>${art('incan/'+image,label)}<b>${label}</b></div>`).join('')}</div>`;
  const lessons=[
   {title:'先分宝石，再决定去留',text:'7颗宝石，3个人：每人背包放2颗，路上剩1颗。背包暂时不算安全。',hint:'👆 点“装进背包”，试着分一次宝石。',visual:cards([['treasure','发现7颗'],['settlement/backpack','你的背包：0 → 2'],['settlement/single-gem','路上剩1颗']]),controls:button('next','👆 装进背包'),tag:'宝石平分'},
   {title:'继续会怎样？',text:'第一张蜘蛛出现，暂时没事；如果又翻到蜘蛛，仍在神庙里的人就丢掉全部背包。',hint:'👆 试一次继续，看看重复危险的后果。',visual:cards([['spiders','第一张蜘蛛'],['back','下一张未知']]),controls:button('next','👆 继续探险'),tag:'认识风险'},
   {title:'第二张蜘蛛，探险失败',text:'两张相同危险出现，本轮立刻结束。你的背包2颗归零；已经存入帐篷的财富不会丢。',hint:'这是固定演示。下一段试试安全返回。',visual:cards([['spiders','蜘蛛'],['spiders','再次出现！'],['settlement/spilled','背包：2 → 0']]),controls:button('next','试试安全返回'),tag:'重复危险'},
   {title:'返回，把财富存好',text:'换一个固定情境：背包2颗，路上1颗。你独自返回，就能保存3颗。',hint:'返回先结算；之后翻出的危险伤不到你。',visual:cards([['settlement/backpack','背包2颗'],['settlement/single-gem','路上1颗'],['tent','安全存入3颗']]),controls:button('next','👆 返回营地'),tag:'返回与余数'},
   {title:'神器只能独自带回',text:'你独自返回，路上的神器也归你！若多人一起返回，只平分宝石，神器留下。',hint:'全局最先带回的3件神器各值5分，之后各值10分。',visual:cards([['artifact-0','独自带回：＋5分'],['tent','帐篷合计：8分']]),controls:button('next','⏩ 快进到第5轮结束'),tag:'独享神器'},
   {title:'你赢了！8 : 6 : 4',text:'五轮结束，比较帐篷里的总财富。你保住宝石、独享神器，赢得教学局！',hint:'同分先比神器数量。正式游戏中，大家同时秘密选择，全部选好才揭晓。',visual:cards([['tent','你：8分'],['artifact-0','🏆 教学胜利']]),controls:button('restart','再练一次')+button('exit','学会了，回大厅'),tag:'教学完成'}
  ];return lessons[step];
 }
 function render(){
  const data=game==='carcassonne'?carc():incan(),total=6;
  dialog.innerHTML=`<header><div><small>固定情境 · 无需打完整局 · 不发桌游币</small><h2>${game==='carcassonne'?'卡卡颂':'印加寻宝'} · 边玩边懂</h2></div>${button('exit','退出教学')}</header><div class="lesson-progress" aria-label="教学进度">${Array.from({length:total},(_,i)=>`<span class="${i<=step?'done':''}"></span>`).join('')}</div><div class="lesson-layout"><section class="lesson-stage">${data.visual}</section><section class="lesson-explanation"><small>${step+1} / ${total} · ${data.tag}</small><h3>${data.title}</h3><p>${data.text}</p><div class="lesson-speech">${data.hint}</div><div class="lesson-controls">${data.controls}</div></section></div>`;
 }
 dialog.addEventListener('click',e=>{
  const tab=e.target.closest('[data-region]');if(tab){region=tab.dataset.region;read.add(region);render();return;}
  const target=e.target.closest('[data-lesson]');if(!target||target.disabled)return;
  const action=target.dataset.lesson;
  if(action==='exit'){dialog.close();return;}
  if(action==='restart'){start(game);return;}
  if(action==='rotate')rotation=(rotation+1)%4;
  else if(action==='place'){if(rotation%2!==1)return;step=1;read.add('road');}
  else if(action==='claim')placed=true;
  else if(action==='farmer')notice='农夫要留到终局。这次先占道路，体验计分后随从返回。';
  else if(action==='close-road')placed=true;
  else if(action==='win')step=5;
  else if(action==='next'){step++;placed=false;notice='';}
  render();
 });
 function start(id){game=id;step=0;rotation=0;placed=false;notice='';read=new Set();region='road';render();if(!dialog.open)dialog.showModal();}
 window.startRulesLesson=start;
})();
