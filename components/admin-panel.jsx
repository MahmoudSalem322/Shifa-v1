'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { DONATION_STATUS, MATCH_STATUS, formatDate, geo } from '@/lib/vocab';
import { ACCEPTED, donationStatus } from './donations';
import { MatchRow } from './matches';
import { ReviewActions } from './review-actions';
import { AdminBlock, RecordDetails } from './admin-kit';
import { AdminMatchingPanel } from './admin-matching-panel';
import { AsyncBlock, Badge, ButtonLink, Card, CardTitle, Icon } from './ui';

/* The admin's dashboard: platform-wide numbers, the donations waiting for
   a decision and the matches waiting for hand-over. The admin manages
   donations and matches but never donates. */

const ADMIN_LINKS = [
  { href: '/admin/users', icon: 'group', title: 'الحسابات المسجلة', text: 'عرض المستخدمين وتعديل حالتهم وحذفهم وإضافتهم' },
  { href: '/admin/healthcare', icon: 'domain_add', title: 'الجهات الصحية', text: 'إضافة وتعديل واعتماد المراكز والصيدليات والأطباء' },
  { href: '/admin/server-donations', icon: 'cloud', title: 'تبرعات الخادم المركزي', text: 'قبول ورفض التبرعات المسجلة على الخادم' },
  { href: '/donations/review', icon: 'fact_check', title: 'إدارة التبرعات', text: 'مطابقة التبرعات المعتمدة وإرسالها للجهات أو الطلبات المناسبة' },
  { href: '/matches', icon: 'join', title: 'مطابقة التبرعات', text: 'تأكيد التسليم أو إلغاء المطابقات' },
];

/* GET /api/admin/dashboard/stats on the .NET API, whatever it reports. */
function ServerStats() {
  const state = useAsync(() => api.admin.stats(), []);
  const stats = state.data && typeof state.data === 'object' ? (state.data.data && typeof state.data.data === 'object' ? state.data.data : state.data) : null;
  return (
    <Card id="server-stats">
      <CardTitle icon="monitoring">إحصائيات خادم شفاء</CardTitle>
      <AdminBlock state={state} empty={{ when: !stats || !Object.keys(stats).length, icon: 'monitoring', title: 'لا توجد إحصائيات' }}>
        <RecordDetails record={stats} />
      </AdminBlock>
    </Card>
  );
}

function Stat({ label, value, icon, cls, href }) {
  return (
    <Link href={href} className="bg-surface-card rounded-xl p-space-sm shadow-sm hover:shadow-md transition-all flex items-center gap-space-sm">
      <span className={'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ' + cls}><Icon name={icon} /></span>
      <div className="flex flex-col min-w-0">
        <span className="font-headline-lg text-headline-lg text-text-heading leading-none">{value}</span>
        <span className="font-label-sm text-label-sm text-text-muted truncate">{label}</span>
      </div>
    </Link>
  );
}

