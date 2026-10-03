import 'server-only';
import { store } from './store';
import { notify } from './notify';
import { HttpError } from './auth';

/* Medical equipment requests from Hospital and Doctor accounts — shown to
   donors for a direct contact, same shape as help-requests.js (patient
   medicine pleas) but for equipment needed to run a clinic or a facility. */

export const COLLECTION = 'equipment-requests';
const REQUESTER_ROLES = ['Hospital', 'Doctor'];
const MAX_OPEN = 20;

export async function createEquipmentRequest({ requesterId, requesterName, requesterRole, requesterPhone, equipmentName, quantity, reason, area, estimatedCost, evidence }) {
  if (!REQUESTER_ROLES.includes(requesterRole)) throw new HttpError(403, 'طلب المعدات متاح للمراكز الصحية والأطباء فقط.');
  const mine = (await store.read(COLLECTION)).filter((r) => r.requesterId === String(requesterId) && !['closed'].includes(r.status));
  if (mine.length >= MAX_OPEN) throw new HttpError(400, 'لديك عدد كبير من طلبات المعدات المفتوحة بالفعل.');
  if (!evidence || !evidence.path || !evidence.kind) throw new HttpError(400, 'يجب إرفاق إثبات للحاجة إلى الجهاز: صورة أو فيديو أو كشف/تقرير طبي.');
  if (!['image', 'video', 'medical_report'].includes(evidence.kind)) throw new HttpError(400, 'نوع الإثبات غير مدعوم.');

  const record = {
    id: store.newId('eq'),
    requesterId: String(requesterId),
    requesterName: requesterName || '',
    requesterRole,
    requesterPhone: requesterPhone || '',
    equipmentName: equipmentName.trim(),
    quantity: quantity || 1,
    reason: (reason || '').trim(),
    area: area || '',
    estimatedCost: Number(estimatedCost) > 0 ? Number(estimatedCost) : null,
    pledgedAmount: 0,
    evidence: { kind: evidence.kind, name: evidence.name || 'إثبات الحاجة', mimeType: evidence.mimeType || '', path: evidence.path },
    status: 'open', /* approved Hospital/Doctor accounts reach donors directly: open -> contacted -> resolved | closed */
    contacts: [],
    createdAt: new Date().toISOString()
  };
  await store.update(COLLECTION, (items) => ({ items: [record, ...items], result: null }));
  return record;
}

export async function listMine(requesterId) {
  const items = await store.read(COLLECTION);
  return items.filter((r) => r.requesterId === String(requesterId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listOpenForDonors() {
  const items = await store.read(COLLECTION);
  return items.filter((r) => r.status === 'open' || r.status === 'contacted').map((r) => ({ ...r, pledgedAmount: (r.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0), remainingAmount: Math.max(0, (Number(r.estimatedCost) || 0) - (r.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0)) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllForAdmin() {
  const items = await store.read(COLLECTION);
  return items.map((r) => ({ ...r, pledgedAmount: (r.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0), remainingAmount: Math.max(0, (Number(r.estimatedCost) || 0) - (r.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0)) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function contactEquipmentRequest(id, donor, message, amount) {
  let updated = null;
  const pledge = Number(amount) > 0 ? Number(amount) : null;
  await store.update(COLLECTION, (items) => ({
    items: items.map((item) => {
      if (item.id !== id) return item;
      if (!['open', 'contacted'].includes(item.status)) throw new HttpError(409, 'هذا الطلب لم يعد متاحاً للتبرع.');
      const alreadyPledged = (item.contacts || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      if (pledge && item.estimatedCost && alreadyPledged + pledge > Number(item.estimatedCost)) throw new HttpError(400, 'المبلغ المتعهد به يتجاوز المبلغ المتبقي المطلوب.');
      updated = {
        ...item,
        status: item.status === 'open' ? 'contacted' : item.status,
        contacts: [...item.contacts, { donorId: donor.id, donorName: donor.name || 'متبرع', donorPhone: donor.phone || '', message: (message || '').trim(), amount: pledge, at: new Date().toISOString() }]
      };
      return updated;
    }),
    result: null
  }));
  if (!updated) return null;

  const pledgeText = pledge ? ' — تبرع مالي مقترح: $' + pledge : '';
  const href = updated.requesterRole === 'Doctor' ? '/doctor-equipment-requests' : '/facility-equipment-requests';
  await notify([{
    userId: updated.requesterId,
    type: 'success',
    title: pledge ? 'متبرع عرض مبلغاً مالياً لطلبك' : 'متبرع تواصل بخصوص طلب المعدات',
    message: (donor.name || 'متبرع') + ' مستعد للمساعدة في توفير "' + updated.equipmentName + '"' + (donor.phone ? ' — للتواصل: ' + donor.phone : '') + (message ? ' — ' + message : '') + pledgeText,
    href
  }]);

  if (pledge) {
    await notify([{
      userId: 'admin-1',
      type: 'info',
      title: 'تعهد تبرع مالي جديد (معدات)',
      message: (donor.name || 'متبرع') + ' يعرض $' + pledge + ' لـ ' + (updated.requesterName || '') + ' مقابل "' + updated.equipmentName + '" — يرجى المتابعة والتنسيق.',
      href: '/admin/equipment-requests'
    }]);
  }

  return updated;
}

export async function closeEquipmentRequest(id, requesterId, status) {
  let updated = null;
  await store.update(COLLECTION, (items) => ({
    items: items.map((item) => {
      if (item.id !== id || item.requesterId !== String(requesterId)) return item;
      updated = { ...item, status: status === 'resolved' ? 'resolved' : 'closed' };
      return updated;
    }),
    result: null
  }));
  return updated;
}

export async function reviewEquipmentRequest(id, admin, decision, note) {
  let updated = null;
  await store.update(COLLECTION, (items) => ({
    items: items.map((item) => {
      if (item.id !== id || item.status !== 'pending_review') return item;
      updated = { ...item, status: decision === 'approve' ? 'open' : 'rejected', review: { by: admin.name || 'الإدارة', note: (note || '').trim(), at: new Date().toISOString() } };
      return updated;
    }), result: null
  }));
  if (!updated) return null;
  await notify([{ userId: updated.requesterId, type: decision === 'approve' ? 'success' : 'info', title: decision === 'approve' ? 'تمت الموافقة على طلب الجهاز' : 'لم تتم الموافقة على طلب الجهاز', message: decision === 'approve' ? 'طلبك لـ "' + updated.equipmentName + '" أصبح ظاهراً للمتبرعين.' : 'طلبك لـ "' + updated.equipmentName + '" لم يُقبل.' + (note ? ' السبب: ' + note : ''), href: updated.requesterRole === 'Doctor' ? '/doctor-equipment-requests' : '/facility-equipment-requests' }]);
  return updated;
}
