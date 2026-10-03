'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { facilityTypeLabel, geo } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { AsyncBlock, Badge, Button, Card, CardTitle, Field, Icon, InfoRow, inputClass } from '@/components/ui';

/* Self-service "إنشاء الملف الخاص" for Hospital accounts. Same visual
   language as the patient-facing facility detail page (facilities/[id]),
   so what the provider edits here is exactly what patients will see once
   an admin approves it. */

const TYPES = ['Hospital', 'Clinic', 'Medical Center'];
const EMPTY = { name: '', type: 'Hospital', address: '', phone: '', email: '', workingHours: '24/7', area: '', emergency: false, imageUrl: '', bio: '' };

const STATUS_BANNER = {
  pending: { cls: 'bg-state-info-subtle text-state-info', icon: 'hourglass_top', title: 'طلبك قيد المراجعة', text: 'أرسلنا بياناتك إلى الإدارة للمصادقة عليها. سنبلغك فور الموافقة.' },
  approved: { cls: 'bg-state-success-subtle text-state-success', icon: 'verified', title: 'صفحتك مُفعّلة', text: 'يمكنك تعديل بياناتك في أي وقت، والتحكم بالخدمات والأطباء من صفحاتهم الخاصة.' },
  rejected: { cls: 'bg-state-danger-subtle text-state-danger', icon: 'error', title: 'الطلب بحاجة لتعديل', text: 'عدّل البيانات أدناه وأعد الإرسال.' }
};

export default function FacilityProfilePage() {
  const state = useAsync(async () => (await api.providerProfile.mine()).item, []);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedNow, setSavedNow] = useState(false);

  useEffect(() => {
    if (state.data) setForm({ ...EMPTY, ...state.data.data });
  }, [state.data]);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm({ ...form, [key]: value });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 3) { setError('اسم المنشأة مطلوب.'); return; }
    if (!form.address.trim()) { setError('العنوان مطلوب.'); return; }
    setBusy(true);
    setError('');
    try {
      const { item } = await api.providerProfile.submit(form);
      state.setData ? state.setData(item) : state.reload();
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
      <PageHeader title="ملفي الخاص" subtitle="بيانات منشأتك كما تظهر للمرضى في دليل المراكز والمستشفيات" />
      <PageBody>
        <RoleGate allow={['Hospital']} message="هذه الصفحة لحسابات المراكز الصحية والمستشفيات فقط.">
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

            {/* Live preview using the same hero layout as the public detail page */}
            <div className="bg-surface-card rounded-2xl overflow-hidden shadow-sm">
              <div className="relative h-40 md:h-56 bg-surface-container">
                {form.imageUrl ? <img src={form.imageUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-primary-container to-secondary-container" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-0 right-0 left-0 p-space-md flex flex-col gap-1 text-white">
                  <span className="self-start px-space-xs py-1 rounded-full bg-surface-card/90 text-text-heading font-label-sm text-label-sm">{facilityTypeLabel(form.type)}</span>
                  <h1 className="font-headline-xl text-headline-xl text-white">{form.name || 'اسم المنشأة'}</h1>
                  {form.address ? <span className="flex items-center gap-1 font-body-sm text-body-sm text-white/90"><Icon name="location_on" className="text-[18px]" />{form.address}</span> : null}
                </div>
              </div>
              <div className="p-space-md grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm">
                <InfoRow icon="schedule" label="مواعيد العمل">{form.workingHours}</InfoRow>
                <InfoRow icon="call" label="الاستقبال">{form.phone || '—'}</InfoRow>
                <InfoRow icon="map" label="المحافظة">{geo.label(form.area) || '—'}</InfoRow>
                <InfoRow icon="emergency" label="الطوارئ">{form.emergency ? 'متوفرة' : 'غير متوفرة'}</InfoRow>
              </div>
            </div>

            <Card>
              <CardTitle icon="edit">تعديل البيانات</CardTitle>
              <form onSubmit={submit} className="flex flex-col gap-space-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <Field label="اسم المنشأة" required><input className={inputClass} value={form.name} onChange={set('name')} /></Field>
                  <Field label="نوع المنشأة">
                    <select className={inputClass} value={form.type} onChange={set('type')}>
                      {TYPES.map((t) => <option key={t} value={t}>{facilityTypeLabel(t)}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="العنوان" required><input className={inputClass} value={form.address} onChange={set('address')} /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <Field label="رقم الهاتف"><input dir="ltr" className={inputClass} value={form.phone} onChange={set('phone')} placeholder="0X XXX XXXX" /></Field>
                  <Field label="البريد الإلكتروني"><input dir="ltr" type="email" className={inputClass} value={form.email} onChange={set('email')} /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <Field label="مواعيد العمل"><input className={inputClass} value={form.workingHours} onChange={set('workingHours')} /></Field>
                  <Field label="المحافظة">
                    <select className={inputClass} value={form.area} onChange={set('area')}>
                      <option value="">اختر المحافظة</option>
                      {geo.all().map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="رابط صورة المنشأة (اختياري)"><input dir="ltr" className={inputClass} value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://…" /></Field>
                <Field label="نبذة عن المنشأة (اختياري)"><textarea rows={3} className={inputClass} value={form.bio} onChange={set('bio')} /></Field>
                <label className="flex items-center gap-2 font-label-md text-label-md text-text-body">
                  <input type="checkbox" checked={form.emergency} onChange={set('emergency')} /> يوجد قسم طوارئ يعمل على مدار الساعة
                </label>
                {error ? <p className="font-body-sm text-body-sm text-state-danger">{error}</p> : null}
                {savedNow ? <p className="font-body-sm text-body-sm text-state-success flex items-center gap-1"><Icon name="check_circle" className="text-body-md" /> تم الحفظ والإرسال.</p> : null}
                <Button type="submit" disabled={busy} icon="send">{busy ? 'جارٍ الإرسال…' : (state.data ? 'حفظ التعديلات' : 'إنشاء الملف الخاص')}</Button>
              </form>
            </Card>

            {state.data?.status === 'approved' ? (
              <div className="flex flex-wrap gap-space-sm">
                <Link href="/facility-services" className="px-space-md py-space-2xs rounded-lg bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1"><Icon name="health_and_safety" className="text-body-md" /> إدارة الخدمات والأقسام</Link>
                <Link href="/facility-doctors" className="px-space-md py-space-2xs rounded-lg bg-surface-container-high text-text-primary font-label-md text-label-md flex items-center gap-1"><Icon name="groups" className="text-body-md" /> إدارة الأطباء</Link>
              </div>
            ) : null}
          </AsyncBlock>
        </RoleGate>
      </PageBody>
    </>
  );
}
