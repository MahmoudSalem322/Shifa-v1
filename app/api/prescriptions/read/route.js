import { handle, HttpError, requireUser } from '@/lib/server/auth';
import { extractPrescription, extractPrescriptionWithVision, visionConfigured } from '@/lib/server/prescription-ai';
import { COLLECTION, publicPrescription } from '@/lib/server/prescriptions';
import { store } from '@/lib/server/store';
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, sniffType } from '@/lib/files';
import { createRateLimit } from '@/lib/server/rate-limit';

const rateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'قرأت وصفات كثيرة خلال وقت قصير. حاول بعد قليل.'
});

/* The largest allowed file plus room for the multipart envelope. */
const MAX_BODY_BYTES = Math.max(MAX_IMAGE_BYTES, MAX_PDF_BYTES) + 512 * 1024;

/* Browser-side OCR can take a while on first use while language data is cached. */
export const maxDuration = 120;

/* POST /api/prescriptions/read (multipart: file + ocrText)
   Module 7 · Feature 1: validate the image, receive browser-side OCR text,
   turn it into editable fields, and keep it as a draft for review. */
export const POST = handle(async (request) => {
  const user = await requireUser(request);

  /* Refuse oversized uploads before buffering the body. */
  const declared = Number(request.headers.get('content-length'));
  if (declared && declared > MAX_BODY_BYTES) throw new HttpError(413, 'حجم الملف أكبر من الحد المسموح.');

  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'أرسل صورة الوصفة كملف.');
  }
  const file = form.get('file');
  const ocrText = String(form.get('ocrText') || '').trim();
  if (!file || typeof file === 'string') throw new HttpError(400, 'أرسل صورة الوصفة كملف.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniffType(bytes);
  if (!mediaType) throw new HttpError(415, 'الملف ليس صورة أو PDF صالحاً. الأنواع المسموحة: JPG أو PNG أو WEBP أو GIF أو PDF.');
  const limit = mediaType === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (bytes.length > limit) throw new HttpError(413, 'حجم الملف أكبر من الحد المسموح.');

  if (mediaType === 'application/pdf') throw new HttpError(415, 'قارئ الوصفة المجاني يدعم الصور JPG أو PNG أو WEBP. يمكنك رفع ملف PDF في طلب الدواء مباشرة.');

  /* Without OCR text the server tries the vision reader (when an API key is
     configured). If it is not available or fails, the browser is told to run
     its own OCR and send the text back. */
  let result;
  if (!ocrText) {
    if (!visionConfigured()) throw new HttpError(409, 'سيتم استخدام القراءة المحلية للصورة.', { code: 'client_ocr_required' });
    rateLimit(user.id);
    try {
      result = await extractPrescriptionWithVision({ bytes, mediaType });
    } catch (error) {
      console.error('[shifa] vision prescription read failed, falling back to browser OCR', error && error.message);
      throw new HttpError(409, 'تعذّرت القراءة الذكية، سيتم استخدام القراءة المحلية.', { code: 'client_ocr_required' });
    }
  } else {
    rateLimit(user.id);
    result = extractPrescription({ text: ocrText });
  }

  const record = await store.update(COLLECTION, (items) => {
    const entry = {
      id: store.newId('rx'),
      userId: user.id,
      status: 'extracted',
      fileName: String(file.name || 'prescription').slice(0, 120),
      mediaType,
      fileSize: bytes.length,
      extracted: result,
      medications: result.medications,
      drugRequestIds: [],
      createdAt: new Date().toISOString()
    };
    return { items: [...items, entry], result: entry };
  });

  return Response.json({ prescription: publicPrescription(record) }, { status: 201 });
});
