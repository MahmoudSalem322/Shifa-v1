import 'server-only';
import crypto from 'crypto';
import { store } from './store';
import { roles } from '@/lib/vocab';
import { HttpError } from './auth';
const ISSUER='shifaa-local-user';
/* The signing secret must come from the environment. A hard-coded fallback would
   let anyone forge a session token, so in production a missing or short secret
   makes every sign/verify fail closed instead. */
function secret(){
  const v=process.env.LOCAL_AUTH_SECRET || process.env.ADMIN_TOKEN_SECRET || '';
  if(v.length>=32) return v;
  if(process.env.NODE_ENV!=='production') return v||'dev-only-insecure-secret-do-not-use-in-prod';
  console.error('[shifa] LOCAL_AUTH_SECRET is missing or shorter than 32 characters');
  throw new HttpError(503,'إعدادات الأمان غير مكتملة على الخادم (LOCAL_AUTH_SECRET).');
}
const TTL=30*24*60*60;
function b64(v){return Buffer.from(v).toString('base64url')}
function sign(v){return crypto.createHmac('sha256',secret()).update(v).digest('base64url')}
function safeEqual(a,b){try{return crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))}catch{return false}}
function tokenFor(user){const h=b64(JSON.stringify({alg:'HS256',typ:'JWT'}));const p=b64(JSON.stringify({iss:ISSUER,sub:String(user.id),id:String(user.id),name:user.fullName||'',email:user.email||'',phone:user.phone||'',role:roles.normalize(user.role),iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+TTL}));return `${h}.${p}.${sign(h+'.'+p)}`}
export function verifyLocalToken(token){const a=String(token||'').split('.');if(a.length!==3)return null;const s=sign(a[0]+'.'+a[1]);if(!safeEqual(a[2],s))return null;let p;try{p=JSON.parse(Buffer.from(a[1],'base64url').toString('utf8'))}catch{return null}return p?.iss===ISSUER&&(!p.exp||p.exp*1000>Date.now())?p:null}
export async function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const d=await new Promise((r,j)=>crypto.scrypt(String(password),salt,64,{N:16384,r:8,p:1},(e,b)=>e?j(e):r(b.toString('hex'))));return `scrypt:${salt}:${d}`}
export async function verifyPassword(password,stored){const [scheme,salt,hash]=String(stored||'').split(':');if(scheme!=='scrypt'||!salt||!hash)return false;const d=await new Promise((r,j)=>crypto.scrypt(String(password),salt,64,{N:16384,r:8,p:1},(e,b)=>e?j(e):r(b.toString('hex'))));return safeEqual(d,hash)}
export async function findUser(login){const q=String(login||'').trim().toLowerCase();return (await store.read('users')).find(u=>String(u.email||'').toLowerCase()===q||String(u.phone||'')===q)||null}
export async function createLocalUser(input){const email=String(input.email||'').trim().toLowerCase();const phone=String(input.phone||'').trim();const existing=await findUser(email)||await findUser(phone);if(existing)return existing;const user={id:store.newId('usr'),fullName:String(input.fullName||'').trim(),email,phone,role:roles.normalize(input.role),passwordHash:await hashPassword(input.password),verified:input.verified!==false,active:true,migrated:!!input.migrated,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await store.update('users',items=>({items:[...items,user],result:user}));return user}
export function sessionResponse(user){return {token:tokenFor(user),user:{id:user.id,fullName:user.fullName,email:user.email,phone:user.phone,role:roles.normalize(user.role)}}}
export {ISSUER as LOCAL_AUTH_ISSUER};
