'use client';

import { useState } from 'react';
import { Field, Icon } from './ui';
import { auth } from '@/lib/api';

const TYPES = [
  { value: 'image', label: 'صورة', accept: 'image/*', icon: 'image' },
  { value: 'video', label: 'فيديو', accept: 'video/*', icon: 'videocam' },
  { value: 'medical_report', label: 'كشف / تقرير طبي', accept: 'image/*,.pdf,application/pdf', icon: 'description' }
];

export default function EvidenceUpload({ required = false, value, onChange, label = 'إثبات الحاجة المالية' }) {
  const [kind, setKind] = useState(value?.kind || 'image');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = TYPES.find((t) => t.value === kind) || TYPES[0];

  const readFile = (file) => {
    if (!file) return;
    setError('');
    if (file.size > 2.5 * 1024 * 1024) {
      setError('حجم الملف يجب ألا يتجاوز 2.5MB.');
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    fetch('/api/evidence/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + auth.getToken() }, body: form })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || 'تعذر رفع الملف.');
        onChange(body.evidence);
      })
      .catch((e) => setError(e.message || 'تعذر رفع الملف.'))
      .finally(() => setBusy(false));
  };

  return (
    <Field label={label} required={required} hint="يمكن إرفاق صورة، فيديو، أو كشف/تقرير طبي. تتم مراجعة الإثبات من الإدارة قبل ظهور الطلب للمتبرعين.">
      <div className="flex flex-col gap-space-xs rounded-xl border border-border-soft bg-surface-subtle p-space-sm">
        <div className="grid grid-cols-3 gap-1">
          {TYPES.map((t) => (
            <button key={t.value} type="button" onClick={() => { setKind(t.value); onChange(value ? { ...value, kind: t.value } : null); }} className={'flex items-center justify-center gap-1 rounded-lg px-2 py-2 font-label-sm text-label-sm ' + (kind === t.value ? 'bg-primary-container text-on-primary' : 'bg-surface-card text-text-muted')}>
              <Icon name={t.icon} className="text-[18px]" />{t.label}
            </button>
          ))}
        </div>
        <input type="file" accept={selected.accept} onChange={(e) => readFile(e.target.files?.[0])} className="block w-full text-sm" />
        {value?.name ? <div className="flex items-center gap-2 text-state-success font-body-sm"><Icon name="check_circle" /> {value.name}</div> : null}
        {busy ? <p className="font-body-sm text-state-info">جارٍ رفع الإثبات…</p> : null}
        {error ? <p className="font-body-sm text-state-danger">{error}</p> : null}
      </div>
    </Field>
  );
}
