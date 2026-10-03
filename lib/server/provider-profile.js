import 'server-only';
import { store } from './store';
import { notify } from './notify';
import { HttpError } from './auth';
import { upsert, facilities, isApproved } from './directory';

/* Doctor / facility / pharmacy self-service profiles. A profile is the
   approval record; approved doctor profiles are mirrored to the local
   doctors directory so the patient search and appointment APIs can use one
   stable doctorId everywhere. */

export const COLLECTION = 'provider-profiles';
export const ROLES = ['Hospital', 'Pharmacy', 'Doctor'];


/* A doctor links to a facility by id. The facility must exist and be approved,
   and its name / address / phone / hours are copied from the facility record,
   never taken from what the client typed. facilityId '' / null unlinks (the
   doctor then keeps any free-text clinic name). `undefined` leaves it alone. */
export async function resolveDoctorFacility(data) {
  const raw = data ? data.facilityId : undefined;
  if (raw === undefined) return null;
  if (raw === null || raw === '') {
    return { facilityId: null, facilityName: String(data.facilityName || '').trim() };
  }
  const facility = (await facilities()).find((f) => String(f.id) === String(raw));
  if (!facility || !isApproved(facility)) {
    throw new HttpError(400, 'المنشأة المختارة غير موجودة أو لم يتم اعتمادها بعد.');
  }
  return {
    facilityId: facility.id,
    facilityName: facility.name || '',
    facilityAddress: facility.address || '',
    facilityPhone: facility.phone || '',
    facilityWorkingHours: facility.workingHours || ''
  };
}

export async function getMine(userId) {
  const items = await store.read(COLLECTION);
  return items.find((p) => p.userId === String(userId)) || null;
}

function doctorIdFor(existing, userId) {
  return existing?.data?.doctorId || existing?.doctorId || 'doctor_' + String(userId);
}

async function syncProviderDirectory(profile, user, data, status) {
  const collection = profile.role === 'Hospital' ? 'facilities' : profile.role === 'Pharmacy' ? 'pharmacies' : 'doctors';
  if (profile.role === 'Doctor') return syncDoctorDirectory(profile, user, data, status);
  const existing = (await store.read(collection)).find((x) => String(x.userId || x.accountId || '') === String(user.id) || String(x.id) === String(data.directoryId || ''));
  const id = existing?.id || (profile.role === 'Hospital' ? 'facility_' : 'pharmacy_') + String(user.id);
  const record = {
    ...(existing || {}), id, userId: String(user.id), accountId: String(user.id),
    name: data.name || user.name || existing?.name || '', email: data.email || user.email || existing?.email || '',
    phone: data.phone || user.phone || existing?.phone || '', address: data.address || data.facilityAddress || existing?.address || '',
    area: data.area || existing?.area || '', workingHours: data.workingHours || existing?.workingHours || '',
    imageUrl: data.imageUrl || existing?.imageUrl || '', bio: data.bio || existing?.bio || '',
    approvalStatus: status, providerProfileId: profile.id, updatedAt: new Date().toISOString(),
    ...(profile.role === 'Hospital' ? { type: data.type || existing?.type || 'Hospital', emergency: !!(data.emergency ?? existing?.emergency) } : {}),
    ...(profile.role === 'Pharmacy' ? { type: data.type || existing?.type || '' } : {})
  };
  return upsert(collection, record);
}

async function syncDoctorDirectory(profile, user, data, status) {
  if (profile.role !== 'Doctor') return null;
  const allDocs = await store.read('doctors');
  const existingMatch = allDocs.find((d) => 
    String(d.userId || '') === String(user.id) ||
    String(d.accountId || '') === String(user.id) ||
    (user.email && d.email && String(d.email).toLowerCase() === String(user.email).toLowerCase())
  );
  const doctorId = profile?.data?.doctorId || profile?.doctorId || existingMatch?.id || doctorIdFor(profile, user.id);
  const existing = allDocs.find((d) => String(d.id) === String(doctorId)) || existingMatch;
  const record = {
    ...(existing || {}),
    id: doctorId,
    userId: String(user.id),
    accountId: String(user.id),
    email: data.email || user.email || existing?.email || '',
    name: data.name || data.fullName || user.name || existing?.name || 'طبيب',
    fullName: data.name || data.fullName || user.name || existing?.fullName || 'طبيب',
    phone: data.phone || user.phone || existing?.phone || '',
    specialization: data.specialization || existing?.specialization || '',
    licenseNumber: data.licenseNumber || existing?.licenseNumber || '',
    yearsOfExperience: Number(data.yearsOfExperience ?? data.experience ?? existing?.yearsOfExperience ?? 0) || 0,
    bio: data.bio || existing?.bio || '',
    subSpecialization: data.subSpecialization || existing?.subSpecialization || '',
    qualifications: data.qualifications || existing?.qualifications || '',
    languages: data.languages || existing?.languages || '',
    facilityId: Object.prototype.hasOwnProperty.call(data, 'facilityId') ? (data.facilityId ?? null) : (existing?.facilityId ?? null),
    facilityName: Object.prototype.hasOwnProperty.call(data, 'facilityName') ? (data.facilityName || '') : (existing?.facilityName || ''),
    facilityAddress: data.facilityAddress || existing?.facilityAddress || '',
    facilityPhone: data.facilityPhone || existing?.facilityPhone || '',
    facilityWorkingHours: data.facilityWorkingHours || existing?.facilityWorkingHours || '',
    area: data.area || existing?.area || '',
    image: data.image || existing?.image || '',
    workDays: data.workDays || existing?.workDays || '',
    workHours: data.workHours || existing?.workHours || '',
    consultationDurationMinutes: Number(data.consultationDurationMinutes ?? existing?.consultationDurationMinutes ?? 20) || 20,
    approvalStatus: status,
    providerProfileId: profile.id,
    updatedAt: new Date().toISOString()
  };
  return upsert('doctors', record);
}

