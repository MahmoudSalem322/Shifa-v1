# نشر شفاء على Vercel

## 1) قاعدة البيانات

أنشئ مشروعًا في Supabase، ثم افتح SQL Editor وشغّل الملف:

`supabase/schema.sql`

## 2) متغيرات البيئة في Vercel

من **Project Settings → Environment Variables** أضف:

- `SUPABASE_URL` = رابط مشروع Supabase
- `SUPABASE_SERVICE_ROLE_KEY` = مفتاح `service_role` من Supabase (Server Only)
- `SHIFA_EVIDENCE_BUCKET` = `shifaa-evidence`
- `LOCAL_AUTH_SECRET` = سلسلة عشوائية طويلة (32+ حرفًا)
- `ADMIN_EMAIL` = بريد الإدارة
- `ADMIN_USERNAME` = بريد الإدارة أو اسم المستخدم الإداري
- `ADMIN_PASSWORD` = كلمة مرور الإدارة
- `ADMIN_NAME` = `مدير منصة شفاء`
- `ADMIN_TOKEN_SECRET` = سلسلة عشوائية طويلة مختلفة عن `LOCAL_AUTH_SECRET`
- `ANTHROPIC_API_KEY` = اختياري، لتحسين قراءة الوصفات الذكية
- `SHIFA_PRESCRIPTION_MODEL` = اسم نموذج Anthropic المدعوم في حسابك، إذا فعّلت المفتاح
- `SHIFA_NAVIGATOR_MODEL` = اسم نموذج Anthropic المدعوم في حسابك، إذا فعّلت المفتاح

لا تضع أسرار Supabase أو كلمات المرور في `NEXT_PUBLIC_*`.

## 3) إعداد Vercel

- Framework: Next.js
- Build Command: `npm run build`
- Install Command: `npm install`
- Output: اتركه تلقائيًا

## 4) التخزين الطبي

يجب أن يكون bucket `shifaa-evidence` خاصًا (Private). التطبيق يستخدم مفتاح `service_role` من الخادم للوصول إلى الملفات الطبية، ولا يضع المفتاح في المتصفح.

## 5) حساب الإدارة

الدخول يتم من صفحة `/login` نفسها. لا يوجد بريد Admin ثابت داخل واجهة المتصفح؛ التحقق من حساب الإدارة يتم على الخادم باستخدام متغيرات البيئة.

## 6) ملاحظات مهمة

- لا ترفع `.env.local` إلى Git أو Vercel كملف.
- لا تستخدم التخزين المحلي `./data` على Vercel؛ يجب إعداد Supabase.
- طلبات مساعدة المرضى وطلبات المعدات التي تكون مفتوحة تظهر للمتبرعين مباشرة، دون موافقة Admin على الطلب نفسه.
- اعتماد الطبيب/المستشفى/الصيدلية يبقى من صلاحيات Admin.
