import { handle, readJson, requireRole, requireUser } from '@/lib/server/auth';
import { pharmacies, upsert } from '@/lib/server/directory';
import { store } from '@/lib/server/store';
import { notify } from '@/lib/server/notify';

const sameMedicine = (a, b) => {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
};

export const PATCH=handle(async(request,{params})=>{
  const u=await requireUser(request);
  requireRole(u,['Pharmacy']);
  const {medicineId}=await params;
  const b=await readJson(request);
  const all=await pharmacies();
  const x=all.find(v=>String(v.userId)===String(u.id)||String(v.email||'').toLowerCase()===String(u.email||'').toLowerCase());
  if(!x)return Response.json({message:'لم يتم العثور على الصيدلية.'},{status:404});
  const previous=(x.medicines||[]).find(m=>String(m.medicineId)===String(medicineId));
  const medicines=(x.medicines||[]).map(m=>String(m.medicineId)===String(medicineId)?{...m,...b,medicineId:m.medicineId}:m);
  const updated=await upsert('pharmacies',{...x,medicines});

  const nowAvailable = (String(b.availability || previous?.availability || '') === 'InStock' || Number(b.quantity) > 0) && Number(b.quantity ?? previous?.quantity ?? 0) > 0;
  if (nowAvailable && previous) {
    const requests = await store.read('drug-requests');
    const matching = requests.filter(r => ['pending','available'].includes(String(r.status)) && sameMedicine(r.medicineName, previous.medicineName));
    if (matching.length) {
      await store.update('drug-requests', items => ({
        items: items.map(r => matching.some(m => String(m.id) === String(r.id)) ? { ...r, status: 'available', availablePharmacyId: x.id, availablePharmacyName: x.name, updatedAt: new Date().toISOString() } : r),
        result: true
      }));
      await notify(matching.map(r => ({
        userId: r.userId,
        type: 'drug_available',
        title: 'دواؤك أصبح متوفرًا',
        message: `أصبح ${previous.medicineName} متوفرًا في ${x.name} في غزة. الكمية المتاحة: ${b.quantity ?? previous.quantity}.`,
        href: '/drug-requests/' + encodeURIComponent(r.id)
      })));
    }
  }
  return Response.json({data:updated});
});
