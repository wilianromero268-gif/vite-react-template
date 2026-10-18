import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dir = path.resolve('data');
const file = path.join(dir, 'db.json');
fs.mkdirSync(dir, {recursive:true});
if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({users:[],keys:[],usage:[]}, null, 2));
let db = JSON.parse(fs.readFileSync(file, 'utf8'));
function save(){ fs.writeFileSync(file, JSON.stringify(db, null, 2)); }
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export function getUser(id){ return db.users.find(u=>u.id===id); }
export function getUserByEmail(email){ return db.users.find(u=>u.email.toLowerCase()===email.toLowerCase()); }
export function upsertUser(profile){
  let user=getUserByEmail(profile.email);
  if(!user){ user={id:crypto.randomUUID(),email:profile.email,name:profile.name||profile.email,avatar:profile.picture||'',createdAt:new Date().toISOString()}; db.users.push(user); }
  else { user.name=profile.name||user.name; user.avatar=profile.picture||user.avatar; }
  save(); return user;
}
export function createKey(userId){
  db.keys=db.keys.filter(k=>k.userId!==userId || k.revoked);
  const raw='sai_'+crypto.randomBytes(32).toString('hex');
  db.keys.push({id:crypto.randomUUID(),userId,hash:sha256(raw),prefix:raw.slice(0,12),createdAt:new Date().toISOString(),revoked:false});
  save(); return raw;
}
export function revokeKeys(userId){ for(const k of db.keys) if(k.userId===userId) k.revoked=true; save(); }
export function findKey(raw){ return db.keys.find(k=>!k.revoked && k.hash===sha256(raw)); }
export function keyInfo(userId){ return db.keys.filter(k=>k.userId===userId&&!k.revoked).map(k=>({id:k.id,prefix:k.prefix,createdAt:k.createdAt})); }
export function recordUsage(userId, endpoint, status){
  db.usage.push({userId,endpoint,status,at:new Date().toISOString()});
  const cutoff=Date.now()-8*86400000;
  db.usage=db.usage.filter(x=>Date.parse(x.at)>cutoff);
  save();
}
export function usageStats(userId){
 const day=new Date().toISOString().slice(0,10);
 const all=db.usage.filter(x=>x.userId===userId);
 return {today:all.filter(x=>x.at.slice(0,10)===day).length,errors:all.filter(x=>x.at.slice(0,10)===day&&x.status>=400).length,recent:all.slice(-20).reverse()};
}
export function allUsers(){return db.users.map(u=>({...u,keys:keyInfo(u.id)}));}
