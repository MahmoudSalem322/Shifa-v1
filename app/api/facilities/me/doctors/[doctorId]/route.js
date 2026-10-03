import { handle, HttpError, requireRole, requireUser } from '@/lib/server/auth';
import { doctors, facilities, upsert } from '@/lib/server/directory';
import { store } from '@/lib/server/store';

/* A hospital can only detach doctors that are linked to its own facility. */
export const DELETE = handle(async (request, { params }) => {
  const u = await requireUser(request);
  requireRole(u, ['Hospital']);
  const { doctorId } = await params;
  const facility = (await facilities()).find(v => String(v.userId || v.accountId || '') === String(u.id));
  if (!facility) throw new HttpError(404, 'لم يتم العثور على المنشأة.');
  const d = (await doctors()).find(v => String(v.id) === String(doctorId));
  if (d && String(d.facilityId) === String(facility.id)) {
    await upsert('doctors', { ...d, facilityId: null, facilityName: '', facilityAddress: '', facilityPhone: '', facilityWorkingHours: '' });
    if (String(d.approvalStatus || '') === 'pending' && d.providerProfileId) {
      await store.update('provider-profiles', items => ({ items: items.filter(p => String(p.id) !== String(d.providerProfileId)), result: true }));
    }
  }
  return Response.json({ ok: true });
});
