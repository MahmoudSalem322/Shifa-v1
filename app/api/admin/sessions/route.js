import { handle, HttpError, requireUser } from '@/lib/server/auth';
import { listSessions } from '@/lib/server/sessions';

/* GET — every account that has made an authenticated request recently,
   newest first, each flagged online/offline (last seen < 5 minutes). */
export const GET = handle(async (request) => {
  const user = await requireUser(request);
  if (user.role !== 'Admin') throw new HttpError(403, 'لا تملك صلاحية الوصول لهذه البيانات.');
  const items = await listSessions();
  return Response.json({ items });
});
