'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDateTime } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { AsyncBlock, Badge, Button, Card, CardTitle, Icon, inputClass } from '@/components/ui';

const ROLE_LABEL = { Hospital: 'مركز صحي / مستشفى', Pharmacy: 'صيدلية', Doctor: 'طبيب' };
const STATUS_LABEL = {
  pending: { label: 'بانتظار المراجعة', cls: 'bg-state-info-subtle text-state-info', icon: 'hourglass_top' },
  approved: { label: 'مفعّلة', cls: 'bg-state-success-subtle text-state-success', icon: 'verified' },
  rejected: { label: 'مرفوضة', cls: 'bg-state-danger-subtle text-state-danger', icon: 'block' }
};

function ProfileRow({ item, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const status = STATUS_LABEL[item.status] || STATUS_LABEL.pending;
  const d = item.data || {};

  const decide = async (decision) => {
    setBusy(true);
    try {
      await api.providerProfile.review(item.id, decision, note);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col gap-space-sm p-space-md rounded-xl bg-surface-card shadow-sm border border-border-soft/60">
      <div className="flex items-start justify-between gap-space-sm">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-text-heading">{d.name || 'بدون اسم'}</h3>
          <p className="font-body-sm text-body-sm text-text-muted">{ROLE_LABEL[item.role]} · {d.address || ''} · {formatDateTime(item.updatedAt)}</p>
        </div>
        <Badge className={status.cls} icon={status.icon}>{status.label}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-2xs font-body-sm text-body-sm text-text-body">
        {d.phone ? <span>📞 {d.phone}</span> : null}
        {d.workingHours ? <span>🕒 {d.workingHours}</span> : null}
        {d.specialization ? <span>🩺 {d.specialization}</span> : null}
        {d.licenseNumber ? <span>🪪 {d.licenseNumber}</span> : null}
        {d.yearsOfExperience != null ? <span>⌛ {d.yearsOfExperience} سنة خبرة</span> : null}
        {d.email ? <span dir="ltr">✉️ {d.email}</span> : null}
      </div>
      {d.bio ? <p className="font-body-sm text-body-sm text-text-muted">{d.bio}</p> : null}
      {item.status === 'pending' ? (
        <div className="flex flex-col gap-space-2xs">
          <input className={inputClass} placeholder="ملاحظة عند الرفض (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-space-2xs">
            <Button tone="primary" icon="check" disabled={busy} onClick={() => decide('approve')}>موافقة وتفعيل الصفحة</Button>
            <Button tone="ghost" icon="close" disabled={busy} onClick={() => decide('reject')}>رفض</Button>
          </div>
        </div>
      ) : item.review ? (
        <p className="font-body-sm text-body-sm text-text-muted">قرار {item.review.by}{item.review.note ? ': ' + item.review.note : ''}</p>
      ) : null}
    </article>
  );
}

export default function AdminProviderProfilesPage() {
  const state = useAsync(async () => (await api.providerProfile.all()).items, []);
  const items = state.data || [];
  const pending = items.filter((i) => i.status === 'pending');
  const rest = items.filter((i) => i.status !== 'pending');

  return (
    <>
      <PageHeader title="طلبات تفعيل الصفحات" subtitle="راجع الصفحات التي أنشأها المراكز الصحية والصيدليات والأطباء بأنفسهم" />
      <PageBody>
        <RoleGate allow={['Admin']} message="هذه الصفحة للإدارة فقط.">
          <Card>
            <CardTitle icon="assignment_turned_in" count={pending.length} actions={<Button tone="soft" icon="refresh" onClick={state.reload}>تحديث</Button>}>بانتظار المراجعة</CardTitle>
            <AsyncBlock state={state} empty={{ when: !pending.length, icon: 'task_alt', title: 'لا توجد طلبات بانتظار المراجعة' }}>
              <div className="flex flex-col gap-space-sm">
                {pending.map((item) => <ProfileRow key={item.id} item={item} onDone={state.reload} />)}
              </div>
            </AsyncBlock>
          </Card>

          {rest.length ? (
            <Card>
              <CardTitle icon="history" count={rest.length}>سجل الطلبات</CardTitle>
              <div className="flex flex-col gap-space-sm">
                {rest.map((item) => <ProfileRow key={item.id} item={item} onDone={state.reload} />)}
              </div>
            </Card>
          ) : null}
        </RoleGate>
      </PageBody>
    </>
  );
}