/* First submission (or a resubmission after rejection) always goes back to
   pending. Editing an already-approved profile keeps it approved. */
export async function submitProfile(user, data) {
  if (!ROLES.includes(user.role)) throw new HttpError(403, 'إنشاء ملف خاص متاح لحسابات المراكز الصحية والصيدليات والأطباء فقط.');
  if (user.role === 'Doctor') {
    const link = await resolveDoctorFacility(data);
    if (link) data = { ...(data || {}), ...link };
  }

  let saved = null;
  await store.update(COLLECTION, (items) => {
    const existing = items.find((p) => p.userId === user.id);
    const now = new Date().toISOString();
    const nextStatus = existing && existing.status === 'approved' ? 'approved' : 'pending';
    const mergedData = {
      ...(existing?.data || {}),
      ...(data || {}),
      email: data.email || existing?.data?.email || user.email || '',
      phone: data.phone || existing?.data?.phone || user.phone || '',
      name: data.name || data.fullName || existing?.data?.name || user.name || '',
      ...(user.role === 'Doctor' ? { doctorId: doctorIdFor(existing, user.id) } : {})
    };
    const record = {
      id: existing ? existing.id : store.newId('pp'),
      userId: user.id,
      role: user.role,
      data: mergedData,
      status: nextStatus,
      review: nextStatus === 'pending' ? null : existing.review,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    saved = record;
    const others = items.filter((p) => p.userId !== user.id);
    return { items: [record, ...others], result: null };
  });

  await syncProviderDirectory(saved, user, saved.data, saved.status);

  if (saved.status === 'pending') {
    const label = saved.role === 'Doctor' ? 'الطبيب' : saved.role === 'Pharmacy' ? 'الصيدلية' : 'المركز/المستشفى';
    const href = saved.role === 'Doctor' ? '/doctor-profile' : saved.role === 'Pharmacy' ? '/pharmacy-profile' : '/facility-profile';
    await notify([{ userId: user.id, type: 'info', title: 'تم إرسال طلب ' + label + ' للإدارة', message: 'تم تسجيل حسابك. أكمل ملفك وانتظر موافقة الإدارة قبل ظهوره للمستخدمين.', href }]);
  }

  return saved;
}

export async function listPendingForAdmin() {
  const items = await store.read(COLLECTION);
  return items.filter((p) => p.status === 'pending').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

export async function listApprovedByRole(role) {
  const items = await store.read(COLLECTION);
  return items.filter((p) => p.role === role && p.status === 'approved');
}

export async function getApprovedById(id) {
  const items = await store.read(COLLECTION);
  return items.find((p) => p.id === id && p.status === 'approved') || null;
}

export async function getApprovedDoctorByDoctorId(doctorId) {
  const items = await store.read(COLLECTION);
  return items.find((p) => p.role === 'Doctor' && p.status === 'approved' && String(p.data?.doctorId || '') === String(doctorId)) || null;
}

export async function listAllForAdmin() {
  const items = await store.read(COLLECTION);
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function reviewProfile(id, admin, decision, note) {
  let updated = null;
  await store.update(COLLECTION, (items) => ({
    items: items.map((item) => {
      if (item.id !== id) return item;
      updated = {
        ...item,
        status: decision === 'approve' ? 'approved' : 'rejected',
        review: { by: admin.name || 'الإدارة', note: (note || '').trim(), at: new Date().toISOString() }
      };
      return updated;
    }),
    result: null
  }));
  if (!updated) return null;

  const user = { id: updated.userId, name: updated.data?.name || '', email: updated.data?.email || '', phone: updated.data?.phone || '' };
  await syncProviderDirectory(updated, user, updated.data || {}, updated.status);

  await notify([{
    userId: updated.userId,
    type: decision === 'approve' ? 'success' : 'info',
    title: decision === 'approve' ? 'تمت الموافقة على ملفك' : 'تم رفض طلب ملفك',
    message: decision === 'approve'
      ? 'أصبح ملفك فعالاً ويمكن للمستخدمين العثور عليك في الدليل.'
      : 'لم تتم الموافقة على ملفك بعد.' + (note ? ' السبب: ' + note : '') + ' عدّل البيانات وأعد الإرسال.',
    href: updated.role === 'Doctor' ? '/doctor-profile' : '/dashboard'
  }]);

  return updated;
}
