import { handle, requireUser } from '@/lib/server/auth';
import { facilities, isApproved, matchesName } from '@/lib/server/directory';

/* Patient-facing list: approved facilities only. */
export const GET = handle(async request => {
  await requireUser(request);
  const q = new URL(request.url).searchParams;
  let data = (await facilities()).filter(isApproved);
  const area = (q.get('area') || '').trim().toLowerCase();
  const type = (q.get('type') || '').trim().toLowerCase();
  const name = q.get('name') || q.get('search') || '';
  if (name) data = data.filter(d => matchesName(d, name));
  if (area) data = data.filter(d => JSON.stringify(d).toLowerCase().includes(area));
  if (type) data = data.filter(d => String(d.type || '').toLowerCase() === type);
  return Response.json({ data });
});
