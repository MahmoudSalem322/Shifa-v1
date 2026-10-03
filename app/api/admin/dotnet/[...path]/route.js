import { handle, HttpError, isAdmin, requireUser, readJson } from '@/lib/server/auth';
import { store } from '@/lib/server/store';
import { doctors, facilities, pharmacies, upsert, remove } from '@/lib/server/directory';
import { hashPassword } from '@/lib/server/local-auth';
import { submitProfile, reviewProfile } from '@/lib/server/provider-profile';

async function listUsers(){return store.read('users')}
function publicUser(u){return {id:u.id,fullName:u.fullName,email:u.email,phone:u.phone,role:u.role,active:u.active,verified:u.verified,createdAt:u.createdAt}}
export async function route(method,request,{params}){const user=await requireUser(request);if(!isAdmin(user))throw new HttpError(403,'هذه العملية متاحة للإدارة فقط.');const path=(await params).path?.join('/')||'';const q=new URL(request.url).searchParams;
 if(method==='GET'&&path==='admin/dashboard/stats'){const [u,d,f,p]=await Promise.all([listUsers(),doctors(),facilities(),pharmacies()]);return Response.json({data:{users:u.length,doctors:d.length,facilities:f.length,pharmacies:p.length}})}
 if(path==='admin/users'||path.startsWith('admin/users/')){const id=path.split('/')[2];if(method==='GET'){let us=await listUsers();const search=String(q.get('search')||'').toLowerCase();const role=String(q.get('role')||'');const status=String(q.get('status')||'');if(!id&&search)us=us.filter(x=>[x.fullName,x.name,x.email,x.phone].some(v=>String(v||'').toLowerCase().includes(search)));if(!id&&role)us=us.filter(x=>String(x.role||'')===role);if(!id&&status)us=us.filter(x=>String(x.status||((x.active===false)?'Inactive':'Active'))===status);const data=id?us.find(x=>String(x.id)===id):us;return Response.json({data:id?(data?publicUser(data):null):us.map(u=>({...publicUser(u),status:u.status||((u.active===false)?'Inactive':'Active')})),total:id?undefined:us.length},{status:id&&!data?404:200})}if(method==='POST'){const b=await readJson(request);const email=String(b.email||'').trim().toLowerCase();const phone=String(b.phone||'').trim();const existing=await listUsers();if(email&&existing.some(x=>String(x.email||'').toLowerCase()===email))throw new HttpError(409,'يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل.');if(phone&&existing.some(x=>String(x.phone||'')===phone))throw new HttpError(409,'يوجد حساب مسجل بهذا الرقم بالفعل.');if (!b.password || String(b.password).length < 8) throw new HttpError(400,'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
const userRec={id:store.newId('usr'),fullName:b.fullName||b.name||'',email,phone,role:b.role||'Patient',active:b.active!==false,verified:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),passwordHash:await hashPassword(b.password)};await store.update('users',xs=>({items:[...xs,userRec],result:userRec}));
if (['Doctor','Hospital','Pharmacy'].includes(userRec.role)) await submitProfile(userRec,{name:userRec.fullName,email:userRec.email,phone:userRec.phone,address:'',area:'',specialization:'',licenseNumber:'',yearsOfExperience:0});
return Response.json({data:publicUser(userRec)},{status:201})}if(method==='PATCH'&&path.endsWith('/status')){const b=await readJson(request);await store.update('users',xs=>({items:xs.map(x=>String(x.id)===id?{...x,active:String(b.status).toLowerCase()==='active',status:String(b.status),updatedAt:new Date().toISOString()}:x),result:true}));return Response.json({ok:true,message:'تم تحديث حالة الحساب.'})}if(method==='PATCH'&&id&&!path.endsWith('/status')){const b=await readJson(request);let updated=null;await store.update('users',xs=>({items:xs.map(x=>{if(String(x.id)!==id)return x;updated={...x,...b,id:x.id,updatedAt:new Date().toISOString()};delete updated.password;delete updated.passwordHash;return updated;}),result:null}));if(!updated)throw new HttpError(404,'الحساب غير موجود.');return Response.json({data:publicUser(updated),message:'تم تعديل الحساب.'})}if(method==='DELETE'){
  const target=(await listUsers()).find(x=>String(x.id)===id);
  await remove('users',id);
  if (target?.role==='Doctor') { const d=(await doctors()).find(x=>String(x.userId||x.accountId)===id); if(d) await remove('doctors',d.id); }
  if (target?.role==='Hospital') { const f=(await facilities()).find(x=>String(x.userId||x.accountId)===id); if(f) await remove('facilities',f.id); }
  if (target?.role==='Pharmacy') { const ph=(await pharmacies()).find(x=>String(x.userId||x.accountId)===id); if(ph) await remove('pharmacies',ph.id); }
  await store.update('provider-profiles',xs=>({items:xs.filter(x=>String(x.userId)!==id),result:true}));
  return Response.json({ok:true,message:'تم حذف الحساب.'})
}}
 if(path==='admin/healthcare'||path.startsWith('admin/healthcare/')){const id=path.split('/')[2];const all=[...(await doctors()).map(x=>({...x,providerType:'Doctor'})),...(await facilities()).map(x=>({...x,providerType:'Facility'})),...(await pharmacies()).map(x=>({...x,providerType:'Pharmacy'}))];if(method==='GET'){const data=id?all.find(x=>String(x.id)===id):all;return Response.json({data},{status:id&&!data?404:200})}if(method==='POST'||method==='PUT'){const b=await readJson(request);const type=b.providerType||b.type||'Facility';const collection=type==='Doctor'?'doctors':type==='Pharmacy'?'pharmacies':'facilities';const rec={...b,id:id||b.id||store.newId(type.toLowerCase())};await upsert(collection,rec);return Response.json({data:rec})}if(method==='PATCH'&&(path.endsWith('/approve')||path.endsWith('/reject'))){
    const decision=path.endsWith('/approve')?'approve':'reject';
    const rec=all.find(x=>String(x.id)===id);
    if(!rec)return Response.json({message:'الجهة غير موجودة.'},{status:404});
    const {providerType,...clean}=rec;
    const col=providerType==='Doctor'?'doctors':providerType==='Pharmacy'?'pharmacies':'facilities';
    const profiles=await store.read('provider-profiles');
    const profile=profiles.find(x=>rec.providerProfileId&&x.id===rec.providerProfileId)||profiles.find(x=>String(x.userId)===String(rec.userId||rec.accountId||'___'));
    if(profile){await reviewProfile(profile.id,user,decision,'')}
    else{await upsert(col,{...clean,approvalStatus:decision==='approve'?'approved':'rejected'})}
    return Response.json({ok:true,message:decision==='approve'?'تم اعتماد الجهة.':'تم رفض الجهة.'})
  }if(method==='DELETE'){const rec=all.find(x=>String(x.id)===id);if(rec)await remove(rec.providerType==='Doctor'?'doctors':rec.providerType==='Pharmacy'?'pharmacies':'facilities',id);return Response.json({ok:true})}}
 /* Medicine catalogue and drug-request administration are intentionally not exposed through the Admin API. */
 if(path.startsWith('admin/donations')){const id=path.split('/')[2];const all=await store.read('donations');if(method==='GET'){return Response.json({data:id?all.find(x=>String(x.id)===id):all})}if(method==='PATCH'){const b=await readJson(request);await store.update('donations',xs=>({items:xs.map(x=>String(x.id)===id?{...x,status:path.endsWith('/approve')?'approved':path.endsWith('/reject')?'rejected':x.status}:x),result:true}));return Response.json({ok:true})}}
 throw new HttpError(404,'عملية غير معروفة.');}
const wrap=m=>handle((r,c)=>route(m,r,c));export const GET=wrap('GET');export const POST=wrap('POST');export const PUT=wrap('PUT');export const PATCH=wrap('PATCH');export const DELETE=wrap('DELETE');
