import { handle, HttpError, requireUser } from '@/lib/server/auth';
import { uploadEvidence } from '@/lib/server/evidence-storage';
import { sniffType } from '@/lib/files';

export const runtime = 'nodejs';
export const maxDuration = 30;
const MAX_BYTES = 2.5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf']);

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const length = Number(request.headers.get('content-length'));
  if (length && length > 3.8 * 1024 * 1024) throw new HttpError(413, 'حجم الملف كبير جداً. الحد الأقصى 2.5MB.');
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const kind = String(form?.get('kind') || 'image');
  if (!file || typeof file === 'string') throw new HttpError(400, 'أرسل ملف الإثبات.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new HttpError(413, 'حجم الملف يجب ألا يتجاوز 2.5MB.');
  const detected = sniffType(bytes);
  if (!detected || !ALLOWED.has(detected)) throw new HttpError(415, 'نوع الملف غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF أو MP4 أو WEBM أو PDF.');
  if (kind === 'video' && !detected.startsWith('video/')) throw new HttpError(400, 'اختر ملف فيديو صالحاً.');
  if (kind !== 'video' && detected.startsWith('video/')) throw new HttpError(400, 'الفيديو يحتاج اختيار نوع الإثبات «فيديو».');
  const evidence = await uploadEvidence({ userId: user.id, bytes, mimeType: detected, originalName: file.name });
  return Response.json({ evidence: { ...evidence, kind, size: bytes.length } }, { status: 201 });
});
