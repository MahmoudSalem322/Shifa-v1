'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, toItem } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { parseWorkDays } from '@/lib/schedule';
import { DOCTOR_FALLBACK_AVATAR, geo, normalizeDoctor, WEEKDAYS_AR } from '@/lib/vocab';
import { PageBody, PageHeader } from '@/components/app-shell';
import { AsyncBlock, ButtonLink, Icon } from '@/components/ui';

/* Patient-facing doctor profile. All profile content is normalized from the API;
   fields that the API does not provide are intentionally omitted or shown as unavailable. */
function displayValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      if (item && typeof item === 'object') return item.name || item.title || item.qualification || item.degree || '';
      return '';
    }).filter(Boolean).join('، ');
  }
  if (value && typeof value === 'object') return value.name || value.title || value.label || '';
  return value == null ? '' : String(value).trim();
}

function StatCard({ icon, label, value, sub, children }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-sm shadow-sm border border-border-soft/60 flex flex-col gap-space-2xs hover:shadow-md transition-shadow min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-text-primary shrink-0"><Icon name={icon} className="text-2xl" /></span>
        <span className="font-label-sm text-label-sm text-text-muted">{label}</span>
      </div>
      <div className="mt-space-3xs min-w-0">
        {children || <span className="font-headline-sm text-headline-sm font-bold text-text-heading block leading-tight break-words">{value || 'غير متوفر'}</span>}
        {sub ? <span className="font-body-sm text-body-sm text-text-muted leading-tight block mt-1 break-words">{sub}</span> : null}
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value, children }) {
  const content = children || displayValue(value);
  if (!content) return null;
  return (
    <div className="flex items-start gap-space-xs rounded-xl bg-surface-container-low/60 p-space-sm min-w-0">
      <span className="w-9 h-9 rounded-lg bg-primary/10 text-text-primary flex items-center justify-center shrink-0"><Icon name={icon} /></span>
      <div className="min-w-0 flex-1">
        <div className="font-label-sm text-label-sm text-text-muted mb-1">{label}</div>
        <div className="font-body-md text-body-md text-text-body break-words">{content}</div>
      </div>
    </div>
  );
}

