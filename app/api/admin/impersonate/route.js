import { handle, HttpError, isAdmin, requireUser, readJson } from '@/lib/server/auth';
import { store } from '@/lib/server/store';
import { sessionResponse } from '@/lib/server/local-auth';

/* Admin-only account switch. The admin keeps a backup of its own browser session;
   the server issues a normal local-user session for the selected account. */
export const POST = handle(async (request) => {
  const admin = await requireUser(request);
  if (!isAdmin(admin)) throw new HttpError(403, 'هذه العملية متاحة للإدارة فقط.');
  const body = await readJson(request);
  const key = String(body.userId || body.email || '').trim().toLowerCase();
  if (!key) throw new HttpError(400, 'معرّف الحساب مطلوب.');
  const users = await store.read('users');
  const target = users.find((u) => String(u.id || '').toLowerCase() === key || String(u.email || '').toLowerCase() === key);
  if (!target) throw new HttpError(404, 'الحساب غير موجود.');
  if (String(target.role || '') === 'Admin') throw new HttpError(400, 'لا يمكن الدخول كحساب إدارة آخر.');
  if (target.active === false) throw new HttpError(403, 'لا يمكن الدخول كحساب موقوف.');
  return Response.json(sessionResponse(target));
});
