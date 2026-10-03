import { handle, HttpError, readJson } from '@/lib/server/auth';
import { createLocalUser, findUser, sessionResponse, verifyPassword } from '@/lib/server/local-auth';
import { migrateLegacyLogin, migrateLegacyData } from '@/lib/server/migration';
import { checkAdminCredentials, signAdminToken, ADMIN_EMAIL, ADMIN_ID, adminName } from '@/lib/server/admin-auth';
export const POST=handle(async request=>{const b=await readJson(request);const login=String(b.emailOrPhone||b.email||'').trim().toLowerCase();const password=String(b.password||'');if(!login||!password)throw new HttpError(400,'البريد الإلكتروني وكلمة المرور مطلوبان.');
  if(!/^\S+@gmail\.com$/i.test(login))throw new HttpError(400,'تسجيل الدخول متاح بالبريد الإلكتروني فقط.');
  if (login === ADMIN_EMAIL.toLowerCase() && checkAdminCredentials(login, password)) {
    return Response.json({ token: signAdminToken(), user: { id: ADMIN_ID, fullName: adminName(), email: ADMIN_EMAIL, role: 'Admin' } });
  }
  let user=await findUser(login);if(user?.active===false)throw new HttpError(403,'هذا الحساب موقوف حالياً.');if(user){if(!(await verifyPassword(password,user.passwordHash)))throw new HttpError(401,'البريد الإلكتروني أو كلمة المرور غير صحيحة.');return Response.json(sessionResponse(user))}const migrated=await migrateLegacyLogin(login,password);if(!migrated)throw new HttpError(401,'البريد الإلكتروني أو كلمة المرور غير صحيحة.');user=await createLocalUser({...migrated,password,migrated:true,verified:true});await migrateLegacyData(user,migrated);return Response.json(sessionResponse(user))});
