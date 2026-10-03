import { handle, HttpError, requireUser } from '@/lib/server/auth';import { medicines } from '@/lib/server/directory';
export const GET=handle(async(request,{params})=>{await requireUser(request);const {id}=await params;const d=(await medicines()).find(x=>String(x.id)===String(id));if(!d)throw new HttpError(404,'لم يتم العثور على الدواء.');return Response.json({data:d})});
