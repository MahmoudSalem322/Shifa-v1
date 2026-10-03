import { handle, HttpError, isAdmin, requireUser } from '@/lib/server/auth';
import { store } from '@/lib/server/store';

export const GET = handle(async (request) => {
  const user = await requireUser(request);
  if (!isAdmin(user)) throw new HttpError(403, 'مطابقة التبرعات متاحة للإدارة فقط.');
  const requests = (await store.read('drug-requests')).filter((r) => !/fulfilled|completed|delivered|rejected|cancel/i.test(String(r.status || 'pending')));
  const donations = (await store.read('donations')).filter((d) => ['approved','matched'].includes(d.status) && Number(d.availableQuantity ?? d.quantity ?? 0) > 0);
  const profiles = (await store.read('provider-profiles')).filter((p) => p.status === 'approved' && ['Hospital','Pharmacy'].includes(p.role));
  return Response.json({
    requests: requests.map((r) => ({ id:r.id, medicineName:r.medicineName, quantity:r.quantity, status:r.status, userName:r.userName })),
    donations: donations.map((d) => ({ id:d.id, medicineName:d.medicineName, quantity:d.quantity, availableQuantity:d.availableQuantity, unit:d.unit, governorate:d.governorate })),
    providers: profiles.map((p) => ({ userId:String(p.userId), role:p.role, name:p.data?.name || p.data?.fullName || '', area:p.data?.area || '', address:p.data?.address || '' }))
  });
});