export default function DoctorProfilePage() {
  const { id } = useParams();
  const state = useAsync(async () => normalizeDoctor(toItem(await api.doctors.get(id))), [id]);
  const doctor = state.data;
  const days = doctor ? parseWorkDays(doctor.workDays) : null;
  const mapQuery = doctor ? (doctor.latitude != null && doctor.longitude != null
    ? doctor.latitude + ',' + doctor.longitude
    : [doctor.facilityName, doctor.facilityAddress, geo.label(doctor.area), 'غزة'].filter(Boolean).join(' ')) : '';
  const qualifications = doctor ? displayValue(doctor.qualifications) : '';
  const languages = doctor ? displayValue(doctor.languages) : '';
  const availabilityKnown = doctor && typeof doctor.availableForBooking === 'boolean';

  return (
    <>
      <PageHeader title="الملف الشخصي للطبيب" subtitle="تعرّف على الطبيب ومكان عمله، ثم اختر الموعد المناسب" />
      <PageBody>
        <nav className="flex items-center gap-1 font-body-sm text-body-sm text-text-muted flex-wrap" aria-label="مسار التنقل">
          <Link href="/doctors" className="hover:text-text-primary">البحث عن طبيب</Link>
          <Icon name="chevron_left" className="text-[18px]" />
          <span className="text-text-body">{doctor ? doctor.name : 'ملف الطبيب'}</span>
        </nav>

        <AsyncBlock state={state}>
          {doctor ? (
            <div className="flex flex-col gap-space-md">
              <section className="relative overflow-hidden w-full bg-surface-container-lowest rounded-2xl shadow-md border border-border-soft/60 p-space-md lg:p-space-lg">
                <div className="absolute -left-12 -top-16 w-48 h-48 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-space-md min-w-0">
                    <div className="relative flex-shrink-0">
                      <img src={doctor.image || DOCTOR_FALLBACK_AVATAR} alt={doctor.name} className="w-28 h-28 lg:w-36 lg:h-36 rounded-2xl object-cover shadow-sm ring-4 ring-state-info-subtle bg-surface-subtle" />
                      {availabilityKnown ? (
                        <span className={'absolute -bottom-2 -left-2 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ring-2 ring-surface-card ' + (doctor.availableForBooking ? 'bg-state-success text-on-state' : 'bg-surface-subtle text-text-muted')} title={doctor.availableForBooking ? 'متاح للحجز' : 'الحجز غير متاح حالياً'}>
                          <Icon name={doctor.availableForBooking ? 'check' : 'schedule'} className="text-sm" />
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-space-xs min-w-0">
                      <div className="flex items-center gap-space-2xs flex-wrap">
                        <h1 className="font-headline-xl text-headline-xl text-text-heading break-words">{doctor.name}</h1>
                        {doctor.licenseNumber ? <span className="inline-flex items-center gap-1 px-space-2xs py-1 rounded-full bg-state-success-subtle text-state-success font-label-sm text-label-sm"><Icon name="verified" className="text-sm" /> مرخّص · {doctor.licenseNumber}</span> : null}
                      </div>
                      <p className="font-headline-sm text-headline-sm text-text-body font-semibold">{doctor.specialization || 'لم يُحدّد التخصص بعد'}</p>
                      {doctor.subSpecialization ? <p className="font-body-sm text-body-sm text-text-muted">التخصص الدقيق: {doctor.subSpecialization}</p> : null}
                      <div className="flex items-center gap-space-sm flex-wrap font-body-sm text-body-sm text-text-muted">
                        {doctor.facilityName ? <span className="inline-flex items-center gap-1"><Icon name="local_hospital" className="text-base text-text-primary" />{doctor.facilityId ? <Link href={'/facilities/' + encodeURIComponent(doctor.facilityId)} className="text-text-primary hover:underline font-semibold">{doctor.facilityName}</Link> : <span>{doctor.facilityName}</span>}</span> : null}
                        {(doctor.area || doctor.facilityAddress) ? <span className="inline-flex items-center gap-1"><Icon name="pin_drop" className="text-base text-text-primary" />{[geo.label(doctor.area), doctor.facilityAddress].filter(Boolean).join('، ')}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row lg:flex-col items-stretch gap-space-xs shrink-0">
                    <ButtonLink href={'/doctors/' + encodeURIComponent(doctor.id) + '/book'} icon="calendar_add_on" className="!px-space-xl !py-space-sm font-headline-sm text-headline-sm">عرض المواعيد وحجز موعد</ButtonLink>
                    <ButtonLink href="/doctors" tone="soft" icon="arrow_forward" className="justify-center">العودة إلى الأطباء</ButtonLink>
                    {availabilityKnown ? <span className={'text-center font-label-sm text-label-sm ' + (doctor.availableForBooking ? 'text-state-success' : 'text-text-muted')}>{doctor.availableForBooking ? 'متاح للحجز' : 'الحجز غير متاح حالياً'}</span> : null}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-sm" aria-label="ملخص الطبيب">
                <StatCard icon="history_edu" label="سنوات الخبرة" value={doctor.experience ? doctor.experience + ' سنة' : ''} sub="الخبرة المسجلة في الملف" />
                <StatCard icon="local_hospital" label="جهة العمل" value={doctor.facilityName} sub={doctor.facilityAddress} />
                <StatCard icon="schedule" label="ساعات دوام الطبيب" value={doctor.workHours} sub={doctor.workDays} />
                <StatCard icon="call" label="التواصل مع الطبيب">
                  {doctor.phone ? <a href={'tel:' + doctor.phone} dir="ltr" className="font-headline-sm text-headline-sm font-bold text-text-primary hover:underline block text-right">{doctor.phone}</a> : <span className="font-headline-sm text-headline-sm font-bold text-text-heading block">غير متوفر</span>}
                </StatCard>
              </section>

              <section className="bg-surface-container-lowest rounded-2xl p-space-md lg:p-space-lg shadow-sm border border-border-soft/60">
                <div className="flex items-center gap-space-2xs mb-space-sm text-text-heading"><Icon name="person_outline" className="text-2xl text-text-primary" /><h2 className="font-headline-lg text-headline-lg font-bold">عن الطبيب</h2></div>
                <p className="font-body-md text-body-md text-text-body leading-relaxed whitespace-pre-line">{doctor.bio || 'لم يضف الطبيب نبذة تعريفية بعد.'}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm mt-space-md">
                  <DetailRow icon="school" label="المؤهلات والشهادات" value={qualifications} />
                  <DetailRow icon="translate" label="اللغات" value={languages} />
                  <DetailRow icon="medical_services" label="التخصص الدقيق" value={doctor.subSpecialization} />
                  <DetailRow icon="verified" label="رقم الترخيص" value={doctor.licenseNumber} />
                </div>
              </section>

              <section className="bg-surface-container-lowest rounded-2xl p-space-md lg:p-space-lg shadow-sm border border-border-soft/60">
                <div className="flex items-center gap-space-2xs mb-space-sm text-text-heading"><Icon name="calendar_month" className="text-2xl text-text-primary" /><h2 className="font-headline-lg text-headline-lg font-bold">أيام دوام الطبيب</h2></div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 sm:gap-space-2xs">
                  {WEEKDAYS_AR.map((day, index) => {
                    const works = days ? days.has(index) : false;
                    return <div key={day} className={'flex flex-col items-center gap-1 p-space-xs rounded-lg text-center ' + (works ? 'bg-state-success-subtle text-state-success' : 'bg-surface-subtle text-text-muted')}><span className="font-label-sm text-label-sm">{day.replace('ال', '')}</span><Icon name={works ? 'check_circle' : 'remove'} className="text-[18px]" /><span className="text-[11px]">{works ? 'دوام' : '—'}</span></div>;
                  })}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm mt-space-sm">
                  <DetailRow icon="schedule" label="ساعات الدوام" value={doctor.workHours} />
                  <DetailRow icon="timer" label="مدة الاستشارة" value={doctor.durationMinutes ? doctor.durationMinutes + ' دقيقة' : ''} />
                </div>
                {!days ? <p className="font-body-sm text-body-sm text-text-muted mt-space-sm">لم يحدد الطبيب أيام الدوام في بياناته بعد.</p> : null}
                <div className="mt-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm rounded-xl bg-primary/5 p-space-sm">
                  <div><h3 className="font-headline-sm text-headline-sm font-bold text-text-heading">هل تريد حجز موعد؟</h3><p className="font-body-sm text-body-sm text-text-muted">ستظهر الأوقات المتاحة حسب جدول الطبيب والحجوزات الحالية.</p></div>
                  <ButtonLink href={'/doctors/' + encodeURIComponent(doctor.id) + '/book'} icon="event_available" className="shrink-0">اختيار موعد</ButtonLink>
                </div>
              </section>

              <section className="bg-surface-container-lowest rounded-2xl p-space-md lg:p-space-lg shadow-sm border border-border-soft/60 flex flex-col gap-space-sm">
                <div className="flex items-center gap-space-2xs text-text-heading"><Icon name="location_city" className="text-2xl text-text-primary" /><h2 className="font-headline-lg text-headline-lg font-bold">جهة العمل والموقع</h2></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <DetailRow icon="local_hospital" label="المستشفى أو المركز" value={doctor.facilityName}>
                    {doctor.facilityName ? (doctor.facilityId ? <Link href={'/facilities/' + encodeURIComponent(doctor.facilityId)} className="font-semibold text-text-primary hover:underline">{doctor.facilityName} <Icon name="open_in_new" className="inline text-sm" /></Link> : doctor.facilityName) : null}
                  </DetailRow>
                  <DetailRow icon="location_on" label="العنوان" value={[doctor.facilityAddress, geo.label(doctor.area)].filter(Boolean).join('، ')} />
                  <DetailRow icon="call" label="رقم تواصل المنشأة">
                    {doctor.facilityPhone ? <a href={'tel:' + doctor.facilityPhone} dir="ltr" className="text-text-primary hover:underline">{doctor.facilityPhone}</a> : null}
                  </DetailRow>
                  <DetailRow icon="schedule" label="ساعات عمل المنشأة" value={doctor.facilityWorkingHours} />
                </div>
                {mapQuery ? <a className="inline-flex items-center gap-1.5 self-start px-space-sm py-2 rounded-lg bg-surface-container-low text-text-primary hover:bg-primary-container hover:text-on-primary font-label-md text-label-md font-semibold transition-colors" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQuery)} target="_blank" rel="noopener noreferrer"><Icon name="directions" className="text-lg" /> فتح الموقع في خرائط Google</a> : null}
              </section>
            </div>
          ) : null}
        </AsyncBlock>
      </PageBody>
    </>
  );
}
