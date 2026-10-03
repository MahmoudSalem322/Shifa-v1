import { handle, requireUser } from '@/lib/server/auth';
import { doctors, facilities, isApproved, matchesName, uniqueDoctors } from '@/lib/server/directory';

/* Patient-facing list: approved doctors only. */
export const GET = handle(async request => {
  const user = await requireUser(request);
  const q = new URL(request.url).searchParams;
  const allDoctors = await doctors();
  let data;
  if (user.role === 'Admin') {
    data = allDoctors;
  } else if (user.role === 'Hospital') {
    const facility = (await facilities()).find((f) => String(f.userId || f.accountId || '') === String(user.id));
    const facilityId = facility?.id;
    data = allDoctors.filter((d) => isApproved(d) || (facilityId && String(d.facilityId) === String(facilityId)));
  } else {
    data = allDoctors.filter(isApproved);
  }
  data = uniqueDoctors(data);
  const s = (q.get('specialization') || q.get('specialty') || '').trim().toLowerCase();
  const area = (q.get('area') || '').trim().toLowerCase();
  const name = q.get('name') || q.get('search') || '';
  if (name) data = data.filter(d => matchesName(d, name));
  if (s) data = data.filter(d => JSON.stringify(d).toLowerCase().includes(s));
  if (area) data = data.filter(d => JSON.stringify(d).toLowerCase().includes(area));
  return Response.json({ data });
});

export const POST = handle(async request => {
  await requireUser(request);
  return Response.json({ message: 'استخدم ملف الطبيب لإنشاء الملف.' }, { status: 400 });
});
