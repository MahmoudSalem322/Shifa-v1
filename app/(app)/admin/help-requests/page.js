'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDateTime, geo } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { AsyncBlock, Badge, Button, Card, CardTitle, Icon, inputClass } from '@/components/ui';
import EvidenceLink from '@/components/evidence-link';

const STATUS_LABEL = {
  pending_review: { label: 'بانتظار التقييم', cls: 'bg-state-info-subtle text-state-info', icon: 'fact_check' },
  open: { label: 'ظاهر للمتبرعين', cls: 'bg-state-warning-subtle text-state-warning', icon: 'visibility' },
  contacted: { label: 'تواصل معه متبرع', cls: 'bg-state-success-subtle text-state-success', icon: 'chat' },
  resolved: { label: 'تم الحل', cls: 'bg-state-success-subtle text-state-success', icon: 'task_alt' },
  rejected: { label: 'مرفوض', cls: 'bg-state-danger-subtle text-state-danger', icon: 'block' },
  closed: { label: 'أغلقه المريض', cls: 'bg-surface-container-high text-text-muted', icon: 'block' }
};

function ReviewRow({ item, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const status = STATUS_LABEL[item.status] || STATUS_LABEL.open;

  const decide = async (decision) => {
    setBusy(true);
    try {
      await api.helpRequests.review(item.id, decision, note);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col gap-space-sm p-space-md rounded-xl bg-surface-card shadow-sm border border-border-soft/60">
      <div className="flex items-start justify-between gap-space-sm">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-text-heading">{item.medicineName}</h3>
          <p className="font-body-sm text-body-sm text-text-muted">
            {item.patientName} · {item.area ? geo.label(item.area) + ' · ' : ''}{formatDateTime(item.createdAt)}
          </p>
        </div>
        <Badge className={status.cls} icon={status.icon}>{status.label}</Badge>
      </div>
      {item.estimatedCost ? <p className="font-label-md text-label-md text-state-success">المطلوب: ${item.estimatedCost} · تم التعهد: ${item.pledgedAmount || 0} · المتبقي: ${item.remainingAmount ?? item.estimatedCost}</p> : null}
      {item.evidence?.path ? <EvidenceLink evidence={item.evidence} className="text-primary font-label-md">عرض إثبات الحاجة ({item.evidence.name || 'ملف'})</EvidenceLink> : null}
      {item.financialReason ? (
        <p className="font-body-sm text-body-sm text-text-body bg-surface-subtle rounded-lg p-space-sm">{item.financialReason}</p>
      ) : null}
      {item.status === 'pending_review' ? (
        <div className="flex flex-col gap-space-2xs">
          <input className={inputClass} placeholder="ملاحظة (تظهر للمريض عند الرفض، اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-space-2xs">
            <Button tone="primary" icon="check" disabled={busy} onClick={() => decide('approve')}>قبول وإظهاره للمتبرعين</Button>
            <Button tone="ghost" icon="close" disabled={busy} onClick={() => decide('reject')}>رفض</Button>
          </div>
        </div>
      ) : item.review ? (
        <p className="font-body-sm text-body-sm text-text-muted">قرار {item.review.by}{item.review.note ? ': ' + item.review.note : ''}</p>
      ) : null}
    </article>
  );
}

export default function AdminHelpRequestsPage() {
  const state = useAsync(async () => (await api.helpRequests.mine()).items, []);
  const items = state.data || [];
  const pending = items.filter((i) => i.status === 'pending_review');
  const rest = items.filter((i) => i.status !== 'pending_review');

  return (
    <>
      <PageHeader title="طلبات المساعدة (المرضى)" subtitle={'قيّم طلبات "لا أقدر على الشراء" قبل ظهورها للمتبرعين'} />
      <PageBody>
        <RoleGate allow={['Admin']} message="هذه الصفحة للإدارة فقط.">
          <Card>
            <CardTitle icon="fact_check" count={pending.length} actions={<Button tone="soft" icon="refresh" onClick={state.reload}>تحديث</Button>}>بانتظار التقييم</CardTitle>
            <AsyncBlock state={state} empty={{ when: !pending.length, icon: 'task_alt', title: 'لا توجد طلبات بانتظار التقييم', hint: 'كل طلبات "لا أقدر على الشراء" الجديدة ستظهر هنا.' }}>
              <div className="flex flex-col gap-space-sm">
                {pending.map((item) => <ReviewRow key={item.id} item={item} onDone={state.reload} />)}
              </div>
            </AsyncBlock>
          </Card>

          {rest.length ? (
            <Card>
              <CardTitle icon="history" count={rest.length}>سجل الطلبات</CardTitle>
              <div className="flex flex-col gap-space-sm">
                {rest.map((item) => <ReviewRow key={item.id} item={item} onDone={state.reload} />)}
              </div>
            </Card>
          ) : null}
        </RoleGate>
      </PageBody>
    </>
  );
}
