import 'server-only';
import { store } from './store';
import { notify } from './notify';
import { HttpError } from './auth';

/* "أحتاج مساعدة في توفير دواء" flow — separate from the drug-request +
   donation matching pipeline (Module 5/8/9), which matches anonymous
   donor stock to requests automatically. This is a direct plea: the
   patient explains they cannot find or afford a specific medicine, it
   is shown to every Donor account, and a donor who wants to help opens
   a direct contact channel (phone) with the patient — no approval step,
   because the whole point is a fast personal connection. */

export const COLLECTION = 'help-requests';
const MAX_OPEN_PER_PATIENT = 10;

export async function createHelpRequest({ patientId, patientName, patientPhone, medicineName, reason, quantity, notes, area, financialReason, estimatedCost, evidence }) {
  const mine = (await store.read(COLLECTION)).filter((r) => r.patientId === String(patientId) && !['closed', 'rejected'].includes(r.status));
  if (mine.length >= MAX_OPEN_PER_PATIENT) {
    throw new HttpError(400, 'لديك عدد كبير من طلبات المساعدة المفتوحة بالفعل. أغلق طلباً قديماً أولاً.');
  }

  const isFinancial = reason === 'cannot_afford';
  /* A plea over "I can't afford it" must state its reason and attach proof
     so donors can judge it themselves. It still goes straight to donors. */
  if (isFinancial && (!financialReason || financialReason.trim().length < 10)) {
    throw new HttpError(400, 'يرجى توضيح سبب عدم القدرة على شراء الدواء (10 أحرف على الأقل) حتى يطّلع عليه المتبرع.');
  }
  if (isFinancial && (!evidence || !evidence.path || !evidence.kind)) {
    throw new HttpError(400, 'يجب إرفاق إثبات للحاجة المالية: صورة أو فيديو أو كشف/تقرير طبي.');
  }
  const allowedEvidence = ['image', 'video', 'medical_report'];
  if (evidence?.kind && !allowedEvidence.includes(evidence.kind)) throw new HttpError(400, 'نوع الإثبات غير مدعوم.');

  const record = {
    id: store.newId('hr'),
    patientId: String(patientId),
    patientName: patientName || '',
    patientPhone: patientPhone || '',
    medicineName: medicineName.trim(),
    quantity: quantity || null,
    reason: reason || 'unavailable', /* 'unavailable' | 'cannot_afford' */
    financialReason: isFinancial ? financialReason.trim() : '',
    estimatedCost: Number(estimatedCost) > 0 ? Number(estimatedCost) : null,
    pledgedAmount: 0,
    evidence: isFinancial ? { kind: evidence.kind, name: evidence.name || 'إثبات الحاجة', mimeType: evidence.mimeType || '', path: evidence.path } : null,
    notes: (notes || '').trim(),
    area: area || '',
    /* Every request goes straight to the donors: no admin approval step.
       (The stated reason and the evidence file stay on the record so a donor
       can judge the need, and the admin keeps oversight and can close it.) */
    status: 'open',
    review: null, /* { by, note, at } once an admin decides */
    contacts: [],
    createdAt: new Date().toISOString()
  };
  await store.update(COLLECTION, (items) => ({ items: [record, ...items], result: null }));
  return record;
}

