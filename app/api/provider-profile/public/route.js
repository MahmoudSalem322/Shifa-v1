import { handle, HttpError, requireUser } from '@/lib/server/auth';
import { listApprovedByRole, ROLES } from '@/lib/server/provider-profile';

/* GET ?role=Hospital|Pharmacy|Doctor — approved profiles only, so they can
   be merged into the public directories any signed-in user browses. */
export const GET = handle(async (request) => {
  await requireUser(request);
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');
  if (!ROLES.includes(role)) throw new HttpError(400, 'دور غير معروف.');
  return Response.json({ items: await listApprovedByRole(role) });
});
