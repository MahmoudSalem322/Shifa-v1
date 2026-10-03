'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { clinicToday } from '@/lib/clock';
import { APPOINTMENT_STATUS, formatDate, formatDateTime, timeLabel, WEEKDAYS_AR } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { AsyncBlock, Badge, Button, Card, CardTitle, Field, Icon, inputClass, Modal } from '@/components/ui';

/* The doctor's side of Module 4: every booking made with the signed-in
   doctor, with immediate approval or cancellation for incoming requests,
   and attendance recording (attended / no-show) once a slot has started.
   The patient is notified of each change. */

const TABS = [
  { key: 'all', label: 'الكل', icon: 'event_note' },
  { key: 'pending', label: 'طلبات جديدة', icon: 'hourglass_top', badge: true },
  { key: 'today', label: 'اليوم', icon: 'today' },
  { key: 'upcoming', label: 'المؤكدة القادمة', icon: 'event_upcoming' },
  { key: 'previous', label: 'السابقة والملغاة', icon: 'history' }
];

function CancelByDoctor({ appointment, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const QUICK_REASONS = [
    'اعتذار طارئ من الطبيب',
    'إلغاء دوام العيادة في هذا اليوم',
    'تغيير في جدول العمليات'
  ];

  const cancel = async () => {
    const finalReason = reason.trim() || 'اعتذار الطبيب عن الموعد';
    setBusy(true);
    try {
      const response = await api.appointments.doctorAction(appointment.id, 'cancel', finalReason);
      toast(response.message || 'تم إلغاء الموعد وإبلاغ المريض.');
      setOpen(false);
      onDone();
    } catch (error) {
      toast(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button tone="danger" icon="event_busy" className="!py-1.5" onClick={() => setOpen(true)}>إلغاء الموعد</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="إلغاء الموعد المؤكد" eyebrow={appointment.patientName}>
        <div className="flex flex-col gap-space-sm">
          <p className="font-body-md text-body-md text-text-muted">
            موعد {formatDate(appointment.date)} الساعة {timeLabel(appointment.time)}. سيصل إشعار الإلغاء إلى المريض ويصبح الوقت متاحاً للحجز.
          </p>
          <div className="flex flex-wrap gap-1">
            <span className="font-label-sm text-label-sm text-text-muted w-full">أسباب سريعة:</span>
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="text-xs px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-text-body transition-colors"
              >
                {r}
              </button>
            ))}
          </div>
          <Field label="سبب الإلغاء" htmlFor={'cancel-' + appointment.id}>
            <textarea
              id={'cancel-' + appointment.id}
              rows={3}
              maxLength={500}
              placeholder="اكتب سبب الإلغاء..."
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex gap-space-xs">
            <Button tone="danger" busy={busy} busyLabel="جارٍ الإلغاء…" onClick={cancel} className="flex-1">تأكيد الإلغاء</Button>
            <Button tone="ghost" onClick={() => setOpen(false)}>تراجع</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function RejectByDoctor({ appointment, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const QUICK_REASONS = [
    'اعتذار لظرف طارئ',
    'العيادة مغلقة في هذا الوقت',
    'يرجى حجز موعد في يوم آخر'
  ];

  const reject = async () => {
    const finalReason = reason.trim() || 'اعتذار الطبيب عن قبول الموعد';
    setBusy(true);
    try {
      const response = await api.appointments.doctorAction(appointment.id, 'reject', finalReason);
      toast(response.message || 'تم رفض / إلغاء طلب الموعد وإبلاغ المريض.');
      setOpen(false);
      onDone();
    } catch (error) {
      toast(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button tone="danger" icon="close" className="!py-1.5" onClick={() => setOpen(true)}>رفض / إلغاء</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="رفض أو إلغاء طلب الموعد" eyebrow={appointment.patientName}>
        <div className="flex flex-col gap-space-sm">
          <p className="font-body-md text-body-md text-text-muted">
            سيتم رفض الطلب وإبلاغ المريض بالإشعار فوراً، كما سيصبح الوقت متاحاً للحجز من جديد.
          </p>
          <div className="flex flex-wrap gap-1">
            <span className="font-label-sm text-label-sm text-text-muted w-full">أسباب سريعة:</span>
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className="text-xs px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-text-body transition-colors"
              >
                {r}
              </button>
            ))}
          </div>
          <Field label="سبب الرفض / الإلغاء (اختياري)" htmlFor={'reject-' + appointment.id}>
            <textarea
              id={'reject-' + appointment.id}
              rows={3}
              maxLength={500}
              placeholder="اكتب سبب الرفض أو اختر من الأسباب أعلاه..."
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex gap-space-xs">
            <Button tone="danger" busy={busy} busyLabel="جارٍ الإلغاء…" onClick={reject} className="flex-1">تأكيد الرفض / الإلغاء</Button>
            <Button tone="ghost" onClick={() => setOpen(false)}>تراجع</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Attendance({ appointment, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');

  const mark = async (action) => {
    setBusy(action);
    try {
      const response = await api.appointments.doctorAction(appointment.id, action);
      toast(response.message);
      onDone();
    } catch (error) {
      toast(error.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <Button tone="success" icon="how_to_reg" className="!py-1.5" busy={busy === 'complete'} busyLabel="…" disabled={!!busy} onClick={() => mark('complete')}>حضر</Button>
      <Button tone="soft" icon="person_off" className="!py-1.5" busy={busy === 'no_show'} busyLabel="…" disabled={!!busy} onClick={() => mark('no_show')}>لم يحضر</Button>
    </>
  );
}

function ConfirmByDoctor({ appointment, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      const response = await api.appointments.doctorAction(appointment.id, 'confirm');
      toast(response.message || 'تمت الموافقة على الموعد وتأكيده بنجاح.');
      onDone();
    } catch (error) {
      toast(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button tone="success" icon="check_circle" className="!py-1.5 font-bold shadow-sm" busy={busy} busyLabel="جارٍ القبول…" disabled={busy} onClick={confirm}>
      موافقة على الموعد
    </Button>
  );
}

function DoctorAppointmentRow({ appointment, onChange }) {
  const status = APPOINTMENT_STATUS[appointment.status] || APPOINTMENT_STATUS.confirmed;
  const day = new Date(appointment.date + 'T00:00');
  const isPending = appointment.recordedStatus === 'pending' || appointment.status === 'pending';
  const isConfirmed = (appointment.recordedStatus === 'confirmed' || appointment.status === 'confirmed') && !isPending;

  return (
    <div className={'flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm p-space-sm rounded-xl transition-all ' +
      (isPending ? 'bg-amber-500/5 border-2 border-amber-500/30 shadow-sm' : 'bg-surface-subtle')}>
      <div className="flex items-start gap-space-sm min-w-0">
        <div className={'w-16 shrink-0 rounded-xl flex flex-col items-center py-1 ' +
          (isPending ? 'bg-amber-500 text-white shadow-sm' : appointment.upcoming ? 'bg-primary-container text-on-primary' : 'bg-surface-container-high text-text-muted')}>
          <span className="font-label-sm text-label-sm">{WEEKDAYS_AR[day.getDay()]}</span>
          <span className="font-headline-md text-headline-md leading-tight">{day.getDate()}</span>
          <span className="font-label-sm text-label-sm">{new Intl.DateTimeFormat('ar', { month: 'short' }).format(day)}</span>
        </div>
        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-headline-sm text-headline-sm text-text-heading truncate">{appointment.patientName}</span>
            {isPending && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white shadow-xs">
                <Icon name="hourglass_top" className="text-[13px]" /> طلب جديد بانتظار موافقتك
              </span>
            )}
          </div>
          <span className="font-label-md text-label-md text-text-body flex items-center gap-1">
            <Icon name="schedule" className="text-[16px] text-text-primary" />
            {timeLabel(appointment.time)} - {timeLabel(appointment.endTime)}
          </span>
          {appointment.phone ? (
            <a href={'tel:' + appointment.phone} className="font-body-sm text-body-sm text-text-primary hover:underline flex items-center gap-1" dir="ltr">
              <Icon name="call" className="text-[16px]" />{appointment.phone}
            </a>
          ) : null}
          {appointment.notes ? (
            <p className="font-body-sm text-body-sm text-text-muted whitespace-pre-line bg-surface-card p-2 rounded-lg border border-border-subtle mt-1">
              <span className="font-bold text-text-body">ملاحظات المريض: </span>{appointment.notes}
            </p>
          ) : null}
          {appointment.status === 'cancelled' ? (
            <span className="font-body-sm text-body-sm text-text-muted">
              {appointment.cancelledBy === 'doctor' ? 'ألغيته أنت' : 'ألغاه المريض'}{appointment.cancelledAt ? ' · ' + formatDateTime(appointment.cancelledAt) : ''}
              {appointment.cancelReason ? ' — ' + appointment.cancelReason : ''}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-space-2xs">
        {!isPending && (
          <Badge className={status.cls}>
            {isConfirmed && !appointment.upcoming ? 'بانتظار تسجيل الحضور' : status.label}
          </Badge>
        )}
        {isPending ? <ConfirmByDoctor appointment={appointment} onDone={onChange} /> : null}
        {isPending ? <RejectByDoctor appointment={appointment} onDone={onChange} /> : null}
        {isConfirmed && appointment.upcoming ? <CancelByDoctor appointment={appointment} onDone={onChange} /> : null}
        {isConfirmed && !appointment.upcoming ? <Attendance appointment={appointment} onDone={onChange} /> : null}
      </div>
    </div>
  );
}

export default function DoctorAppointmentsPage() {
  const [tab, setTab] = useState('all');
  const state = useAsync(async () => (await api.appointments.forDoctor()).appointments, []);

  // Poll for new appointments every 10 seconds and on window focus
  useEffect(() => {
    const timer = setInterval(() => {
      state.reload();
    }, 10000);
    const onFocus = () => state.reload();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [state]);

  const groups = useMemo(() => {
    const all = state.data || [];
    const today = clinicToday();
    const pendingList = all.filter((a) => a.recordedStatus === 'pending' || a.status === 'pending');
    const todayList = all.filter((a) => a.date === today && a.status !== 'cancelled');
    const upcomingList = all.filter((a) => a.upcoming && a.date !== today && a.status !== 'cancelled' && a.recordedStatus !== 'pending' && a.status !== 'pending');
    const previousList = all.filter((a) => (!a.upcoming && a.date !== today) || a.status === 'cancelled').slice().reverse();

    // In "all", pending appointments appear first so doctor never misses them!
    const pendingIds = new Set(pendingList.map(a => a.id));
    const nonPending = all.filter(a => !pendingIds.has(a.id));
    const allList = [...pendingList, ...nonPending];

    return {
      all: allList,
      pending: pendingList,
      today: todayList,
      upcoming: upcomingList,
      previous: previousList
    };
  }, [state.data]);

  const list = groups[tab] || [];
  const waitingAttendance = (state.data || []).filter((a) => (a.recordedStatus === 'confirmed' || a.status === 'confirmed') && !a.upcoming).length;
  const pendingCount = groups.pending.length;

  return (
    <>
      <PageHeader title="مواعيد العيادة" subtitle="إدارة حجوزات المرضى والموافقة عليها وتسجيل الحضور" />
      <PageBody>
        <RoleGate allow={['Doctor']} message="هذه الصفحة متاحة لحسابات الأطباء">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-space-sm">
            {TABS.map((t) => {
              const count = state.data ? groups[t.key].length : '—';
              const isPendingTab = t.key === 'pending';
              const hasPending = isPendingTab && pendingCount > 0;
              return (
                <div
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={'cursor-pointer rounded-xl p-space-sm shadow-sm flex flex-col sm:flex-row items-center gap-space-xs text-center sm:text-right transition-all ' +
                    (tab === t.key ? 'ring-2 ring-primary bg-surface-card' : 'bg-surface-card hover:bg-surface-subtle ') +
                    (hasPending ? 'border-2 border-amber-500 bg-amber-500/10' : '')}
                >
                  <Icon name={t.icon} className={'text-[28px] ' + (hasPending ? 'text-amber-500' : 'text-text-primary')} />
                  <div className="flex flex-col">
                    <span className={'font-headline-lg text-headline-lg leading-none ' + (hasPending ? 'text-amber-600 dark:text-amber-400 font-black' : 'text-text-heading')}>
                      {count}
                    </span>
                    <span className="font-label-sm text-label-sm text-text-muted flex items-center justify-center sm:justify-start gap-1">
                      {t.label}
                      {hasPending && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Alert banner for pending appointments awaiting doctor approval */}
          {pendingCount > 0 && (
            <div className="p-space-sm rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-900 dark:text-amber-200 font-label-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm shadow-sm">
              <div className="flex items-center gap-space-sm">
                <span className="p-2 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Icon name="notification_important" className="text-[24px]" />
                </span>
                <div>
                  <p className="font-headline-sm text-headline-sm font-bold text-amber-950 dark:text-amber-100">
                    لديك {pendingCount} {pendingCount === 1 ? 'طلب حجز موعد جديد' : 'طلبات حجز مواعيد جديدة'} بانتظار موافقتك أو رفضك
                  </p>
                  <p className="font-body-sm text-body-sm opacity-90 mt-0.5">
                    يمكنك مراجعة تفاصيل المريض والموافقة على الموعد لتأكيده، أو إلغائه/رفضه مع سبب يصل للمريض.
                  </p>
                </div>
              </div>
              <Button tone="primary" size="sm" onClick={() => setTab('pending')} className="whitespace-nowrap shrink-0 !bg-amber-600 hover:!bg-amber-700 !text-white">
                عرض الطلبات الجديدة ({pendingCount})
              </Button>
            </div>
          )}

          {waitingAttendance > 0 && (
            <p className="p-space-sm rounded-xl bg-state-warning-subtle text-state-warning font-label-md text-label-md flex items-center gap-2">
              <Icon name="pending_actions" /> لديك {waitingAttendance} {waitingAttendance === 1 ? 'موعد' : 'مواعيد'} بانتظار تسجيل الحضور أو الغياب.
            </p>
          )}

          <Card>
            <CardTitle icon="event_note" count={list.length} actions={<Button tone="soft" icon="refresh" onClick={state.reload}>تحديث</Button>}>
              الحجوزات
            </CardTitle>
            <div className="flex flex-wrap gap-space-2xs" role="tablist">
              {TABS.map((t) => {
                const count = state.data ? groups[t.key].length : 0;
                const isPendingTab = t.key === 'pending';
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={'px-space-sm py-1.5 rounded-full font-label-md text-label-md flex items-center gap-1.5 transition-colors ' +
                      (tab === t.key
                        ? 'bg-primary-container text-on-primary font-bold'
                        : isPendingTab && count > 0
                        ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200 hover:bg-amber-500/30 font-bold'
                        : 'bg-surface-container-low text-text-body hover:bg-surface-container-high')}
                  >
                    <Icon name={t.icon} className="text-[18px]" />
                    <span>{t.label}</span>
                    {count > 0 && (
                      <span className={'px-1.5 py-0.2 rounded-full text-xs font-bold ' +
                        (tab === t.key ? 'bg-white/20 text-on-primary' : isPendingTab ? 'bg-amber-500 text-white' : 'bg-surface-container-high text-text-muted')}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <AsyncBlock state={state} empty={{
              when: !list.length,
              icon: tab === 'pending' ? 'task_alt' : 'event_available',
              title: tab === 'all' ? 'لا توجد أي مواعيد بعد' :
                     tab === 'pending' ? 'لا توجد أي طلبات مواعيد جديدة بانتظار الموافقة' :
                     tab === 'today' ? 'لا توجد مواعيد اليوم' :
                     tab === 'upcoming' ? 'لا توجد مواعيد مؤكدة قادمة' : 'لا توجد مواعيد سابقة',
              hint: tab === 'pending'
                ? 'عندما يقوم أي مريض بحجز موعد في عيادتك، سيظهر طلبه هنا فوراً لتتمكن من الموافقة عليه أو إلغائه.'
                : 'تظهر هنا الحجوزات التي يجريها المرضى من صفحتك في دليل الأطباء.'
            }}>
              <div className="flex flex-col gap-space-xs">
                {list.map((a) => <DoctorAppointmentRow key={a.id} appointment={a} onChange={state.reload} />)}
              </div>
            </AsyncBlock>
          </Card>
        </RoleGate>
      </PageBody>
    </>
  );
}
