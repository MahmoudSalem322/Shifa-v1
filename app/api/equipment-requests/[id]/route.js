import { handle, HttpError, isAdmin, readJson, requireUser, text } from '@/lib/server/auth';
import { closeEquipmentRequest, contactEquipmentRequest, reviewEquipmentRequest } from '@/lib/server/equipment-requests';

export const PATCH = handle(async (request, { params }) => {
  const user = await requireUser(request);
  const { id } = await params;
  const body = await readJson(request);

  if (body.action === 'approve' || body.action === 'reject') {
    if (!isAdmin(user)) throw new HttpError(403, 'مراجعة طلبات المعدات متاحة للإدارة فقط.');
    const updated = await reviewEquipmentRequest(id, user, body.action, text(body.note, 300));
    if (!updated) throw new HttpError(404, 'الطلب غير موجود أو لم يعد بانتظار المراجعة.');
    return Response.json({ item: updated });
  }

  if (body.action === 'contact') {
    if (user.role !== 'Donor') throw new HttpError(403, 'التواصل متاح لحسابات المتبرعين فقط.');
    const updated = await contactEquipmentRequest(id, { id: user.id, name: user.name, phone: text(body.phone, 30) }, text(body.message, 300), body.amount);
    if (!updated) throw new HttpError(404, 'الطلب غير موجود.');
    return Response.json({ item: updated });
  }

  if (body.action === 'resolved' || body.action === 'closed') {
    const updated = await closeEquipmentRequest(id, user.id, body.action);
    if (!updated) throw new HttpError(404, 'الطلب غير موجود أو لا تملك صلاحية تعديله.');
    return Response.json({ item: updated });
  }

  throw new HttpError(400, 'إجراء غير معروف.');
});
