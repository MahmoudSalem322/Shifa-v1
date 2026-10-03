import { handle, HttpError, isAdmin, requireUser } from '@/lib/server/auth';
import { store } from '@/lib/server/store';
import { readEvidence } from '@/lib/server/evidence-storage';

/* GET — the prescription file of a drug request, for its owner or an admin. */
export const GET = handle(async (request, { params }) => {
  const user = await requireUser(request);
  const { id } = await params;
  const item = (await store.read('drug-requests')).find((r) => String(r.id) === String(id));
  if (!item || (!isAdmin(user) && String(item.userId) !== String(user.id))) throw new HttpError(404, 'لم يتم العثور على الطلب.');
  if (!item.prescription?.path) throw new HttpError(404, 'لا توجد وصفة مرفقة بهذا الطلب.');
  const file = await readEvidence(item.prescription.path);
  if (!file) throw new HttpError(404, 'ملف الوصفة غير متاح.');
  return new Response(file.bytes, {
    status: 200,
    headers: {
      'Content-Type': item.prescription.mimeType || file.mimeType,
      'Content-Disposition': "inline; filename*=UTF-8''" + encodeURIComponent(String(item.prescription.name || 'prescription')),
      'Cache-Control': 'private, no-store'
    }
  });
});
