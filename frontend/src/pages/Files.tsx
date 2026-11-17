import { useState } from 'react';
import { api } from '../api';
import { Badge, Card, ConfirmButton, Empty, Icon, Segmented } from '../components/ui';
import { useProject } from '../store';
import { DropZone, useUpload } from '../steps/common';
import type { StoredFile } from '../types';
import { bytes, fmtDateTime } from '../time';

type Category = StoredFile['category'];
const LABEL: Record<Category, string> = { wireframe: 'Wireframe', reference: 'Reference', other: 'Other' };

export default function Files() {
  const { b, run } = useProject();
  const { upload, busy } = useUpload();
  const [category, setCategory] = useState<Category>('reference');
  const original = b.files.reduce((s, f) => s + f.original_size, 0);
  const stored = b.files.reduce((s, f) => s + f.stored_size, 0);

  return (
    <div className="stack">
      <Card title="Files" aside={b.files.length > 0 ? <span className="muted">{bytes(original)} uploaded · {bytes(stored)} on disk</span> : undefined}>
        <p className="lead">
          Sketches, screenshots, specs, reference PDFs — everything for this project in one place. Each file can be up to 10 MB and is
          compressed before it is stored on your disk.
        </p>
        <div className="upload-bar">
          <Segmented<Category> size="sm" ariaLabel="File category" value={category} onChange={setCategory}
            options={(Object.keys(LABEL) as Category[]).map((c) => ({ value: c, label: LABEL[c] }))} />
        </div>
        <DropZone busy={busy} onFiles={(files) => upload(files, category)}>
          Drop files here, or click to choose <small>(max 10 MB each)</small>
        </DropZone>
      </Card>

      {b.files.length === 0 ? (
        <Empty title="No files yet">Photos of paper wireframes are a good first upload.</Empty>
      ) : (
        <div className="file-table-wrap">
          <table className="file-table">
            <thead>
              <tr><th>Name</th><th>Kind</th><th>Size</th><th>Stored as</th><th>Added</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {b.files.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="file-name">
                      {f.mime.startsWith('image/') && <img src={api.fileUrl(f.id)} alt="" loading="lazy" />}
                      <a href={api.fileUrl(f.id)} target="_blank" rel="noreferrer">{f.name}</a>
                    </div>
                  </td>
                  <td><Badge>{LABEL[f.category]}</Badge></td>
                  <td>{bytes(f.original_size)}</td>
                  <td>
                    {f.compression === 'zstd'
                      ? <span title="Compressed with Zstandard">{bytes(f.stored_size)} <span className="muted">(−{Math.min(99, Math.round((1 - f.stored_size / f.original_size) * 100))}%)</span></span>
                      : <span className="muted" title="Already compressed (images, archives…) — stored unchanged">as is</span>}
                  </td>
                  <td className="muted">{fmtDateTime(f.created_at)}</td>
                  <td className="file-actions">
                    <a className="icon-btn" href={api.fileUrl(f.id, true)} aria-label={`Download ${f.name}`} title="Download"><Icon name="download" size={15} /></a>
                    <ConfirmButton className="icon-btn" confirmLabel="Sure?" title="Delete" onConfirm={() => run(() => api.remove('files', f.id))}><Icon name="trash" size={15} /></ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
