import { handle, requireUser } from '@/lib/server/auth';
import { doctors, uniqueDoctors } from '@/lib/server/directory';

/* Patient-facing directory: only doctors whose provider profile has been
   approved by an admin are returned. */
export const GET = handle(async request => {
  await requireUser(request);
  const q = new URL(request.url).searchParams;
  let data = uniqueDoctors((await doctors()).filter((d) => d.approvalStatus === 'approved'));
  const name = (q.get('name') || q.get('search') || '').trim().toLowerCase();
  const specialization = (q.get('specialization') || q.get('specialty') || '').trim().toLowerCase();
  const area = (q.get('area') || '').trim().toLowerCase();

  if (name) {
    data = data.filter((d) => [d.name, d.fullName, d.specialization, d.facilityName, d.area]
      .filter(Boolean).join(' ').toLowerCase().includes(name));
  }
  if (specialization) {
    data = data.filter((d) => String(d.specialization || '').toLowerCase().includes(specialization));
  }
  if (area) {
    data = data.filter((d) => JSON.stringify(d).toLowerCase().includes(area));
  }
  return Response.json({ data });
});
