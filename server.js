const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const engine=require('./game');
const incan=require('./incan');
const games=require('./public/games.json');
const {rewards}=require('./economy');
const PUBLIC=path.join(__dirname,'public');
function createApp({persist=true}={}) {
 const file=path.join(__dirname,'data','rooms.json');let rooms={};
 if(persist&&fs.existsSync(file))rooms=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const room of Object.values(rooms)){room.gameId??='carcassonne';room.spectators??=[];if(!room.players.length&&!room.spectators.length)delete rooms[room.code];}
 const historyFile=path.join(__dirname,'data','match-history.json');const histories=persist&&fs.existsSync(historyFile)?JSON.parse(fs.readFileSync(historyFile,'utf8')):{};
 const chatFile=path.join(__dirname,'data','chats.json');let chats=persist&&fs.existsSync(chatFile)?JSON.parse(fs.readFileSync(chatFile,'utf8')):{};
 for(const r of Object.values(rooms))chats[r.code]??={code:r.code,title:r.title,players:r.players.map(({id,token,name})=>({id,token,name})),chat:r.chat||[],updated:r.updated};
 const clients=new Set(),chatClients=new Set(),departures=new Map();
 const imageDir=path.join(__dirname,'data','chat-images'),imageMemory=new Map();
 const stickerFile=path.join(__dirname,'data','stickers.json');let stickers=persist&&fs.existsSync(stickerFile)?JSON.parse(fs.readFileSync(stickerFile,'utf8')):[];
 const defaultStickers=require('./public/assets/umaru-gifs/manifest.json');
 const ownerKey=token=>crypto.createHash('sha256').update(token).digest('hex');
 const anyaStickers=require('./public/assets/anya/manifest.json');
 const economyFile=path.join(__dirname,'data','economy.json');const economy=persist&&fs.existsSync(economyFile)?JSON.parse(fs.readFileSync(economyFile,'utf8')):{accounts:{},settlements:{}};
 function wallet(token){if(typeof token!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(token))return {coins:0,anyaUnlocked:false};const key=ownerKey(token);return economy.accounts[key]??={coins:0,anyaUnlocked:false};}
 function saveEconomy(){if(persist){fs.mkdirSync(path.dirname(economyFile),{recursive:true});fs.writeFileSync(economyFile+'.tmp',JSON.stringify(economy));fs.renameSync(economyFile+'.tmp',economyFile);}}
 function settle(r){if(r.status!=='finished'||!r.matchId)return;let payout=economy.settlements[r.matchId];if(!payout){payout=rewards(r.gameId,r.players);for(const row of payout){const p=r.players.find(p=>p.id===row.playerId);wallet(p.token).coins+=row.coins;}economy.settlements[r.matchId]=payout;saveEconomy();}r.coinResults=payout;}
 const saveStickers=()=>{if(persist){fs.mkdirSync(path.dirname(stickerFile),{recursive:true});fs.writeFileSync(stickerFile+'.tmp',JSON.stringify(stickers));fs.renameSync(stickerFile+'.tmp',stickerFile);}};
 function readImage(id){return persist?fs.readFileSync(path.join(imageDir,id)):imageMemory.get(id);}
 function writeImage(id,bytes){if(persist){fs.mkdirSync(imageDir,{recursive:true});fs.writeFileSync(path.join(imageDir,id),bytes);}else imageMemory.set(id,bytes);}
 function imageExtension(bytes){if(bytes.length>24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';if(bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)return '.jpg';if(bytes.length>13&&['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString())&&bytes.at(-1)===59)return '.gif';throw new Error('请选择 PNG、JPG 或 GIF 图片');}
 function sendImage(res,id,bytes){res.writeHead(200,{'Content-Type':id.endsWith('.png')?'image/png':id.endsWith('.gif')?'image/gif':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);}
 function removeImage(id){if(persist){const target=path.join(imageDir,id);if(fs.existsSync(target))fs.unlinkSync(target);}else imageMemory.delete(id);}
 function addMessage(r,message){r.chat??=[];r.chat.push(message);while(r.chat.length>100){const old=r.chat.shift();if(old.image)removeImage(old.image);}}
 function quotedMessage(r,id){if(!id)return undefined;const m=r.chat?.find(m=>m.id===id);if(!m)throw new Error('引用的消息已过期，请重新选择');return {id:m.id,name:m.name,text:m.image?'[截图]':m.text};}
 function mentionedPlayers(r,text){return r.players.filter(p=>new RegExp('@'+p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[\\s，。！？,!?：:；;])','u').test(text)).map(p=>({id:p.id,name:p.name}));}
 function imageCaption(value){const text=typeof value==='string'?value.trim():'';if(text.length>300)throw new Error('聊天内容最多 300 字');return text;}
 const save=()=>{if(persist){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(rooms));fs.renameSync(file+'.tmp',file);fs.writeFileSync(chatFile+'.tmp',JSON.stringify(chats));fs.renameSync(chatFile+'.tmp',chatFile);fs.writeFileSync(historyFile+'.tmp',JSON.stringify(histories));fs.renameSync(historyFile+'.tmp',historyFile);}};
 const cleanName=(v,max=18)=>typeof v==='string'?v.trim().slice(0,max):'';
 function rememberResult(r){if(r.status==='finished'&&!r.results)r.results=r.players.map(({token,...p})=>structuredClone(p));}
 function recordHistory(r){if(r.status!=='finished'||!r.results)return;const id=r.matchId||r.code+'-legacy';const list=histories[r.code]??=[];if(list.some(m=>m.id===id))return;const ranking=rewards(r.gameId,r.results);list.unshift({id,code:r.code,title:r.title,gameId:r.gameId,finishedAt:r.matchId?Date.now():null,players:ranking.map(row=>({...row,coins:r.coinResults?.find(p=>p.playerId===row.playerId)?.coins??null,artifacts:r.results.find(p=>p.id===row.playerId)?.artifacts?.length||0}))});}
 function publicRoom(room,token) {
  const {game,...r}=room;
  const viewer=r.players.find(p=>p.token===token);
  return {...r,spectators:r.spectators.map(({token,...p})=>p),viewerId:viewer?.id||r.spectators.find(p=>p.token===token)?.id,chat:chats[r.code]?.players.some(p=>p.token===token)?chats[r.code].chat:[],players:r.players.map(({token,...p})=>r.gameId==='incangold'&&r.status!=='finished'&&p.id!==viewer?.id?{...p,score:null}:p),game:game?(r.gameId==='incangold'?incan.publicGame(game,viewer?.id):{...game,deck:undefined,remaining:game.deck.length,features:engine.available(game)}):null};
 }
 function removeMember(r,id){const playing=r.status==='playing'&&r.players.some(p=>p.id===id);r.players=r.players.filter(p=>p.id!==id);r.spectators=r.spectators.filter(p=>p.id!==id);if(playing){delete r.readyReminder;r.status='waiting';r.game=null;delete r.results;delete r.coinResults;delete r.matchId;r.players.forEach(p=>{p.ready=false;p.score=0;p.meeples=7;});}if(!r.players.some(p=>p.id===r.hostId))r.hostId=r.players[0]?.id||null;const host=r.players.find(p=>p.id===r.hostId);if(host)host.ready=true;if(!r.players.length&&!r.spectators.length)delete rooms[r.code];}
 function publicChat(r,token){const viewer=r?.players.find(p=>p.token===token);if(!viewer)return null;return {...r,viewerId:viewer.id,players:r.players.map(({token,...p})=>p)};}
 function joinChat(r,p){chats[r.code]??={code:r.code,title:r.title,players:[],chat:[],updated:Date.now()};const c=chats[r.code];if(!c.players.some(v=>v.token===p.token))c.players.push({id:p.id,token:p.token,name:p.name});return c;}
 function lobby(){return Object.values(rooms).map(r=>({code:r.code,title:r.title,gameId:r.gameId,maxPlayers:r.maxPlayers,count:r.players.length,spectatorCount:r.spectators.length,status:r.status,host:r.players.find(p=>p.id===r.hostId)?.name,updated:r.updated})).sort((a,b)=>b.updated-a.updated);}
 function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
 function publish(){for(const r of Object.values(rooms)){rememberResult(r);settle(r);recordHistory(r);}save();for(const c of clients){const r=rooms[c.code];c.res.write(`data: ${JSON.stringify({wallet:wallet(c.token),rooms:lobby(),room:r?publicRoom(r,c.token):null})}\n\n`);}for(const c of chatClients)c.res.write(`data: ${JSON.stringify({wallet:wallet(c.token),chat:publicChat(chats[c.code],c.token)})}\n\n`);}
 function requireRoom(code){const r=rooms[String(code).toUpperCase()];if(!r)throw new Error('房间不存在');return r;}
 function requireChat(code){const r=chats[String(code).toUpperCase()];if(!r)throw new Error('聊天室不存在');return r;}
 function requirePlayer(r,token){const p=r.players.find(p=>p.token===token);if(!p)throw new Error('你还没有加入这个房间');return p;}
 for(const r of Object.values(rooms)){rememberResult(r);settle(r);recordHistory(r);}
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/history'&&req.method==='GET'){const code=(url.searchParams.get('room')||'').toUpperCase();return send(res,200,{matches:code?histories[code]||[]:Object.values(histories).flat().sort((a,b)=>(b.finishedAt||0)-(a.finishedAt||0))});}
  if(url.pathname==='/api/economy'){
   try{const token=req.headers['x-player-token'];if(typeof token!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(token))throw new Error('无效身份');const account=wallet(token);
    if(req.method==='GET')return send(res,200,{wallet:account});
    if(req.method==='POST'){if(!account.anyaUnlocked){if(account.coins<500)throw new Error('桌游币不足，需要 500 桌游币');account.coins-=500;account.anyaUnlocked=true;saveEconomy();publish();}return send(res,200,{wallet:account});}
    res.writeHead(405);return res.end();
   }catch(e){return send(res,400,{error:e.message});}
  }
  if(url.pathname==='/api/stickers'){
   try{
    const token=req.headers['x-player-token']||url.searchParams.get('token');if(typeof token!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(token))throw new Error('无效身份');const owner=ownerKey(token),id=url.searchParams.get('id');
    if(req.method==='GET'){if(!id)return send(res,200,{stickers:stickers.filter(s=>s.owner===owner).map(({owner,...s})=>s),defaults:defaultStickers,anya:anyaStickers,wallet:wallet(token)});const sticker=stickers.find(s=>s.id===id&&s.owner===owner);if(!sticker)throw new Error('表情包不存在');return sendImage(res,id,readImage(id));}
    if(req.method==='POST'){
     if(stickers.filter(s=>s.owner===owner).length>=30)throw new Error('最多保存 30 个表情包，请先移除不用的');const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size<=2*1024*1024)chunks.push(chunk);}if(size>2*1024*1024)throw new Error('表情包不能超过 2 MB');const bytes=Buffer.concat(chunks),id=crypto.randomUUID()+imageExtension(bytes);writeImage(id,bytes);stickers.push({id,owner});saveStickers();return send(res,200,{id});
    }
    if(req.method==='DELETE'){const sticker=stickers.find(s=>s.id===id&&s.owner===owner);if(!sticker)throw new Error('表情包不存在');stickers=stickers.filter(s=>s!==sticker);saveStickers();removeImage(id);return send(res,200,{ok:true});}
    res.writeHead(405);return res.end();
   }catch(e){return send(res,400,{error:e.message});}
  }
  if(url.pathname==='/api/chat-image'){
   try{
    const r=requireChat(url.searchParams.get('room'));const p=requirePlayer(r,req.headers['x-player-token']||url.searchParams.get('token'));
    if(req.method==='POST'){
     const reply=quotedMessage(r,req.headers['x-reply-to']),text=imageCaption(decodeURIComponent(req.headers['x-chat-text']||''));
     const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size<=5*1024*1024)chunks.push(chunk);}if(size>5*1024*1024)throw new Error('截图不能超过 5 MB');
     const bytes=Buffer.concat(chunks),id=crypto.randomUUID()+imageExtension(bytes);writeImage(id,bytes);
     addMessage(r,{id:crypto.randomUUID(),playerId:p.id,name:p.name,text,image:id,reply,mentions:mentionedPlayers(r,text),time:Date.now()});r.updated=Date.now();publish();return send(res,200,{ok:true});
    }
    if(req.method==='GET'){
     const id=url.searchParams.get('id');if(!r.chat?.some(m=>m.image===id))throw new Error('截图不存在');
     const bytes=persist?fs.readFileSync(path.join(imageDir,id)):imageMemory.get(id);if(!bytes)throw new Error('截图不存在');
     return sendImage(res,id,bytes);
    }
    res.writeHead(405);return res.end();
   }catch(e){return send(res,400,{error:e.message});}
  }
  if(url.pathname==='/events'||url.pathname==='/chat-events') {
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
   const c={res,code:url.searchParams.get('room')||'',token:url.searchParams.get('token')},chatStream=url.pathname==='/chat-events',pool=chatStream?chatClients:clients;pool.add(c);
   const key=c.code+':'+c.token;clearTimeout(departures.get(key));departures.delete(key);const r=rooms[c.code];res.write(`data: ${JSON.stringify(chatStream?{chat:publicChat(chats[c.code],c.token)}:{rooms:lobby(),room:r?publicRoom(r,c.token):null})}\n\n`);
   const beat=setInterval(()=>res.write(': heartbeat\n\n'),20000);
   req.on('close',()=>{clearInterval(beat);pool.delete(c);if(chatStream||[...clients].some(v=>v.code===c.code&&v.token===c.token))return;const timer=setTimeout(()=>{departures.delete(key);if([...clients].some(v=>v.code===c.code&&v.token===c.token))return;const r=rooms[c.code],p=r&&[...r.players,...r.spectators].find(p=>p.token===c.token);if(p){removeMember(r,p.id);publish();}},60000);timer.unref();departures.set(key,timer);});return;
  }
  if(url.pathname==='/api/info'&&req.method==='GET')return send(res,200,{rooms:lobby(),addresses:Object.values(os.networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal).map(n=>n.address)});
  if(url.pathname==='/api/action'&&req.method==='POST') {
   try {
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw new Error('请求过大');}
    const b=JSON.parse(raw);if(typeof b.token!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(b.token))throw new Error('无效身份，请刷新页面');
    let r,p,skippedMeeple=false;
    if(b.action==='create') {
     const name=cleanName(b.name);if(!name)throw new Error('请输入昵称');
     const gameId=b.gameId||'carcassonne',definition=Object.hasOwn(games,gameId)?games[gameId]:null;if(!definition)throw new Error('未知桌游');
     const maxPlayers=Number(b.maxPlayers);if(!Number.isInteger(maxPlayers)||maxPlayers<definition.minPlayers||maxPlayers>definition.maxPlayers)throw new Error(`人数应为 ${definition.minPlayers}–${definition.maxPlayers} 人`);
     let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(rooms[code]||chats[code]);
     p={id:crypto.randomUUID(),token:b.token,name,color:0,ready:true,score:0,meeples:7};
     r={spectators:[],code,title:cleanName(b.title,28)||`${name}的房间`,gameId,maxPlayers,hostId:p.id,players:[p],status:'waiting',game:null,updated:Date.now()};rooms[code]=r;joinChat(r,p);
    } else {
     if(b.action==='chatJoin'){const gameRoom=rooms[String(b.code).toUpperCase()],gamePlayer=gameRoom&&[...gameRoom.players,...gameRoom.spectators].find(p=>p.token===b.token);if(gamePlayer)joinChat(gameRoom,gamePlayer);else if(gameRoom&&!chats[gameRoom.code])chats[gameRoom.code]={code:gameRoom.code,title:gameRoom.title,players:[],chat:[],updated:Date.now()};}
     const chatAction=['chat','sticker','chatJoin','chatLeave','chatRename'].includes(b.action);r=chatAction?requireChat(b.code):requireRoom(b.code);rememberResult(r);p=r.players.find(p=>p.token===b.token);
     if(b.action==='chatJoin'){if(!p){const name=cleanName(b.name);if(!name)throw new Error('请输入昵称');p={id:crypto.randomUUID(),token:b.token,name};r.players.push(p);}}
     else if(b.action==='chatLeave'){p=requirePlayer(r,b.token);r.players=r.players.filter(v=>v.token!==b.token);if(!r.players.length){for(const m of r.chat)if(m.image)removeImage(m.image);delete chats[r.code];}}
     else if(b.action==='watch'){if(!p){p=r.spectators.find(p=>p.token===b.token);if(!p){const name=cleanName(b.name);if(!name)throw new Error('请输入昵称');p={id:crypto.randomUUID(),token:b.token,name};r.spectators.push(p);}}joinChat(r,p);
     } else if(b.action==='leave'){p=p||r.spectators.find(p=>p.token===b.token);if(!p)throw new Error('你还没有加入这个房间');removeMember(r,p.id);
     } else if(b.action==='join') {
      if(!p){if(r.status==='playing')throw new Error('对局已经开始，请等待下一局');if(r.players.length>=r.maxPlayers)throw new Error('房间已满');
       const name=cleanName(b.name);if(!name)throw new Error('请输入昵称');
       const color=[0,1,2,3,4,5,6,7].find(n=>!r.players.some(p=>p.color===n));
       p={id:chats[r.code]?.players.find(v=>v.token===b.token)?.id||crypto.randomUUID(),token:b.token,name,color,ready:false,score:0,meeples:7};r.players.push(p);r.spectators=r.spectators.filter(v=>v.token!==b.token);if(!r.hostId){r.hostId=p.id;p.ready=true;}
      }joinChat(r,p);
     } else {
      p=requirePlayer(r,b.token);
      if(b.action==='chatRename'){const title=typeof b.title==='string'?b.title.trim():'';if(!title)throw new Error('请输入聊天室名称');if(title.length>28)throw new Error('聊天室名称最多 28 字');r.title=title;}
      else if(b.action==='sticker'){
       const anya=anyaStickers.find(s=>s.id===b.stickerId);if(anya&&!wallet(b.token).anyaUnlocked)throw new Error('请先花费 500 桌游币解锁阿尼亚表情包');const builtin=defaultStickers.find(s=>s.id===b.stickerId),sticker=stickers.find(s=>s.id===b.stickerId&&s.owner===ownerKey(b.token));if(!builtin&&!sticker&&!anya)throw new Error('表情包不存在');const text=imageCaption(b.text),reply=quotedMessage(r,b.replyTo),id=crypto.randomUUID()+(anya?'.png':builtin?'.gif':path.extname(sticker.id));writeImage(id,anya?fs.readFileSync(path.join(PUBLIC,'assets','anya',anya.file)):builtin?fs.readFileSync(path.join(PUBLIC,'assets','umaru-gifs',builtin.file)):readImage(sticker.id));addMessage(r,{id:crypto.randomUUID(),playerId:p.id,name:p.name,text,image:id,sticker:true,reply,mentions:mentionedPlayers(r,text),time:Date.now()});
      }
      else if(b.action==='chat') {
       const text=typeof b.text==='string'?b.text.trim():'';
       if(!text)throw new Error('请输入聊天内容');if(text.length>300)throw new Error('聊天内容最多 300 字');
       const reply=quotedMessage(r,b.replyTo);addMessage(r,{id:crypto.randomUUID(),playerId:p.id,name:p.name,text,reply,mentions:mentionedPlayers(r,text),time:Date.now()});
      }
      else if(b.action==='selectGame') {if(r.status!=='waiting'||p.id!==r.hostId)throw new Error('只有房主能在等待时更换桌游');const definition=Object.hasOwn(games,b.gameId)?games[b.gameId]:null;if(!definition)throw new Error('未知桌游');if(r.players.length>definition.maxPlayers)throw new Error(`${definition.name}最多支持 ${definition.maxPlayers} 人，请先减少房间人数`);delete r.readyReminder;r.gameId=b.gameId;r.maxPlayers=definition.maxPlayers;r.players.forEach((v,i)=>{v.ready=v.id===r.hostId;v.color=i;});}
      else if(b.action==='remindReady'){if(p.id!==r.hostId)throw new Error('只有房主可以提醒准备');if(r.status!=='waiting')throw new Error('只能在等待开局时提醒');const targets=r.players.filter(v=>v.id!==r.hostId&&!v.ready).map(v=>v.id);if(!targets.length)throw new Error('大家已经准备好了');r.readyReminder={id:crypto.randomUUID(),targets,expiresAt:Date.now()+60000};}
      else if(b.action==='confirmReady'){if(r.status!=='waiting'||r.readyReminder?.id!==b.reminderId||r.readyReminder.expiresAt<Date.now()||!r.readyReminder.targets.includes(p.id))throw new Error('准备提醒已过期，请在房间内重新准备');p.ready=true;}
      else if(b.action==='ready') {if(r.status!=='waiting')throw new Error('对局已开始');if(p.id!==r.hostId)p.ready=!p.ready;}
      else if(b.action==='start') {
       if(p.id!==r.hostId)throw new Error('只有房主可以开始');if(r.status!=='waiting')throw new Error('对局已开始');
       const definition=games[r.gameId];if(r.players.length<definition.minPlayers||!r.players.every(p=>p.ready))throw new Error(`至少 ${definition.minPlayers} 位玩家，且所有玩家准备后才能开始`);
       delete r.readyReminder;r.matchId=crypto.randomUUID();delete r.coinResults;r.game=r.gameId==='incangold'?incan.start(r.players):engine.start(r.players);r.status='playing';
      } else if(b.action==='place') {if(r.status!=='playing'||r.gameId!=='carcassonne')throw new Error('当前不是卡卡颂对局');engine.place(r.game,r.players,p.id,b.x,b.y,b.rotation);if(p.meeples===0){skippedMeeple=true;engine.finishTurn(r.game,r.players,p.id);if(r.game.phase==='finished')r.status='finished';}}
      else if(b.action==='finish') {if(r.status!=='playing'||r.gameId!=='carcassonne')throw new Error('当前不是卡卡颂对局');engine.finishTurn(r.game,r.players,p.id,b.feature??null);if(r.game.phase==='finished')r.status='finished';}
      else if(b.action==='choose') {if(r.status!=='playing'||r.gameId!=='incangold')throw new Error('当前不是印加寻宝对局');incan.choose(r.game,r.players,p.id,b.choice,b.step);if(r.game.phase==='finished')r.status='finished';}
      else if(b.action==='nextRound') {if(r.status!=='playing'||r.gameId!=='incangold')throw new Error('当前不能确认下一轮探险');incan.confirmNextRound(r.game,r.players,p.id,b.round);}
      else if(b.action==='rematch') {if(p.id!==r.hostId||r.status!=='finished')throw new Error('请等待房主在对局结束后开启下一局');r.status='waiting';r.game=null;delete r.results;delete r.coinResults;delete r.matchId;r.players.forEach(p=>{p.ready=p.id===r.hostId;p.score=0;p.meeples=7;});}
      else if(b.action==='kick'){if(p.id!==r.hostId)throw new Error('只有房主可以踢人');if(b.playerId===p.id)throw new Error('不能踢自己');const target=[...r.players,...r.spectators].find(v=>v.id===b.playerId);if(!target)throw new Error('成员已离开');removeMember(r,target.id);const c=chats[r.code];if(c)c.players=c.players.filter(v=>v.id!==target.id);} else throw new Error('未知操作');
     }
     r.updated=Date.now();
    }
    if(['join','watch'].includes(b.action)){const key=r.code+':'+b.token;clearTimeout(departures.get(key));departures.delete(key);}
    publish();return send(res,200,{wallet:wallet(b.token),room:b.action==='leave'?null:rooms[r.code]?publicRoom(rooms[r.code],b.token):null,chat:publicChat(chats[r.code],b.token),playerId:p.id,code:r.code,...(skippedMeeple?{skippedMeeple:true}:{})});
   } catch(e){return send(res,400,{error:e.message});}
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  let relative;try{relative=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end();}
  const target=path.resolve(PUBLIC,'.'+(relative==='/'?'/index.html':relative));
  if(!target.startsWith(PUBLIC+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}
   const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.gif':'image/gif'};
   res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  });
 });
 server.on('close',()=>{for(const t of departures.values())clearTimeout(t);for(const c of [...clients,...chatClients])c.res.end();});
 return server;
}
if(require.main===module){const port=Number(process.env.PORT)||3000;createApp().listen(port,'0.0.0.0',()=>{
 console.log(`桌游会客厅已启动\n本机：http://localhost:${port}`);
 for(const n of Object.values(os.networkInterfaces()).flat())if(n.family==='IPv4'&&!n.internal)console.log(`局域网：http://${n.address}:${port}`);
 console.log('关闭此窗口停止服务。对局自动保存到 D 盘项目 data 文件夹。');
});}
module.exports={createApp};
