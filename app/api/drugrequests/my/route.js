import { handle, requireUser } from '@/lib/server/auth';
import { store } from '@/lib/server/store';

/* GET /api/drugrequests/my — the caller's own drug requests, newest first.
   Without this file the request fell into /api/drugrequests/[id] with
   id="my" and always answered 404, which broke the patient dashboard and
   the drug-requests page. */
export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const data = (await store.read('drug-requests'))
    .filter((x) => String(x.userId) === String(user.id))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return Response.json({ data });
});
