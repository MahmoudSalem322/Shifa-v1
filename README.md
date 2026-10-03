# شفاء — Shifa (Next.js)

منصة صحية تربط المرضى بالأطباء والمراكز الصحية والصيدليات، مع طلب الأدوية والتبرع بها وقراءة الوصفات بالذكاء الاصطناعي.

The project was converted from static HTML pages (kept for reference in `legacy/`) to **Next.js 16 (App Router)**, React 19 and Tailwind CSS 3.

## Running

```bash
npm install
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY (اختياري للمساعد الصحي فقط) for the prescription reader
npm run dev                  # http://localhost:3000
npm run build && npm start   # production
```

## Structure

```
app/
  page.js                    Landing page
  login/                     Login, register, forgot password + OTP, new password
  (app)/                     Everything behind login (sidebar shell in components/app-shell.jsx)
    dashboard/               Role-aware dashboard (patient, donor, doctor, pharmacy, hospital)
    account/                 Account settings for every role (name, phone, theme, password reset)
    doctor-appointments/     A doctor's bookings: today / upcoming / previous, attendance, cancel
    doctors/ [id]/ [id]/book Doctor search, profile, booking (Module 4)
    appointments/ [id]       My appointments, details, cancel (Module 4)
    facilities/ pharmacies/ medicines/   Search + details pages
    my-profile/              Doctor's full profile + schedule editor
  not-found.js, error.js     Arabic 404 and error pages (plus (app)/error.js, global-error.js)
    drug-requests/ new/ [id] Module 5 — create, track, details
    prescription-reader/     Module 7 — AI prescription reader
    donations/ new/ [id]/ review/        Module 8 — donate, my donations, details, review
    health-navigator/        Module 6 — AI health navigator (chat → search)
    matches/ [id]            Module 9 — donation ↔ drug request matches, hand-over
  api/                       Route handlers for what the .NET API does not cover yet
components/                  Shared UI (ui.jsx, app-shell.jsx, prescription-upload.jsx, …)
lib/
  api.js                     Client for the .NET API and for app/api (token, errors, normalisers)
  vocab.js                   Governorates, roles, validation, record normalisers, status labels
  schedule.js                workDays / workHours → bookable slots
  clock.js                   Today / now / slot instants in Asia/Gaza, whatever the host's zone
  matching.js                Module 9 matching rules (name, strength, quantity, expiry, location)
  navigator.js               Module 6 specialties, keyword fallback parser
  server/                    Server-only helpers: token check, JSON store, AI reader
legacy/                      The original static site, untouched
```

## Backends

| Feature | Where it lives |
|---|---|
| Auth, doctors, facilities, pharmacies, medicines, drug requests (incl. prescription file storage), booking | الـ backend المحلي في Next.js (`NEXT_PUBLIC_API_BASE`) |
| Available slots, appointment history, cancel, the doctor's bookings and attendance | `app/api/appointments/*` — booking is forwarded to `POST /api/appointments/book` |
| Donations + approve / reject, donor edit / withdraw while pending | `app/api/donations/*` |
| Prescription reading (Claude vision) and the saved results | `app/api/prescriptions/*` |
| Health navigator (Claude → directory search on the .NET API) | `app/api/navigator` |
| Donation ↔ request matches, hand-over | `app/api/matches/*` |
| Notifications to other users (donor, reviewer, patient) | `app/api/notifications` |

The route handlers accept the same Bearer token as the .NET API. They check it by calling the .NET API: a 401 means forged or expired, a 404/403/2xx means genuine, and any other answer (5xx, 429) is refused with 503 rather than trusted. Only then are the token's claims used for the user id and role.

Permissions worth knowing:

- A match's hand-over (deliver, reviewer cancel) belongs to the pharmacy or centre that approved the donation.
- A donor's phone and pickup address are visible to the donor and to that approving reviewer only.
- Doctors see bookings made with their directory profile (`GET /api/doctors/me` links the account to it).

Appointment times are Gaza wall-clock times; `lib/clock.js` works out "today", "past" and each slot's instant in `Asia/Gaza`, so a server running in UTC behaves the same.

