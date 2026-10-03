import { handle, HttpError, requireUser, requireRole } from '@/lib/server/auth';
import { COLLECTION as DONATIONS } from '@/lib/server/donations';
import { candidateView, reservedFor } from '@/lib/server/matches';
import { store } from '@/lib/server/store';
import { findMatches } from '@/lib/matching';
import { geo } from '@/lib/vocab';

/* GET /api/matches/candidates?drugRequestId=…&governorate=…
   Module 9 · "Create Matching API" → "Return Matching Donations".
   Compares the request's medicine and outstanding quantity with every
   approved donation, drops expiring ones and ranks by location. */
export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const { searchParams } = new URL(request.url);
  const drugRequestId = searchParams.get('drugRequestId') || '';
  if (!drugRequestId) throw new HttpError(400, 'حدّد طلب الدواء.');
  requireRole(user, ['Admin'], 'مطابقة التبرعات تتم بواسطة الإدارة فقط.');
  const governorate = geo.normalize(searchParams.get('governorate'));

  const rawRequest = (await store.read('drug-requests')).find((r) => String(r.id) === String(drugRequestId));
  if (!rawRequest) throw new HttpError(404, 'لم يتم العثور على طلب الدواء.');
  const drugRequest = rawRequest;
  const donations = await store.read(DONATIONS);

  const required = Math.max(1, Number(drugRequest.quantity) || 1);
  const reserved = reservedFor(donations, drugRequestId);
  const outstanding = Math.max(0, required - reserved);

  const candidates = outstanding > 0
    ? findMatches({ medicineName: drugRequest.medicineName, quantity: outstanding }, donations.filter((d) => d.donorId !== user.id), { governorate })
      .slice(0, 20)
      .map(candidateView)
    : [];

  return Response.json({
    request: { id: drugRequest.id, medicineName: drugRequest.medicineName, quantity: required, status: drugRequest.status },
    required,
    reserved,
    outstanding,
    governorate,
    candidates
  });
});
