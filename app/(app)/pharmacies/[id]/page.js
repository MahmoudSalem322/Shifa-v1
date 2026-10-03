'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api, toItem } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { geo, normalizePharmacy, normalizeStocks, statusLabel, statusTone, stockTone, TONE_SOLID } from '@/lib/vocab';
import { PageBody, PageHeader } from '@/components/app-shell';
import { AsyncBlock, Badge, Card, CardTitle, EmptyState, Icon, InfoRow } from '@/components/ui';

/* Port of pharmacy-details.html (GET /api/pharmacies/{id}). */
export default function PharmacyDetailsPage() {
  const { id } = useParams();
  const [medicineQuery, setMedicineQuery] = useState('');
  const isSelfService = String(id).startsWith('self-');
  const state = useAsync(async () => {
    if (isSelfService) {
      const { item } = await api.providerProfile.publicGet(id.slice(5));
      let stock = [];
      try {
        const matches = toList(await api.pharmacies.search({ name: item.data?.name || item.data?.fullName || '' }));
        const same = matches.find((candidate) =>
          String(candidate.name || '').trim().toLowerCase() === String(item.data?.name || '').trim().toLowerCase()
          && (!item.data?.address || !candidate.address || String(candidate.address).trim().toLowerCase() === String(item.data.address).trim().toLowerCase())
        ) || matches[0];
        stock = normalizeStocks(same || {});
      } catch {}
      return { pharmacy: normalizePharmacy({ ...item.data, id }), stocks: stock };
    }
    const raw = toItem(await api.pharmacies.get(id));
    return { pharmacy: normalizePharmacy(raw), stocks: normalizeStocks(raw) };
  }, [id]);
  const p = state.data && state.data.pharmacy;
  const stocks = (state.data && state.data.stocks) || [];
  const filteredStocks = useMemo(() => {
    const query = medicineQuery.trim().toLowerCase();
    if (!query) return stocks;
    return stocks.filter((stock) => String(stock.medicineName || '').toLowerCase().includes(query));
  }, [stocks, medicineQuery]);

  return (
    <>
      <PageHeader title="تفاصيل الصيدلية" subtitle={p ? p.name : ''} />
      <PageBody>
        <nav className="flex items-center gap-1 font-body-sm text-body-sm text-text-muted" aria-label="مسار التنقل">
          <Link href="/pharmacies" className="hover:text-text-primary">دليل الصيدليات</Link>
          <Icon name="chevron_left" className="text-[18px]" />
          <span className="text-text-body">{p ? p.name : '…'}</span>
        </nav>

        <AsyncBlock state={state}>
          {p ? (
            <>
              <div className="bg-gradient-to-l from-primary-container to-primary-hover text-on-primary rounded-2xl p-space-md lg:p-space-lg shadow-md flex flex-col md:flex-row md:items-center justify-between gap-space-md">
                <div className="flex items-center gap-space-md">
                  <span className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><Icon name="local_pharmacy" className="text-[36px]" /></span>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="font-headline-xl text-headline-xl">{p.name}</h1>
                      {p.status ? <Badge className={TONE_SOLID[statusTone(p.status)] || 'bg-surface-card/20 text-white'}>{statusLabel(p.status)}</Badge> : null}
                    </div>
                    {p.address ? <span className="font-body-md text-body-md text-white/85 flex items-center gap-1"><Icon name="location_on" className="text-[18px]" />{p.address}</span> : null}
                  </div>
                </div>
                {p.phone ? (
                  <a href={'tel:' + p.phone} className="inline-flex items-center justify-center gap-2 px-space-md py-3 rounded-xl bg-surface-card text-text-heading font-label-lg text-label-lg shadow-sm shrink-0">
                    <Icon name="call" /> <span dir="ltr">{p.phone}</span>
                  </a>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm">
                <InfoRow icon="schedule" label="ساعات العمل">{p.workingHours}</InfoRow>
                <InfoRow icon="map" label="المحافظة">{geo.label(p.area) || geo.label(p.address)}</InfoRow>
              </div>

              <Card>
                <CardTitle
                  icon="inventory_2"
                  count={filteredStocks.length}
                  actions={null}
                >
                  الأدوية المتوفرة
                </CardTitle>
                <div className="relative mb-space-sm">
                    <Icon name="search" className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      value={medicineQuery}
                      onChange={(e) => setMedicineQuery(e.target.value)}
                      className="w-full pr-10 pl-space-sm py-space-xs bg-surface-container-low rounded-lg font-body-md focus:outline-none"
                      placeholder="ابحث عن دواء داخل هذه الصيدلية…"
                      aria-label="البحث عن دواء في الصيدلية"
                      autoFocus
                    />
                  </div>
                {filteredStocks.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-space-xs">
                    {filteredStocks.map((stock, index) => {
                      const tone = stockTone(stock);
                      const name = stock.medicineName || 'دواء';
                      return (
                        <div key={index} className="flex items-center justify-between gap-space-sm p-space-sm rounded-xl bg-surface-subtle">
                          <div className="flex flex-col min-w-0">
                            {stock.medicineId != null
                              ? <Link href={'/medicines/' + encodeURIComponent(stock.medicineId)} className="font-headline-sm text-headline-sm text-text-heading hover:text-primary truncate">{name}</Link>
                              : <span className="font-headline-sm text-headline-sm text-text-heading truncate">{name}</span>}
                            <Badge className={tone.cls + ' self-start mt-1'}>{tone.label}{stock.quantity ? ' (' + stock.quantity + ' ' + (stock.unit || 'وحدة') + ')' : ''}</Badge>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {stock.price ? <span className="font-headline-sm text-headline-sm text-text-primary" dir="ltr">{stock.price.toFixed(2)} ₪</span> : null}
                            <Link href={'/drug-requests/new?medicine=' + encodeURIComponent(name)} className="font-label-md text-label-md text-text-primary hover:underline">طلب الدواء</Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <EmptyState icon="inventory_2" title={medicineQuery ? 'لا يوجد دواء مطابق للبحث في هذه الصيدلية' : 'لا توجد أدوية مسجّلة لهذه الصيدلية حالياً'} />}
              </Card>

              {p.address ? (
                <Card>
                  <CardTitle icon="location_city">الموقع</CardTitle>
                  <p className="font-body-md text-body-md text-text-body">{p.address}</p>
                  <a className="inline-flex items-center gap-1.5 self-start px-space-sm py-2 rounded-lg bg-surface-container-low text-text-primary hover:bg-primary-container hover:text-on-primary font-label-md text-label-md transition-colors"
                    href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.latitude && p.longitude ? p.latitude + ',' + p.longitude : p.name + ' ' + p.address)}
                    target="_blank" rel="noopener noreferrer">
                    <Icon name="directions" /> فتح في خرائط Google
                  </a>
                </Card>
              ) : null}
            </>
          ) : null}
        </AsyncBlock>
      </PageBody>
    </>
  );
}
