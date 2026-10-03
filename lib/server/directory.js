import 'server-only';
import { store } from './store';
import { MOCK_DOCTORS, MOCK_FACILITIES, MOCK_PHARMACIES, MOCK_MEDICINES } from '@/lib/mock-data';
/* Demo doctors / facilities / pharmacies are seeded only for local development,
   or when SHIFA_SEED_DEMO_DATA=true. In production the directory starts empty and
   fills with real providers as the admin approves them. */
const SEED_DEMO = process.env.SHIFA_SEED_DEMO_DATA ? process.env.SHIFA_SEED_DEMO_DATA === 'true' : process.env.NODE_ENV !== 'production';
const demo=(rows)=>SEED_DEMO?(rows||[]):[];
async function ensure(name,seed){const cur=await store.read(name);if(cur.length||!(seed||[]).length)return cur;const rows=(seed||[]).map(x=>({...x,approvalStatus:x.approvalStatus||'approved'}));await store.update(name,items=>({items:items.length?items:rows,result:true}));return store.read(name)}
export const doctors=()=>ensure('doctors',demo(MOCK_DOCTORS.data));export const facilities=()=>ensure('facilities',demo(MOCK_FACILITIES.data));export const pharmacies=()=>ensure('pharmacies',demo(MOCK_PHARMACIES.data));export const medicines=()=>ensure('medicines',MOCK_MEDICINES.data||[]);
export async function upsert(collection,record){return store.update(collection,items=>{const i=items.findIndex(x=>String(x.id)===String(record.id));const next=[...items];if(i<0)next.push(record);else next[i]={...next[i],...record};return {items:next,result:next[i<0?next.length-1:i]}})}
export async function remove(collection,id){return store.update(collection,items=>({items:items.filter(x=>String(x.id)!==String(id)),result:true}))}

/* ---- Approval safety -------------------------------------------------
   Fields a provider must never be able to set through a profile/PUT body.
   Approval is decided only by an admin (provider-profile review). */
const PROTECTED_DIRECTORY_FIELDS = ['approvalStatus', 'providerProfileId', 'userId', 'accountId', 'id', 'role', 'review', 'createdAt', 'passwordHash', 'email'];
export function sanitizeDirectoryBody(body) {
  const out = { ...(body || {}) };
  for (const key of PROTECTED_DIRECTORY_FIELDS) delete out[key];
  return out;
}
export const isApproved = (record) => !!record && record.approvalStatus === 'approved';

/* Prevent duplicate doctor cards when the same doctor exists once as a
   directory record and once as a facility/provider mirror. Prefer stable
   provider/user identifiers; otherwise fall back to the normalized name plus
   facility so two doctors with the same name in different facilities remain
   separate. */
export function uniqueDoctors(list) {
  const seen = new Set();
  return (list || []).filter((doctor) => {
    const provider = String(doctor?.providerProfileId || '').trim();
    const user = String(doctor?.userId || doctor?.accountId || '').trim();
    const name = String(doctor?.name || doctor?.fullName || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    const facility = String(doctor?.facilityId || doctor?.facilityName || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    const key = provider ? 'provider:' + provider : user ? 'user:' + user : 'name:' + name + '|facility:' + facility;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
/* A record is visible to patients only when approved; its owner and the admin always see it. */
export function canSeeRecord(record, user) {
  if (isApproved(record)) return true;
  if (!user) return false;
  if (user.role === 'Admin') return true;
  return String(record?.userId || record?.accountId || '') === String(user.id);
}
export const matchesName = (record, q) => {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  return [record.name, record.fullName, record.facilityName, record.address, record.area, record.type].filter(Boolean).join(' ').toLowerCase().includes(needle);
};
