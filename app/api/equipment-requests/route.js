import { handle, HttpError, isAdmin, requireUser, readJson, text } from '@/lib/server/auth';
import { createEquipmentRequest, listAllForAdmin, listMine, listOpenForDonors, reviewEquipmentRequest } from '@/lib/server/equipment-requests';
import { getMine } from '@/lib/server/provider-profile';

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  if (isAdmin(user)) return Response.json({ items: await listAllForAdmin() });
  if (user.role === 'Hospital' || user.role === 'Doctor') return Response.json({ items: await listMine(user.id) });
  if (user.role === 'Donor') return Response.json({ items: await listOpenForDonors() });
  throw new HttpError(403, 'هذه الميزة للمراكز الصحية والأطباء والمتبرعين فقط.');
});

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  if (user.role !== 'Hospital' && user.role !== 'Doctor') throw new HttpError(403, 'طلب المعدات متاح للمراكز الصحية والأطباء فقط.');
  const profile = await getMine(user.id);
  if (!profile || profile.status !== 'approved') throw new HttpError(403, 'يجب اعتماد حسابك من الإدارة أولاً قبل طلب المعدات.');
  const body = await readJson(request);
  const equipmentName = text(body.equipmentName, 200);
  if (!equipmentName) throw new HttpError(400, 'اسم الجهاز أو المعدة مطلوب.');
  const quantity = Number(body.quantity) > 0 ? Math.min(Math.floor(Number(body.quantity)), 1000) : 1;

  const item = await createEquipmentRequest({
    requesterId: user.id,
    requesterName: user.name,
    requesterRole: user.role,
    requesterPhone: text(body.requesterPhone, 30),
    equipmentName,
    quantity,
    reason: text(body.reason, 500),
    area: text(body.area, 100),
    estimatedCost: body.estimatedCost,
    evidence: body.evidence
  });
  return Response.json({ item }, { status: 201 });
});
