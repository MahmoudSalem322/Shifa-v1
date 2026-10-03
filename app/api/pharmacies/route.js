import { handle, requireUser } from '@/lib/server/auth';
import { pharmacies, isApproved, matchesName } from '@/lib/server/directory';

/* Patient-facing list: approved pharmacies only. */
export const GET = handle(async request => {
  await requireUser(request);
  const q = new URL(request.url).searchParams;
  let data = (await pharmacies()).filter(isApproved);
  const area = (q.get('area') || '').trim().toLowerCase();
  const name = q.get('name') || q.get('search') || '';
  if (name) data = data.filter(d => matchesName(d, name));
  if (area) data = data.filter(d => JSON.stringify(d).toLowerCase().includes(area));
  return Response.json({ data });
});
