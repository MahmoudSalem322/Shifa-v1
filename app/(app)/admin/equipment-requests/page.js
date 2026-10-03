'use client';

import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useState } from 'react';
import { formatDateTime } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { AsyncBlock, Badge, Button, Card, CardTitle } from '@/components/ui';
import EvidenceLink from '@/components/evidence-link';

const STATUS_LABEL = {
  open: { label: 'بانتظار متبرع', cls: 'bg-state-warning-subtle text-state-warning' },
  contacted: { label: 'تواصل معه متبرع', cls: 'bg-state-info-subtle text-state-info' },
  pending_review: { label: 'بانتظار التحقق', cls: 'bg-state-info-subtle text-state-info' },
  rejected: { label: 'مرفوض', cls: 'bg-state-danger-subtle text-state-danger' },
  resolved: { label: 'تم التوفير', cls: 'bg-state-success-subtle text-state-success' },
  closed: { label: 'مغلق', cls: 'bg-surface-container-high text-text-muted' }
};

function ReviewActions({ item, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (action) => { setBusy(true); try { await api.equipmentRequests.review(item.id, action, note); onDone(); } finally { setBusy(false); } };
  return <div className="flex flex-col gap-space-xs bg-surface-subtle rounded-lg p-space-sm"><input className="w-full rounded-lg border border-border-soft bg-surface-card px-3 py-2" placeholder="ملاحظة للمستشفى/الطبيب (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} /><div className="flex gap-space-2xs"><Button tone="primary" disabled={busy} onClick={() => decide('approve')}>قبول وإظهار للمتبرعين</Button><Button tone="ghost" disabled={busy} onClick={() => decide('reject')}>رفض</Button></div></div>;
}

export default function AdminEquipmentRequestsPage() {
  const state = useAsync(async () => (await api.equipmentRequests.mine()).items, []);
  return (
    <>
      <PageHeader title="طلبات المعدات الطبية" subtitle="نظرة شاملة على كل طلبات المعدات من المراكز الصحية والأطباء" />
      <PageBody>
        <RoleGate allow={['Admin']} message="هذه الصفحة للإدارة فقط.">
          <Card>
            <CardTitle icon="medical_services" count={(state.data || []).length} actions={<Button tone="soft" icon="refresh" onClick={state.reload}>تحديث</Button>}>كل الطلبات</CardTitle>
            <AsyncBlock state={state} empty={{ when: !(state.data || []).length, icon: 'medical_services', title: 'لا توجد طلبات بعد' }}>
              <div className="flex flex-col gap-space-sm">
                {(state.data || []).map((item) => {
                  const status = STATUS_LABEL[item.status] || STATUS_LABEL.open;
                  return (
                    <article key={item.id} className="flex flex-col gap-space-xs p-space-md rounded-xl bg-surface-card shadow-sm border border-border-soft/60">
                      <div className="flex items-start justify-between gap-space-sm">
                        <div>
                          <h3 className="font-headline-sm text-headline-sm text-text-heading">{item.equipmentName}</h3>
                          <p className="font-body-sm text-body-sm text-text-muted">{item.requesterName} ({item.requesterRole === 'Doctor' ? 'طبيب' : 'مركز صحي'}) · الكمية: {item.quantity} · {formatDateTime(item.createdAt)}</p>
                        </div>
                        <Badge className={status.cls}>{status.label}</Badge>
                      </div>
                      {item.estimatedCost ? <p className="font-label-md text-label-md text-state-success">المطلوب: ${item.estimatedCost} · تم التعهد: ${item.pledgedAmount || 0} · المتبقي: ${item.remainingAmount ?? item.estimatedCost}</p> : null}
                      {item.evidence?.path ? <EvidenceLink evidence={item.evidence} className="text-primary font-label-md">عرض إثبات الحاجة ({item.evidence.name || 'ملف'})</EvidenceLink> : null}
                      {item.status === 'pending_review' ? <ReviewActions item={item} onDone={state.reload} /> : null}
                      {item.contacts?.length ? (
                        <div className="flex flex-col gap-space-3xs bg-state-info-subtle/40 rounded-lg p-space-sm">
                          {item.contacts.map((c, i) => (
                            <p key={i} className="font-body-sm text-body-sm text-text-body">
                              {c.donorName}{c.amount ? ' — تعهد بـ $' + c.amount : ''}{c.donorPhone ? ' — ' + c.donorPhone : ''}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </AsyncBlock>
          </Card>
        </RoleGate>
      </PageBody>
    </>
  );
}
