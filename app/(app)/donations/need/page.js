'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync, useSession } from '@/lib/hooks';
import { formatDateTime, geo } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { AsyncBlock, Badge, Button, Card, CardTitle, Field, Icon, inputClass } from '@/components/ui';
import EvidenceUpload from '@/components/evidence-upload';

/* "أحتاج مساعدة" — a patient who cannot find or afford a medicine asks
   directly; every donor sees it and can open contact. Separate from the
   prescription-based drug-request + donation-matching pipeline. */

const REASONS = [
  { value: 'unavailable', label: 'الدواء غير متوفر في المنطقة', icon: 'search_off' },
  { value: 'cannot_afford', label: 'لا أقدر على شراء الدواء', icon: 'payments' }
];

const STATUS_LABEL = {
  pending_review: { label: 'قيد التقييم من الإدارة', cls: 'bg-state-info-subtle text-state-info', icon: 'fact_check' },
  open: { label: 'بانتظار متبرع', cls: 'bg-state-warning-subtle text-state-warning', icon: 'hourglass_top' },
  contacted: { label: 'تواصل معك متبرع', cls: 'bg-state-info-subtle text-state-info', icon: 'chat' },
  resolved: { label: 'تم الحل', cls: 'bg-state-success-subtle text-state-success', icon: 'task_alt' },
  rejected: { label: 'لم تتم الموافقة', cls: 'bg-state-danger-subtle text-state-danger', icon: 'block' },
  closed: { label: 'مغلق', cls: 'bg-surface-container-high text-text-muted', icon: 'block' }
};

function RequestCard({ item, onClose }) {
  const status = STATUS_LABEL[item.status] || STATUS_LABEL.open;
  return (
    <article className="flex flex-col gap-space-sm p-space-md rounded-xl bg-surface-card shadow-sm border border-border-soft/60">
      <div className="flex items-start justify-between gap-space-sm">
        <div>
          <h3 className="font-headline-sm text-headline-sm text-text-heading">{item.medicineName}</h3>
          <p className="font-body-sm text-body-sm text-text-muted">
            {REASONS.find((r) => r.value === item.reason)?.label} · {formatDateTime(item.createdAt)}
          </p>
        </div>
        <Badge className={status.cls} icon={status.icon}>{status.label}</Badge>
      </div>
      {item.estimatedCost ? (
        <p className="font-label-md text-label-md text-state-success">التكلفة التقريبية: ${item.estimatedCost}</p>
      ) : null}
      {item.financialReason ? (
        <p className="font-body-sm text-body-sm text-text-body bg-surface-subtle rounded-lg p-space-xs">
          <span className="font-semibold">سبب عدم القدرة على الشراء: </span>{item.financialReason}
        </p>
      ) : null}
      {item.status === 'rejected' && item.review?.note ? (
        <p className="font-body-sm text-body-sm text-state-danger">سبب عدم القبول: {item.review.note}</p>
      ) : null}
      {item.notes ? <p className="font-body-sm text-body-sm text-text-body">{item.notes}</p> : null}
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
      {['open', 'contacted', 'pending_review'].includes(item.status) ? (
        <div className="flex gap-space-2xs">
          <Button tone="soft" onClick={() => onClose(item.id, 'resolved')}>تم الحل</Button>
          <Button tone="ghost" onClick={() => onClose(item.id, 'closed')}>إغلاق الطلب</Button>
        </div>
      ) : null}
    </article>
  );
}

