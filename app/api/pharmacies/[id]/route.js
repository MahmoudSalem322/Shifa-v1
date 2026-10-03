import { handle, HttpError, requireUser } from '@/lib/server/auth';
import { pharmacies, canSeeRecord } from '@/lib/server/directory';

export const GET = handle(async (request, { params }) => {
  const user = await requireUser(request);
  const { id } = await params;
  const d = (await pharmacies()).find(x => String(x.id) === String(id));
  if (!d || !canSeeRecord(d, user)) throw new HttpError(404, 'لم يتم العثور على الصيدلية.');
  return Response.json({ data: d });
});
