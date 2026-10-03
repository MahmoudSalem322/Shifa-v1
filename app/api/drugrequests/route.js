import { handle, HttpError, requireUser, requireRole } from '@/lib/server/auth';
import { store } from '@/lib/server/store';
import { pharmacies } from '@/lib/server/directory';
import { notify } from '@/lib/server/notify';
import { savePrescriptionFile } from '@/lib/server/drug-request-files';

const sameMedicine = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const GET=handle(async request=>{
  const user=await requireUser(request);
  const data=(await store.read('drug-requests')).filter(x=>String(x.userId)===String(user.id));
  return Response.json({data});
});

export const POST=handle(async request=>{
  const user=await requireUser(request);
  requireRole(user,['Patient','Donor'],'طلبات الأدوية متاحة لحسابات المرضى.');
  const form=await request.formData();
  const name=String(form.get('medicineName')||'').trim();
  const quantity=Number(form.get('quantity')||0);
  if(!name||!Number.isFinite(quantity)||quantity<1)throw new HttpError(400,'اسم الدواء والكمية مطلوبان.');
  const openStatuses = new Set(['pending','review','processing','submitted','open']);
  const existing = (await store.read('drug-requests')).find((r) => String(r.userId) === String(user.id) && openStatuses.has(String(r.status || 'pending').toLowerCase()) && sameMedicine(r.medicineName, name));
  if (existing) return Response.json({data: existing, duplicate: true, message: 'يوجد طلب مفتوح لنفس الدواء بالفعل.'});
  const prescription=await savePrescriptionFile(user,form.get('prescription'));
  const item={id:store.newId('drug'),userId:user.id,userName:user.name,medicineName:name,quantity,notes:String(form.get('notes')||''),hasPrescription:!!prescription,...(prescription?{prescription}:{}),status:'pending',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await store.update('drug-requests',items=>({items:[...items,item],result:item}));

  // Notify Gaza pharmacies so the request appears in their notification inbox.
  const pharmacyList = await pharmacies();
  const matchingPharmacies = pharmacyList.filter((pharmacy) =>
    pharmacy.approvalStatus === 'approved' && (pharmacy.userId || pharmacy.accountId) &&
    (String(pharmacy.area || '').toLowerCase().includes('gaza') || String(pharmacy.address || '').includes('غزة'))
  );
  await notify(matchingPharmacies.map((pharmacy) => ({
    userId: pharmacy.userId || pharmacy.accountId,
    type: 'drug_request',
    title: 'طلب دواء جديد',
    message: `المريض ${user.name || ''} طلب ${name} بكمية ${quantity}. إذا توفر الدواء، حدّث المخزون ليصل إشعار للمريض.`,
    href: '/pharmacy-stock'
  })));

  return Response.json({data:item},{status:201});
});
