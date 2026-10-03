import { handle, readJson, requireRole, requireUser } from '@/lib/server/auth';
import { doctors, upsert, sanitizeDirectoryBody } from '@/lib/server/directory';
import { resolveDoctorFacility, submitProfile } from '@/lib/server/provider-profile';

const mine = async (u) => (await doctors()).find(x => 
  String(x.userId || x.accountId || '') === String(u.id) ||
  (x.email && String(x.email).toLowerCase() === String(u.email).toLowerCase())
) || null;

export const GET = handle(async request => {
  const u = await requireUser(request);
  const d = await mine(u);
  return Response.json({ data: d || { id: 'doctor_' + u.id, userId: u.id, name: u.name, email: u.email, phone: u.phone, role: 'Doctor' } });
});

export const PUT = handle(async request => {
  const u = await requireUser(request);
  requireRole(u, ['Doctor']);
  const body = sanitizeDirectoryBody(await readJson(request));
  const existing = await mine(u);

  /* The facility link is validated first (approved facility only) so nothing
     is written when it is invalid. */
  const link = (await resolveDoctorFacility(body)) || {};

  const record = {
    ...(existing || {}),
    ...body,
    ...link,
    id: existing?.id || 'doctor_' + u.id,
    userId: String(u.id),
    accountId: String(u.id),
    email: existing?.email || u.email,
    approvalStatus: existing?.approvalStatus || 'pending',
    updatedAt: new Date().toISOString()
  };

  /* Keep the approval record and the public directory in sync. Editing a
     rejected profile creates a fresh pending review; approval can never be
     set from this request. */
  const profile = await submitProfile(u, {
    name: record.fullName || record.name || u.name,
    email: record.email,
    phone: record.phone || u.phone,
    specialization: record.specialization || '',
    licenseNumber: record.licenseNumber || '',
    yearsOfExperience: Number(record.yearsOfExperience ?? record.experience ?? 0) || 0,
    bio: record.bio || '',
    subSpecialization: record.subSpecialization || '',
    qualifications: record.qualifications || '',
    languages: record.languages || '',
    facilityId: record.facilityId ?? null,
    facilityName: record.facilityName || '',
    facilityAddress: record.facilityAddress || '',
    facilityPhone: record.facilityPhone || '',
    facilityWorkingHours: record.facilityWorkingHours || '',
    area: record.area || '',
    image: record.image || '',
    workDays: record.workDays || '',
    workHours: record.workHours || '',
    consultationDurationMinutes: Number(record.consultationDurationMinutes || 20) || 20,
    doctorId: record.id
  });

  /* submitProfile already wrote the directory record with the right status;
     merge the remaining editable fields on top without touching approval. */
  const saved = await upsert('doctors', { ...record, approvalStatus: profile.status, providerProfileId: profile.id });
  return Response.json({ data: saved });
});