They store data as JSON files in `./data`, which needs a persistent disk (`next start` on a VM or container). On serverless hosting those collections should move into the .NET API or a database — the handlers only use `store.read` / `store.update` in `lib/server/store.js`.

## Sprint 2 coverage

- **Module 4, appointments:** the doctor's working days and hours, the day's slots (booked and past slots disabled), a booking form with a confirmation step, double-booking prevention on the server, a success screen, and upcoming/previous appointments with status, details and cancel.
- **Module 5, drug requests:** a request form with validation and a prescription upload component (image or PDF, type and size checked in the browser and again on the server). The file is stored by the .NET API with the request. You can track requests by ID, medicine, quantity, date and status, open a details page, and see an empty state when there are none.
- **Module 7, AI prescription reader:** upload and validate a prescription, have Tesseract.js OCR المجاني extract names, dosage and quantity, then review, edit and confirm them. Confirmed medicines become drug requests with the prescription attached, and the prescription's status is tracked.
- **Module 8, donations:** a donation form (medicine, quantity, expiry with a 30-day minimum, location, donor info) with validation and a status. Pharmacies and health centres get a review queue with approve and reject (a reason is required) and a status history.
- **Module 6, AI health navigator:** a chat input with a send button. Claude turns the message into a service, specialty, location, facility type or medicine (strict JSON schema), the server searches doctors, facilities, pharmacies and medicines on the .NET API, and the page shows the recommended results. Emergencies get the 101 banner and emergency departments. If the AI is not configured or fails, a keyword parser takes over and the page says so.
- **Module 9, donation and drug matching:** on a drug request, approved donations are compared by medicine name (Arabic/Latin normalisation, typo tolerance, strength must agree), outstanding vs available quantity, expiry (at least 14 days left) and governorate (nearest first). The patient picks one and the quantity is reserved atomically. The match record, donation status and request status update, and the donor and reviewing organisation are notified. Pharmacies and centres confirm the hand-over, and either side can cancel, which returns the units.

Beyond the sprint list:

- **Doctors** get a *مواعيد العيادة* page with today's, upcoming and previous bookings. They record attendance (attended / no-show) once a slot starts, or cancel before it with a reason. The patient is notified, and the doctor is notified of new bookings and patient cancellations.
- **Every role** has an account page (`/account`). Name and phone are saved through the role's profile endpoint; donor changes stay on the device because the .NET API has no donor profile.
- **Donors** can edit or withdraw a donation while it is still pending review.
- **Pharmacies** set Open / Busy / Closed. **Health centres** set Open / Emergency only / Partial / Closed, and each service Available / Limited / Unavailable.
- Dark mode, Arabic 404 and error pages.

The .NET API has no endpoint to change a drug request's status, so "matched" and "fulfilled" are derived from the match records (`applyMatchStatus` in `lib/matching.js`).


## نشر المشروع على Vercel (Vercel production setup)

1. **Supabase:** أنشئ مشروعاً، ثم شغّل `supabase/schema.sql` مرة واحدة في SQL Editor (آمن للتشغيل أكثر من مرة؛ يضيف عمود `rev` الذي يمنع ضياع البيانات عند الكتابة المتزامنة).
2. **متغيرات البيئة في Vercel** (Project Settings → Environment Variables) — انظر `.env.example`:
   - مطلوبة: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SHIFA_EVIDENCE_BUCKET`, `LOCAL_AUTH_SECRET` (32+ حرفاً), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET` (32+ حرفاً).
   - اختيارية: `ANTHROPIC_API_KEY` (قراءة الوصفات الذكية + المساعد الصحي)، `SHIFA_PRESCRIPTION_MODEL`, `SHIFA_NAVIGATOR_MODEL`, `SHIFA_SEED_DEMO_DATA`.
3. **لا ترفع `.env.local`** ولا أي ملف فيه كلمات سر. الملف مُستثنى في `.gitignore`.
4. بدون Supabase على Vercel يرفض الخادم الحفظ برسالة واضحة بدل أن يفقد البيانات بصمت (القرص مؤقت).
5. بدون `LOCAL_AUTH_SECRET` (أو أقل من 32 حرفاً) في الإنتاج يفشل تسجيل الدخول بدل استخدام مفتاح افتراضي قابل للتزوير.

### سلوك الاعتماد (Approval flow)

