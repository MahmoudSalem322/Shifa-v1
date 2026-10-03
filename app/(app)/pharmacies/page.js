'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api, toList } from '@/lib/api';
import { useAsync, useDebounced } from '@/lib/hooks';
import { geo, normalizePharmacy, statusLabel, statusTone, TONE_BADGE } from '@/lib/vocab';
import { PageHeader, RoleGate } from '@/components/app-shell';
import { useSession } from '@/lib/hooks';
import { AsyncBlock, Button, Field, Icon, inputClass } from '@/components/ui';

/* Port of pharmacy-directory.html (GET /api/pharmacies/search). */

const PILLS = [
  { key: '', label: 'الكل' },
  { key: 'open', label: 'مفتوحة الآن' },
  { key: '24h', label: 'تعمل 24 ساعة' },
];

function PharmacyCard({ pharmacy }) {
  const href = '/pharmacies/' + encodeURIComponent(pharmacy.id);
  return (
    <article className="bg-surface-card rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        <div className="relative h-40 w-full bg-surface-container overflow-hidden">
          {pharmacy.imageUrl
            ? <img className="w-full h-full object-cover" alt="" src={pharmacy.imageUrl} />
            : <div className="w-full h-full bg-gradient-to-br from-primary-container to-secondary-container" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          
          {pharmacy.status ? (
            <span className={'absolute top-3 right-3 inline-flex items-center gap-1 px-space-xs py-1 rounded-full font-label-sm text-label-sm shadow-sm ' + TONE_BADGE[statusTone(pharmacy.status)]}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" /> {statusLabel(pharmacy.status)}
            </span>
          ) : null}

          <div className="absolute bottom-3 right-3 left-3 flex justify-between items-end text-white gap-2">
            <h3 className="font-headline-md text-headline-md leading-tight text-white flex items-center gap-1">
              {pharmacy.name}
            </h3>
            {pharmacy.rating ? (
              <span className="flex items-center gap-1 bg-surface-card/90 text-text-body px-2 py-0.5 rounded-md font-label-sm text-label-sm shrink-0">
                <Icon name="star" filled className="text-state-warning text-[16px]" />{pharmacy.rating.toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-space-md flex flex-col gap-space-sm">
          {pharmacy.address ? <div className="flex items-center gap-space-2xs text-text-muted font-body-sm text-body-sm"><Icon name="location_on" className="text-text-primary text-[18px]" />{pharmacy.address}</div> : null}
          {pharmacy.workingHours ? <div className="flex items-center gap-space-2xs text-text-muted font-body-sm text-body-sm"><Icon name="schedule" className="text-text-primary text-[18px]" />{pharmacy.workingHours}</div> : null}
        </div>
      </div>

      <div className="p-space-md pt-0 flex items-center gap-space-2xs">
        <Link href={href} className="flex-1 py-space-xs px-space-sm rounded-lg bg-primary-container hover:bg-primary-hover text-on-primary font-label-md text-label-md flex items-center justify-center gap-1 shadow-sm transition-colors">
          عرض التفاصيل <Icon name="arrow_back" className="text-[18px]" />
        </Link>
        {pharmacy.phone ? (
          <a aria-label="الاتصال بالصيدلية" href={'tel:' + pharmacy.phone} className="w-10 h-10 rounded-lg bg-surface-container-low hover:bg-surface-container text-text-primary flex items-center justify-center">
            <Icon name="call" className="text-[20px]" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function PharmacyDirectoryPage() {
  const session = useSession();
  if (session?.role === 'Admin') return <RoleGate allow={['Patient']} message="هذا القسم مخصص للمرضى." />;

  const [search, setSearch] = useState('');
  const [medicineSearch, setMedicineSearch] = useState('');
  const [location, setLocation] = useState('');
  const [pill, setPill] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const debounced = useDebounced(search, 300);

  const state = useAsync(async () => {
    const [catalog, selfService] = await Promise.all([
      toList(await api.pharmacies.search({ name: debounced, area: location })).map(normalizePharmacy).filter(Boolean),
      api.providerProfile.publicList('Pharmacy').then((r) => r.items || []).catch(() => [])
    ]);
    const merged = await Promise.all(selfService.map(async (p) => {
      let stock = [];
      try {
        const matches = toList(await api.pharmacies.search({ name: p.data?.name || p.data?.fullName || '' }));
        const same = matches.find((candidate) =>
          String(candidate.name || '').trim().toLowerCase() === String(p.data?.name || '').trim().toLowerCase()
          && (!p.data?.address || !candidate.address || String(candidate.address).trim().toLowerCase() === String(p.data.address).trim().toLowerCase())
        ) || matches[0];
        stock = same?.medicines || [];
      } catch {}
      return normalizePharmacy({ ...p.data, id: 'self-' + p.id, medicines: stock });
    }));
    return [...catalog, ...merged];
  }, [debounced, location]);

  const requestMedicine = async () => {
    const medicineName = medicineSearch.trim();
    if (!medicineName) return;
    setRequestBusy(true);
    setRequestMessage('');
    try {
      await api.medicineDemands.create({ medicineName, area: location });
      setRequestMessage('تم تسجيل طلبك. سنرسل لك إشعارًا فور ظهور الدواء في إحدى الصيدليات.');
    } catch (error) {
      setRequestMessage(error.message || 'تعذر تسجيل طلب الدواء.');
    } finally {
      setRequestBusy(false);
    }
  };

  const pharmacies = useMemo(() => (state.data || []).filter((p) => {
    if (search && !(p.name + ' ' + p.address).toLowerCase().includes(search.toLowerCase())) return false;
    if (medicineSearch) {
      const wanted = medicineSearch.trim().toLowerCase();
      const hasMedicine = (p.medicines || []).some((m) =>
        String(m.medicineName || '').toLowerCase().includes(wanted) || wanted.includes(String(m.medicineName || '').toLowerCase())
      );
      if (!hasMedicine) return false;
    }
    if (location) {
      const actual = geo.normalize(p.area) || geo.normalize(p.address);
      if (actual && actual !== location) return false;
    }
    if (pill === 'open' && p.status === 'Closed') return false;
    if (pill === '24h' && !String(p.workingHours).includes('24')) return false;
    return true;
  }), [state.data, search, medicineSearch, location, pill]);

  return (
    <>
      <PageHeader title="البحث عن الصيدليات والدواء" subtitle="ابحث عن الدواء والصيدليات المتوفر فيها داخل غزة" />
      <div className="max-w-[1280px] mx-auto w-full px-space-sm sm:px-space-md lg:px-space-xl py-space-lg pb-space-3xl flex flex-col gap-space-lg">
        <div className="bg-surface-card rounded-2xl p-space-md shadow-md flex flex-col gap-space-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
            <div>
              <h2 className="font-headline-lg text-headline-lg text-text-heading">ابحث عن الدواء والصيدليات</h2>
              <p className="font-body-md text-body-md text-text-muted">اكتب اسم الدواء لمعرفة الصيدليات التي يتوفر فيها، أو ابحث باسم الصيدلية والموقع.</p>
            </div>
            <Icon name="local_pharmacy" className="text-primary text-[38px]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm">
            <div className="relative">
              <Icon name="search" className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input className="w-full pr-10 pl-space-sm py-space-xs bg-surface-container-low rounded-lg font-body-md focus:outline-none" placeholder="ابحث باسم الصيدلية أو العنوان…"
                value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث عن صيدلية" />
            </div>
            <div className="relative">
              <Icon name="medication" className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input className="w-full pr-10 pl-space-sm py-space-xs bg-surface-container-low rounded-lg font-body-md focus:outline-none" placeholder="ابحث عن دواء متوفر داخل الصيدلية…"
                value={medicineSearch} onChange={(e) => setMedicineSearch(e.target.value)} aria-label="البحث عن دواء داخل الصيدليات" />
            </div>
            <select aria-label="المحافظة" className="w-full px-space-xs py-space-xs bg-surface-container-low rounded-lg font-body-md cursor-pointer focus:outline-none" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">كل مناطق غزة</option>
              {geo.all().map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
              
            </select>
          </div>
          {medicineSearch.trim() && !state.loading && !pharmacies.length ? (
            <div className="rounded-xl bg-state-warning-subtle p-space-sm flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
              <div>
                <p className="font-label-lg text-label-lg text-text-heading">لم نجد «{medicineSearch.trim()}» في النتائج الحالية.</p>
                <p className="font-body-sm text-body-sm text-text-muted">يمكنك تسجيل طلب لتصلك رسالة عند توفره في أي صيدلية.</p>
              </div>
              <Button tone="soft" icon="notifications_active" disabled={requestBusy} onClick={requestMedicine}>{requestBusy ? 'جارٍ تسجيل الطلب…' : 'اطلب توفير الدواء'}</Button>
            </div>
          ) : null}
          {requestMessage ? <p className="font-body-sm text-body-sm text-state-success flex items-center gap-1"><Icon name="check_circle" />{requestMessage}</p> : null}
          <div className="flex flex-wrap gap-space-2xs">
            {PILLS.map((p) => (
              <button key={p.key || 'all'} type="button" aria-pressed={pill === p.key} onClick={() => setPill(p.key)}
                className={'px-space-sm py-1 rounded-full font-label-md text-label-md transition-colors ' + (pill === p.key ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-text-body hover:bg-surface-container')}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-space-2xs">
          <h2 className="font-headline-lg text-headline-lg text-text-heading">الصيدليات</h2>
          <span className="px-space-xs py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-md text-label-md">
            {state.loading && !state.data ? 'جارٍ التحميل…' : pharmacies.length + ' صيدلية'}
          </span>
        </div>

        <AsyncBlock state={state} skeleton={4} empty={{ when: !pharmacies.length, title: 'لا توجد صيدليات مطابقة', hint: 'جرّب محافظة أخرى أو أزل بعض عوامل التصفية.' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {pharmacies.map((p) => <PharmacyCard key={p.id} pharmacy={p} />)}
          </div>
        </AsyncBlock>

        <div className="bg-surface-card rounded-2xl p-space-md shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-sm">
            <span className="w-12 h-12 rounded-xl bg-primary/10 text-text-primary flex items-center justify-center"><Icon name="support_agent" /></span>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-text-heading">لم تجد الدواء في صيدليات منطقتك؟</h3>
              <p className="font-body-md text-body-md text-text-muted">أرسل طلب دواء وأرفق وصفتك، وستتولى الصيدليات المتابعة.</p>
            </div>
          </div>
          <Link href={'/drug-requests/new' + (medicineSearch.trim() ? '?medicine=' + encodeURIComponent(medicineSearch.trim()) : '')} className="px-space-md py-2.5 rounded-lg bg-primary-container text-on-primary font-label-lg text-label-lg shrink-0">طلب دواء</Link>
        </div>
      </div>
    </>
  );
}
