import { handle, HttpError, readJson, requireRole, requireUser } from '@/lib/server/auth';
import { doctors, facilities, upsert, isApproved } from '@/lib/server/directory';
import { store } from '@/lib/server/store';
import { notify } from '@/lib/server/notify';
import { ADMIN_ID } from '@/lib/server/admin-auth';

/* A hospital attaches an approved doctor who is not linked anywhere yet. */
export const POST = handle(async request => {
  const u = await requireUser(request);
  requireRole(u, ['Hospital']);
  const b = await readJson(request);
  const facility = (await facilities()).find(v => String(v.userId || v.accountId || '') === String(u.id));
  if (!facility) throw new HttpError(404, 'لم يتم العثور على المنشأة.');
  if (!isApproved(facility)) throw new HttpError(403, 'يجب اعتماد المنشأة من الإدارة أولاً.');
  if (!b.doctorId) {
    const name = String(b.name || '').trim();
    const specialization = String(b.specialization || b.specialty || '').trim();
    if (name.length < 3 || specialization.length < 2) throw new HttpError(400, 'أدخل اسم الطبيب والتخصص.');
    const existing = (await doctors()).find(v => String(v.facilityId) === String(facility.id) && String(v.name || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) return Response.json({ data: existing, duplicate: true });
    const doctorId = store.newId('doc');
    const created = { id: doctorId, name, fullName: name, specialization, specialty: specialization, phone: String(b.phone || '').trim(), email: String(b.email || '').trim(), bio: String(b.bio || '').trim(), facilityId: facility.id, facilityName: facility.name || '', facilityAddress: facility.address || '', facilityPhone: facility.phone || '', facilityWorkingHours: facility.workingHours || '', approvalStatus: 'pending', createdAt: new Date().toISOString(), source: 'facility' };
    const saved = await upsert('doctors', created);
    const profile = { id: store.newId('pp'), userId: 'facility_doctor_' + doctorId, role: 'Doctor', data: { ...created, doctorId }, status: 'pending', review: null, createdAt: created.createdAt, updatedAt: created.createdAt };
    await store.update('provider-profiles', items => ({ items: [profile, ...items.filter(x => x.id !== profile.id)], result: profile }));
    await notify([{ userId: ADMIN_ID, type: 'provider_approval', title: 'طبيب جديد بانتظار الاعتماد', message: name + ' أضافته ' + (facility.name || 'منشأة صحية'), href: '/admin/provider-profiles' }]);
    return Response.json({ data: saved, pendingApproval: true, providerProfileId: profile.id }, { status: 201 });
  }
  const d = (await doctors()).find(v => String(v.id) === String(b.doctorId));
  if (!d || !isApproved(d)) throw new HttpError(404, 'لم يتم العثور على الطبيب.');
  if (d.facilityId && String(d.facilityId) !== String(facility.id)) throw new HttpError(409, 'هذا الطبيب مرتبط بمنشأة أخرى.');
  return Response.json({
    data: await upsert('doctors', {
      ...d,
      facilityId: facility.id,
      facilityName: facility.name || '',
      facilityAddress: facility.address || '',
      facilityPhone: facility.phone || '',
      facilityWorkingHours: facility.workingHours || ''
    })
  });
});
