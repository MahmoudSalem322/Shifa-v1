import { handle, HttpError, isAdmin, readJson, requireUser, text } from '@/lib/server/auth';
import { createHelpRequest, listAllForAdmin, listMine, listOpenForDonors } from '@/lib/server/help-requests';

/* GET — role-aware:
   - Patient: their own requests (open, contacted, resolved, closed).
   - Donor:   every still-open request, so they can offer to help.
   - Admin:   everything, for oversight. */
export const GET = handle(async (request) => {
  const user = await requireUser(request);
  if (user.role === 'Patient') return Response.json({ items: await listMine(user.id) });
  if (user.role === 'Donor') return Response.json({ items: await listOpenForDonors() });
  if (isAdmin(user)) return Response.json({ items: await listAllForAdmin() });
  throw new HttpError(403, 'هذه الميزة لحسابات المرضى والمتبرعين فقط.');
});

/* POST { medicineName, quantity, reason, notes, area, patientPhone } —
   a patient asking for direct help finding or affording a medicine. */
export const POST = handle(async (request) => {
  const user = await requireUser(request);
  if (user.role !== 'Patient') throw new HttpError(403, 'طلب المساعدة متاح لحسابات المرضى فقط.');
  const body = await readJson(request);
  const medicineName = text(body.medicineName, 200);
  if (!medicineName) throw new HttpError(400, 'اسم الدواء مطلوب.');
  const reason = body.reason === 'cannot_afford' ? 'cannot_afford' : 'unavailable';
  const quantity = Number(body.quantity) > 0 ? Math.min(Math.floor(Number(body.quantity)), 1000) : null;

  const item = await createHelpRequest({
    patientId: user.id,
    patientName: user.name,
    patientPhone: text(body.patientPhone, 30),
    medicineName,
    reason,
    quantity,
    notes: text(body.notes, 500),
    area: text(body.area, 100),
    financialReason: text(body.financialReason, 500),
    estimatedCost: body.estimatedCost,
    evidence: body.evidence
  });
  return Response.json({ item }, { status: 201 });
});
