import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { Field, Icon, SavedText } from '../components/ui';
import { useProject, useToast } from '../store';
import type { Meta } from '../types';
import { bytes } from '../time';

/** A blueprint answer stored under a key in the project's plan. */
export function PlanField({ k, label, hint, placeholder, multiline = true, minRows = 2, mono }: {
  k: string; label: string; hint?: ReactNode; placeholder?: string; multiline?: boolean; minRows?: number; mono?: boolean;
}) {
  const { p, savePlan } = useProject();
  return (
    <Field label={label} hint={hint} htmlFor={`plan-${k}`}>
      <SavedText id={`plan-${k}`} value={p.plan[k] ?? ''} onSave={(v) => savePlan(k, v)} placeholder={placeholder}
        multiline={multiline} minRows={minRows} mono={mono} />
    </Field>
  );
}

/** A removable row/card in an editable list. */
export function ItemCard({ children, onRemove, title }: { children: ReactNode; onRemove: () => void; title?: ReactNode }) {
  return (
    <div className="item-card">
      <div className="item-card-head">
        <div className="item-card-title">{title}</div>
        <button type="button" className="icon-btn" aria-label="Remove" title="Remove" onClick={onRemove}><Icon name="trash" size={15} /></button>
      </div>
      {children}
    </div>
  );
}

export const MAX_UPLOAD = 10 * 1024 * 1024;

/** Uploads files to the project, refusing anything over the limit before it leaves the browser. */
export function useUpload(meta?: Meta | null) {
  const { p, run } = useProject();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const limit = meta?.max_upload_bytes ?? MAX_UPLOAD;

  const upload = async (files: FileList | File[] | Blob, category: string, name?: string) => {
    const list: { blob: Blob; name: string }[] =
      files instanceof Blob && !(files instanceof File) ? [{ blob: files, name: name ?? 'file' }]
        : files instanceof File ? [{ blob: files, name: files.name }]
          : Array.from(files as FileList | File[]).map((f) => ({ blob: f, name: f.name }));
    setBusy(true);
    try {
      for (const f of list) {
        if (f.blob.size > limit) {
          toast.error(`“${f.name}” is ${bytes(f.blob.size)}. Uploads are limited to 10 MB — shrink it or link to it instead.`);
          continue;
        }
        if (f.blob.size === 0) {
          toast.error(`“${f.name}” is empty.`);
          continue;
        }
        await run(() => api.upload(p.id, f.blob, f.name, category));
      }
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

export function DropZone({ onFiles, busy, accept, children }: {
  onFiles: (files: FileList) => void; busy: boolean; accept?: string; children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <label className={`dropzone ${over ? 'over' : ''} ${busy ? 'busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}>
      <input type="file" multiple accept={accept} className="visually-hidden" disabled={busy}
        onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; }} />
      <Icon name="upload" size={20} />
      <span>{busy ? 'Uploading…' : children}</span>
    </label>
  );
}
