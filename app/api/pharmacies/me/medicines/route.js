import { handle, readJson, requireRole, requireUser } from '@/lib/server/auth';
import { pharmacies, upsert } from '@/lib/server/directory';
import { store } from '@/lib/server/store';
import { notify } from '@/lib/server/notify';
import { COLLECTION as DEMAND_COLLECTION } from '@/lib/server/medicine-demand';

const sameMedicine = (a, b) => {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
};

export const POST=handle(async request=>{
  const u=await requireUser(request);
  requireRole(u,['Pharmacy']);
  const b=await readJson(request);
  const x=(await pharmacies()).find(v=>String(v.userId)===String(u.id)||String(v.email||'').toLowerCase()===String(u.email||'').toLowerCase())||{id:'pharmacy_'+Date.now().toString(36),userId:u.id,name:u.name,email:u.email,medicines:[]};
  const item={medicineId:b.medicineId||'custom_'+Date.now().toString(36),medicineName:b.customName||b.medicineName||'',quantity:Number(b.quantity||0),price:Number(b.price||0),availability:b.availability||'InStock'};
  if(!item.medicineName)return Response.json({message:'اسم الدواء مطلوب.'},{status:400});
  const existingMedicineIndex = (x.medicines || []).findIndex((m) => sameMedicine(m.medicineName, item.medicineName));
  const medicines = [...(x.medicines || [])];
  if (existingMedicineIndex >= 0) medicines[existingMedicineIndex] = { ...medicines[existingMedicineIndex], ...item };
  else medicines.push(item);
  const updated=await upsert('pharmacies',{...x,medicines});

  if (item.quantity > 0 && item.availability === 'InStock') {
    const requests = await store.read('drug-requests');
    const matching = requests.filter(r => ['pending','available'].includes(String(r.status)) && sameMedicine(r.medicineName, item.medicineName));
    if (matching.length) {
      await store.update('drug-requests', items => ({
        items: items.map(r => matching.some(m => String(m.id) === String(r.id)) ? { ...r, status: 'available', availablePharmacyId: x.id, availablePharmacyName: x.name, updatedAt: new Date().toISOString() } : r),
        result: true
      }));
      await notify(matching.map(r => ({
        userId: r.userId,
        type: 'drug_available',
        title: 'دواؤك أصبح متوفرًا',
        message: `أصبح ${item.medicineName} متوفرًا في ${x.name} في غزة. الكمية المتاحة: ${item.quantity}.`,
        href: '/drug-requests/' + encodeURIComponent(r.id)
      })));
    }

    // Resolve the separate "لم أجد الدواء" demand immediately as well.
    const demands = await store.read(DEMAND_COLLECTION);
    const demandMatches = demands.filter((d) => d.status === 'open' && sameMedicine(d.medicineName, item.medicineName) && (!d.area || String(d.area).toLowerCase() === String(x.area || '').toLowerCase()));
    if (demandMatches.length) {
      const mapsLink = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(x.address || x.name || 'غزة');
      await store.update(DEMAND_COLLECTION, items => ({
        items: items.map(d => demandMatches.some(m => String(m.id) === String(d.id))
          ? { ...d, status: 'resolved', resolvedAt: new Date().toISOString(), pharmacyName: x.name || '', address: x.address || '', pharmacyId: x.id }
          : d),
        result: true
      }));
      await notify(demandMatches.map(d => ({
        userId: d.patientId,
        type: 'success',
        title: 'توفر الدواء الذي تبحث عنه',
        message: `دواء ${item.medicineName} أصبح متوفرًا في ${x.name || 'صيدلية'}. الكمية المتاحة: ${item.quantity}.`,
        href: mapsLink
      })));
    }
  }
  return Response.json({data:updated},{status:201});
});
