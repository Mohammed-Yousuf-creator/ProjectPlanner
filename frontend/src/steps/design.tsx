// Steps 5–7: data, screens, and the shape of the system.

import { useState } from 'react';
import { api } from '../api';
import { SketchPad } from '../components/SketchPad';
import { AddInput, ConfirmButton, Empty, Field, Icon, SavedText } from '../components/ui';
import { useProject } from '../store';
import type { EntityData, FieldData, ModuleData, PlanItem } from '../types';
import { bytes } from '../time';
import { DropZone, ItemCard, PlanField, useUpload } from './common';

// ---------- 5. data models ----------

export function DataStep() {
  const { items, addItem, removeItem, updateItem } = useProject();
  const entities = items<EntityData>('entity');
  return (
    <>
      <p className="lead">
        All software does is move data around. List what you need to store and how the pieces relate — no talk of Postgres versus
        anything yet. It is much cheaper to find a missing model on paper than in a live database.
      </p>
      {entities.length === 0 && <Empty title="No data models yet">A blog has users, posts and comments. What does yours have?</Empty>}
      <div className="entity-grid">
        {entities.map((e) => <EntityCard key={e.id} e={e} onRemove={() => removeItem(e.id)} update={(patch) => updateItem(e, patch)} />)}
      </div>
      <AddInput placeholder="Model name, e.g. User" buttonLabel="Add model" onAdd={(name) => addItem('entity', { name, fields: [], relations: '' })} />
      <PlanField k="data_notes" label="Notes" placeholder="Anything about the data that does not fit in a model" minRows={1} />
    </>
  );
}

