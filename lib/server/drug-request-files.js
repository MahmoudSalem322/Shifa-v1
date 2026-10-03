import 'server-only';
import { HttpError } from './auth';
import { sniffType } from '@/lib/files';
import { uploadEvidence } from './evidence-storage';

/* The prescription attached to a drug request. Checked by content (not the
   declared type) and kept in the same private storage as evidence files. */
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

export async function savePrescriptionFile(user, file) {
  if (!file || typeof file === 'string' || !file.size) return null;
  if (file.size > MAX_BYTES) throw new HttpError(413, 'حجم الوصفة يجب ألا يتجاوز 3MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffType(bytes);
  if (!type || !ALLOWED.has(type)) throw new HttpError(415, 'نوع الوصفة غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF أو PDF.');
  const stored = await uploadEvidence({ userId: user.id, bytes, mimeType: type, originalName: file.name });
  return { path: stored.path, mimeType: type, name: stored.name };
}