export async function listMine(patientId) {
  const items = await store.read(COLLECTION);
  return items.filter((r) => r.patientId === String(patientId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* Requests a donor may act on: open ("not available") and contacted
   ones. "pending_review" (unevaluated financial pleas) and "rejected"
   never reach donors. */
export async function listOpenForDonors() {
  const items = await store.read(COLLECTION);
  return items.filter((r) => r.status === 'open' || r.status === 'contacted').map((r) => ({ ...r, pledgedAmount: (r.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0), remainingAmount: Math.max(0, (Number(r.estimatedCost) || 0) - (r.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0)) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllForAdmin() {
  const items = await store.read(COLLECTION);
  return items.map((r) => ({ ...r, pledgedAmount: (r.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0), remainingAmount: Math.max(0, (Number(r.estimatedCost) || 0) - (r.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0)) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* An admin evaluates a "cannot afford" plea before it reaches donors. */
export async function reviewHelpRequest(id, admin, decision, note) {
  let updated = null;
  await store.update(COLLECTION, (items) => ({
    items: items.map((item) => {
      if (item.id !== id || item.status !== 'pending_review') return item;
      updated = {
        ...item,
        status: decision === 'approve' ? 'open' : 'rejected',
        review: { by: admin.name || 'الإدارة', note: (note || '').trim(), at: new Date().toISOString() }
      };
      return updated;
    }),
    result: null
  }));
  if (!updated) return null;

  await notify([{
    userId: updated.patientId,
    type: decision === 'approve' ? 'success' : 'info',
    title: decision === 'approve' ? 'تمت الموافقة على طلبك' : 'لم تتم الموافقة على طلبك',
    message: decision === 'approve'
      ? 'طلبك للحصول على "' + updated.medicineName + '" أصبح ظاهراً للمتبرعين الآن.'
      : 'طلبك لـ "' + updated.medicineName + '" لم يُقبل.' + (note ? ' السبب: ' + note : ''),
    href: '/donations/need'
  }]);

  return updated;
}

/* A donor opens contact: recorded on the request and the patient is
   notified with the donor's name/phone so they can talk directly. If an
   `amount` is given, this is a financial pledge instead of (or alongside)
   a direct contact — the admin is looped in too so the transfer can be
   coordinated safely. */
export async function contactHelpRequest(id, donor, message, amount) {
  let updated = null;
  const pledge = Number(amount) > 0 ? Number(amount) : null;
  await store.update(COLLECTION, (items) => ({
    items: items.map((item) => {
      if (item.id !== id) return item;
      if (!['open', 'contacted'].includes(item.status)) throw new HttpError(409, 'هذا الطلب لم يعد متاحاً للتبرع.');
      const alreadyPledged = (item.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      if (pledge && item.estimatedCost && alreadyPledged + pledge > Number(item.estimatedCost)) {
        throw new HttpError(400, 'المبلغ المتعهد به يتجاوز المبلغ المتبقي المطلوب.');
      }
      updated = {
        ...item,
        status: item.status === 'open' ? 'contacted' : item.status,
        contacts: [...item.contacts, {
          donorId: donor.id,
          donorName: donor.name || 'متبرع',
          donorPhone: donor.phone || '',
          message: (message || '').trim(),
          amount: pledge,
          at: new Date().toISOString()
        }]
      };
      return updated;
    }),
    result: null
  }));
  if (!updated) return null;

  const pledgeText = pledge ? ' — تبرع مالي مقترح: $' + pledge : '';
  await notify([{
    userId: updated.patientId,
    type: 'success',
    title: pledge ? 'متبرع عرض مبلغاً مالياً لطلبك' : 'متبرع تواصل بخصوص طلبك',
    message: (donor.name || 'متبرع') + ' مستعد للمساعدة في توفير "' + updated.medicineName + '"' +
      (donor.phone ? ' — للتواصل: ' + donor.phone : '') + (message ? ' — ' + message : '') + pledgeText,
    href: '/donations/need'
  }]);

  if (pledge) {
    await notify([{
      userId: 'admin-1',
      type: 'info',
      title: 'تعهد تبرع مالي جديد',
      message: (donor.name || 'متبرع') + ' يعرض $' + pledge + ' للمريض ' + (updated.patientName || '') + ' مقابل "' + updated.medicineName + '" — يرجى المتابعة والتنسيق.',
      href: '/admin/help-requests'
    }]);
  }

  return updated;
}

/* The patient closes their own request (found it elsewhere, no longer needed). */
export async function closeHelpRequest(id, patientId, status) {
  let updated = null;
  await store.update(COLLECTION, (items) => ({
    items: items.map((item) => {
      if (item.id !== id || item.patientId !== String(patientId)) return item;
      updated = { ...item, status: status === 'resolved' ? 'resolved' : 'closed' };
      return updated;
    }),
    result: null
  }));
  return updated;
}
