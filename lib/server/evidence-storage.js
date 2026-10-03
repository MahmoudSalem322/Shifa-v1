import 'server-only';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { HttpError } from './auth';
import { DATA_DIR } from './store';

const URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = process.env.SHIFA_EVIDENCE_BUCKET || 'shifaa-evidence';

function configured() { return !!(URL && KEY); }
function headers(extra = {}) { return { apikey: KEY, Authorization: `Bearer ${KEY}`, ...extra }; }
function safePath(value) {
  const p = String(value || '').replace(/\\/g, '/');
  if (!p || p.includes('..') || p.startsWith('/') || p.includes('//')) throw new HttpError(400, 'مسار الملف غير صالح.');
  return p;
}

export async function uploadEvidence({ userId, bytes, mimeType, originalName }) {
  const safe = String(originalName || 'evidence').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100);
  const objectPath = `${String(userId)}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${safe}`;

  if (configured()) {
    const response = await fetch(`${URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: 'POST', headers: headers({ 'Content-Type': mimeType || 'application/octet-stream', 'x-upsert': 'false' }), body: bytes
    });
    if (!response.ok) throw new HttpError(502, 'تعذر حفظ ملف الإثبات. حاول مجدداً.');
    return { bucket: BUCKET, path: objectPath, mimeType: mimeType || '', name: String(originalName || 'إثبات الحاجة').slice(0, 120) };
  }

  const localRoot = path.join(DATA_DIR, 'evidence');
  const target = path.join(localRoot, objectPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  await fs.writeFile(target + '.json', JSON.stringify({ mimeType: mimeType || 'application/octet-stream', name: String(originalName || 'إثبات الحاجة').slice(0, 120) }), 'utf8');
  return { bucket: 'local', path: objectPath, mimeType: mimeType || '', name: String(originalName || 'إثبات الحاجة').slice(0, 120) };
}

export async function signedEvidenceUrl(objectPath, expiresIn = 600) {
  const clean = safePath(objectPath);
  if (!configured()) return null;
  const response = await fetch(`${URL}/storage/v1/object/sign/${BUCKET}/${clean}`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn })
  });
  if (!response.ok) throw new HttpError(404, 'ملف الإثبات غير متاح.');
  const body = await response.json();
  const signed = body.signedURL || body.signedUrl || body.url;
  if (!signed) throw new HttpError(404, 'ملف الإثبات غير متاح.');
  return signed.startsWith('http') ? signed : `${URL}/storage/v1${signed}`;
}

export async function readLocalEvidence(objectPath) {
  const clean = safePath(objectPath);
  if (configured()) return null;
  const file = path.join(DATA_DIR, 'evidence', clean);
  try {
    const [bytes, metaText] = await Promise.all([fs.readFile(file), fs.readFile(file + '.json', 'utf8').catch(() => '{}')]);
    let meta = {};
    try { meta = JSON.parse(metaText); } catch {}
    return { bytes, mimeType: meta.mimeType || 'application/octet-stream', name: meta.name || 'إثبات الحاجة' };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/* Reads a stored file as bytes, from the local disk or from Supabase
   Storage, so a route can return it directly. A redirect to a Supabase URL
   cannot be followed by a fetch() from the page (cross-origin), and the
   page has to use fetch() because the file sits behind the Bearer token. */
export async function readEvidence(objectPath) {
  const local = await readLocalEvidence(objectPath);
  if (local) return local;
  const url = await signedEvidenceUrl(objectPath);
  if (!url) return null;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return null;
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type') || 'application/octet-stream',
    name: 'ملف'
  };
}
