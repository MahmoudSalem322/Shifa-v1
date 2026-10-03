'use client';

import { useState } from 'react';
import { auth } from '@/lib/api';

/* Opens an evidence file (image / video / PDF) in a new tab.

   The file endpoint needs the Bearer token, which a plain <a href> never
   sends — it always came back 401. So the file is fetched with the token,
   turned into a blob URL and opened from that. The tab is opened first,
   inside the click, so the browser's pop-up blocker lets it through. */
export default function EvidenceLink({ evidence, className = 'text-primary font-label-md', children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!evidence?.path) return null;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const tab = window.open('', '_blank');
    try {
      const url = '/api/evidence/' + String(evidence.path).split('/').map(encodeURIComponent).join('/');
      const response = await fetch(url, { headers: { Authorization: 'Bearer ' + auth.getToken() } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'تعذر فتح ملف الإثبات.');
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = blobUrl;
      else window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    } catch (e) {
      if (tab) tab.close();
      setError(e.message || 'تعذر فتح ملف الإثبات.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={open} disabled={busy} className={className + ' text-start underline-offset-2 hover:underline disabled:opacity-60'}>
        {busy ? 'جارٍ فتح الملف…' : children}
      </button>
      {error ? <span className="font-body-sm text-body-sm text-state-danger">{error}</span> : null}
    </span>
  );
}
