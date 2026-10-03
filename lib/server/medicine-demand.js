import 'server-only';
import { pick, toList } from '@/lib/api';
import { store } from './store';
import { notify } from './notify';
import { backend } from './auth';

/* "لم أجد الدواء" flow:
   1. Patient searches a medicine, gets nothing (in their area, or anywhere).
      A demand is logged and every Pharmacy account is notified.
   2. Next time the patient's demands are read (dashboard, medicines page),
      each open one is quietly re-checked against the live catalog. The
      first time it turns up, the demand is resolved and the patient gets
      a notification with the pharmacy name/address and a map link. */

export const COLLECTION = 'medicine-demands';
const RECHECK_LIMIT = 5; /* per read, so a patient with many open demands does not hammer the API */

function mapsLink(address) {
  if (!address) return '';
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
}

export async function createDemand({ patientId, patientName, medicineName, area }) {
  const normalizedMedicine = medicineName.trim().toLocaleLowerCase();
  const normalizedArea = area || '';
  const existing = (await store.read(COLLECTION)).find((d) =>
    String(d.patientId) === String(patientId) &&
    d.status === 'open' &&
    String(d.medicineName || '').trim().toLocaleLowerCase() === normalizedMedicine &&
    String(d.area || '') === normalizedArea
  );
  if (existing) return existing;
  const demand = {
    id: store.newId('md'),
    patientId: String(patientId),
    patientName: patientName || '',
    medicineName: medicineName.trim(),
    area: normalizedArea,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  await store.update(COLLECTION, (items) => ({ items: [demand, ...items], result: null }));

  /* Tell pharmacies a patient is looking for this medicine. Best-effort:
     if the .NET admin account is not configured yet, this silently no-ops
     rather than failing the patient's request. */
  try {
    const pharmacyAccounts = (await store.read('users')).filter((u) => String(u.role) === 'Pharmacy' && u.active !== false);
    await notify(pharmacyAccounts.map((u) => ({
      userId: String(u.id), type: 'info', title: 'مريض يبحث عن دواء',
      message: 'يبحث مريض عن "' + demand.medicineName + '"' + (area ? ' في ' + area : ' في أي منطقة') + '. إن توفر لديك، حدّث مخزونك ليصله تلقائياً.', href: '/pharmacy-stock'
    })));
  } catch (error) { console.error('[shifa] could not notify pharmacies of demand', error); }

  return demand;
}

async function tryResolve(user, demand) {
  const attempts = demand.area ? [demand.area, ''] : [''];
  for (const area of attempts) {
    let response;
    try {
      response = await backend(user, 'GET', '/api/medicines/search?' + new URLSearchParams({ name: demand.medicineName, area }).toString());
    } catch {
      continue;
    }
    if (!response.ok) continue;
    const matches = toList(response.payload);
    if (!matches.length) continue;
    const stock = matches[0];
    const pharmacyName = pick(stock, 'pharmacyName', 'name') || '';
    const address = pick(stock, 'address', 'pharmacyAddress') || '';
    return { pharmacyName, address, foundArea: area || pick(stock, 'area') || '' };
  }
  return null;
}

/* Re-checks up to RECHECK_LIMIT open demands for this patient; resolves
   and notifies the ones now found. Returns the (possibly updated) list. */
export async function readAndRecheckDemands(user) {
  const all = await store.read(COLLECTION);
  const mine = all.filter((d) => d.patientId === user.id);
  const open = mine.filter((d) => d.status === 'open').slice(0, RECHECK_LIMIT);
  if (!open.length) return mine;

  const resolutions = new Map();
  for (const demand of open) {
    const found = await tryResolve(user, demand).catch(() => null);
    if (found) resolutions.set(demand.id, found);
  }
  if (!resolutions.size) return mine;

  await store.update(COLLECTION, (items) => ({
    items: items.map((item) => resolutions.has(item.id)
      ? { ...item, status: 'resolved', resolvedAt: new Date().toISOString(), ...resolutions.get(item.id) }
      : item),
    result: null
  }));

  await notify(Array.from(resolutions.entries()).map(([id, found]) => {
    const demand = mine.find((d) => d.id === id);
    return {
      userId: user.id,
      type: 'success',
      title: 'توفر الدواء الذي تبحث عنه',
      message: '"' + (demand ? demand.medicineName : '') + '" أصبح متوفراً في ' + (found.pharmacyName || 'إحدى الصيدليات') + (found.address ? ' — ' + found.address : ''),
      href: found.address ? mapsLink(found.address) : '/medicines'
    };
  }));

  return (await store.read(COLLECTION)).filter((d) => d.patientId === user.id);
}

export { mapsLink };
