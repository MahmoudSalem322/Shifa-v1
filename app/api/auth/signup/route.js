import { handle, HttpError, readJson } from '@/lib/server/auth';
import { createLocalUser, findUser, sessionResponse } from '@/lib/server/local-auth';
import { submitProfile } from '@/lib/server/provider-profile';
import { roles } from '@/lib/vocab';
import { ADMIN_EMAIL } from '@/lib/server/admin-auth';

export const POST = handle(async request => {
  const b = await readJson(request);
  const email = String(b.email || '').trim().toLowerCase();
  const phone = String(b.phone || '').trim();
  const role = roles.normalize(b.role);

  if (!b.fullName) throw new HttpError(400, 'الاسم الكامل مطلوب.');
  if (!/^\S+@gmail\.com$/i.test(email)) throw new HttpError(400, 'أدخل بريد Gmail صحيح (مثال: name@gmail.com).');
  if (!/^05\d{8}$/.test(phone)) throw new HttpError(400, 'رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بـ 05.');
  if (String(b.password || '').length < 8) throw new HttpError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  if (b.password !== b.confirmPassword) throw new HttpError(400, 'كلمتا المرور غير متطابقتين.');
  if (email === ADMIN_EMAIL.toLowerCase()) throw new HttpError(409, 'هذا البريد مخصص لحساب إدارة منصة شفاء.');
  if (await findUser(email) || await findUser(phone)) throw new HttpError(409, 'يوجد حساب مسجل بهذه البيانات بالفعل.');

  const user = await createLocalUser({ ...b, email, phone, role, verified: true });

  /* Every healthcare provider starts as pending. The public directory is
     gated by this approval record, so new doctors, facilities and pharmacies
     never appear before admin review. */
  if (['Doctor', 'Hospital', 'Pharmacy'].includes(role)) {
    await submitProfile(user, {
      name: String(b.fullName).trim(), email, phone,
      facilityName: role === 'Doctor' ? '' : String(b.fullName).trim(),
      address: '', area: '',
      specialization: '', licenseNumber: '', yearsOfExperience: 0
    });
  }

  return Response.json(sessionResponse(user), { status: 201 });
});
