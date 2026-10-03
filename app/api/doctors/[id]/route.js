import { handle, HttpError, requireUser } from '@/lib/server/auth';
import { doctors } from '@/lib/server/directory';

export const GET = handle(async (request, { params }) => {
  const user = await requireUser(request);
  const { id } = await params;
  const d = (await doctors()).find(x => String(x.id) === String(id));
  if (!d) throw new HttpError(404, 'لم يتم العثور على الطبيب.');

  /* Patients and other public consumers can only open approved profiles.
     The doctor can still open their own record while it is being reviewed. */
  const isOwner = String(d.userId || d.accountId || '') === String(user.id);
  if (!isOwner && user.role !== 'Admin' && d.approvalStatus !== 'approved') {
    throw new HttpError(404, 'لم يتم العثور على الطبيب.');
  }
  return Response.json({ data: d });
});
