import { handle, HttpError, isAdmin, readJson, requireUser } from '@/lib/server/auth';
import { getMine, listAllForAdmin, listPendingForAdmin, ROLES, submitProfile } from '@/lib/server/provider-profile';

/* GET — the provider's own profile + status.
   GET ?scope=pending|all — admin queues. */
export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');

  if (scope) {
    if (!isAdmin(user)) throw new HttpError(403, 'هذه القائمة للإدارة فقط.');
    return Response.json({ items: scope === 'pending' ? await listPendingForAdmin() : await listAllForAdmin() });
  }

  if (!ROLES.includes(user.role)) throw new HttpError(403, 'هذه الميزة لحسابات المراكز الصحية والصيدليات والأطباء فقط.');
  return Response.json({ item: await getMine(user.id) });
});

/* POST { data } — submit or update the provider's own profile.
   `data` is a free-form object matching the provider's kind (facility,
   pharmacy, or doctor profile fields) — validated lightly here and
   rendered as-is on the public detail pages once approved. */
export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  if (!body.data || typeof body.data !== 'object') throw new HttpError(400, 'بيانات الملف مطلوبة.');
  const item = await submitProfile(user, body.data);
  return Response.json({ item }, { status: 201 });
});
