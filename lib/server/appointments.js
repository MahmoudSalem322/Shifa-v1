import 'server-only';
import { normalizeDoctor } from '@/lib/vocab';
import { toItem } from '@/lib/api';
import { buildSlots } from '@/lib/schedule';
import { clinicInstant } from '@/lib/clock';
import { backend, HttpError } from './auth';
import { store } from './store';

export const COLLECTION = 'appointments';


/* Reads the doctor from the .NET API with the caller's token. */
export async function fetchDoctor(user, doctorId) {
  const localDoctor = (await store.read('doctors')).find(d => String(d.id) === String(doctorId));
  if (localDoctor) {
    if (localDoctor.approvalStatus !== 'approved' && String(localDoctor.userId || '') !== String(user.id)) {
      throw new HttpError(404, 'لم يتم العثور على الطبيب.');
    }
    const doctor = normalizeDoctor(localDoctor);
    if (!doctor || doctor.id === undefined || doctor.id === null || doctor.id === '') {
      throw new HttpError(404, 'بيانات الطبيب غير مكتملة.');
    }
    return doctor;
  }

  const result = await backend(user, 'GET', '/api/doctors/' + encodeURIComponent(doctorId));
  if (result.status === 404) throw new HttpError(404, 'لم يتم العثور على الطبيب.');
  if (result.status === 401) throw new HttpError(401, 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
  if (!result.ok) throw new HttpError(502, 'تعذّر تحميل بيانات الطبيب من الخادم.');
  const doctor = normalizeDoctor(toItem(result.payload));
  if (!doctor) throw new HttpError(404, 'لم يتم العثور على الطبيب.');
  if (doctor.id === undefined || doctor.id === null || doctor.id === '') throw new HttpError(502, 'بيانات الطبيب الواردة من الخادم غير مكتملة.');
  return doctor;
}

/* A reservation waits at most this long on the .NET API; one older than
   that belongs to a request that died mid-flight and no longer holds. */
const RESERVATION_TTL_MS = 3 * 60 * 1000;

export function isHolding(appointment, now = Date.now()) {
  if (appointment.status === 'confirmed' || appointment.status === 'pending') return true;
  return appointment.status === 'reserving' && now - Date.parse(appointment.createdAt) < RESERVATION_TTL_MS;
}

function normalizeDocId(val) {
  return String(val || '').replace(/^doctor_usr_doctor_/, '').replace(/^doctor_/, '');
}

/* Times already held for a doctor on a date: confirmed bookings plus
   reservations still waiting on the .NET API. */
export function bookedTimes(items, doctorId, date) {
  const target = String(doctorId);
  const targetNorm = normalizeDocId(target);
  return new Set(
    items
      .filter((a) => {
        if (a.date !== date || !isHolding(a)) return false;
        const cur = String(a.doctorId);
        if (cur === target) return true;
        if (targetNorm && normalizeDocId(cur) === targetNorm) return true;
        return false;
      })
      .map((a) => a.time)
  );
}

export function slotsFor(doctor, date, items) {
  return buildSlots({
    date,
    workDays: doctor.workDays,
    workHours: doctor.workHours,
    durationMinutes: doctor.durationMinutes,
    booked: bookedTimes(items, doctor.id, dateKey(date))
  });
}

export function dateKey(date) {
  if (typeof date === 'string') return date;
  const pad = (n) => String(n).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/* "Upcoming" vs "previous" is derived from the slot, not stored. The
   slot is Gaza wall-clock time, so startsAt carries the right instant
   even when the server runs in UTC. */
export function withTiming(appointment, now = new Date()) {
  const startsAt = clinicInstant(appointment.date, appointment.time);
  const past = startsAt.getTime() < now.getTime();
  let status = appointment.status;
  if (status === 'confirmed' && past) status = 'completed';
  const isUpcomingStatus = appointment.status === 'confirmed' || appointment.status === 'pending';
  return { ...appointment, status, startsAt: startsAt.toISOString(), upcoming: !past && isUpcomingStatus };
}

export function publicAppointment(appointment) {
  /* eslint-disable-next-line no-unused-vars */
  const { patientId, ...rest } = withTiming(appointment);
  return rest;
}

/* ------------------------------------------------------------------
   Doctor side. A booking stores the doctor's directory id, while the
   caller's token carries their account id; GET /api/doctors/me links
   the two. The link is remembered so a patient's booking or
   cancellation can notify the doctor's account.
   ------------------------------------------------------------------ */

const DOCTOR_ACCOUNTS = 'doctor-accounts';

export async function ownDoctorId(user) {
  const result = await backend(user, 'GET', '/api/doctors/me');
  if (result.status === 401) throw new HttpError(401, 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
  if (result.status === 404) throw new HttpError(404, 'لم يُنشأ ملفك المهني بعد. أكمل ملفك المهني أولاً.');
  if (!result.ok) throw new HttpError(502, 'تعذّر تحميل ملفك المهني من خادم شفاء.');
  const doctor = normalizeDoctor(toItem(result.payload));
  if (!doctor || doctor.id === undefined || doctor.id === null || doctor.id === '') {
    throw new HttpError(502, 'بيانات ملفك المهني الواردة من الخادم غير مكتملة.');
  }
  const doctorId = String(doctor.id);
  await store.update(DOCTOR_ACCOUNTS, (items) => {
    if (items.some((a) => a.doctorId === doctorId && a.userId === user.id)) return { items, result: null };
    return { items: [...items.filter((a) => a.doctorId !== doctorId), { doctorId, userId: user.id, at: new Date().toISOString() }], result: null };
  }).catch(() => {});
  return doctorId;
}

/* The account behind a directory doctor, if that doctor has signed in. */
export async function doctorAccountOf(doctorId) {
  const sid = String(doctorId);
  const items = await store.read(DOCTOR_ACCOUNTS);
  const entry = items.find((a) => String(a.doctorId) === sid);
  if (entry && entry.userId) return entry.userId;
  const allDocs = await store.read('doctors');
  const d = allDocs.find((x) => String(x.id) === sid || (x.userId && ('doctor_' + x.userId === sid)));
  if (d && (d.userId || d.accountId)) return d.userId || d.accountId;
  if (sid.startsWith('doctor_usr_doctor_')) {
    const raw = 'usr_doctor_' + sid.slice('doctor_usr_doctor_'.length);
    const byRaw = items.find((a) => String(a.userId) === raw || String(a.doctorId) === raw);
    if (byRaw && byRaw.userId) return byRaw.userId;
    return raw;
  }
  if (sid.startsWith('doctor_')) {
    const raw = sid.slice('doctor_'.length);
    const byRaw = items.find((a) => String(a.userId) === raw || String(a.doctorId) === raw);
    if (byRaw && byRaw.userId) return byRaw.userId;
    return raw;
  }
  return '';
}

/* Collect all possible doctor identifier aliases for a user account */
export async function allDoctorIdsOf(user) {
  const ids = new Set();
  if (!user) return ids;

  const uid = String(user.id || '');
  if (uid) {
    ids.add(uid);
    ids.add('doctor_' + uid);
    if (uid.startsWith('usr_doctor_')) {
      const num = uid.replace('usr_doctor_', '');
      ids.add(num);
      ids.add('doctor_' + num);
    }
  }

  try {
    const ownId = await ownDoctorId(user);
    if (ownId) {
      ids.add(String(ownId));
      ids.add('doctor_' + String(ownId));
    }
  } catch {}

  try {
    const docAccounts = await store.read(DOCTOR_ACCOUNTS);
    for (const a of docAccounts) {
      if (String(a.userId) === uid) {
        ids.add(String(a.doctorId));
        if (typeof a.doctorId === 'string' && a.doctorId.startsWith('doctor_usr_doctor_')) {
          ids.add(a.doctorId.replace('doctor_usr_doctor_', ''));
        }
      }
    }
  } catch {}

  try {
    const allDocs = await store.read('doctors');
    for (const d of allDocs) {
      const matchUserId = String(d.userId || '') === uid || String(d.accountId || '') === uid;
      const matchEmail = Boolean(user.email && d.email && String(d.email).toLowerCase() === String(user.email).toLowerCase());
      const matchId = String(d.id) === uid || String(d.id) === 'doctor_' + uid;
      if (matchUserId || matchEmail || matchId) {
        if (d.id !== undefined && d.id !== null) {
          ids.add(String(d.id));
          if (typeof d.id === 'string' && d.id.startsWith('doctor_usr_doctor_')) {
            ids.add(d.id.replace('doctor_usr_doctor_', ''));
          }
        }
      }
    }
  } catch {}

  return ids;
}

/* What the doctor sees: the patient's contact details, and the status as
   recorded (so the page knows whether attendance is still open). */
export function doctorAppointment(appointment) {
  const view = publicAppointment(appointment);
  view.recordedStatus = appointment.status;
  return view;
}

export const readAppointments = () => store.read(COLLECTION);