function StatGroup({ title, icon, children }) {
  return (
    <section className="flex flex-col gap-space-2xs">
      <h2 className="font-label-lg text-label-lg text-text-muted flex items-center gap-1"><Icon name={icon} className="text-[18px]" /> {title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-space-sm">{children}</div>
    </section>
  );
}

export function AdminPanel() {
  const donations = useAsync(async () => (await api.donations.all()).donations, []);
  const matches = useAsync(async () => (await api.matches.list()).matches, []);
  const providerProfiles = useAsync(async () => (await api.providerProfile.all()).items || [], []);
  const healthcare = useAsync(async () => {
    const response = await api.admin.healthcare.list({ page: 1, pageSize: 200 });
    return response?.data || response?.items || [];
  }, []);

  const donationList = donations.data || [];
  const matchList = matches.data || [];
  const providerList = providerProfiles.data || [];
  const healthcareList = healthcare.data || [];
  const approvedHealthcare = healthcareList.filter((x) => {
    const status = String(x.approvalStatus || x.status || '').toLowerCase();
    return x.isApproved === true || x.approved === true || status === 'approved' || status === 'active';
  });
  const pendingProviders = providerList.filter((p) => p.status === 'pending').length;

  const show = (state, value) => (state.data ? value : '—');
  const donationCount = (status) => donationList.filter((d) => d.status === status).length;
  const matchCount = (status) => matchList.filter((m) => m.status === status).length;


  const pending = donationList
    .filter((d) => d.status === 'pending')
    .sort((a, b) => String(a.expiryDate || '9999').localeCompare(String(b.expiryDate || '9999')));
  const waiting = matchList.filter((m) => m.status === 'reserved');
  const pendingProfileItems = providerList.filter((p) => p.status === 'pending');

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-space-sm">
        {ADMIN_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="bg-surface-card rounded-2xl p-space-md shadow-sm hover:shadow-md transition-all flex flex-col gap-space-2xs group">
            <span className="w-12 h-12 rounded-xl bg-primary/10 text-text-primary flex items-center justify-center group-hover:bg-primary-container group-hover:text-on-primary transition-colors">
              <Icon name={link.icon} className="text-[26px]" />
            </span>
            <span className="font-headline-sm text-headline-sm text-text-heading">{link.title}</span>
            <span className="font-body-sm text-body-sm text-text-muted">{link.text}</span>
          </Link>
        ))}
      </div>

      <ServerStats />

      <AdminMatchingPanel />

      <Card id="approved-healthcare">
        <CardTitle icon="verified" count={approvedHealthcare.length} actions={<ButtonLink href="/admin/healthcare" tone="soft">إدارة الجهات الصحية</ButtonLink>}>
          الجهات الصحية المعتمدة
        </CardTitle>
        <AsyncBlock state={healthcare} skeleton={2} empty={{ when: !approvedHealthcare.length, icon: 'domain_disabled', title: 'لا توجد جهات صحية معتمدة حالياً' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-xs">
            {approvedHealthcare.slice(0, 12).map((item) => {
              const kind = String(item.providerType || item.type || '').toLowerCase();
              const roleLabel = kind.includes('doctor') ? 'طبيب' : kind.includes('pharmacy') ? 'صيدلية' : 'مستشفى / مركز صحي';
              const name = item.name || item.fullName || 'بدون اسم';
              return (
                <div key={(item.providerType || item.type || '') + String(item.id)} className="p-space-sm rounded-xl bg-surface-subtle border border-border-soft">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-headline-sm text-headline-sm text-text-heading truncate">{name}</span>
                    <span className="shrink-0 px-2 py-1 rounded-full bg-state-success-subtle text-state-success font-label-sm text-label-sm">معتمد</span>
                  </div>
                  <span className="font-body-sm text-body-sm text-text-muted">{roleLabel}{item.address ? ' · ' + item.address : ''}</span>
                </div>
              );
            })}
          </div>
        </AsyncBlock>
      </Card>

      <Card id="pending-approvals">
        <CardTitle icon="verified_user" count={pendingProfileItems.length} actions={<ButtonLink href="/admin/provider-profiles" tone="soft">إدارة كل الطلبات</ButtonLink>}>طلبات اعتماد الحسابات</CardTitle>
        <AsyncBlock state={providerProfiles} skeleton={2} empty={{ when: !pendingProfileItems.length, icon: 'task_alt', title: 'لا توجد حسابات بانتظار الاعتماد' }}>
          <div className="flex flex-col gap-space-xs">
            {pendingProfileItems.slice(0, 8).map((item) => {
              const roleLabel = item.role === 'Doctor' ? 'طبيب' : item.role === 'Pharmacy' ? 'صيدلية' : 'مستشفى / مركز صحي';
              const name = item.data?.name || 'بدون اسم';
              return (
                <div key={item.id} className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm p-space-sm rounded-xl bg-surface-subtle">
                  <div className="min-w-0">
                    <span className="font-headline-sm text-headline-sm text-text-heading block truncate">{name}</span>
                    <span className="font-body-sm text-body-sm text-text-muted">{roleLabel} · بانتظار مراجعة الإدارة</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <ButtonLink href="/admin/provider-profiles" tone="soft" icon="visibility">مراجعة</ButtonLink>
                    <button type="button" className="px-3 py-2 rounded-lg bg-primary-container text-on-primary font-label-md" onClick={async () => { await api.providerProfile.review(item.id, 'approve'); providerProfiles.reload(); }}>اعتماد</button>
                  </div>
                </div>
              );
            })}
          </div>
        </AsyncBlock>
      </Card>

      <StatGroup title="تبرعات الموقع" icon="volunteer_activism">
        {['pending', 'approved', 'matched', 'delivered', 'rejected', 'withdrawn'].map((status) => (
          <Stat key={status} href="/donations/review" label={DONATION_STATUS[status].label} icon={DONATION_STATUS[status].icon}
            cls={DONATION_STATUS[status].cls} value={show(donations, donationCount(status))} />
        ))}
      </StatGroup>

      <StatGroup title="المطابقات" icon="insights">
        {['reserved', 'delivered', 'cancelled'].map((status) => (
          <Stat key={status} href="/matches" label={'مطابقات ' + MATCH_STATUS[status].label} icon={MATCH_STATUS[status].icon}
            cls={MATCH_STATUS[status].cls} value={show(matches, matchCount(status))} />
        ))}
        <Stat href="/donations/review" label="تبرعات متاحة للمطابقة" icon="inventory_2" cls="bg-state-success-subtle text-state-success"
          value={show(donations, donationList.filter((d) => ACCEPTED.includes(d.status) && d.availableQuantity > 0).length)} />
      </StatGroup>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-lg">
        <Card id="pending-donations">
          <CardTitle icon="hourglass_top" count={pending.length} actions={<ButtonLink href="/donations/review" tone="soft">إدارة التبرعات</ButtonLink>}>
            بانتظار المراجعة
          </CardTitle>
          <AsyncBlock state={donations} skeleton={2} empty={{ when: !pending.length, icon: 'task_alt', title: 'لا توجد تبرعات بانتظار المراجعة' }}>
            <div className="flex flex-col gap-space-xs">
              {pending.slice(0, 5).map((d) => (
                <div key={d.id} className="flex flex-col gap-space-2xs p-space-sm rounded-xl bg-surface-subtle">
                  <div className="flex items-center justify-between gap-space-sm">
                    <Link href={'/donations/' + encodeURIComponent(d.id)} className="flex flex-col min-w-0 hover:text-text-primary">
                      <span className="font-headline-sm text-headline-sm text-text-heading truncate" dir="auto">{d.medicineName}</span>
                      <span className="font-body-sm text-body-sm text-text-muted truncate">
                        {d.quantity} {d.unit} · {geo.label(d.governorate)}{d.donorName ? ' · ' + d.donorName : ''}
                        {d.expiryDate ? ' · تنتهي ' + formatDate(d.expiryDate, { month: 'short', year: 'numeric' }) : ''}
                      </span>
                    </Link>
                    <Badge className={donationStatus(d.status).cls} icon={donationStatus(d.status).icon}>{donationStatus(d.status).label}</Badge>
                  </div>
                  <ReviewActions donation={d} compact onDone={() => donations.reload()} />
                </div>
              ))}
            </div>
          </AsyncBlock>
        </Card>

        <Card id="waiting-matches">
          <CardTitle icon="local_shipping" count={waiting.length} actions={<ButtonLink href="/matches" tone="soft">كل المطابقات</ButtonLink>}>
            مطابقات بانتظار التسليم
          </CardTitle>
          <AsyncBlock state={matches} skeleton={2} empty={{ when: !waiting.length, icon: 'join', title: 'لا توجد مطابقات بانتظار التسليم' }}>
            <div className="flex flex-col gap-space-xs">
              {waiting.slice(0, 5).map((m) => <MatchRow key={m.id} match={m} />)}
            </div>
          </AsyncBlock>
        </Card>
      </div>


    </>
  );
}
