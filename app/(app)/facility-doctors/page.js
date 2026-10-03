'use client';

import { useEffect, useState } from 'react';
import { api, toList } from '@/lib/api';
import { useAsync, useSession } from '@/lib/hooks';
import { useToast } from '@/components/toast';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { AsyncBlock, Button, Card, CardTitle, EmptyState, Modal, inputClass, Field } from '@/components/ui';

export default function FacilityDoctorsPage() {
  const toast = useToast();
  const session = useSession();
  const [addingDoctor, setAddingDoctor] = useState(false);

  const state = useAsync(async () => {
    // Centres and hospitals use the Hospital role in Shifaa.
    if (!session || session.role !== 'Hospital') return { doctors: [] };
    const raw = await api.facilities.me();
    const doctorsList = toList(await api.doctors.list());
    const doctors = doctorsList.filter(d => String(d.facilityId) === String(raw.id)).filter((doctor, index, list) => index === list.findIndex((x) => String(x.providerProfileId || x.userId || x.accountId || '').trim() === String(doctor.providerProfileId || doctor.userId || doctor.accountId || '').trim() && String(x.name || '').trim().toLocaleLowerCase() === String(doctor.name || '').trim().toLocaleLowerCase()));
    return { doctors };
  }, [session]);

  const removeDoctor = async (id) => {
    if (!window.confirm('هل أنت متأكد من إزالة هذا الطبيب؟')) return;
    try {
      await api.facilities.removeDoctor(id);
      toast('تمت إزالة الطبيب بنجاح.');
      state.reload();
    } catch (error) {
      toast(error.message);
    }
  };

  return (
    <>
      <PageHeader title="أطباء المركز / المستشفى" subtitle="إدارة أطباء المركز الصحي أو المستشفى وإدخال بياناتهم ليتم اعتمادهم وظهورهم للمرضى" />
      <PageBody>
        <RoleGate allow={['Hospital']} message="هذه الصفحة مخصصة للمراكز الصحية والمستشفيات فقط.">
          <Card id="facility-doctors">
            <CardTitle icon="groups" count={state.data ? state.data.doctors.length : undefined}>الأطباء المسجلون</CardTitle>
            <AsyncBlock state={state} empty={{ when: state.data && !state.data.doctors.length, icon: 'groups', title: 'لا يوجد أطباء مسجلون بعد' }}>
              <div className="flex flex-col gap-space-xs">
                {state.data ? state.data.doctors.map((doctor) => (
                  <div key={doctor.id} className="flex flex-wrap items-center justify-between gap-space-sm p-space-sm rounded-xl bg-surface-subtle">
                    <div className="flex flex-col">
                      <span className="font-headline-sm text-headline-sm text-text-heading">{doctor.name}</span>
                      <span className="font-body-sm text-body-sm text-text-muted">{doctor.specialization}</span>
                      <span className={'font-label-sm text-label-sm mt-1 ' + (doctor.approvalStatus === 'approved' ? 'text-state-success' : 'text-state-warning')}>{doctor.approvalStatus === 'approved' ? 'معتمد ويظهر للمرضى' : 'بانتظار اعتماد الإدارة'}</span>
                    </div>
                    <Button tone="danger" icon="delete" className="!py-1.5" onClick={() => removeDoctor(doctor.id)}>إزالة</Button>
                  </div>
                )) : null}
              </div>
            </AsyncBlock>
            <div className="mt-2 flex justify-end border-t border-border-subtle pt-space-md">
              <Button icon="person_add" onClick={() => setAddingDoctor(true)}>إضافة طبيب</Button>
            </div>
          </Card>
          <AddDoctorModal open={addingDoctor} onClose={() => setAddingDoctor(false)} onAdded={() => { setAddingDoctor(false); state.reload(); }} />
        </RoleGate>
      </PageBody>
    </>
  );
}

function AddDoctorModal({ open, onClose, onAdded }) {
  const toast = useToast();
  const [mode, setMode] = useState('new');
  const [name, setName] = useState(''); const [specialization, setSpecialization] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [bio, setBio] = useState('');
  const doctorsState = useAsync(async () => (open ? toList(await api.doctors.list()).filter(d => !d.facilityId) : null), [open]);
  const [selectedId, setSelectedId] = useState(''); const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) return; setMode('new'); setName(''); setSpecialization(''); setPhone(''); setEmail(''); setBio(''); setSelectedId(''); setQuery(''); }, [open]);
  const list=(doctorsState.data||[]).filter(d=>!query||String(d.name||'').toLowerCase().includes(query.toLowerCase())).slice(0,50);
  const submit=async e=>{ e.preventDefault(); setBusy(true); try { const payload=mode==='new'?{name,specialization,phone,email,bio}:{doctorId:selectedId}; const r=await api.facilities.addDoctor(payload); toast(r.pendingApproval?'تم تسجيل الطبيب وإرساله لاعتماد الإدارة.':r.duplicate?'الطبيب موجود بالفعل ولم يتم تكراره.':'تم إضافة الطبيب.'); onAdded(); } catch(e){toast(e.message);} finally{setBusy(false);} };
  return <Modal open={open} onClose={onClose} title="إضافة طبيب" wide><form className="flex flex-col gap-space-md" onSubmit={submit}>
    <div className="flex gap-2"><Button type="button" tone={mode==='new'?'primary':'soft'} onClick={()=>setMode('new')}>إدخال بيانات طبيب</Button><Button type="button" tone={mode==='existing'?'primary':'soft'} onClick={()=>setMode('existing')}>ربط طبيب موجود</Button></div>
    {mode==='new'?<div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm"><Field label="اسم الطبيب" required><input className={inputClass} value={name} onChange={e=>setName(e.target.value)} required/></Field><Field label="التخصص" required><input className={inputClass} value={specialization} onChange={e=>setSpecialization(e.target.value)} required/></Field><Field label="الهاتف"><input className={inputClass} value={phone} onChange={e=>setPhone(e.target.value)}/></Field><Field label="البريد الإلكتروني"><input className={inputClass} type="email" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="نبذة عن الطبيب"><textarea className={inputClass} value={bio} onChange={e=>setBio(e.target.value)} rows={3}/></Field></div>:<><Field label="ابحث عن طبيب غير مرتبط بمنشأة"><input className={inputClass} value={query} onChange={e=>setQuery(e.target.value)}/></Field><div className="max-h-64 overflow-y-auto flex flex-col gap-1">{list.map(d=><label key={d.id} className="flex gap-2 p-2 rounded-lg hover:bg-surface-subtle"><input type="radio" name="doctor" checked={String(d.id)===selectedId} onChange={()=>setSelectedId(String(d.id))}/><span>{d.name} — {d.specialization}</span></label>)}</div></>}
    <div className="flex justify-end gap-3 pt-4 border-t border-border-soft"><Button type="button" tone="ghost" onClick={onClose}>إلغاء</Button><Button type="submit" icon="person_add" busy={busy}>حفظ الطبيب</Button></div>
  </form></Modal>;
}
