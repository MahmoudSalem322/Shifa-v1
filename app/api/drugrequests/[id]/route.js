import { handle, HttpError, requireUser } from '@/lib/server/auth';
import { store } from '@/lib/server/store';
import { savePrescriptionFile } from '@/lib/server/drug-request-files';

const mine = (item, user) => String(item.userId) === String(user.id);

export const GET = handle(async (request, { params }) => {
  const user = await requireUser(request);
  const { id } = await params;
  const item = (await store.read('drug-requests')).find((r) => String(r.id) === String(id) && mine(r, user));
  if (!item) throw new HttpError(404, 'لم يتم العثور على الطلب.');
  return Response.json({ data: item });
});

/* PUT — multipart, same fields as create. Only while the request is pending. */
export const PUT = handle(async (request, { params }) => {
  const user = await requireUser(request);
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  if (!form) throw new HttpError(400, 'صيغة الطلب غير صحيحة.');
  const name = String(form.get('medicineName') || '').trim().slice(0, 200);
  const quantity = Number(form.get('quantity') || 0);
  if (!name || !Number.isFinite(quantity) || quantity < 1) throw new HttpError(400, 'اسم الدواء والكمية مطلوبان.');
  const notes = String(form.get('notes') || '').trim().slice(0, 1000);

  const current = (await store.read('drug-requests')).find((r) => String(r.id) === String(id) && mine(r, user));
  if (!current) throw new HttpError(404, 'لم يتم العثور على الطلب.');
  if (current.status && current.status !== 'pending') throw new HttpError(409, 'لا يمكن تعديل الطلب بعد معالجته.');

  const prescription = await savePrescriptionFile(user, form.get('prescription'));
  let updated = null;
  await store.update('drug-requests', (items) => ({
    items: items.map((r) => {
      if (String(r.id) !== String(id) || !mine(r, user)) return r;
      updated = {
        ...r, medicineName: name, quantity, notes,
        ...(prescription ? { prescription, hasPrescription: true } : {}),
        updatedAt: new Date().toISOString()
      };
      return updated;
    }),
    result: null
  }));
  if (!updated) throw new HttpError(404, 'لم يتم العثور على الطلب.');
  return Response.json({ data: updated });
});

export const DELETE = handle(async (request, { params }) => {
  const user = await requireUser(request);
  const { id } = await params;
  await store.update('drug-requests', (items) => ({ items: items.filter((r) => !(String(r.id) === String(id) && mine(r, user))), result: true }));
  return Response.json({ ok: true });
});
