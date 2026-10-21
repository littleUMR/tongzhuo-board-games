// Keep decisions on the table; supporting information and presentations open on demand.
let songDesk={key:'',panel:'',seq:0,pending:'',timer:0,views:{},street:''};
function songPanelButton(id,label){return '<button type="button" data-song-panel="'+id+'">'+label+'</button>';}
function songOwned(id,ownerId){const p=room.game.players.find(p=>p.id===ownerId),cards=p?.shops.filter(s=>s.id===id)||[];return '<p class="song-ownership">已建 '+cards.filter(s=>s.built).length+' · 待建 '+cards.filter(s=>!s.built).length+(cards.length?' · 已拥有':' · 尚未拥有')+'</p>';}
function songShopStatus(shop,ownerId){
 const links=[['fortune','wheel',2],['wheel','drink',1],['tea','story',2],['wine','story',2],['drink','story',2],['book','tea',2],['silk','jewelry',1],['porcelain','jewelry',1]],p=room.game.players.find(p=>p.id===ownerId),built=id=>p?.shops.some(s=>s.id===id&&s.built);
 return songOwned(shop.id,ownerId)+'<div class="song-link-list">'+links.filter(([a,b])=>a===shop.id||b===shop.id).map(([a,b,n])=>{const ready=built(a)&&built(b),missing=[a,b].filter(id=>!built(id));return '<article>'+songImage('piece-'+a,songShopName(a))+'<span>＋</span>'+songImage('piece-'+b,songShopName(b))+'<p><b>'+(ready?'已形成联动':'尚未形成联动')+'</b><br>'+songShopName(a)+'被光顾时 +'+n+'两<br>'+(ready?'两间店均已开张':'还需建成：'+missing.map(songShopName).join('、'))+'</p></article>';}).join('')+'</div>';
}
function songEventArt(event){if(!event)return '';const i=SONG_CARDS.events.findIndex(e=>e.id===event.id);return '<div class="song-event-art" role="img" aria-label="'+esc(event.name)+'插画" style="background-position:'+(i%3*50)+'% '+(Math.floor(i/3)*50)+'%"></div>';}
function songMenuCollection(p,includeDiscard=true){const group=(title,cards)=>'<h4>'+title+' · '+cards.length+'张</h4><div class="song-menu-collection">'+cards.map(grade=>{const m=SONG_CARDS.menus.find(m=>m.grade===grade);return '<article class="quality-'+grade+'">'+songImage(m.art,m.name)+'<b>'+grade+'品 · '+m.name+'</b><small>收入 '+m.income+'</small></article>';}).join('')+'</div>';return group('雅阁（展示组成，不公开抽取顺序）',p.menuDraw||[])+(includeDiscard?group('后厨弃牌',p.discard||[]):'');}
function songNoticeHTML(notice){
 if(notice.opening)return '<p class="song-opening-goal">胜利条件：先建造 <strong>8</strong> 个店铺且拥有 <strong>50</strong> 两现银的玩家获胜。</p>'+songNoticeHTML({...notice,opening:false});
 if(notice.kind==='draw')return '<p>本次新补入的公共牌，所有玩家同步可见。看完后继续经营。</p><div class="song-reveal-cards">'+notice.cards.map(({kind,card:c})=>'<article class="song-reveal-card">'+(kind==='event'?songEventArt(c):songImage(c.art,c.name))+'<small>'+({event:'事件揭晓',shop:'新地契',guest:'新客人'}[kind])+'</small><h3>'+esc(c.name)+'</h3><p>'+esc(kind==='event'?c.rule:kind==='shop'?'建造 '+c.cost+'两 · '+c.rule:c.meals+'道菜 · '+c.visits.map(songShopName).join(' / '))+'</p></article>').join('')+'</div>';
 const p=room.game.players.find(p=>p.id===notice.id),owner=room.players.find(v=>v.id===notice.id);return '<div class="song-victory-portrait">'+(window.cosmeticDoll?window.cosmeticDoll(owner.look||{}):songImage('guest-merchant',owner.name))+'</div><h2>'+esc(owner.name)+(notice.kind==='win'?' 获胜！':' 已建成八家店铺！')+'</h2><p>'+p.money+'两现银 · '+p.shops.filter(s=>s.built).length+'家已建店铺</p><p>'+(notice.kind==='win'?'八铺兴隆，持银五十！':('距离胜利还差 '+Math.max(0,50-p.money)+' 两（需持有50两）。'))+'</p>';
}
function songDismissPanel(){if(songDesk.panel==='notice')songDesk.notices.shift();songDesk.panel=songDesk.notices?.length?'notice':'';clearTimeout(songDesk.timer);songRenderPanel();}
function songSeatPositions(players,selfId){
 const start=Math.max(0,players.findIndex(p=>p.id===selfId)),positions=players.length===2?['bottom','top']:players.length===3?['bottom','right','left']:['bottom','right','top','left'];
 return players.map((_,i)=>({id:players[(start+i)%players.length].id,position:positions[i]}));
}
function songReflow(g){
 const board=$('songBoard'),mine=room.status==='playing'&&room.players[g.turn]?.id===playerId,actor=g.players[g.turn];
 const key=room.code+':'+room.matchId,seq=g.lastSettlement?.seq||0,pending=g.pendingSettlement?g.pendingSettlement.mealId+':'+g.step:'';
 if(songDesk.key!==key){clearTimeout(songDesk.timer);songDesk={key,panel:pending?'settlement':'',seq,pending,timer:0,views:{},street:'',notices:[],reveal:g.revealSeq||0,eight:g.players.filter(p=>p.shops.filter(s=>s.built).length>=8).map(p=>p.id),won:false};if(!room.tutorial&&g.phase!=='finished')songDesk.notices.push({kind:'draw',opening:g.moves===0,cards:g.reveals?.length?g.reveals:[...g.market.map(card=>({kind:'shop',card})),...g.queue.map(card=>({kind:'guest',card}))]});}
 else if(pending&&pending!==songDesk.pending){songDesk.panel='settlement';clearTimeout(songDesk.timer);}
 else if(seq!==songDesk.seq){songDesk.panel='settlement';clearTimeout(songDesk.timer);if(!room.tutorial)songDesk.timer=setTimeout(()=>{if(songDesk.key===key&&songDesk.panel==='settlement'){songDesk.panel='';if(room?.gameId==='song')renderSong();}},8000);}
 songDesk.seq=seq;songDesk.pending=pending;
 if(g.revealSeq!==undefined&&g.revealSeq!==songDesk.reveal){songDesk.reveal=g.revealSeq;if(g.phase!=='finished'&&g.reveals?.length)songDesk.notices.push({kind:'draw',cards:g.reveals});}
 for(const p of g.players)if(p.shops.filter(s=>s.built).length>=8&&!songDesk.eight.includes(p.id)){songDesk.eight.push(p.id);songDesk.notices.push({kind:'eight',id:p.id});}
 if(g.phase==='finished'&&!songDesk.won){songDesk.won=true;songDesk.notices=songDesk.notices.filter(n=>n.kind!=='draw'&&n.kind!=='eight');songDesk.notices.unshift(...g.winners.map(id=>({kind:'win',id})));songDesk.panel='notice';clearTimeout(songDesk.timer);}
 if(room.guided)songDesk.panel=room.guided.step===8?'settlement':[5,6].includes(room.guided.step)?'kitchen':'';
 else if(mine&&g.phase==='prepare'&&songDesk.phase!=='prepare')songDesk.panel='kitchen';
 else if(g.phase==='serve'&&songDesk.phase!=='serve'&&songDesk.panel==='kitchen')songDesk.panel='';
 songDesk.phase=g.phase;
 if(!songDesk.panel&&songDesk.notices.length)songDesk.panel='notice';
 const streets=[...board.querySelectorAll('.song-street')],rows=[...board.querySelectorAll('.song-market-columns>section')];
 songDesk.views={kitchen:board.querySelector('.song-kitchen').outerHTML,settlement:board.querySelector('.song-banquet').outerHTML,log:'<ol class="song-readable-log">'+g.log.map(t=>'<li>'+esc(t)+'</li>').join('')};
 const own=g.players.find(p=>p.id===playerId),e=g.pendingSettlement||g.lastSettlement;
 if(own){const reason=own.drawCount+own.discardCount<=6?'牌组至少保留6张，当前不能淘汰。':own.discardCount===0?'后厨没有可淘汰的弃牌。':g.retiredMenu?'本回合已经淘汰过一次。':own.money<3?'淘汰需要3两，当前银两不足。':'备菜时可付3两淘汰一张后厨牌；每回合一次。';songDesk.views.kitchen='<p class="song-retire-reason">'+reason+'</p>'+songDesk.views.kitchen+songMenuCollection(own,false);}
 if(e)songDesk.views.settlement+='<p class="song-net-income">选客支出 −'+(e.waitingPaid||0)+'两（已在选客时扣除） · 本单净赚 '+(e.total===undefined?'待结算':e.total-(e.waitingPaid||0))+'两</p>';
 songDesk.streets={};
 streets.forEach((street,i)=>{
  const state=g.players.find(p=>p.id===street.dataset.songOwner);
  if(!state)return;
  street.querySelectorAll('.song-piece').forEach((piece,i)=>{const shop=state.shops[i];if(shop.built&&songShopStatus(shop,state.id).includes('已形成联动')){const badge=document.createElement('span');badge.className='song-link-badge';badge.textContent='联动';badge.title='点击店铺图片查看已形成的联动';piece.append(badge);}});
  if(state.id!==playerId)street.querySelectorAll('.song-piece.unbuilt>button[data-song-move]').forEach(button=>{const label=document.createElement('em');label.className='song-unbuilt-label';label.textContent='待建';button.replaceWith(label);});
  street.querySelector('header>b').innerHTML='<button type="button" data-song-street="'+state.id+'">'+esc(room.players.find(v=>v.id===state.id).name)+(state.id===playerId?' · 你':'')+' <small>展开 ↗</small></button>';
  if(state.id===playerId){
   street.classList.add('song-own-street');
   const stats=street.querySelector('header>span');stats.className='song-own-stats';
   stats.innerHTML='<strong>现银 <em>'+state.money+'</em> 两</strong><strong>已建 <em>'+state.shops.filter(s=>s.built).length+'</em> / 8 铺</strong>';
   street.querySelector('header>b').after(stats);
  }
  const linked=state.shops.filter(s=>s.built).map(s=>songShopStatus(s,state.id)).filter(html=>html.includes('<article>'));
  songDesk.streets[state.id]=street.outerHTML+'<h3>店铺联动</h3>'+linked.join('')+'<h3>菜牌组成</h3>'+songMenuCollection(state);
 });
 rows.forEach((row,i)=>{row.hidden=false;row.className='song-offer-row song-offer-'+['guest','shop','menu'][i];});
 rows[0].querySelector('h4').innerHTML='客人 <small>比较菜数、逛店和等待钱</small><span class="song-stock">牌库 '+g.remainingGuests+'</span>';
 rows[1].querySelector('h4').innerHTML='地契 <small>每回合与菜谱二选一</small><button data-song-detail="decks" data-song-card="0" class="song-stock">库余 '+g.remainingShops+' · 明细</button>';
 rows[2].querySelector('h4').innerHTML='菜谱 <small>四品最低 → 一品最高</small>';
 rows[1].querySelectorAll('.song-card').forEach((node,i)=>{const s=g.market[i],rule=document.createElement('p');rule.className='song-shop-rule';rule.textContent=s.rule;node.querySelector('div').insertBefore(rule,node.querySelector('[data-song-move]'));});
 rows[2].querySelectorAll('.song-menu').forEach((node,i)=>{const m=SONG_CARDS.menus[i];node.querySelector('b').textContent=m.grade+'品 · '+m.name;});
 rows.forEach(row=>row.querySelectorAll('.song-card>div>small,.song-card>div>p,.song-menu>div>small,.song-menu>div>p,[data-song-move]').forEach(node=>{
  node.innerHTML=esc(node.textContent).replace(/\d+/g,'<span class="song-key-number">$&</span>');
 }));
 rows[0].classList.toggle('priority',g.phase==='serve');rows[1].classList.toggle('priority',g.phase==='purchase');rows[2].classList.toggle('priority',g.phase==='purchase');
 const phase={purchase:'购买营建',prepare:'备菜汰旧',serve:'选择客人',roll:'掷骰收银',finished:'对局结束'}[g.phase];
 let command=g.phase==='purchase'?songButton('purchaseDone',0,'结束购买 → 备菜',mine):g.phase==='prepare'?songPanelButton('kitchen','打开后厨汰旧')+songButton('prepareDone',0,'结束备菜 → 招待',mine):g.phase==='roll'?songPanelButton('settlement','查看待掷骰子'):'';
 if(g.phase==='finished')command=room.hostId===playerId?'<button data-turn="rematch">再开一局</button>':'';
 const hint=g.phase==='purchase'?(g.boughtCard?'已买入一张牌，仍可建造已有地契':'挑选地契或菜谱，已有地契可直接建造'):g.phase==='serve'?'在客人区选择一位，中央浮层会翻菜、掷骰并结算':g.phase==='prepare'?'可淘汰后厨一张弱菜，也可跳过':g.phase==='roll'?'这一单尚未结算，等待当前玩家亲手掷骰':'本局已结束，可回看最后一单';
 const winner=g.phase==='finished'?room.players.filter(p=>g.winners.includes(p.id)).map(p=>p.name).join('、')+' 获胜':room.players[g.turn].name+'的回合';
 board.classList.add('song-desk');board.classList.toggle('song-rolling',songSubmitting&&g.phase==='roll');board.style.setProperty('--seat-count',g.players.length);
 board.replaceChildren();
 const header=document.createElement('header');header.className='song-desk-head';header.innerHTML='<h2>大宋百商图</h2><span class="song-headline">'+(g.activeEvent?'当前事件：'+esc(g.activeEvent.name)+' · '+esc(g.activeEvent.rule)+' <button data-song-detail="event" data-song-card="0">查看详情</button>':esc(g.tableEvents?.at(-1)?.text||'汴京开市，先投资，再招待客人'))+'</span><nav>'+songPanelButton('kitchen','我的菜牌')+songPanelButton('log','对局记录')+songPanelButton('settlement','回看上一单')+'<button data-song-chat>聊天</button><button data-song-rules>规则</button></nav>';
 const actions=document.createElement('section');actions.className='song-action-bar';actions.innerHTML='<strong>'+esc(winner)+'</strong><b>'+phase+'</b><span>'+esc(hint)+'</span><em>'+actor.money+'两 · 已建'+actor.shops.filter(s=>s.built).length+'/8铺</em>'+command+(g.activeEvent?'<button data-song-detail="event" data-song-card="0" class="song-event-chip">事件：'+esc(g.activeEvent.name)+'</button>':'');
 actions.querySelector('.song-event-chip')?.remove();
 const market=document.createElement('main');market.className='song-decision-market';market.setAttribute('aria-label','每轮公共选择：地契、菜谱、客人');market.append(rows[1],rows[2],rows[0]);
 const table=document.createElement('section');table.className='song-mahjong-table';table.dataset.seats=g.players.length;table.setAttribute('aria-label','四方桌面 · 自己在下方');table.append(market);
 for(const seat of songSeatPositions(g.players,playerId)){
  const street=streets.find(s=>s.dataset.songOwner===seat.id);if(!street)continue;
  const zone=document.createElement('section');zone.className='song-seat seat-'+seat.position;zone.dataset.owner=seat.id;
  zone.append(street);if(seat.position==='bottom')zone.append(actions);
  table.append(zone);
 }
 board.append(header,table);
 songRenderPanel();
}
function songRenderPanel(){
 const board=$('songBoard');board.querySelector('.song-overlay')?.remove();if(!songDesk.panel)return;
 const titles={kitchen:'我的菜牌 · 后厨与雅阁',settlement:room.game.pendingSettlement?'正在招待 · 等待掷骰':'上一单 · 上菜与收银',log:'对局记录',street:'商业街全景',notice:songDesk.notices?.[0]?.kind==='draw'?'公共补牌 · 翻牌展示':songDesk.notices?.[0]?.kind==='win'?'东家获胜':'八铺兴隆 · 胜利预警'};
 let content=songDesk.panel==='street'?songDesk.streets[songDesk.street]:songDesk.views[songDesk.panel];
 if(songDesk.panel==='notice')content=songNoticeHTML(songDesk.notices[0]);
 if(songDesk.panel==='kitchen'&&!room.game.players.some(p=>p.id===playerId))content='<p>旁观时请点击东家名称查看他的菜牌组成。</p>';
 const preparing=songDesk.panel==='kitchen'&&room.game.phase==='prepare'&&room.players[room.game.turn].id===playerId;
 const close=preparing?songButton('prepareDone',0,room.game.retiredMenu?'完成备菜':'不淘汰任何菜品'):('<button type="button" data-song-dismiss>'+(songDesk.panel==='notice'?'看完了，继续':'收起 ×')+'</button>');
 const overlay=document.createElement('section');overlay.className='song-overlay';overlay.innerHTML='<div class="song-overlay-shade" '+(songDesk.panel==='notice'?'':'data-song-dismiss')+'></div><section class="song-overlay-window panel-'+songDesk.panel+'" role="dialog" aria-label="'+titles[songDesk.panel]+'"><header><h3>'+titles[songDesk.panel]+'</h3>'+close+'</header><div class="song-overlay-content">'+content+'</div></section>';board.append(overlay);
 overlay.querySelector('button[data-song-dismiss]')?.focus({preventScroll:true});
}
document.addEventListener('click',e=>{
 if(room?.gameId!=='song')return;
 const panel=e.target.closest('[data-song-panel]'),street=e.target.closest('[data-song-street]');
 if(e.target.closest('[data-song-chat]')){$('chatOpen').click();return;}
 if(e.target.closest('[data-song-dismiss]')){songDismissPanel();return;}
 if(panel){songDesk.panel=panel.dataset.songPanel;clearTimeout(songDesk.timer);songRenderPanel();}
 if(street){songDesk.street=street.dataset.songStreet;songDesk.panel='street';songRenderPanel();}
});
document.addEventListener('keydown',e=>{
 if(!songDesk.panel||document.querySelector('dialog[open]'))return;
 if(e.key==='Escape'){if(songDesk.panel!=='notice')songDismissPanel();return;}
 if(e.key==='Tab'){
  const window=document.querySelector('.song-overlay-window'),buttons=window?[...window.querySelectorAll('button:not(:disabled),[href],input')]:[];
  if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
});
