import { handle, HttpError, readJson, requireUser, text } from '@/lib/server/auth';
import { createDemand, readAndRecheckDemands } from '@/lib/server/medicine-demand';

/* GET — the patient's own demand alerts, newest first. Open ones are
   quietly re-checked against the live catalog first (see medicine-demand.js). */
export const GET = handle(async (request) => {
  const user = await requireUser(request);
  if (user.role !== 'Patient') throw new HttpError(403, 'هذه الميزة لحسابات المرضى فقط.');
  const items = await readAndRecheckDemands(user);
  return Response.json({ items: items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
});

/* POST { medicineName, area } — "لم أجد الدواء": logs the demand and
   notifies pharmacies. area may be '' to mean "searched everywhere". */
export const POST = handle(async (request) => {
  const user = await requireUser(request);
  if (user.role !== 'Patient') throw new HttpError(403, 'هذه الميزة لحسابات المرضى فقط.');
  const body = await readJson(request);
  const medicineName = text(body.medicineName, 200);
  if (!medicineName) throw new HttpError(400, 'اسم الدواء مطلوب.');
  const demand = await createDemand({
    patientId: user.id,
    patientName: user.name,
    medicineName,
    area: text(body.area, 100)
  });
  return Response.json({ item: demand }, { status: 201 });
});
