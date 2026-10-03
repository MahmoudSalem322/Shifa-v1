import { handle, readJson, requireRole, requireUser } from '@/lib/server/auth';
import { pharmacies, upsert, sanitizeDirectoryBody } from '@/lib/server/directory';

const mine = async (u) => (await pharmacies()).find(x => String(x.userId || x.accountId || '') === String(u.id)) || null;

export const GET = handle(async request => {
  const u = await requireUser(request);
  const d = await mine(u);
  return Response.json({ data: d || { id: u.id, userId: u.id, name: u.name, email: u.email, phone: u.phone, role: 'Pharmacy', status: 'Open', medicines: [] } });
});

export const PUT = handle(async request => {
  const u = await requireUser(request);
  requireRole(u, ['Pharmacy']);
  const body = await readJson(request);
  const existing = await mine(u);
  const record = {
    ...(existing || {}),
    ...sanitizeDirectoryBody(body),
    id: existing?.id || 'pharmacy_' + u.id,
    userId: String(u.id),
    accountId: String(u.id),
    email: existing?.email || u.email,
    approvalStatus: existing?.approvalStatus || 'pending',
    updatedAt: new Date().toISOString()
  };
  return Response.json({ data: await upsert('pharmacies', record) });
});