- **المريض:** حسابه معتمد تلقائياً ويسجّل الدخول مباشرة بعد إنشاء الحساب.
- **الطبيب / المستشفى / الصيدلية:** يُنشأ ملفهم بحالة `pending`، يعبّئونه، فيذهب للأدمن. لا يظهرون للمرضى إلا بعد `approved`. لا يمكن لأي مزوّد تعيين `approvalStatus` بنفسه (تُحذف الحقول المحمية من كل طلب `PUT /me`).
- **ربط الطبيب بالمنشأة:** يختار الطبيب منشأة **معتمدة** فقط؛ الاسم والعنوان والهاتف وساعات العمل تُنسخ من سجل المنشأة وليس مما يكتبه العميل. المستشفى يستطيع إضافة طبيب معتمد غير مرتبط، وفصل أطبائه فقط.
- **طلبات المساعدة والتبرع (مريض) وطلبات المعدات (مستشفى/طبيب معتمد):** تذهب مباشرة للمتبرع بحالة `open` بدون موافقة الأدمن. يبقى للأدمن الاطلاع والمتابعة.

### قارئ الوصفات

- إن وُجد `ANTHROPIC_API_KEY`: يقرأ الخادم الصورة بنموذج رؤية مع مخطط JSON صارم وتعليمات بعدم التخمين، ويعلّم الحقول غير الواضحة.
- وإلا (أو عند فشله): OCR مجاني متعدد المراحل في المتصفح (Tesseract.js) + محلّل قواعد.
- في الحالتين: تظهر صورة الوصفة بجانب الأدوية، تُلوَّن الحقول غير المؤكدة، ولا يمكن التأكيد قبل تفعيل خيار «راجعت كل دواء». الدقة 100% غير مضمونة، والصيدلي يتحقق من الوصفة الأصلية عند الصرف.
- عزل المرضى: يُعاد بناء محتوى الصفحة عند تغيّر المستخدم المسجّل، والإشعارات المحلية مفصولة لكل حساب، وكل وصفة مربوطة بـ `userId` على الخادم.

## Fix log (this review)

- **ثغرة اعتماد ذاتي:** `PUT /api/facilities/me` و`/pharmacies/me` و`/doctors/me` كانت تدمج جسم الطلب كما هو، فيستطيع أي مستشفى/صيدلية إرسال `approvalStatus:"approved"` والظهور للمرضى بدون الأدمن. أُصلحت.
- قوائم الأطباء والمنشآت والصيدليات وصفحات التفاصيل والمساعد الصحي تُرجع **المعتمدين فقط** (كانت صفحات التفاصيل تعرض غير المعتمدين، والقوائم تعرض أي سجل بلا حالة).
- زر «اعتماد» في صفحة الأدمن `healthcare` كان يعرض «تم الاعتماد» دون أي تأثير. أصبح يعتمد فعلاً عبر سجل الملف.
- حفظ منشأة الطبيب كان يحوّل المعرّف النصي إلى `NaN` (`Number(...)`). أُصلح، مع التحقق من المنشأة على الخادم.
- البريد الإلكتروني لم يعد يُستخدم لمطابقة سجلات المزوّدين (كان يمكن انتحال سجل آخر بتغيير البريد).
- المستشفى لم يعد يستطيع فصل طبيب من منشأة أخرى أو إضافة طبيب غير معتمد.
- طلبات المساعدة المالية وطلبات المعدات لم تعد تنتظر الأدمن؛ والتبرع لطلب مغلق أو مرفوض مُنع.
- إشعارات طلب الدواء تصل للصيدليات المعتمدة فقط.
- `LOCAL_AUTH_SECRET`: حُذف المفتاح الافتراضي الثابت.
- التخزين: كتابة متزامنة آمنة (compare-and-swap) في Supabase، ورفض صريح عند غياب Supabase على Vercel.
- بيانات العرض التجريبية (أطباء/منشآت/صيدليات وهمية) لا تُزرع في الإنتاج افتراضياً.
- اسم النموذج الافتراضي: `claude-sonnet-5-5`.
- (من الإصدار السابق) إصلاح صفحات طلبات المعدات، روابط الإثباتات، و`/api/drugrequests/my`.
