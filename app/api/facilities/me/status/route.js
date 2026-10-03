import { handle, HttpError, readJson, requireRole, requireUser } from '@/lib/server/auth';
import { facilities, upsert } from '@/lib/server/directory';

const STATUSES = ['Open', 'Emergency', 'Partial', 'Closed'];

export const PATCH = handle(async request => {
  const u = await requireUser(request);
  requireRole(u, ['Hospital']);
  const b = await readJson(request);
  const status = b.status || 'Open';
  if (!STATUSES.includes(status)) throw new HttpError(400, 'حالة غير مدعومة.');
  const x = (await facilities()).find(v => String(v.userId || v.accountId || '') === String(u.id))
    || { id: 'facility_' + u.id, userId: String(u.id), accountId: String(u.id), name: u.name, email: u.email, approvalStatus: 'pending' };
  return Response.json({ data: await upsert('facilities', { ...x, status, updatedAt: new Date().toISOString() }) });
});
