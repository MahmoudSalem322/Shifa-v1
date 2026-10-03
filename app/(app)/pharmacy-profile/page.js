'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { geo } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { AsyncBlock, Badge, Button, Card, CardTitle, Field, Icon, InfoRow, inputClass } from '@/components/ui';

/* Self-service "إنشاء الملف الخاص" for Pharmacy accounts — same visual
   language as the patient-facing pharmacy detail page (pharmacies/[id]). */

const EMPTY = { name: '', type: '', address: '', phone: '', email: '', workingHours: '9:00 ص - 9:00 م', area: '', acceptsInsurance: false, hasColdChain: false, imageUrl: '', bio: '' };

const STATUS_BANNER = {
  pending: { cls: 'bg-state-info-subtle text-state-info', icon: 'hourglass_top', title: 'طلبك قيد المراجعة', text: 'أرسلنا بياناتك إلى الإدارة للمصادقة عليها. سنبلغك فور الموافقة.' },
  approved: { cls: 'bg-state-success-subtle text-state-success', icon: 'verified', title: 'صفحتك مُفعّلة', text: 'يمكنك تعديل بياناتك في أي وقت، وإدارة مخزون الأدوية من صفحته الخاصة.' },
  rejected: { cls: 'bg-state-danger-subtle text-state-danger', icon: 'error', title: 'الطلب بحاجة لتعديل', text: 'عدّل البيانات أدناه وأعد الإرسال.' }
};

export default function PharmacyProfilePage() {
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
    if (form.name.trim().length < 3) { setError('اسم الصيدلية مطلوب.'); return; }
    if (!form.address.trim()) { setError('العنوان مطلوب.'); return; }
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
      <PageHeader title="ملفي الخاص" subtitle="بيانات صيدليتك كما تظهر للمرضى في دليل الصيدليات" />
      <PageBody>
        <RoleGate allow={['Pharmacy']} message="هذه الصفحة لحسابات الصيدليات فقط.">
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

            <div className="bg-gradient-to-l from-primary-container to-primary-hover text-on-primary rounded-2xl p-space-md lg:p-space-lg shadow-md flex flex-col md:flex-row md:items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-md">
                <span className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><Icon name="local_pharmacy" className="text-[36px]" /></span>
                <div className="flex flex-col gap-1">
                  <h1 className="font-headline-xl text-headline-xl">{form.name || 'اسم الصيدلية'}</h1>
                  {form.address ? <span className="font-body-md text-body-md text-white/85 flex items-center gap-1"><Icon name="location_on" className="text-[18px]" />{form.address}</span> : null}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm">
              <InfoRow icon="schedule" label="ساعات العمل">{form.workingHours}</InfoRow>
              <InfoRow icon="map" label="المحافظة">{geo.label(form.area) || '—'}</InfoRow>
              <InfoRow icon="health_and_safety" label="التأمين">{form.acceptsInsurance ? 'تقبل التأمين' : 'لا تقبل'}</InfoRow>
              <InfoRow icon="ac_unit" label="سلسلة التبريد">{form.hasColdChain ? 'متوفرة' : 'غير متوفرة'}</InfoRow>
            </div>

            <Card>
              <CardTitle icon="edit">تعديل البيانات</CardTitle>
              <form onSubmit={submit} className="flex flex-col gap-space-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm"><Field label="اسم الصيدلية" required><input className={inputClass} value={form.name} onChange={set('name')} /></Field><Field label="نوع المنشأة"><input className={inputClass} value={form.type} onChange={set('type')} placeholder="اكتب نوع المنشأة" /></Field></div>
                <Field label="العنوان" required><input className={inputClass} value={form.address} onChange={set('address')} /></Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <Field label="رقم الهاتف"><input dir="ltr" className={inputClass} value={form.phone} onChange={set('phone')} /></Field>
                  <Field label="البريد الإلكتروني"><input dir="ltr" type="email" className={inputClass} value={form.email} onChange={set('email')} /></Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <Field label="ساعات العمل"><input className={inputClass} value={form.workingHours} onChange={set('workingHours')} /></Field>
                  <Field label="المحافظة">
                    <select className={inputClass} value={form.area} onChange={set('area')}>
                      <option value="">اختر المحافظة</option>
                      {geo.all().map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="رابط صورة الصيدلية (اختياري)"><input dir="ltr" className={inputClass} value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://…" /></Field>
                <Field label="نبذة (اختياري)"><textarea rows={3} className={inputClass} value={form.bio} onChange={set('bio')} /></Field>
                <div className="flex flex-wrap gap-space-md">
                  <label className="flex items-center gap-2 font-label-md text-label-md text-text-body">
                    <input type="checkbox" checked={form.acceptsInsurance} onChange={set('acceptsInsurance')} /> تقبل التأمين الصحي
                  </label>
                  <label className="flex items-center gap-2 font-label-md text-label-md text-text-body">
                    <input type="checkbox" checked={form.hasColdChain} onChange={set('hasColdChain')} /> يوجد سلسلة تبريد للأدوية
                  </label>
                </div>
                {error ? <p className="font-body-sm text-body-sm text-state-danger">{error}</p> : null}
                {savedNow ? <p className="font-body-sm text-body-sm text-state-success flex items-center gap-1"><Icon name="check_circle" className="text-body-md" /> تم الحفظ والإرسال.</p> : null}
                <Button type="submit" disabled={busy} icon="send">{busy ? 'جارٍ الإرسال…' : (state.data ? 'حفظ التعديلات' : 'إنشاء الملف الخاص')}</Button>
              </form>
            </Card>

            {state.data?.status === 'approved' ? (
              <Link href="/pharmacy-stock" className="self-start px-space-md py-space-2xs rounded-lg bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1"><Icon name="inventory_2" className="text-body-md" /> إدارة مخزون الأدوية</Link>
            ) : null}
          </AsyncBlock>
        </RoleGate>
      </PageBody>
    </>
  );
}
