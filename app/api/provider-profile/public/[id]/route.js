import { handle, HttpError, requireUser } from '@/lib/server/auth';
import { getApprovedById } from '@/lib/server/provider-profile';

export const GET = handle(async (request, { params }) => {
  await requireUser(request);
  const { id } = await params;
  const item = await getApprovedById(id);
  if (!item) throw new HttpError(404, 'الصفحة غير موجودة أو غير مفعّلة بعد.');
  return Response.json({ item });
});
