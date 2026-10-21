const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {ANCHORS}=require('./anchors');

// Store only hashed browser identities. Never publish this file with source packages.
class ProfileStore{
  constructor({file=null}={}){
    this.file=file;this.data={version:1,profiles:{},settled:{},gmGrants:{}};
    if(file&&fs.existsSync(file)){
      const saved=JSON.parse(fs.readFileSync(file,'utf8'));
      if(saved.version!==1||!saved.profiles||!saved.settled)throw Error('玩家积分存档格式异常，请先恢复备份');
      for(const profile of Object.values(saved.profiles)){
        if(!Number.isSafeInteger(profile.points)||profile.points<0||!Number.isSafeInteger(profile.earned)||profile.earned<0||!Array.isArray(profile.unlocked)||profile.unlocked.some(id=>!ANCHORS.some(a=>a.id===id))||profile.equipped!==null&&!profile.unlocked.includes(profile.equipped))throw Error('玩家积分存档内容异常，请先恢复备份');
      }
      saved.gmGrants??={};
      if(typeof saved.gmGrants!=='object'||saved.gmGrants===null||Array.isArray(saved.gmGrants))throw Error('GM 积分记录格式异常');
      this.data=saved;
    }
  }
  key(token){if(!/^[a-f0-9]{32}$/.test(token||''))throw Error('无效身份');return createHash('sha256').update(token).digest('hex');}
  empty(){return {points:0,earned:0,unlocked:[],equipped:null};}
  get(token){const key=this.key(token);return structuredClone(this.data.profiles[key]||this.empty());}
  commit(next){
    if(this.file){
      fs.mkdirSync(path.dirname(this.file),{recursive:true});
      fs.writeFileSync(this.file+'.tmp',JSON.stringify(next),{mode:0o600});
      fs.renameSync(this.file+'.tmp',this.file);
    }
    this.data=next;
  }
  unlock(token,id){
    const key=this.key(token),item=ANCHORS.find(a=>a.id===id);if(!item)throw Error('锚点不存在');
    const next=structuredClone(this.data),profile=next.profiles[key]||(next.profiles[key]=this.empty());
    if(profile.unlocked.includes(id))return this.get(token);
    if(profile.points<item.cost)throw Error('游戏积分不足，完成对局后再来看看');
    profile.points-=item.cost;profile.unlocked.push(id);profile.equipped=id;this.commit(next);return this.get(token);
  }
  equip(token,id){
    const key=this.key(token),next=structuredClone(this.data),profile=next.profiles[key]||(next.profiles[key]=this.empty());
    if(id!==null&&!profile.unlocked.includes(id))throw Error('请先解锁这个锚点');
    profile.equipped=id;this.commit(next);return this.get(token);
  }
  grantPoints(actorToken,targetToken,points,requestId){
    const actor=this.key(actorToken),target=this.key(targetToken);
    if(!Number.isSafeInteger(points)||points<1||points>100000)throw Error('每次只能发放 1–100000 整数积分');
    if(!/^[a-f0-9]{32}$/.test(requestId||''))throw Error('无效操作编号');
    const receipt=actor+':'+requestId,previous=this.data.gmGrants[receipt];
    if(previous){if(previous.target!==target||previous.points!==points)throw Error('操作编号已使用，请重新提交');return {profile:this.get(targetToken),duplicate:true};}
    const next=structuredClone(this.data),profile=next.profiles[target]||(next.profiles[target]=this.empty());
    if(!Number.isSafeInteger(profile.points+points))throw Error('积分超出存档范围');
    profile.points+=points;
    next.gmGrants[receipt]={target,points,at:Date.now()};this.commit(next);
    return {profile:this.get(targetToken),duplicate:false};
  }
  settle(matchId,awards){
    if(typeof matchId!=='string'||!/^[a-f0-9]{32}$/.test(matchId))throw Error('无效对局结算');
    if(this.data.settled[matchId])return false;
    const next=structuredClone(this.data),seen=new Set();
    for(const {token,points} of awards){
      const key=this.key(token);if(seen.has(key))throw Error('同一玩家不能重复结算');seen.add(key);
      if(!Number.isSafeInteger(points)||points<0||points>100000)throw Error('无效结算积分');
      const profile=next.profiles[key]||(next.profiles[key]=this.empty());
      if(!Number.isSafeInteger(profile.points+points)||!Number.isSafeInteger(profile.earned+points))throw Error('积分超出存档范围');
      profile.points+=points;profile.earned+=points;
    }
    next.settled[matchId]=true;this.commit(next);return true;
  }
}
module.exports={ProfileStore};
