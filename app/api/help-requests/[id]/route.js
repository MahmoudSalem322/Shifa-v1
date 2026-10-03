import { handle, HttpError, isAdmin, readJson, requireUser, text } from '@/lib/server/auth';
import { closeHelpRequest, contactHelpRequest, reviewHelpRequest } from '@/lib/server/help-requests';

/* PATCH { action: 'contact', message } — a donor opens a direct contact
   channel with the patient (Donor only).
   PATCH { action: 'resolved' | 'closed' } — the patient closes their own
   request once it is no longer needed.
   PATCH { action: 'approve' | 'reject', note } — an admin evaluates a
   "cannot afford" plea before it reaches donors. */
export const PATCH = handle(async (request, { params }) => {
  const user = await requireUser(request);
  const { id } = await params;
  const body = await readJson(request);

  if (body.action === 'contact') {
    if (user.role !== 'Donor') throw new HttpError(403, 'التواصل مع صاحب الطلب متاح لحسابات المتبرعين فقط.');
    const updated = await contactHelpRequest(id, { id: user.id, name: user.name, phone: text(body.phone, 30) }, text(body.message, 300), body.amount);
    if (!updated) throw new HttpError(404, 'الطلب غير موجود.');
    return Response.json({ item: updated });
  }

  if (body.action === 'resolved' || body.action === 'closed') {
    const updated = await closeHelpRequest(id, user.id, body.action);
    if (!updated) throw new HttpError(404, 'الطلب غير موجود أو لا تملك صلاحية تعديله.');
    return Response.json({ item: updated });
  }

  if (body.action === 'approve' || body.action === 'reject') {
    if (!isAdmin(user)) throw new HttpError(403, 'مراجعة طلبات المساعدة متاحة للإدارة فقط.');
    const updated = await reviewHelpRequest(id, user, body.action === 'approve' ? 'approve' : 'reject', text(body.note, 300));
    if (!updated) throw new HttpError(404, 'الطلب غير موجود أو لم يعد بانتظار المراجعة.');
    return Response.json({ item: updated });
  }

  throw new HttpError(400, 'إجراء غير معروف.');
});
