'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useToast } from './toast';
import { Button, Card, CardTitle, Field, inputClass } from './ui';

export function AdminMatchingPanel() {
  const toast = useToast();
  const state = useAsync(() => api.matches.adminOptions(), []);
  const [requestId, setRequestId] = useState('');
  const [donationId, setDonationId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const requests = state.data?.requests || [];
  const donations = state.data?.donations || [];
  const providers = state.data?.providers || [];
  const request = requests.find(x => String(x.id) === String(requestId));
  const donation = donations.find(x => String(x.id) === String(donationId));
  const max = Number(donation?.availableQuantity ?? donation?.quantity ?? 0);
  const submit = async (e) => {
    e.preventDefault();
    if (!requestId || !donationId || !providerId) return toast('اختر طلب الدواء والتبرع والجهة الصحية.');
    const provider = providers.find(x => String(x.userId) === String(providerId));
    const q = Number(quantity || max);
    if (!Number.isInteger(q) || q < 1 || q > max) return toast('أدخل كمية صحيحة ضمن الكمية المتاحة.');
    setBusy(true);
    try {
      await api.matches.create({ drugRequestId:requestId, donationId, quantity:q, governorate:request?.governorate || '', recipientUserId:provider.userId, recipientName:provider.name, recipientRole:provider.role });
      toast('تمت المطابقة وإرسال التبرع للجهة الصحية.');
      setRequestId(''); setDonationId(''); setProviderId(''); setQuantity(''); state.reload();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  return <Card id="admin-matching">
    <CardTitle icon="join">مطابقة التبرعات وإرسالها</CardTitle>
    <p className="font-body-sm text-body-sm text-text-muted">لا تصل التبرعات للصيدليات أو المراكز الصحية إلا بعد اعتمادها ثم مطابقتها هنا من الإدارة.</p>
    <form className="grid grid-cols-1 md:grid-cols-2 gap-space-sm" onSubmit={submit}>
      <Field label="طلب الدواء"><select className={inputClass} value={requestId} onChange={e=>setRequestId(e.target.value)}><option value="">اختر الطلب</option>{requests.map(r=><option key={r.id} value={r.id}>{r.medicineName} · {r.quantity} · #{r.id}</option>)}</select></Field>
      <Field label="التبرع المعتمد"><select className={inputClass} value={donationId} onChange={e=>setDonationId(e.target.value)}><option value="">اختر التبرع</option>{donations.map(d=><option key={d.id} value={d.id}>{d.medicineName} · المتاح {d.availableQuantity ?? d.quantity} · #{d.id}</option>)}</select></Field>
      <Field label="الجهة المستلمة"><select className={inputClass} value={providerId} onChange={e=>setProviderId(e.target.value)}><option value="">اختر الصيدلية/المركز</option>{providers.map(p=><option key={p.userId} value={p.userId}>{p.name} · {p.role === 'Pharmacy' ? 'صيدلية' : 'مركز/مستشفى'}</option>)}</select></Field>
      <Field label="الكمية"><input className={inputClass} type="number" min="1" max={max || undefined} value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder={max ? String(max) : 'اختر التبرع'} /></Field>
      <div className="md:col-span-2 flex justify-end"><Button type="submit" icon="send" busy={busy}>مطابقة وإرسال</Button></div>
    </form>
  </Card>;
}
