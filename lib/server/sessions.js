import 'server-only';
import { store } from './store';

/* Real presence tracking. There is no login "event" to hook — auth lives
   on the .NET API — so instead every authenticated request (any call to
   requireUser in lib/server/auth.js) touches this user's row with "now".
   A user is "online" if their last touch was within ONLINE_WINDOW_MS.
   This is the same trick every "N users online now" indicator uses. */

export const COLLECTION = 'sessions';
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const THROTTLE_MS = 60 * 1000;
const lastTouch = new Map();

export async function touchSession(user) {
  if (!user || !user.id) return;
  const last = lastTouch.get(user.id) || 0;
  if (Date.now() - last < THROTTLE_MS) return;
  lastTouch.set(user.id, Date.now());
  const now = new Date().toISOString();
  try {
    await store.update(COLLECTION, (items) => {
      const others = items.filter((item) => item.id !== user.id);
      const existing = items.find((item) => item.id === user.id);
      const next = [
        {
          id: user.id,
          name: user.name || (existing && existing.name) || '',
          email: user.email || (existing && existing.email) || '',
          role: user.role,
          firstSeenAt: (existing && existing.firstSeenAt) || now,
          lastSeenAt: now
        },
        ...others
      ].slice(0, 5000);
      return { items: next, result: null };
    });
  } catch (error) {
    /* Presence tracking must never break the request that triggered it. */
    console.error('[shifa] could not update session presence', error);
  }
}

export async function listSessions() {
  const items = await store.read(COLLECTION);
  const now = Date.now();
  return items
    .map((item) => ({ ...item, online: now - new Date(item.lastSeenAt).getTime() < ONLINE_WINDOW_MS }))
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}
