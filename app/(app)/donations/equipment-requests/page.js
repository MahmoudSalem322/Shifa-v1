'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync, useSession } from '@/lib/hooks';
import { formatDateTime } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { AsyncBlock, Badge, Button, Card, CardTitle, Field, Icon, inputClass } from '@/components/ui';
import EvidenceLink from '@/components/evidence-link';

const REQUESTER_LABEL = {
  Hospital: { label: 'مركز صحي / مستشفى', icon: 'local_hospital', cls: 'bg-state-info-subtle text-state-info' },
  Doctor: { label: 'طبيب', icon: 'person', cls: 'bg-primary-container text-on-primary-container' }
};

function ContactPanel({ item, onSent }) {
  const session = useSession();
  const [mode, setMode] = useState('contact');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState(session?.user?.phone || '');
  const [amount, setAmount] = useState(item.estimatedCost ? String(item.estimatedCost) : '');
  const [busy, setBusy] = useState(false);
  const alreadyContacted = (item.contacts || []).some((c) => c.donorId === session?.user?.id);

  const send = async () => {
    setBusy(true);
    try {
      await api.equipmentRequests.contact(item.id, { message, phone, amount: mode === 'financial' ? Number(amount) || null : null });
      onSent();
    } finally {
      setBusy(false);
    }
  };

  if (alreadyContacted) {
    return <p className="font-body-sm text-body-sm text-state-success flex items-center gap-1"><Icon name="check_circle" className="text-body-md" /> لقد تواصلت مع هذا الطلب بالفعل.</p>;
  }

  return (
    <div className="flex flex-col gap-space-2xs bg-surface-subtle rounded-lg p-space-sm">
      <div className="flex gap-space-2xs">
        <button type="button" onClick={() => setMode('contact')} className={'flex-1 px-space-sm py-2 rounded-lg font-label-md text-label-md ' + (mode === 'contact' ? 'bg-primary-container text-on-primary' : 'bg-surface-card text-text-muted')}>تواصل مباشر</button>
        <button type="button" onClick={() => setMode('financial')} className={'flex-1 px-space-sm py-2 rounded-lg font-label-md text-label-md ' + (mode === 'financial' ? 'bg-primary-container text-on-primary' : 'bg-surface-card text-text-muted')}>تبرع بمبلغ مالي</button>
      </div>
      {mode === 'financial' ? (
        <Field label="المبلغ المتعهد به بالدولار" required>
          <input type="number" min="1" dir="ltr" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="مثال: 150" />
        </Field>
      ) : null}
      <Field label="رقم هاتفك (يظهر لصاحب الطلب)">
        <input dir="ltr" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
      </Field>
      <Field label="رسالة قصيرة (اختياري)">
        <textarea className={inputClass} rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={mode === 'financial' ? 'مثال: سأحول المبلغ خلال يومين.' : 'مثال: أستطيع تأمين الجهاز، تواصل معي.'} />
      </Field>
      <Button tone="soft" icon="volunteer_activism" disabled={busy || (mode === 'financial' && !amount)} onClick={send}>
        {busy ? 'جارٍ الإرسال…' : (mode === 'financial' ? 'إرسال التعهد وإبلاغ الإدارة' : 'تواصل معه')}
      </Button>
    </div>
  );
}

function RequestCard({ item, onSent }) {
  const who = REQUESTER_LABEL[item.requesterRole] || REQUESTER_LABEL.Hospital;
  const [open, setOpen] = useState(false);
  return (
    <article className="flex flex-col gap-space-sm p-space-md rounded-xl bg-surface-card shadow-sm border border-border-soft/60">
      <div className="flex items-start justify-between gap-space-sm">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-text-heading">{item.equipmentName}</h3>
          <p className="font-body-sm text-body-sm text-text-muted">{item.requesterName} · الكمية: {item.quantity} · {formatDateTime(item.createdAt)}</p>
        </div>
        <Badge className={who.cls} icon={who.icon}>{who.label}</Badge>
      </div>
      {item.estimatedCost ? <div className="flex flex-col gap-1"><p className="font-label-md text-label-md text-state-success">المطلوب: ${item.estimatedCost} · تم التعهد: ${item.pledgedAmount || 0} · المتبقي: ${item.remainingAmount ?? item.estimatedCost}</p><div className="h-2 rounded-full bg-surface-container-high overflow-hidden"><div className="h-full bg-primary" style={{ width: Math.min(100, ((item.pledgedAmount || 0) / Number(item.estimatedCost)) * 100) + '%' }} /></div></div> : null}
      {item.evidence?.path ? <EvidenceLink evidence={item.evidence} className="text-primary font-label-md">عرض إثبات الحاجة ({item.evidence.name || 'ملف'})</EvidenceLink> : null}
      {item.reason ? <p className="font-body-sm text-body-sm text-text-body">{item.reason}</p> : null}
      {open ? <ContactPanel item={item} onSent={onSent} /> : (
        <Button tone="soft" icon="volunteer_activism" onClick={() => setOpen(true)}>أريد المساعدة</Button>
      )}
    </article>
  );
}

export default function DonorEquipmentRequestsPage() {
  const state = useAsync(async () => (await api.equipmentRequests.mine()).items, []);
  return (
    <>
      <PageHeader title="طلبات المعدات الطبية" subtitle="مراكز صحية وأطباء بحاجة إلى أجهزة أو معدات — تواصل معهم مباشرة" />
      <PageBody>
        <RoleGate allow={['Donor']} message="هذه الصفحة لحسابات المتبرعين فقط.">
          <Card>
            <CardTitle icon="medical_services" count={(state.data || []).length} actions={<Button tone="soft" icon="refresh" onClick={state.reload}>تحديث</Button>}>طلبات مفتوحة</CardTitle>
            <AsyncBlock state={state} empty={{ when: !(state.data || []).length, icon: 'medical_services', title: 'لا توجد طلبات حالياً' }}>
              <div className="flex flex-col gap-space-sm">
                {(state.data || []).map((item) => <RequestCard key={item.id} item={item} onSent={state.reload} />)}
              </div>
            </AsyncBlock>
          </Card>
        </RoleGate>
      </PageBody>
    </>
  );
}
