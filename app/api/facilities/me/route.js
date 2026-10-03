import { handle, readJson, requireRole, requireUser } from '@/lib/server/auth';
import { facilities, upsert, sanitizeDirectoryBody } from '@/lib/server/directory';

const mine = async (u) => (await facilities()).find(x => String(x.userId || x.accountId || '') === String(u.id)) || null;

export const GET = handle(async request => {
  const u = await requireUser(request);
  const d = await mine(u);
  return Response.json({ data: d || { id: u.id, userId: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: 'Open', services: [], doctors: [] } });
});

/* The facility edits its own details. Approval fields can never be set here:
   a record that does not exist yet is created as `pending`. */
export const PUT = handle(async request => {
  const u = await requireUser(request);
  requireRole(u, ['Hospital']);
  const body = await readJson(request);
  const existing = await mine(u);
  const record = {
    ...(existing || {}),
    ...sanitizeDirectoryBody(body),
    id: existing?.id || 'facility_' + u.id,
    userId: String(u.id),
    accountId: String(u.id),
    email: existing?.email || u.email,
    approvalStatus: existing?.approvalStatus || 'pending',
    updatedAt: new Date().toISOString()
  };
  return Response.json({ data: await upsert('facilities', record) });
});
