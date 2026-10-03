import { handle, HttpError, isAdmin, requireUser } from '@/lib/server/auth';
import { readEvidence } from '@/lib/server/evidence-storage';
import { store } from '@/lib/server/store';

export const GET = handle(async (request, context) => {
  const user = await requireUser(request);
  const { path = [] } = await context.params;
  const objectPath = Array.isArray(path) ? path.join('/') : String(path);
  const [help, equipment] = await Promise.all([store.read('help-requests'), store.read('equipment-requests')]);
  const owner = [...help, ...equipment].find((item) => item.evidence?.path === objectPath);
  if (!owner) throw new HttpError(404, 'ملف الإثبات غير موجود.');
  const allowed = isAdmin(user) || user.role === 'Donor' || String(owner.patientId || owner.requesterId) === String(user.id);
  if (!allowed) throw new HttpError(403, 'ليس لديك صلاحية لعرض هذا الإثبات.');
  if (user.role === 'Donor' && !['open', 'contacted'].includes(owner.status)) throw new HttpError(403, 'هذا الإثبات غير متاح حالياً.');

  const file = await readEvidence(objectPath);
  if (!file) throw new HttpError(404, 'ملف الإثبات غير متاح.');
  return new Response(file.bytes, {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(String(file.name || 'file')),
      'Cache-Control': 'private, max-age=300'
    }
  });
});
