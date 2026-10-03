'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { DOCTOR_FALLBACK_AVATAR, geo } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { AsyncBlock, Button, Card, CardTitle, Field, Icon, inputClass } from '@/components/ui';

/* Self-service "إنشاء الملف الخاص" for Doctor accounts — same visual
   language as the patient-facing doctor profile page (doctors/[id]).
   Approval here only gates the public listing; day-to-day schedule and
   appointment editing already live at /my-profile and /doctor-appointments. */

const EMPTY = { name: '', specialization: '', licenseNumber: '', yearsOfExperience: '', subSpecialization: '', qualifications: '', languages: '', bio: '', facilityName: '', facilityAddress: '', area: '', phone: '', image: '' };

const STATUS_BANNER = {
  pending: { cls: 'bg-state-info-subtle text-state-info', icon: 'hourglass_top', title: 'طلبك قيد المراجعة', text: 'أرسلنا بياناتك إلى الإدارة للمصادقة عليها. سنبلغك فور الموافقة.' },
  approved: { cls: 'bg-state-success-subtle text-state-success', icon: 'verified', title: 'صفحتك مُفعّلة', text: 'يمكنك تعديل بياناتك في أي وقت، وإدارة جدولك ومواعيدك من صفحاتهما الخاصة.' },
  rejected: { cls: 'bg-state-danger-subtle text-state-danger', icon: 'error', title: 'الطلب بحاجة لتعديل', text: 'عدّل البيانات أدناه وأعد الإرسال.' }
};

