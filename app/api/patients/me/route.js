import { handle, readJson, requireRole, requireUser } from '@/lib/server/auth';
import { store } from '@/lib/server/store';
const mine = async u => (await store.read('patient-profiles')).find(x => String(x.userId) === String(u.id)) || null;
export const GET = handle(async request => { const u = await requireUser(request); const p = await mine(u); return Response.json({ data: p || { userId: u.id, fullName: u.name, email: u.email, phone: u.phone, role: u.role } }); });
export const PUT = handle(async request => { const u = await requireUser(request); requireRole(u, ['Patient']); const body = await readJson(request); const current = await mine(u); const record = { ...(current || {}), ...body, userId: u.id, email: u.email, updatedAt: new Date().toISOString() }; await store.update('patient-profiles', xs => ({ items: [...xs.filter(x => String(x.userId) !== String(u.id)), record], result: record })); return Response.json({ data: record }); });
