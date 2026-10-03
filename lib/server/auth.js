import 'server-only';
import { claimOf } from '@/lib/api';
import { roles } from '@/lib/vocab';
import { ADMIN_ISSUER, verifyAdminToken } from './admin-auth';
import { touchSession } from './sessions';
import { verifyLocalToken, LOCAL_AUTH_ISSUER } from './local-auth';
import { doctors, facilities, pharmacies, medicines, upsert, isApproved, canSeeRecord, uniqueDoctors } from './directory';
import { store } from './store';

/* Identifies the caller of a route handler from the same Bearer token the
   browser sends to the Shifaa .NET API.

   This app does not hold the API's signing key, so it cannot verify the
   JWT itself. Instead it asks the API: a request to an authorised
   endpoint comes back 401 for a bad or expired token, and 404 (or 200 /
   403) for a genuine one. Any other answer (5xx, 429, a proxy error page)
   proves nothing, so the request is refused with 503 rather than trusted.
   Only then are the token's claims trusted.
   Results are cached briefly so a page load does not hit Render per call. */

export const API_BASE = '';

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}

function decodePayload(token) {
  const part = String(token).split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

async function tokenIsGenuine(token) {
  const hit = cache.get(token);
  if (hit && hit.expires > Date.now()) return hit.ok;

  /* GET /api/medicines/{id} needs any valid token; id 0 never exists, so
     a genuine token gets 404 and a forged or expired one gets 401. */
  let response;
  try {
    response = await fetch(API_BASE + '/api/medicines/0', {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
      signal: AbortSignal.timeout(90000)
    });
  } catch {
    throw new HttpError(503, 'تعذّر التحقق من الجلسة لأن خادم شفاء لا يستجيب. حاول بعد قليل.');
  }

  let ok;
  if (response.status === 401) ok = false;
  else if (response.ok || response.status === 404 || response.status === 403) ok = true;
  else throw new HttpError(503, 'تعذّر التحقق من الجلسة الآن لأن خادم شفاء لا يعمل كما يجب. حاول بعد قليل.');

  cache.set(token, { ok, expires: Date.now() + CACHE_MS });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return ok;
}

/* Returns { token, id, name, email, role } or throws HttpError(401). */
export async function requireUser(request) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, 'يجب تسجيل الدخول أولاً.');

  const claims = decodePayload(token);
  if (!claims) throw new HttpError(401, 'رمز الجلسة غير صالح.');

  /* Local Shifaa accounts are signed and verified entirely by this app. */
  if (claims.iss === LOCAL_AUTH_ISSUER) {
    const local = verifyLocalToken(token);
    if (!local) throw new HttpError(401, 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
    const localUser = { token, id: String(local.id || local.sub), name: local.name || '', email: local.email || '', phone: local.phone || '', role: roles.normalize(local.role || '') };
    await touchSession(localUser);
    return localUser;
  }

  /* The admin's token is signed by this app, not the .NET API. */
  if (claims.iss === ADMIN_ISSUER) {
    const admin = verifyAdminToken(token);
    if (!admin) throw new HttpError(401, 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');
    const adminUser = { token, id: admin.sub, name: admin.name || '', email: admin.email || '', role: 'Admin' };
    await touchSession(adminUser);
    return adminUser;
  }

  if (claims.exp && claims.exp * 1000 < Date.now()) throw new HttpError(401, 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');

  if (!(await tokenIsGenuine(token))) throw new HttpError(401, 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى.');

  const email = claimOf(claims, 'email') || '';
  const id = claimOf(claims, 'id') ?? email;
  if (id === undefined || id === '') throw new HttpError(401, 'تعذّر تحديد هوية المستخدم من رمز الجلسة.');

  const user = {
    token,
    id: String(id),
    name: claimOf(claims, 'name') || '',
    email,
    role: roles.normalize(claimOf(claims, 'role') || '')
  };
  await touchSession(user);
  return user;
}

export function isAdmin(user) {
  return !!user && user.role === 'Admin';
}

export function requireRole(user, allowed, message) {
  if (!allowed.includes(user.role)) {
    throw new HttpError(403, message || 'لا تملك صلاحية تنفيذ هذا الإجراء.');
  }
}

/* Calls the .NET API on the user's behalf. */
export async function backend(user, method, path, body) {
  /* Local mode: server modules use the same contract without an HTTP call
     back into the app or reaching the retired .NET service. */
  if (!API_BASE) {
    const cleanPath = String(path || '').split('?')[0];
    const query = new URLSearchParams(String(path || '').includes('?') ? String(path).split('?')[1] : '');
    const unwrap = (item) => item ? { ok: true, status: 200, payload: { data: item } } : { ok: false, status: 404, payload: null };
    if (method === 'GET') {
      if (cleanPath === '/api/doctors') {
        let items = uniqueDoctors((await doctors()).filter(isApproved));
        const q = (query.get('specialization') || query.get('specialty') || '').toLowerCase();
        const area = (query.get('area') || '').toLowerCase();
        if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
        if (area) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(area));
        return { ok: true, status: 200, payload: { data: items } };
      }
      if (cleanPath.startsWith('/api/doctors/search')) {
        let items = uniqueDoctors((await doctors()).filter(isApproved));
        const q = (query.get('specialization') || query.get('specialty') || query.get('name') || '').toLowerCase();
        const area = (query.get('area') || '').toLowerCase();
        if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
        if (area) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(area));
        return { ok: true, status: 200, payload: { data: items } };
      }
      if (cleanPath === '/api/doctors/me') {
        const item = (await doctors()).find(x => 
          String(x.userId || x.accountId || '') === String(user.id) ||
          (x.email && String(x.email).toLowerCase() === String(user.email).toLowerCase())
        );
        return unwrap(item || { id: user.id, userId: user.id, name: user.name, email: user.email, phone: user.phone, role: 'Doctor' });
      }
      const dm = cleanPath.match(/^\/api\/doctors\/([^/]+)$/);
      if (dm) return unwrap((await doctors()).find(x => String(x.id) === decodeURIComponent(dm[1]) && canSeeRecord(x, user)));
      if (cleanPath === '/api/facilities' || cleanPath === '/api/facilities/search') {
        let items = (await facilities()).filter(isApproved);
        const q = (query.get('name') || query.get('search') || '').toLowerCase();
        const area = (query.get('area') || '').toLowerCase();
        if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
        if (area) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(area));
        return { ok: true, status: 200, payload: { data: items } };
      }
      if (cleanPath === '/api/facilities/me') {
        const item = (await facilities()).find(x => String(x.userId || x.accountId || '') === String(user.id));
        return unwrap(item || { id: user.id, userId: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role });
      }
      const fm = cleanPath.match(/^\/api\/facilities\/([^/]+)$/);
      if (fm) return unwrap((await facilities()).find(x => String(x.id) === decodeURIComponent(fm[1]) && canSeeRecord(x, user)));
      if (cleanPath === '/api/pharmacies' || cleanPath === '/api/pharmacies/search') {
        let items = (await pharmacies()).filter(isApproved);
        const q = (query.get('name') || query.get('search') || '').toLowerCase();
        const area = (query.get('area') || '').toLowerCase();
        if (q) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(q));
        if (area) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(area));
        return { ok: true, status: 200, payload: { data: items } };
      }
      if (cleanPath === '/api/pharmacies/me') {
        const item = (await pharmacies()).find(x => String(x.userId || x.accountId || '') === String(user.id));
        return unwrap(item || { id: user.id, userId: user.id, name: user.name, email: user.email, phone: user.phone, role: 'Pharmacy' });
      }
      const pm = cleanPath.match(/^\/api\/pharmacies\/([^/]+)$/);
      if (pm) return unwrap((await pharmacies()).find(x => String(x.id) === decodeURIComponent(pm[1]) && canSeeRecord(x, user)));
      if (cleanPath === '/api/medicines' || cleanPath === '/api/medicines/list' || cleanPath === '/api/medicines/search') {
        let items = await medicines();
        const q = (query.get('name') || '').toLowerCase();
        const cat = (query.get('category') || '').toLowerCase();
        const area = (query.get('area') || '').toLowerCase();
        if (q) items = items.filter(x => String(x.name || '').toLowerCase().includes(q) || String(x.scientificName || '').toLowerCase().includes(q));
        if (cat) items = items.filter(x => String(x.category || '').toLowerCase() === cat);
        if (area) items = items.filter(x => JSON.stringify(x).toLowerCase().includes(area));
        return { ok: true, status: 200, payload: { data: items } };
      }
      const mm = cleanPath.match(/^\/api\/medicines\/([^/]+)$/);
      if (mm) return unwrap((await medicines()).find(x => String(x.id) === decodeURIComponent(mm[1])));
      if (cleanPath.startsWith('/api/drugrequests/my')) {
        const items = (await store.read('drug-requests')).filter(x => String(x.userId) === String(user.id));
        return { ok: true, status: 200, payload: { data: items } };
      }
    }
    return { ok: false, status: 404, payload: { message: 'الواجهة المحلية لا تدعم هذا المسار بعد.' } };
  }
  const headers = { Authorization: 'Bearer ' + user.token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(90000)
    });
  } catch {
    throw new HttpError(503, 'تعذّر الوصول إلى خادم شفاء. حاول بعد قليل.');
  }
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  return { ok: response.ok, status: response.status, payload };
}

/* Wraps a handler so thrown HttpErrors become JSON responses. */
export function handle(fn) {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (error) {
      if (error instanceof HttpError) {
        return Response.json({ message: error.message, ...(error.extra || {}) }, { status: error.status });
      }
      console.error('[shifa] route handler failed', error);
      return Response.json({ message: 'حدث خطأ غير متوقع في الخادم.' }, { status: 500 });
    }
  };
}

export async function readJson(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'صيغة الطلب غير صحيحة.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'صيغة الطلب غير صحيحة.');
  return body;
}

/* Trimmed string capped at `max` characters. */
export function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

/* ASP.NET-style validation envelope so the client's fieldErrors() works. */
export function validationError(errors) {
  const first = Object.values(errors)[0];
  return new HttpError(400, Array.isArray(first) ? first[0] : String(first), { errors });
}
