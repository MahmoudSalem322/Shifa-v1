import { handle, HttpError, readJson, requireRole, requireUser, text } from '@/lib/server/auth';
import { store } from '@/lib/server/store';
import { notify } from '@/lib/server/notify';
import { ADMIN_ID } from '@/lib/server/admin-auth';

const COLLECTION = 'facility-medicine-requests';

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  requireRole(user, ['Hospital']);
  const items = (await store.read(COLLECTION)).filter((r) => String(r.facilityUserId) === String(user.id));
  return Response.json({ items: items.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
});

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  requireRole(user, ['Hospital']);
  const body = await readJson(request);
  const medicine = text(body.medicine || body.medicineName, 200);
  const quantity = Math.max(1, Number(body.quantity) || 0);
  if (!medicine) throw new HttpError(400, 'اسم الدواء مطلوب.');
  if (!quantity) throw new HttpError(400, 'الكمية مطلوبة.');
  const existing = (await store.read(COLLECTION)).find((r) =>
    String(r.facilityUserId) === String(user.id) && r.status === 'pending' &&
    String(r.medicine).trim().toLocaleLowerCase() === medicine.trim().toLocaleLowerCase()
  );
  if (existing) return Response.json({ item: existing, duplicate: true, message: 'يوجد طلب مفتوح لنفس الدواء بالفعل.' });
  const item = { id: store.newId('fmr'), facilityUserId: String(user.id), facilityName: user.name || user.email || 'المركز الصحي', medicine, quantity, status: 'pending', createdAt: new Date().toISOString() };
  await store.update(COLLECTION, items => ({ items: [item, ...items], result: item }));
  await notify([{ userId: ADMIN_ID, type: 'facility_medicine_request', title: 'طلب دواء جديد من مركز صحي', message: item.facilityName + ' طلب ' + item.quantity + ' من ' + item.medicine, href: '/admin/healthcare' }]);
  return Response.json({ item, duplicate: false }, { status: 201 });
});