export default function NeedHelpPage() {
  const session = useSession();
  const state = useAsync(async () => (await api.helpRequests.mine()).items, []);
  const [form, setForm] = useState({ medicineName: '', reason: 'unavailable', quantity: '1', area: '', notes: '', patientPhone: '', financialReason: '', estimatedCost: '', evidence: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [lastReason, setLastReason] = useState('unavailable');

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.medicineName.trim()) { setError('اسم الدواء مطلوب.'); return; }
    if (form.reason === 'cannot_afford' && form.financialReason.trim().length < 10) {
      setError('يرجى توضيح سبب عدم القدرة على الشراء (10 أحرف على الأقل) حتى يراجعه فريق الإدارة.');
      return;
    }
    if (form.reason === 'cannot_afford' && !form.evidence?.path) { setError('أرفق إثبات الحاجة المالية قبل إرسال الطلب.'); return; }
    setBusy(true);
    setError('');
    try {
      await api.helpRequests.create({
        medicineName: form.medicineName.trim(),
        reason: form.reason,
        quantity: Number(form.quantity) || null,
        area: form.area,
        notes: form.notes.trim(),
        patientPhone: form.patientPhone.trim() || (session?.user?.phone || ''),
        financialReason: form.financialReason.trim(),
        estimatedCost: Number(form.estimatedCost) || null,
        evidence: form.evidence
      });
      setLastReason(form.reason);
      setForm({ medicineName: '', reason: 'unavailable', quantity: '1', area: '', notes: '', patientPhone: '', financialReason: '', estimatedCost: '', evidence: null });
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
    await api.helpRequests.close(id, status);
    state.reload();
  };

  return (
    <>
      <PageHeader title="أحتاج مساعدة" subtitle="اطلب دواءً لا تقدر على شرائه أو توفيره، ليصل طلبك مباشرة إلى المتبرعين" />
      <PageBody>
        <RoleGate allow={['Patient']} message="هذه الميزة لحسابات المرضى فقط.">
          <Card>
            <CardTitle icon="favorite">اطلب مساعدة جديدة</CardTitle>
            <form onSubmit={submit} className="flex flex-col gap-space-sm">
              <Field label="اسم الدواء" required>
                <input className={inputClass} value={form.medicineName} onChange={set('medicineName')} placeholder="مثال: إنسولين سريع المفعول" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                <Field label="لماذا تحتاج المساعدة؟">
                  <select className={inputClass} value={form.reason} onChange={set('reason')}>
                    {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="الكمية المطلوبة (اختياري)">
                  <input type="number" min="1" className={inputClass} value={form.quantity} onChange={set('quantity')} />
                </Field>
              </div>
              {form.reason === 'cannot_afford' ? (
                <>
                  <Field label="سبب عدم القدرة على الشراء" required hint="يظهر هذا السبب للمتبرعين لمساعدتهم على فهم طلبك.">
                    <textarea className={inputClass} rows={3} value={form.financialReason} onChange={set('financialReason')} placeholder="مثال: بلا دخل حالياً بسبب الظروف، والدواء مطلوب لعلاج مزمن…" />
                  </Field>
                  <Field label="التكلفة التقريبية بالدولار (اختياري)" hint="تساعد المتبرع على معرفة المبلغ المطلوب إن رغب بتبرع مالي مباشر.">
                    <input type="number" min="1" dir="ltr" className={inputClass} value={form.estimatedCost} onChange={set('estimatedCost')} placeholder="مثال: 25" />
                  </Field>
                  <EvidenceUpload required value={form.evidence} onChange={(evidence) => setForm({ ...form, evidence })} />
                </>
              ) : null}
              <Field label="المحافظة (اختياري)">
                <select className={inputClass} value={form.area} onChange={set('area')}>
                  <option value="">غير محدد</option>
                  {geo.all().map((g) => <option key={g.slug} value={g.slug}>{g.label}</option>)}
                </select>
              </Field>
              <Field label="رقم للتواصل (اختياري إن اختلف عن حسابك)">
                <input dir="ltr" className={inputClass} value={form.patientPhone} onChange={set('patientPhone')} placeholder="05XXXXXXXX" />
              </Field>
              <Field label="تفاصيل إضافية (اختياري)">
                <textarea className={inputClass} rows={3} value={form.notes} onChange={set('notes')} placeholder="أي تفاصيل تساعد المتبرع على مساعدتك بسرعة" />
              </Field>
              {error ? <p className="font-body-sm text-body-sm text-state-danger">{error}</p> : null}
              {done ? (
                <p className="font-body-sm text-body-sm text-state-success flex items-center gap-1">
                  <Icon name="check_circle" className="text-body-md" />
                  {lastReason === 'cannot_afford' ? 'تم إرسال طلبك، وأصبح ظاهراً للمتبرعين الآن.' : 'تم إرسال طلبك، سيظهر للمتبرعين الآن.'}
                </p>
              ) : null}
              <Button type="submit" disabled={busy} icon="send">{busy ? 'جارٍ الإرسال…' : 'إرسال الطلب'}</Button>
            </form>
          </Card>

          <Card>
            <CardTitle icon="list_alt" count={(state.data || []).length} actions={<Button tone="soft" icon="refresh" onClick={state.reload}>تحديث</Button>}>طلباتي</CardTitle>
            <AsyncBlock state={state} empty={{ when: !(state.data || []).length, icon: 'favorite', title: 'لا توجد طلبات بعد', hint: 'أرسل طلباً أعلاه ليصل إلى المتبرعين مباشرة.' }}>
              <div className="flex flex-col gap-space-sm">
                {(state.data || []).map((item) => <RequestCard key={item.id} item={item} onClose={close} />)}
              </div>
            </AsyncBlock>
          </Card>
        </RoleGate>
      </PageBody>
    </>
  );
}
