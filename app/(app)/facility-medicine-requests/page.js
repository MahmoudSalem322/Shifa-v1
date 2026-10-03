'use client';

import { useEffect, useState } from 'react';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { Card, CardTitle, Badge, Button, Modal, Field, inputClass, AsyncBlock } from '@/components/ui';
import { useToast } from '@/components/toast';
import { api } from '@/lib/api';

export default function FacilityMedicineRequestsPage() {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [requests, setRequests] = useState(null);
  const load = async () => { try { const r = await api.facilityMedicineRequests.list(); setRequests(r.items || []); } catch (e) { toast(e.message); } };
  useEffect(() => { load(); }, []);
  const handleAdd = async (req) => {
    try { const r = await api.facilityMedicineRequests.create(req); toast(r.duplicate ? 'يوجد طلب مفتوح لنفس الدواء بالفعل، لذلك لم يتم تكراره.' : 'تم إرسال طلب الدواء بنجاح.'); setAdding(false); load(); }
    catch (e) { toast(e.message); }
  };
  return (<>
    <PageHeader title="طلبات الأدوية" subtitle="طلب احتياجات المركز الصحي مباشرة بعد اعتماد الحساب، دون تكرار الطلبات المفتوحة" />
    <PageBody><RoleGate allow={['Hospital']} message="هذه الصفحة مخصصة للمراكز الصحية والمستشفيات فقط.">
      <Card><CardTitle icon="medication" count={requests?.length}>طلبات المركز</CardTitle>
        {!requests ? <AsyncBlock state={{loading:true}} skeleton={3} /> : requests.length ? <div className="flex flex-col gap-space-xs">{requests.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-space-sm p-space-sm rounded-xl bg-surface-subtle"><div><b>{r.medicine}</b><div className="text-text-muted">الكمية: {r.quantity}</div></div><Badge className={r.status==='pending'?'bg-state-warning-subtle text-state-warning':'bg-state-success-subtle text-state-success'}>{r.status==='pending'?'قيد المتابعة':r.status}</Badge></div>)}</div> : <p className="text-text-muted">لا توجد طلبات أدوية.</p>}
        <div className="mt-2 flex justify-end border-t border-border-subtle pt-space-md"><Button icon="add" onClick={() => setAdding(true)}>طلب دواء جديد</Button></div>
      </Card><AddMedicineModal open={adding} onClose={() => setAdding(false)} onAdded={handleAdd}/></RoleGate></PageBody></>);
}
function AddMedicineModal({open,onClose,onAdded}) { const [name,setName]=useState(''); const [quantity,setQuantity]=useState('1'); const submit=e=>{e.preventDefault();if(name.trim()) onAdded({medicine:name.trim(),quantity:Number(quantity)||1});}; return <Modal open={open} onClose={onClose} title="طلب دواء جديد"><form className="flex flex-col gap-space-md" onSubmit={submit}><Field label="اسم الدواء" htmlFor="req-med" required><input id="req-med" className={inputClass} value={name} onChange={e=>setName(e.target.value)} required/></Field><Field label="الكمية" htmlFor="req-qty" required><input id="req-qty" type="number" min="1" className={inputClass} value={quantity} onChange={e=>setQuantity(e.target.value)} required/></Field><div className="flex justify-end gap-3 pt-4 border-t border-border-soft"><Button tone="ghost" onClick={onClose}>إلغاء</Button><Button type="submit" icon="send">إرسال الطلب</Button></div></form></Modal>; }
