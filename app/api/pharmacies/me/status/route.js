import { handle, HttpError, readJson, requireRole, requireUser } from '@/lib/server/auth';
import { pharmacies, upsert } from '@/lib/server/directory';

const STATUSES = ['Open', 'Busy', 'Closed'];

export const PATCH = handle(async request => {
  const u = await requireUser(request);
  requireRole(u, ['Pharmacy']);
  const b = await readJson(request);
  const status = b.status || 'Open';
  if (!STATUSES.includes(status)) throw new HttpError(400, 'حالة غير مدعومة.');
  const x = (await pharmacies()).find(v => String(v.userId || v.accountId || '') === String(u.id))
    || { id: 'pharmacy_' + u.id, userId: String(u.id), accountId: String(u.id), name: u.name, email: u.email, medicines: [], approvalStatus: 'pending' };
  return Response.json({ data: await upsert('pharmacies', { ...x, status, updatedAt: new Date().toISOString() }) });
});
