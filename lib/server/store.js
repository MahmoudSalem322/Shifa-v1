import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/* Storage for the features the Shifaa .NET API does not cover yet
   (appointment history, donations, prescription reads, notifications,
   medicine demand alerts, help requests, live sessions).

   Two backends behind the same store.read / store.update interface:

   - Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set): one row per
     collection in the `kv_store` table (see supabase/schema.sql), the
     whole collection stored as a JSON array in `value`. This survives
     serverless redeploys (Vercel) because it is a real database, not
     the instance's disk.
   - JSON files under ./data (no Supabase env vars set): the original
     MVP stand-in, handy for local dev without a Supabase project. Not
     suitable for serverless hosting — Vercel's filesystem is read-only
     apart from /tmp, which is wiped on every redeploy. */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const useSupabase = !!(SUPABASE_URL && SUPABASE_KEY);

export const DATA_DIR = process.env.SHIFA_DATA_DIR ||
  (process.env.VERCEL ? path.join('/tmp', 'shifa-data') : path.join(process.cwd(), 'data'));
const queues = new Map();

/* ---- Supabase backend: PostgREST directly, no extra dependency ----
   Each collection is one row. Serverless functions run in many instances at
   once, so a plain read-modify-write would silently lose updates (two people
   signing up at the same moment, for example). Every write therefore carries
   the row's `rev` and only succeeds if nobody changed the row meanwhile;
   otherwise store.update re-reads and re-applies its change. */

const restHeaders = () => ({ apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY });
const restUrl = (query) => SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/kv_store' + query;
let casSupported = true; /* false if the `rev` column has not been added yet */

class ConflictError extends Error {}

async function supabaseReadRow(collection) {
  const select = casSupported ? 'value,rev' : 'value';
  const response = await fetch(restUrl('?key=eq.' + encodeURIComponent(collection) + '&select=' + select), { headers: restHeaders(), cache: 'no-store' });
  if (!response.ok) {
    const body = await response.text();
    if (casSupported && response.status === 400 && /rev/i.test(body)) {
      console.warn('[shifa] kv_store.rev column missing — run supabase/schema.sql to enable safe concurrent writes');
      casSupported = false;
      return supabaseReadRow(collection);
    }
    throw new Error('Supabase read failed (' + response.status + '): ' + body);
  }
  const rows = await response.json();
  const row = rows[0];
  return { exists: !!row, rev: row && Number.isFinite(Number(row.rev)) ? Number(row.rev) : 0, items: row && Array.isArray(row.value) ? row.value : [] };
}

async function supabaseWriteRow(collection, items, prev) {
  if (!casSupported) {
    const response = await fetch(restUrl('?on_conflict=key'), {
      method: 'POST',
      headers: { ...restHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ key: collection, value: items }])
    });
    if (!response.ok) throw new Error('Supabase write failed (' + response.status + '): ' + (await response.text()));
    return;
  }
  let response;
  if (prev.exists) {
    response = await fetch(restUrl('?key=eq.' + encodeURIComponent(collection) + '&rev=eq.' + prev.rev), {
      method: 'PATCH',
      headers: { ...restHeaders(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ value: items, rev: prev.rev + 1 })
    });
  } else {
    response = await fetch(restUrl('?on_conflict=key'), {
      method: 'POST',
      headers: { ...restHeaders(), 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify([{ key: collection, value: items, rev: 1 }])
    });
  }
  if (!response.ok) throw new Error('Supabase write failed (' + response.status + '): ' + (await response.text()));
  const written = await response.json();
  if (!Array.isArray(written) || written.length === 0) throw new ConflictError('kv_store row changed concurrently');
}

function requireDurableStorage() {
  if (!useSupabase && process.env.VERCEL) {
    console.error('[shifa] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set: on Vercel the local disk is wiped on every deploy, so data cannot be saved.');
    throw new Error('التخزين الدائم غير مهيأ: أضف SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في إعدادات Vercel.');
  }
}

function fileFor(collection) {
  if (!/^[a-z-]+$/.test(collection)) throw new Error('Invalid collection name');
  return path.join(DATA_DIR, collection + '.json');
}

async function readFile(collection) {
  try {
    const text = await fs.readFile(fileFor(collection), 'utf8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeFile(collection, items) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const target = fileFor(collection);
  const temp = target + '.' + process.pid + '.tmp';
  await fs.writeFile(temp, JSON.stringify(items, null, 2), 'utf8');
  /* On Windows an antivirus or indexer holding the target briefly makes
     rename fail with EPERM / EBUSY; a short retry gets past it. */
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(temp, target);
      return;
    } catch (error) {
      if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) {
        await fs.rm(temp, { force: true }).catch(() => {});
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

/* Runs `fn` with exclusive access to the collection. Supabase itself
   handles concurrent writers safely (each write is one row upsert), but
   this still serialises within a single server instance so a read-modify
   write pair (store.update) never interleaves with itself. */
function exclusive(collection, fn) {
  const previous = queues.get(collection) || Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  queues.set(collection, next.catch(() => {}));
  return next;
}

async function readCollection(collection) {
  requireDurableStorage();
  return useSupabase ? (await supabaseReadRow(collection)).items : readFile(collection);
}

export const store = {
  backend: useSupabase ? 'supabase' : 'json-file',

  read(collection) {
    return exclusive(collection, () => readCollection(collection));
  },

  /* `mutate(items)` returns { items, result }; items are persisted and
     result is handed back to the caller. Throwing aborts the write. With
     Supabase the change is retried if another instance wrote in between,
     so `mutate` must be safe to run more than once. */
  update(collection, mutate) {
    return exclusive(collection, async () => {
      requireDurableStorage();
      if (!useSupabase) {
        const items = await readFile(collection);
        const { items: nextItems, result } = await mutate(items);
        await writeFile(collection, nextItems);
        return result;
      }
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const prev = await supabaseReadRow(collection);
        const { items: nextItems, result } = await mutate(prev.items);
        try {
          await supabaseWriteRow(collection, nextItems, prev);
          return result;
        } catch (error) {
          if (!(error instanceof ConflictError)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60 * (attempt + 1)));
        }
      }
      throw new Error('Supabase write conflict on "' + collection + '" after several retries');
    });
  },

  newId(prefix) {
    return prefix + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  }
};
