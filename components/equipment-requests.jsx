'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { formatDateTime } from '@/lib/vocab';
import { AsyncBlock, Badge, Button, Card, CardTitle, Field, Icon, inputClass } from '@/components/ui';
import EvidenceLink from './evidence-link';
import EvidenceUpload from './evidence-upload';

const STATUS_LABEL = {
  pending_review: { label: 'بانتظار مراجعة الإدارة', cls: 'bg-state-warning-subtle text-state-warning', icon: 'pending_actions' },
  rejected: { label: 'لم تتم الموافقة', cls: 'bg-state-danger-subtle text-state-danger', icon: 'cancel' },
  open: { label: 'بانتظار متبرع', cls: 'bg-state-warning-subtle text-state-warning', icon: 'hourglass_top' },
  contacted: { label: 'تواصل معك متبرع', cls: 'bg-state-info-subtle text-state-info', icon: 'chat' },
  resolved: { label: 'تم التوفير', cls: 'bg-state-success-subtle text-state-success', icon: 'task_alt' },
  closed: { label: 'مغلق', cls: 'bg-surface-container-high text-text-muted', icon: 'block' }
};

function RequestCard({ item, onClose }) {
  const status = STATUS_LABEL[item.status] || STATUS_LABEL.pending_review;
  return (
    <article className="flex flex-col gap-space-sm p-space-md rounded-xl bg-surface-card shadow-sm border border-border-soft/60">
      <div className="flex items-start justify-between gap-space-sm">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-text-heading">{item.equipmentName}</h3>
          <p className="font-body-sm text-body-sm text-text-muted">الكمية: {item.quantity} · {formatDateTime(item.createdAt)}</p>
        </div>
        <Badge className={status.cls} icon={status.icon}>{status.label}</Badge>
      </div>
      {item.estimatedCost ? <p className="font-label-md text-label-md text-state-success">المطلوب: ${item.estimatedCost} · تم التعهد: ${item.pledgedAmount || 0} · المتبقي: ${item.remainingAmount ?? item.estimatedCost}</p> : null}
      {item.evidence?.path ? <EvidenceLink evidence={item.evidence} className="text-primary font-label-md">عرض إثبات الحاجة ({item.evidence.name || 'ملف'})</EvidenceLink> : null}
      {item.reason ? <p className="font-body-sm text-body-sm text-text-body">{item.reason}</p> : null}
      {item.status === 'rejected' && item.review?.note ? <p className="font-body-sm text-body-sm text-state-danger">سبب الرفض: {item.review.note}</p> : null}
      {item.contacts?.length ? (
        <div className="flex flex-col gap-space-2xs bg-state-info-subtle/40 rounded-lg p-space-sm">
          {item.contacts.map((c, i) => (
            <div key={i} className="font-body-sm text-body-sm text-text-body flex items-center gap-space-2xs flex-wrap">
              <Icon name="volunteer_activism" className="text-state-info text-body-md" />
              <span className="font-semibold">{c.donorName}</span>
              {c.amount ? <span className="text-state-success font-semibold">تعهد بـ ${c.amount}</span> : null}
              {c.donorPhone ? <span dir="ltr">{c.donorPhone}</span> : null}
              {c.message ? <span className="text-text-muted">— {c.message}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {item.status === 'open' || item.status === 'contacted' ? (
        <div className="flex gap-space-2xs">
          <Button tone="soft" onClick={() => onClose(item.id, 'resolved')}>تم التوفير</Button>
          <Button tone="ghost" onClick={() => onClose(item.id, 'closed')}>إغلاق الطلب</Button>
        </div>
      ) : null}
    </article>
  );
}

/* Shared by /facility-equipment-requests (Hospital) and
   /doctor-equipment-requests (Doctor). */
export function EquipmentRequestsManager() {
  const state = useAsync(async () => (await api.equipmentRequests.mine()).items, []);
  const [form, setForm] = useState({ equipmentName: '', quantity: '1', reason: '', estimatedCost: '', evidence: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.equipmentName.trim()) { setError('اسم الجهاز أو المعدة مطلوب.'); return; }
    if (!form.evidence?.path) { setError('أرفق إثبات الحاجة إلى الجهاز قبل إرسال الطلب.'); return; }
    setBusy(true);
    setError('');
    try {
      await api.equipmentRequests.create({ equipmentName: form.equipmentName.trim(), quantity: Number(form.quantity) || 1, reason: form.reason.trim(), estimatedCost: Number(form.estimatedCost) || null, evidence: form.evidence });
      setForm({ equipmentName: '', quantity: '1', reason: '', estimatedCost: '', evidence: null });
      setDone(true);
      state.reload();
      setTimeout(() => setDone(false), 4000);
    } catch (e) {
      setError(e.message || 'تعذّر إرسال الطلب.');
    } finally {
      setBusy(false);
    }
  };

  const close = async (id, status) => {
    await api.equipmentRequests.close(id, status);
    state.reload();
  };

  return (
    <>
      <Card>
        <CardTitle icon="medical_services">طلب معدات جديدة</CardTitle>
        <form onSubmit={submit} className="flex flex-col gap-space-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
            <Field label="اسم الجهاز أو المعدة" required className="sm:col-span-2">
              <input className={inputClass} value={form.equipmentName} onChange={set('equipmentName')} placeholder="مثال: جهاز أكسجين محمول" />
            </Field>
            <Field label="الكمية">
              <input type="number" min="1" className={inputClass} value={form.quantity} onChange={set('quantity')} />
            </Field>
          </div>
          <Field label="لماذا تحتاجه؟ (اختياري)">
            <textarea rows={2} className={inputClass} value={form.reason} onChange={set('reason')} placeholder="أي تفاصيل تساعد المتبرع على المساعدة بسرعة" />
          </Field>
          <Field label="التكلفة التقريبية بالدولار (اختياري)" hint="تساعد المتبرع على تقدير مبلغ تبرع مالي إن رغب بذلك بدل تأمين الجهاز مباشرة.">
            <input type="number" min="1" dir="ltr" className={inputClass} value={form.estimatedCost} onChange={set('estimatedCost')} placeholder="مثال: 150" />
          </Field>
          <EvidenceUpload required value={form.evidence} onChange={(evidence) => setForm({ ...form, evidence })} label="إثبات الحاجة إلى الجهاز" />
          {error ? <p className="font-body-sm text-body-sm text-state-danger">{error}</p> : null}
          {done ? <p className="font-body-sm text-body-sm text-state-success flex items-center gap-1"><Icon name="check_circle" className="text-body-md" /> تم إرسال طلبك، وهو الآن بانتظار مراجعة الإدارة قبل ظهوره للمتبرعين.</p> : null}
          <Button type="submit" disabled={busy} icon="send">{busy ? 'جارٍ الإرسال…' : 'إرسال الطلب'}</Button>
        </form>
      </Card>

      <Card>
        <CardTitle icon="list_alt" count={(state.data || []).length} actions={<Button tone="soft" icon="refresh" onClick={state.reload}>تحديث</Button>}>طلباتي</CardTitle>
        <AsyncBlock state={state} empty={{ when: !(state.data || []).length, icon: 'medical_services', title: 'لا توجد طلبات بعد' }}>
          <div className="flex flex-col gap-space-sm">
            {(state.data || []).map((item) => <RequestCard key={item.id} item={item} onClose={close} />)}
          </div>
        </AsyncBlock>
      </Card>
    </>
  );
}