export default function DoctorProfileSetupPage() {
  const state = useAsync(async () => (await api.providerProfile.mine()).item, []);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedNow, setSavedNow] = useState(false);

  useEffect(() => {
    if (state.data) setForm({ ...EMPTY, ...state.data.data });
  }, [state.data]);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('اختر صورة فقط.'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('حجم الصورة يجب ألا يتجاوز 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((prev) => ({ ...prev, image: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 3) { setError('اسمك مطلوب.'); return; }
    if (!form.specialization.trim()) { setError('التخصص مطلوب.'); return; }
    if (!form.licenseNumber.trim()) { setError('رقم الترخيص مطلوب.'); return; }
    setBusy(true);
    setError('');
    try {
      const { item } = await api.providerProfile.submit(form);
      state.setData(item);
      setSavedNow(true);
      setTimeout(() => setSavedNow(false), 4000);
    } catch (e) {
      setError(e.message || 'تعذّر حفظ الملف.');
    } finally {
      setBusy(false);
    }
  };

  const banner = state.data ? STATUS_BANNER[state.data.status] : null;

  return (
    <>
      <PageHeader title="ملفي الخاص" subtitle="بياناتك كما تظهر للمرضى عند البحث عن طبيب" />
      <PageBody>
        <RoleGate allow={['Doctor']} message="هذه الصفحة لحسابات الأطباء فقط.">
          <AsyncBlock state={state}>
            {banner ? (
              <div className={'rounded-2xl p-space-md flex items-start gap-space-sm ' + banner.cls}>
                <Icon name={banner.icon} className="text-[26px] shrink-0" />
                <div>
                  <h2 className="font-headline-sm text-headline-sm">{banner.title}</h2>
                  <p className="font-body-sm text-body-sm">{banner.text}</p>
                  {state.data?.review?.note ? <p className="font-body-sm text-body-sm mt-1">ملاحظة الإدارة: {state.data.review.note}</p> : null}
                </div>
              </div>
            ) : (
              <div className="bg-surface-card rounded-2xl p-space-md shadow-sm flex items-center gap-space-sm">
                <Icon name="info" className="text-primary text-[26px]" />
                <p className="font-body-sm text-body-sm text-text-body">أكمل بياناتك أدناه ثم أرسلها للإدارة لتفعيل صفحتك.</p>
              </div>
            )}

            <div className="w-full bg-surface-container-lowest rounded-xl shadow-md p-space-md lg:p-space-lg flex flex-col sm:flex-row items-start sm:items-center gap-space-md">
              <img src={form.image || DOCTOR_FALLBACK_AVATAR} alt="" className="w-24 h-24 rounded-xl object-cover shadow-sm ring-4 ring-state-info-subtle" />
              <div className="flex flex-col gap-space-3xs">
                <h1 className="font-headline-xl text-headline-xl text-text-heading">{form.name || 'اسمك'}</h1>
                <p className="font-headline-sm text-headline-sm text-text-body font-semibold">{form.specialization || 'التخصص'}</p>
                {form.facilityName ? <span className="font-body-sm text-body-sm text-text-muted flex items-center gap-1"><Icon name="domain" className="text-[18px]" />{form.facilityName}</span> : null}
              </div>
            </div>

            <Card>
              <CardTitle icon="edit">تعديل البيانات</CardTitle>
              <form onSubmit={submit} className="flex flex-col gap-space-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <Field label="الاسم الكامل" required><input className={inputClass} value={form.name} onChange={set('name')} /></Field>
                  <Field label="التخصص" required><input className={inputClass} value={form.specialization} onChange={set('specialization')} placeholder="مثال: طب أطفال" /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <Field label="رقم الترخيص" required><input dir="ltr" className={inputClass} value={form.licenseNumber} onChange={set('licenseNumber')} /></Field>
                  <Field label="سنوات الخبرة"><input type="number" min="0" className={inputClass} value={form.yearsOfExperience} onChange={set('yearsOfExperience')} /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <Field label="التخصص الدقيق"><input className={inputClass} value={form.subSpecialization} onChange={set('subSpecialization')} /></Field>
                  <Field label="اللغات"><input className={inputClass} value={form.languages} onChange={set('languages')} placeholder="العربية، الإنجليزية" /></Field>
                </div>
                <Field label="المؤهلات والشهادات"><textarea rows={3} className={inputClass} value={form.qualifications} onChange={set('qualifications')} /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <Field label="اسم المنشأة (اختياري)"><input className={inputClass} value={form.facilityName} onChange={set('facilityName')} /></Field>
                  <Field label="المحافظة">
                    <select className={inputClass} value={form.area} onChange={set('area')}>
                      <option value="">اختر المحافظة</option>
                      {geo.all().map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="عنوان العيادة (اختياري)"><input className={inputClass} value={form.facilityAddress} onChange={set('facilityAddress')} /></Field>
                <Field label="صورتك الشخصية (اختياري)"><div className="flex flex-col gap-2"><input type="file" accept="image/*" onChange={chooseImage} className={inputClass}/>{form.image ? <img src={form.image} alt="معاينة الصورة" className="w-24 h-24 rounded-xl object-cover"/> : null}</div></Field>
                <Field label="نبذة تعريفية (اختياري)"><textarea rows={3} className={inputClass} value={form.bio} onChange={set('bio')} /></Field>
                {error ? <p className="font-body-sm text-body-sm text-state-danger">{error}</p> : null}
                {savedNow ? <p className="font-body-sm text-body-sm text-state-success flex items-center gap-1"><Icon name="check_circle" className="text-body-md" /> تم الحفظ والإرسال.</p> : null}
                <Button type="submit" disabled={busy} icon="send">{busy ? 'جارٍ الإرسال…' : (state.data ? 'حفظ التعديلات' : 'إنشاء الملف الخاص')}</Button>
              </form>
            </Card>

            {state.data?.status === 'approved' ? (
              <div className="flex flex-wrap gap-space-sm">
                <Link href="/my-profile" className="px-space-md py-space-2xs rounded-lg bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1"><Icon name="event_available" className="text-body-md" /> جدول العمل والمواعيد</Link>
                <Link href="/doctor-appointments" className="px-space-md py-space-2xs rounded-lg bg-surface-container-high text-text-primary font-label-md text-label-md flex items-center gap-1"><Icon name="event_note" className="text-body-md" /> إدارة حجوزات المرضى</Link>
              </div>
            ) : null}
          </AsyncBlock>
        </RoleGate>
      </PageBody>
    </>
  );
}
