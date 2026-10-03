'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useState } from 'react';
import { useSession } from '@/lib/hooks';
import { api, pick, toItem, toList } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { notifications } from '@/lib/notifications';
import { formatDateTime } from '@/lib/vocab';
import { PageBody, PageHeader, RoleGate } from '@/components/app-shell';
import { PrescriptionUpload } from '@/components/prescription-upload';
import { useToast } from '@/components/toast';
import { AsyncBlock, Badge, Button, Card, CardTitle, Icon, inputClass } from '@/components/ui';

/* Module 7 — AI Prescription Reader.
   Feature 1: upload → validate → AI extraction (POST /api/prescriptions/read)
              → review and edit → confirm (PATCH …/{id} action=confirm).
   Feature 2: confirmed medicines become drug requests on the .NET API
              (POST /api/drugrequests, with the prescription attached), and
              the prescription is linked to them (PATCH …/{id} action=link). */

const PRESCRIPTION_STATUS = {
  extracted: { label: 'بانتظار المراجعة', cls: 'bg-state-warning-subtle text-state-warning', icon: 'rate_review' },
  confirmed: { label: 'مؤكدة', cls: 'bg-state-info-subtle text-state-info', icon: 'fact_check' },
  requested: { label: 'تم إرسال الطلبات', cls: 'bg-state-success-subtle text-state-success', icon: 'task_alt' }
};

const CONFIDENCE = {
  high: { label: 'قراءة واضحة', cls: 'bg-state-success-subtle text-state-success' },
  medium: { label: 'راجِع القراءة', cls: 'bg-state-warning-subtle text-state-warning' },
  low: { label: 'قراءة غير مؤكدة', cls: 'bg-error-container text-state-danger' }
};

/* Rows get a local key so deleting one does not move another row's
   state (errors, focus) onto its neighbour. */
let rowKey = 0;
const keyed = (row) => ({ ...row, _key: ++rowKey });

/* Fields the reader marked as unclear are outlined until the patient edits the row. */
const unsure = (row, field) => !row.edited && Array.isArray(row.uncertainFields) && row.uncertainFields.includes(field);
const UNSURE_CLASS = ' !border-state-warning ring-1 ring-state-warning';

const EMPTY_ROW = { name: '', strength: '', dosage: '', frequency: '', duration: '', quantity: 1, quantityUnit: '', notes: '', confidence: 'high', edited: true };