function EntityCard({ e, onRemove, update }: { e: PlanItem<EntityData>; onRemove: () => void; update: (patch: Partial<EntityData>) => void }) {
  const { fresh } = useProject();
  const fields = e.data.fields ?? [];
  // Build every change on the newest field list, so two quick edits in a row both survive.
  const latest = () => fresh(e).fields ?? [];
  const setField = (i: number, patch: Partial<FieldData>) => update({ fields: latest().map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  return (
    <ItemCard onRemove={onRemove} title={<SavedText className="title-input" value={e.data.name ?? ''} onSave={(v) => update({ name: v })} ariaLabel="Model name" />}>
      <table className="fields-table">
        <thead><tr><th>Field</th><th>Type</th><th>Notes</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {fields.map((f, i) => (
            <tr key={i}>
              <td><SavedText mono value={f.name ?? ''} onSave={(v) => setField(i, { name: v })} ariaLabel="Field name" /></td>
              <td><SavedText value={f.type ?? ''} onSave={(v) => setField(i, { type: v })} placeholder="text" ariaLabel="Field type" /></td>
              <td><SavedText value={f.note ?? ''} onSave={(v) => setField(i, { note: v })} placeholder="" ariaLabel="Field notes" /></td>
              <td><button className="icon-btn" aria-label="Remove field" onClick={() => update({ fields: latest().filter((_, j) => j !== i) })}><Icon name="x" size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <AddInput placeholder="Field, e.g. email" buttonLabel="Field" onAdd={(name) => update({ fields: [...latest(), { name, type: '', note: '' }] })} />
      <Field label="Relationships">
        <SavedText value={e.data.relations ?? ''} onSave={(v) => update({ relations: v })} placeholder="has many Posts, belongs to Team…" ariaLabel="Relationships" />
      </Field>
    </ItemCard>
  );
}

// ---------- 6. wireframes ----------

export function WireframeStep() {
  const { b, run } = useProject();
  const { upload, busy } = useUpload();
  const [sketching, setSketching] = useState(false);
  const sketches = b.files.filter((f) => f.category === 'wireframe');

  return (
    <>
      <p className="lead">
        Not Figma. Grab paper, draw rectangles and stick figures, photograph it — or scribble right here. No colours, no fonts.
        You are only checking the layout and how a user gets from one screen to the next.
      </p>
      <div className="wire-actions">
        <DropZone busy={busy} accept="image/*,.pdf" onFiles={(files) => upload(files, 'wireframe')}>
          Drop photos of your sketches here, or click to choose <small>(max 10 MB each)</small>
        </DropZone>
        <button className="btn" onClick={() => setSketching(true)}><Icon name="pencil" /> Open sketch pad</button>
      </div>

      {sketches.length > 0 && (
        <div className="thumb-grid">
          {sketches.map((f) => (
            <figure key={f.id} className="thumb">
              <a href={api.fileUrl(f.id)} target="_blank" rel="noreferrer">
                {f.mime.startsWith('image/') ? <img src={api.fileUrl(f.id)} alt={f.name} loading="lazy" /> : <span className="thumb-file">{f.name.split('.').pop()?.toUpperCase()}</span>}
              </a>
              <figcaption>
                <span title={f.name}>{f.name}</span>
                <small>{bytes(f.original_size)}</small>
                <ConfirmButton className="icon-btn" confirmLabel="Sure?" onConfirm={() => run(() => api.remove('files', f.id))} title="Delete"><Icon name="trash" size={14} /></ConfirmButton>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <PlanField k="flow_notes" label="User flow in words"
        hint="Where does the login form go? What happens after someone uploads a file? How do you get between pages? If it takes too many clicks, you will notice here."
        placeholder={'Landing → sign in → dashboard\nDashboard → “New” → form → back to dashboard with the new item on top'} minRows={3} />

      {sketching && (
        <SketchPad busy={busy} onClose={() => setSketching(false)}
          onSave={async (png) => {
            await upload(png, 'wireframe', `sketch-${sketches.length + 1}.png`);
            setSketching(false);
          }} />
      )}
    </>
  );
}

// ---------- 7. future & architecture ----------

const HORIZONS = [
  { value: 'weekend', title: 'Weekend throwaway', blurb: 'Quick and dirty is correct. A file-based database and a free host are fine.' },
  { value: 'portfolio', title: 'Portfolio piece', blurb: 'Clean, readable, demo-able. It has to look finished, not scale.' },
  { value: 'longterm', title: 'Long-lived, real users', blurb: 'Worth some work up front: tests, migrations, a proper deploy.' },
  { value: 'scale', title: 'Needs to scale', blurb: 'Design for growth where it matters — and only there.' },
];

const PACKAGES = ['Script / CLI', 'Web app (frontend + backend)', 'Backend API / service', 'Static website', 'Mobile app', 'Browser extension', 'Desktop app', 'Library'];

export function ArchitectureStep() {
  const { p, savePlan, items, addItem, updateItem, removeItem } = useProject();
  const modules = items<ModuleData>('module');
  const horizon = p.plan.horizon ?? '';
  const packaging = p.plan.packaging ?? '';
  return (
    <>
      <Field label="How long will this project live?"
        hint="The worst mistakes are over-engineering something simple and under-engineering something that has to last. Will today's decisions still matter in six months?">
        <div className="choice-grid" role="radiogroup" aria-label="Project future">
          {HORIZONS.map((h) => (
            <button key={h.value} type="button" role="radio" aria-checked={horizon === h.value}
              className={`choice-card ${horizon === h.value ? 'on' : ''}`} onClick={() => savePlan('horizon', horizon === h.value ? '' : h.value)}>
              <strong>{h.title}</strong>
              <span>{h.blurb}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="What kind of package is it?" hint="How does it live in the world? Getting this wrong means rebuilding a lot later.">
        <div className="chips">
          {PACKAGES.map((name) => (
            <button key={name} type="button" className={`chip ${packaging === name ? 'on' : ''}`} onClick={() => savePlan('packaging', packaging === name ? '' : name)}>{name}</button>
          ))}
        </div>
        <SavedText value={packaging} onSave={(v) => savePlan('packaging', v)} placeholder="…or describe it yourself" ariaLabel="Packaging" />
      </Field>

      <Field label="Modules (black boxes)"
        hint="Split the system into a few big boxes that only talk through a small interface — like hardware with USB ports. You always know where code goes, and you can swap one box without touching the rest.">
        {modules.length === 0 && <Empty title="No modules yet">Typical for a web app: controller (endpoints), logic (the brain), data access — plus one box per external thing.</Empty>}
        <div className="entity-grid">
          {modules.map((m) => (
            <ItemCard key={m.id} onRemove={() => removeItem(m.id)}
              title={<SavedText className="title-input" value={m.data.name ?? ''} onSave={(v) => updateItem(m, { name: v })} ariaLabel="Module name" />}>
              <Field label="Responsibility">
                <SavedText multiline minRows={1} value={m.data.responsibility ?? ''} onSave={(v) => updateItem(m, { responsibility: v })} placeholder="The one thing this box is in charge of" ariaLabel="Responsibility" />
              </Field>
              <Field label="Interface — what other modules may call">
                <SavedText multiline mono minRows={2} value={m.data.interface ?? ''} onSave={(v) => updateItem(m, { interface: v })} placeholder={'createFile(path, content)\nreadFile(path)'} ariaLabel="Interface" />
              </Field>
              <Field label="Files">
                <SavedText multiline mono minRows={1} value={m.data.files ?? ''} onSave={(v) => updateItem(m, { files: v })} placeholder="storage/save, storage/load" ariaLabel="Files" />
              </Field>
            </ItemCard>
          ))}
        </div>
        <AddInput placeholder="Module name, e.g. Storage" buttonLabel="Add module" onAdd={(name) => addItem('module', { name, responsibility: '', interface: '', files: '' })} />
      </Field>

      <PlanField k="architecture_notes" label="How the pieces talk to each other" placeholder="Controller → logic → data access. The logic module is the only one that calls storage…" minRows={2} />
    </>
  );
}
