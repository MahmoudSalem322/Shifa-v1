import { handle, HttpError, isAdmin, readJson, requireUser, text } from '@/lib/server/auth';
import { reviewProfile } from '@/lib/server/provider-profile';

/* PATCH { action: 'approve' | 'reject', note } — admin only. */
export const PATCH = handle(async (request, { params }) => {
  const user = await requireUser(request);
  if (!isAdmin(user)) throw new HttpError(403, 'مراجعة الصفحات متاحة للإدارة فقط.');
  const { id } = await params;
  const body = await readJson(request);
  if (body.action !== 'approve' && body.action !== 'reject') throw new HttpError(400, 'إجراء غير معروف.');
  const updated = await reviewProfile(id, user, body.action, text(body.note, 300));
  if (!updated) throw new HttpError(404, 'الطلب غير موجود.');
  return Response.json({ item: updated });
});