function StepHeader({ step, reviewCount = 0, requestCount = 0 }) {
  const steps = [
    { label: 'رفع الوصفة' },
    { label: 'مراجعة البيانات', count: reviewCount },
    { label: 'إرسال الطلبات', count: requestCount }
  ];
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="خطوات القراءة">
      {steps.map((item, index) => (
        <li key={item.label} className={'flex items-center gap-2 p-space-xs rounded-xl ' + (index === step ? 'bg-primary-container text-on-primary shadow-sm' : index < step ? 'bg-state-success-subtle text-state-success' : 'bg-surface-card text-text-muted')}>
          <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-label-md shrink-0">
            {index < step ? <Icon name="check" className="text-[18px]" /> : index + 1}
          </span>
          <span className="font-label-md text-label-md">{item.label}</span>
          {item.count > 0 ? <span className="mr-auto min-w-6 h-6 px-1.5 rounded-full bg-white/70 text-text-heading flex items-center justify-center font-label-sm">{item.count}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export default function PrescriptionReaderPage() {
  const toast = useToast();
  const session = useSession();
  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(null);
  const [record, setRecord] = useState(null);      // stored prescription
  const [rows, setRows] = useState([]);            // editable medicines
  const [confirming, setConfirming] = useState(false);
  const [rowErrors, setRowErrors] = useState({});
  const [selected, setSelected] = useState({});
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState({});      // index → { state, id, message }
  const [ocrReady, setOcrReady] = useState(false);
  const [reviewed, setReviewed] = useState(false);   // patient compared every row with the original
  const [previewUrl, setPreviewUrl] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStage, setOcrStage] = useState('');
  const ocrWorkerRef = useRef(null);

  const history = useAsync(async () => toList(await api.prescriptions.mine()), [session?.id]);

  // Never carry review/send state from one signed-in patient to another.
  useEffect(() => { if (!session?.id) return; reset(); }, [session?.id]);

  const step = !record && !rows.length ? 0 : record && record.status !== 'extracted' ? 2 : 1;

  useEffect(() => () => {
    if (ocrWorkerRef.current) ocrWorkerRef.current.terminate().catch(() => {});
  }, []);

  /* The original image stays next to the extracted rows so each one can be checked against it. */
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setFile(null); setRecord(null); setRows([]); setReadError(null);
    setRowErrors({}); setSelected({}); setResults({}); setReviewed(false);
    setOcrProgress(0); setOcrStage('');
  };

  /* ---- Feature 1: read ------------------------------------------- */

  const ensureTesseract = () => new Promise((resolve, reject) => {
    if (window.Tesseract) {
      setOcrReady(true);
      resolve(window.Tesseract);
      return;
    }

    const existing = document.querySelector('script[data-shifaa-tesseract]');
    if (existing) {
      existing.addEventListener('load', () => { setOcrReady(true); resolve(window.Tesseract); }, { once: true });
      existing.addEventListener('error', () => reject(new Error('تعذر تحميل قارئ OCR المجاني. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
    script.async = true;
    script.dataset.shifaaTesseract = 'true';
    script.onload = () => {
      if (window.Tesseract) {
        setOcrReady(true);
        resolve(window.Tesseract);
      } else {
        reject(new Error('تعذر تهيئة قارئ OCR المجاني.'));
      }
    };
    script.onerror = () => reject(new Error('تعذر تحميل قارئ OCR المجاني. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.'));
    document.head.appendChild(script);
  });

  /* Puts a stored prescription on screen as editable rows. */
  const showResult = (prescription) => {
    setRecord(prescription);
    setReviewed(false);
    setRows(prescription.medications.map((m) => keyed({ ...m, quantity: m.quantity ?? '', edited: false })));
    notifications.add({
      type: 'prescription',
      title: 'تمت قراءة الوصفة',
      message: prescription.medications.length
        ? 'استُخرج ' + prescription.medications.length + ' دواء. راجع البيانات قبل التأكيد.'
        : 'لم يتم العثور على أدوية في الصورة.',
      ref: prescription.id
    });
    history.reload();
  };

  /* Multi-pass in-browser OCR (Tesseract). Returns the merged text. */
  const runBrowserOcr = async () => {
    await ensureTesseract();
    if (!ocrWorkerRef.current) {
      ocrWorkerRef.current = await window.Tesseract.createWorker(['ara', 'eng'], 1, {
        logger: (message) => {
          if (message && typeof message.progress === 'number') setOcrProgress(Math.round(message.progress * 100));
        }
      });
    }
    const preprocess = async (source, mode = 'balanced') => {
      const bitmap = await createImageBitmap(source);
      const maxSide = 3200;
      const scale = Math.min(4, Math.max(2, maxSide / Math.max(bitmap.width, bitmap.height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let min = 255;
      let max = 0;
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
        min = Math.min(min, gray);
        max = Math.max(max, gray);
      }
      const range = Math.max(1, max - min);
      for (let i = 0; i < image.data.length; i += 4) {
        const gray = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
        const normalized = Math.max(0, Math.min(255, ((gray - min) * 255) / range));
        let value = normalized;
        if (mode === 'threshold') value = normalized > 178 ? 255 : normalized < 92 ? 0 : normalized;
        if (mode === 'soft') value = Math.max(0, Math.min(255, (normalized - 128) * 1.35 + 128));
        image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      }
      // A light local contrast/sharpen pass helps Arabic handwriting and small
      // prescription print without changing the original upload.
      if (mode === 'sharp') {
        const copy = new Uint8ClampedArray(image.data);
        const w = image.width;
        const h = image.height;
        const at = (x, y) => copy[(y * w + x) * 4];
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = (y * w + x) * 4;
            const center = copy[i];
            const blur = (at(x-1,y) + at(x+1,y) + at(x,y-1) + at(x,y+1)) / 4;
            const value = Math.max(0, Math.min(255, center + (center - blur) * 0.8));
            image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
          }
        }
      }
      ctx.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png');
    };

    setOcrStage('تحسين الصورة ورفع وضوح النص…');
    const balanced = await preprocess(file, 'balanced');
    const sharp = await preprocess(file, 'sharp');
    setOcrStage('قراءة النص العربي والإنجليزي بعدة طرق…');
    const pass = async (image, psm) => {
      await ocrWorkerRef.current.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300'
      });
      const result = await ocrWorkerRef.current.recognize(image);
      const data = result && result.data ? result.data : {};
      const text = String(data.text || '').trim();
      const confidence = Number(data.confidence);
      return { text, confidence: Number.isFinite(confidence) ? confidence : 0 };
    };
    /* Keep the fast path to four OCR passes. The previous version referenced
       `soft` and `threshold` images that were never created, causing
       `ReferenceError: soft is not defined` and stopping the reader. Two
       segmentation modes on the balanced image plus two on the sharpened
       image give useful coverage without the old ten-pass delay. */
    const passes = [];
    for (const [image, psm] of [[balanced, '6'], [balanced, '11'], [sharp, '6'], [sharp, '11']]) {
      passes.push(await pass(image, psm));
    }

    /* Prefer higher-confidence OCR, then add only genuinely new lines from the
       other passes, so the parser does not see six copies of the same medicine. */
    const ranked = passes.filter((item) => item.text).sort((a, b) => b.confidence - a.confidence);
    const normalizeOcrLine = (line) => String(line || '')
      .toLowerCase()
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/[إأآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    const mergedLines = [];
    const seenLines = [];
    const similarity = (a, b) => {
      if (!a || !b) return 0;
      if (a === b) return 1;
      if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
      const at = new Set(a.split(' '));
      const bt = new Set(b.split(' '));
      const intersection = [...at].filter((x) => bt.has(x)).length;
      return intersection / Math.max(1, new Set([...at, ...bt]).size);
    };
    for (const item of ranked) {
      for (const line of item.text.split(/\n+/).map((v) => v.trim()).filter(Boolean)) {
        const normalized = normalizeOcrLine(line);
        if (!normalized || normalized.length < 2) continue;
        if (seenLines.some((existing) => similarity(existing, normalized) >= 0.82)) continue;
        seenLines.push(normalized);
        mergedLines.push(line);
      }
    }
    const ocrText = mergedLines.join('\n').slice(0, 12000);
    if (!ocrText) throw new Error('لم يتم التعرف على نص من الصورة. صوّر الوصفة بوضوح أكبر.');
    return ocrText;
  };

  const read = async () => {
    if (!file) return setReadError({ message: 'اختر صورة الوصفة أولاً.' });
    if (file.type === 'application/pdf') return setReadError({ message: 'القارئ المجاني يدعم صور JPG وPNG وWEBP فقط. لملفات PDF، أرفقها مباشرة بطلب الدواء.' });
    setReading(true);
    setReadError(null);
    setOcrProgress(0);
    try {
      /* 1) Server-side smart reader when it is configured. */
      setOcrStage('جارٍ قراءة الوصفة…');
      const first = new FormData();
      first.append('file', file);
      try {
        const response = await api.prescriptions.read(first);
        showResult(response.prescription);
        return;
      } catch (error) {
        if (!(error && error.payload && error.payload.code === 'client_ocr_required')) throw error;
      }

      /* 2) Otherwise read the text in the browser and send it. */
      const ocrText = await runBrowserOcr();
      const form = new FormData();
      form.append('file', file);
      form.append('ocrText', ocrText);
      const response = await api.prescriptions.read(form);
      showResult(response.prescription);
    } catch (error) {
      setReadError(error);
    } finally {
      setReading(false);
      setOcrProgress(0);
      setOcrStage('');
    }
  };

  const startManual = () => {
    setReadError(null);
    setRecord(null);
    setRows([keyed(EMPTY_ROW)]);
  };

  /* ---- review / edit --------------------------------------------- */

  const updateRow = (index, key, value) => {
    setRows((list) => list.map((row, i) => (i === index ? { ...row, [key]: value, edited: true } : row)));
    setRowErrors((errors) => ({ ...errors, [index]: undefined }));
  };

  const removeRow = (index) => {
    setRows((list) => list.filter((_, i) => i !== index));
    setRowErrors((errors) => {
      const next = {};
      Object.entries(errors).forEach(([key, value]) => {
        const i = Number(key);
        if (i < index) next[i] = value;
        else if (i > index) next[i - 1] = value;
      });
      return next;
    });
  };

  const validateRows = () => {
    const errors = {};
    rows.forEach((row, index) => {
      const quantity = Number(row.quantity);
      if (String(row.name).trim().length < 2) errors[index] = 'اسم الدواء مطلوب.';
      else if (!Number.isInteger(quantity) || quantity < 1) errors[index] = 'أدخل كمية صحيحة.';
    });
    setRowErrors(errors);
    return !Object.keys(errors).length;
  };

  const confirm = async () => {
    if (!rows.length) return toast('أضف دواءً واحداً على الأقل.');
    if (!reviewed) return toast('قارن كل دواء بالوصفة الأصلية ثم فعّل خيار المراجعة قبل التأكيد.');
    if (!validateRows()) return toast('راجع الحقول المظللة قبل التأكيد.');
    setConfirming(true);
    const medications = rows.map(({ _key, ...row }) => ({ ...row, quantity: Number(row.quantity) }));
    try {
      const response = record
        ? await api.prescriptions.confirm(record.id, medications)
        : await api.prescriptions.createManual(medications, file ? file.name : '');
      setRecord(response.prescription);
      setRows(response.prescription.medications.map(keyed));
      setSelected(Object.fromEntries(response.prescription.medications.map((_, i) => [i, true])));
      toast('تم تأكيد بيانات الوصفة وحفظها.');
      history.reload();
    } catch (error) {
      toast(error.message);
    } finally {
      setConfirming(false);
    }
  };

  /* ---- Feature 2: send as drug requests --------------------------- */

  const sendRequests = async () => {
    const indexes = rows.map((_, i) => i).filter((i) => selected[i] && !(results[i] && results[i].state === 'sent'));
    if (!indexes.length) return toast('اختر دواءً واحداً على الأقل.');
    setSending(true);
    const created = [];
    for (const index of indexes) {
      const med = rows[index];
      setResults((r) => ({ ...r, [index]: { state: 'sending' } }));
      const payload = new FormData();
      payload.append('medicineName', [med.name, med.strength].filter(Boolean).join(' '));
      payload.append('quantity', String(med.quantity));
      payload.append('notes', [
        med.dosage && 'الجرعة: ' + med.dosage,
        med.frequency && 'التكرار: ' + med.frequency,
        med.duration && 'المدة: ' + med.duration,
        med.notes,
        'من وصفة مقروءة عبر قارئ الوصفات الذكي (' + record.id + ')'
      ].filter(Boolean).join(' | ').slice(0, 1000));
      if (file) payload.append('prescription', file);
      try {
        const response = await api.drugRequests.create(payload);
        const id = pick(toItem(response) || {}, 'id', 'requestId', 'drugRequestId');
        created.push({ id: id ?? '', medicineName: med.name, quantity: med.quantity });
        setResults((r) => ({ ...r, [index]: { state: 'sent', id } }));
      } catch (error) {
        setResults((r) => ({ ...r, [index]: { state: 'failed', message: error.status === 403 ? 'طلب الأدوية متاح لحسابات المرضى فقط.' : error.message } }));
      }
    }

    const linkable = created.filter((c) => c.id !== '');
    if (linkable.length) {
      try {
        const response = await api.prescriptions.link(record.id, linkable);
        setRecord(response.prescription);
        notifications.add({
          type: 'drug_submitted',
          title: 'تم إرسال طلبات الوصفة',
          message: 'أُرسل ' + linkable.length + ' طلب دواء من الوصفة المقروءة.',
          ref: record.id
        });
        history.reload();
      } catch (error) {
        toast('أُرسلت الطلبات لكن تعذّر ربطها بالوصفة: ' + error.message);
      }
    }
    setSending(false);
  };

  return (
    <>
      <PageHeader title="قارئ الوصفات الطبية" subtitle="Tesseract.js OCR متعدد المراحل — عربي + إنجليزي — مع مراجعة إلزامية قبل إرسال أي طلب" />
      <PageBody>
        <RoleGate allow={['Patient']} message="قارئ الوصفات متاح لحسابات المرضى فقط">
          <StepHeader
            step={step}
            reviewCount={rows.length}
            requestCount={Object.values(results).filter((result) => result && (result.state === 'sent' || result.state === 'sending')).length}
          />

          {/* Step 1 — upload */}
          {step === 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-space-lg">
              <Card className="lg:col-span-3">
                <CardTitle icon="document_scanner">ارفع صورة الوصفة</CardTitle>
                <PrescriptionUpload file={file} onChange={(f) => { setFile(f); setReadError(null); }} allowPdf={false} label="صورة الوصفة" optional={false} />
                {readError ? (
                  <div className="p-space-sm rounded-xl flex items-start gap-2 font-label-md text-label-md bg-state-danger-subtle text-state-danger" role="alert">
                    <Icon name="error" className="text-[20px]" />
                    <span>{readError.message}</span>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-space-xs">
                  <Button icon="document_scanner" busy={reading} busyLabel="جارٍ قراءة الوصفة…" onClick={read} disabled={!file}>قراءة الوصفة مجاناً</Button>
                  <Button tone="soft" icon="edit_note" onClick={startManual}>إدخال الأدوية يدوياً</Button>
                </div>
                {reading ? (
                  <p className="font-body-sm text-body-sm text-text-muted">{ocrStage || 'جارٍ تحليل الصورة محلياً في متصفحك…'} {ocrProgress ? ocrProgress + '%' : ''}</p>
                ) : null}
              </Card>
              <Card className="lg:col-span-2">
                <CardTitle icon="tips_and_updates">لقراءة أدق</CardTitle>
                <ul className="flex flex-col gap-space-xs font-body-md text-body-md text-text-body">
                  {[
                    ['light_mode', 'صوّر الوصفة في إضاءة جيدة ومن دون ظلال.'],
                    ['crop_free', 'اجعل الوصفة كاملة داخل الصورة ومستقيمة.'],
                    ['blur_off', 'تأكد أن الخط واضح وغير مهتز.']
                  ].map(([icon, text]) => (
                    <li key={icon} className="flex items-start gap-2"><Icon name={icon} className="text-text-primary text-[20px]" />{text}</li>
                  ))}
                </ul>
                <p className="font-body-sm text-body-sm text-text-muted p-space-sm rounded-xl bg-surface-subtle">
                  المحرك المجاني المستخدم: Tesseract.js مع اللغة العربية والإنجليزية، وتحسين للصورة وقراءات متعددة. لا يرسل الصورة إلى خدمة مدفوعة، ولا يعتمد أي معلومة غير واضحة تلقائياً؛ راجع كل حقل قبل التأكيد.
                </p>
              </Card>
            </div>
          ) : null}

          {/* Step 2 — review & edit */}
          {step === 1 ? (
            <Card>
              <CardTitle
                icon="rate_review"
                count={rows.length}
                actions={<Button tone="ghost" icon="restart_alt" onClick={reset}>البدء من جديد</Button>}
              >
                راجع الأدوية المستخرجة
              </CardTitle>

              {previewUrl ? (
                <details open className="rounded-xl border border-border-soft p-space-xs">
                  <summary className="cursor-pointer font-label-md text-label-md text-text-heading">صورة الوصفة الأصلية (للمقارنة)</summary>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="صورة الوصفة الأصلية" className="mt-space-xs max-h-80 w-auto max-w-full rounded-lg border border-border-soft" />
                </details>
              ) : null}

              {record && record.extracted ? (
                <div className="flex flex-wrap gap-space-xs font-body-sm text-body-sm text-text-muted">
                  {record.extracted.doctorName ? <span className="px-2 py-1 rounded-lg bg-surface-subtle">الطبيب: {record.extracted.doctorName}</span> : null}
                  {record.extracted.patientName ? <span className="px-2 py-1 rounded-lg bg-surface-subtle">المريض: {record.extracted.patientName}</span> : null}
                  {record.extracted.prescriptionDate ? <span className="px-2 py-1 rounded-lg bg-surface-subtle">تاريخ الوصفة: {record.extracted.prescriptionDate}</span> : null}
                </div>
              ) : null}

              {record && record.extracted && (!record.extracted.isPrescription || record.extracted.readability === 'unreadable') ? (
                <div className="p-space-sm rounded-xl bg-state-warning-subtle text-state-warning flex items-center gap-2 font-label-md text-label-md">
                  <Icon name="warning" />
                  {!record.extracted.isPrescription ? 'لا تبدو الصورة وصفة طبية.' : 'الصورة غير واضحة بما يكفي للقراءة.'} يمكنك إضافة الأدوية يدوياً أو رفع صورة أوضح.
                </div>
              ) : null}



              <div className="flex flex-col gap-space-sm">
                {rows.map((row, index) => (
                  <div key={row._key || index} className={'p-space-sm rounded-xl border ' + (rowErrors[index] ? 'border-state-danger/50 bg-state-danger-subtle/40' : 'border-border-soft bg-surface-subtle')}>
                    <div className="flex items-center justify-between gap-2 mb-space-xs">
                      <span className="font-label-md text-label-md text-text-heading flex items-center gap-2">
                        دواء {index + 1}
                        {!row.edited && CONFIDENCE[row.confidence] ? <Badge className={CONFIDENCE[row.confidence].cls}>{CONFIDENCE[row.confidence].label}</Badge> : null}
                        {row.edited ? <Badge className="bg-surface-container-high text-text-primary" icon="edit">معدّل</Badge> : null}
                      </span>
                      <button type="button" aria-label={'حذف دواء ' + (index + 1)} onClick={() => removeRow(index)}
                        className="w-8 h-8 rounded-lg text-state-danger hover:bg-state-danger-subtle flex items-center justify-center">
                        <Icon name="delete" className="text-[20px]" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-space-xs">
                      <label className="col-span-2 flex flex-col gap-1">
                        <span className="font-label-sm text-label-sm text-text-muted">اسم الدواء *</span>
                        <input className={inputClass + (unsure(row, 'name') ? UNSURE_CLASS : '')} dir="auto" value={row.name} onChange={(e) => updateRow(index, 'name', e.target.value)} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="font-label-sm text-label-sm text-text-muted">الكمية *</span>
                        <input className={inputClass + (unsure(row, 'quantity') ? UNSURE_CLASS : '')} type="number" min="1" value={row.quantity} onChange={(e) => updateRow(index, 'quantity', e.target.value)} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="font-label-sm text-label-sm text-text-muted">القوة / التركيز</span>
                        <input className={inputClass + (unsure(row, 'strength') ? UNSURE_CLASS : '')} dir="auto" value={row.strength || ''} placeholder="500 mg" onChange={(e) => updateRow(index, 'strength', e.target.value)} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="font-label-sm text-label-sm text-text-muted">عدد المرات باليوم</span>
                        <input className={inputClass + (unsure(row, 'frequency') ? UNSURE_CLASS : '')} value={row.frequency} placeholder="3 مرات يومياً" onChange={(e) => updateRow(index, 'frequency', e.target.value)} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="font-label-sm text-label-sm text-text-muted">المدة المحددة</span>
                        <input className={inputClass + (unsure(row, 'duration') ? UNSURE_CLASS : '')} value={row.duration} placeholder="7 أيام" onChange={(e) => updateRow(index, 'duration', e.target.value)} />
                      </label>
                      <label className="col-span-2 flex flex-col gap-1">
                        <span className="font-label-sm text-label-sm text-text-muted">الجرعة</span>
                        <input className={inputClass + (unsure(row, 'dosage') ? UNSURE_CLASS : '')} dir="auto" value={row.dosage || ''} placeholder="1 قرص" onChange={(e) => updateRow(index, 'dosage', e.target.value)} />
                      </label>
                      <label className="col-span-2 flex flex-col gap-1">
                        <span className="font-label-sm text-label-sm text-text-muted">ملاحظات الطبيب / التعليمات</span>
                        <textarea className={inputClass + ' min-h-20 resize-y' + (unsure(row, 'notes') ? UNSURE_CLASS : '')} dir="auto" value={row.notes || ''} placeholder="بعد الأكل، عند الحاجة، قبل النوم…" onChange={(e) => updateRow(index, 'notes', e.target.value)} />
                      </label>
                    </div>
                    {rowErrors[index] ? <p className="font-label-sm text-label-sm text-state-danger mt-1" role="alert">{rowErrors[index]}</p> : null}
                  </div>
                ))}
                {!rows.length ? (
                  <p className="font-body-md text-body-md text-text-muted text-center py-space-md">لا توجد أدوية. أضف دواءً يدوياً.</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-space-xs">
                <Button tone="soft" icon="add" onClick={() => setRows([...rows, keyed(EMPTY_ROW)])}>إضافة دواء</Button>
                <Button icon="fact_check" busy={confirming} busyLabel="جارٍ الحفظ…" onClick={confirm} disabled={!rows.length || !reviewed}>تأكيد بيانات الوصفة</Button>
              </div>
              <label className="flex items-start gap-2 p-space-sm rounded-xl bg-state-warning-subtle text-state-warning font-label-md text-label-md cursor-pointer">
                <input type="checkbox" className="mt-1" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                <span>قارنت بيانات كل دواء بالوصفة الأصلية وصحّحت أي تعديل مطلوب.</span>
              </label>
            </Card>
          ) : null}

          {/* Step 3 — connect with drug requests */}
          {step === 2 ? (
            <Card>
              <CardTitle
                icon="send"
                actions={<>
                  <Badge className={(PRESCRIPTION_STATUS[record.status] || PRESCRIPTION_STATUS.extracted).cls + ' text-label-md py-1 px-3'} icon={(PRESCRIPTION_STATUS[record.status] || PRESCRIPTION_STATUS.extracted).icon}>{(PRESCRIPTION_STATUS[record.status] || PRESCRIPTION_STATUS.extracted).label}</Badge>
                  <Button tone="ghost" icon="document_scanner" onClick={reset}>قراءة وصفة أخرى</Button>
                </>}
              >
                إرسال الأدوية كطلبات
              </CardTitle>
              <p className="font-body-md text-body-md text-text-muted">
                اختر الأدوية التي تريد طلبها. سيُنشأ طلب دواء منفصل لكل دواء{file ? ' مع إرفاق صورة الوصفة' : ''}، ويمكنك متابعتها من صفحة طلبات الأدوية.
              </p>
              <div className="flex flex-col gap-space-xs">
                {rows.map((row, index) => {
                  const result = results[index];
                  return (
                    <label key={index} className="flex items-center gap-space-sm p-space-sm rounded-xl bg-surface-subtle cursor-pointer">
                      <input type="checkbox" checked={!!selected[index]} disabled={sending || (result && result.state === 'sent')}
                        onChange={(e) => setSelected({ ...selected, [index]: e.target.checked })} />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-label-lg text-label-lg text-text-heading" dir="auto">{row.name} {row.strength ? <span className="text-text-muted font-body-sm">{row.strength}</span> : null}</span>
                        <span className="font-body-sm text-body-sm text-text-muted">
                          الكمية: {row.quantity} {row.quantityUnit} {[row.dosage, row.frequency, row.duration].filter(Boolean).length ? '· ' + [row.dosage, row.frequency, row.duration].filter(Boolean).join(' · ') : ''}
                        </span>
                        {result && result.state === 'failed' ? <span className="font-label-sm text-label-sm text-state-danger">{result.message}</span> : null}
                      </div>
                      {result && result.state === 'sending' ? <Badge className="bg-state-info-subtle text-state-info" icon="progress_activity">جارٍ الإرسال</Badge> : null}
                      {result && result.state === 'sent' ? (
                        result.id != null ? (
                          <Link href={'/drug-requests/' + encodeURIComponent(result.id)} className="shrink-0"><Badge className="bg-state-success-subtle text-state-success" icon="check_circle">طلب #{result.id}</Badge></Link>
                        ) : <Badge className="bg-state-success-subtle text-state-success" icon="check_circle">تم الإرسال</Badge>
                      ) : null}
                      {result && result.state === 'failed' ? <Badge className="bg-error-container text-state-danger" icon="error">فشل</Badge> : null}
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-space-xs">
                <Button icon="send" busy={sending} busyLabel="جارٍ إرسال الطلبات…" onClick={sendRequests}>إرسال الطلبات المحددة</Button>
                {record.status === 'requested' ? <Link href="/drug-requests" className="inline-flex items-center gap-1 px-space-md py-2.5 rounded-lg bg-surface-container-low text-text-primary font-label-lg text-label-lg">متابعة الطلبات <Icon name="arrow_back" className="text-[18px]" /></Link> : null}
              </div>
            </Card>
          ) : null}

          {/* History */}
          <Card>
            <CardTitle icon="history" count={(history.data || []).length}>وصفاتي السابقة</CardTitle>
            <AsyncBlock state={history} skeleton={2} empty={{ when: !(history.data || []).length, icon: 'receipt_long', title: 'لم تقرأ أي وصفة بعد' }}>
              <div className="flex flex-col gap-space-xs">
                {(history.data || []).map((p) => {
                  const status = PRESCRIPTION_STATUS[p.status] || PRESCRIPTION_STATUS.extracted;
                  return (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-space-sm p-space-sm rounded-xl bg-surface-subtle">
                      <div className="flex items-center gap-space-sm min-w-0">
                        <span className="w-11 h-11 rounded-xl bg-primary/10 text-text-primary flex items-center justify-center shrink-0">
                          <Icon name={p.source === 'manual' ? 'edit_note' : 'document_scanner'} />
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-label-lg text-label-lg text-text-heading truncate">
                            {p.medications.map((m) => m.name).join('، ') || 'بدون أدوية'}
                          </span>
                          <span className="font-body-sm text-body-sm text-text-muted">
                            {formatDateTime(p.createdAt)} · {p.medications.length} دواء{p.drugRequestIds && p.drugRequestIds.length ? ' · ' + p.drugRequestIds.length + ' طلب' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-space-2xs">
                        <Badge className={status.cls} icon={status.icon}>{status.label}</Badge>
                        {p.status !== 'requested' ? (
                          <Button tone="soft" className="!py-1.5" onClick={() => {
                            setFile(null);
                            setRecord(p);
                            setRows((p.medications || []).map((m) => keyed({ ...m, edited: p.status !== 'extracted' })));
                            setSelected(Object.fromEntries(p.medications.map((_, i) => [i, true])));
                            setResults({});
                            setReviewed(false);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}>متابعة</Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </AsyncBlock>
          </Card>
        </RoleGate>
      </PageBody>
    </>
  );
}
