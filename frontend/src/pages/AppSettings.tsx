import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Badge, Card, ConfirmButton, Field, Icon, Segmented, Spinner } from '../components/ui';
import { useToast } from '../store';
import { bytes, fmtDateTime } from '../time';
import type { AppSettings, BackupList, OneBuildMode } from '../types';

/** Settings that apply to every project: the one-build rule and backups. */
export default function AppSettingsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [backups, setBackups] = useState<BackupList | null>(null);
  const [backupsError, setBackupsError] = useState('');
  const [busy, setBusy] = useState('');
  const [importing, setImporting] = useState(false);

  const loadBackups = useCallback(() => {
    api.backups().then((b) => { setBackups(b); setBackupsError(''); }).catch((e: Error) => setBackupsError(e.message));
  }, []);
  useEffect(() => {
    api.settings().then(setSettings).catch((e: Error) => toast.error(e.message));
    loadBackups();
  }, [loadBackups]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch: Partial<AppSettings>) => {
    try { setSettings(await api.saveSettings(patch)); } catch (e) { toast.error((e as Error).message); }
  };

  const create = async () => {
    setBusy('create');
    try { await api.createBackup(); toast.ok('Backup created.'); loadBackups(); } catch (e) { toast.error((e as Error).message); }
    setBusy('');
  };
  const restore = async (name: string) => {
    setBusy(name);
    try {
      const res = await api.restoreBackup(name);
      toast.ok(`Restored. The state from just before is kept as ${res.safety_backup}.`);
      loadBackups();
      api.settings().then(setSettings).catch(() => undefined);
    } catch (e) { toast.error((e as Error).message); }
    setBusy('');
  };
  const remove = async (name: string) => {
    try { await api.deleteBackup(name); loadBackups(); } catch (e) { toast.error((e as Error).message); }
  };

  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const project = await api.importProject(file);
      toast.ok(`Imported “${project.name}”.`);
      navigate(`/p/${project.id}`);
    } catch (e) { toast.error((e as Error).message); }
    setImporting(false);
  };

  if (!settings) return <main className="page"><Spinner /></main>;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>App settings</h1>
          <p className="muted">These apply to every project. Project settings live in each project's Settings tab.</p>
        </div>
        <Link className="btn btn-ghost" to="/"><Icon name="back" size={14} /> All projects</Link>
      </div>

      <div className="stack settings">
        <Card title="One project at a time">
          <p className="lead">Starting a second project while the first is unfinished is the most common way neither gets finished. Hackathons are exempt — they end on their own.</p>
          <Field label="When I start a new project while another is still being built">
            <Segmented<OneBuildMode> ariaLabel="One-project rule" value={settings.one_build_mode} onChange={(v) => save({ one_build_mode: v })}
              options={[
                { value: 'off', label: 'Say nothing' },
                { value: 'warn', label: 'Warn me' },
                { value: 'block', label: 'Refuse' },
              ]} />
          </Field>
          <p className="muted small">
            {settings.one_build_mode === 'block' ? 'A new project is refused until the one in progress is shipped or archived with a reason.'
              : settings.one_build_mode === 'warn' ? 'The new-project dialog names the project you are leaving unfinished.' : 'No check is made.'}
          </p>
        </Card>

        <Card title="Backups" aside={backups && !backups.available ? <Badge tone="danger">not available</Badge> : undefined}>
          <p className="lead">A backup is the whole database plus every uploaded file in one archive. Restoring replaces everything with the backup's state — and first saves the current state, so a restore can be undone.</p>
          {backupsError && <div className="notice notice-danger"><Icon name="alert" size={15} /><span>{backupsError}</span></div>}
          {backups && !backups.available && (
            <div className="notice notice-warn"><Icon name="alert" size={15} /><span>{backups.missing} Install the PostgreSQL client tools (<code>sudo apt install postgresql-client</code>) and restart the planner.</span></div>
          )}
          {backups?.last_error && <div className="notice notice-danger"><Icon name="alert" size={15} /><span>The last automatic backup failed: {backups.last_error}</span></div>}

          <div className="row row-wrap backup-auto">
            <label className="check-inline">
              <input type="checkbox" checked={settings.backup_enabled} onChange={(e) => save({ backup_enabled: e.target.checked })} />
              Back up automatically once a day
            </label>
            <label className="inline-field">
              Keep the last
              <select className="input input-narrow" value={settings.backup_keep} disabled={!settings.backup_enabled}
                onChange={(e) => save({ backup_keep: Number(e.target.value) })}>
                {[3, 7, 14, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}
                {![3, 7, 14, 30, 60].includes(settings.backup_keep) && <option value={settings.backup_keep}>{settings.backup_keep}</option>}
              </select>
              automatic backups
            </label>
          </div>
          {backups && <p className="muted small">Stored in <code>{backups.dir}</code>. Copy that folder somewhere else now and then — a backup on the same disk does not survive the disk.</p>}

          <div className="card-actions">
            <button className="btn btn-primary btn-sm" onClick={create} disabled={busy !== '' || (backups !== null && !backups.available)}>
              {busy === 'create' ? 'Backing up…' : 'Back up now'}
            </button>
          </div>

          {backups && backups.items.length > 0 && (
            <div className="file-table-wrap backup-table">
              <table className="file-table">
                <thead><tr><th>Backup</th><th>Made</th><th>Size</th><th /></tr></thead>
                <tbody>
                  {backups.items.map((item) => (
                    <tr key={item.name}>
                      <td><span className="file-name"><code>{item.name}</code>{item.auto && <Badge>automatic</Badge>}{item.name.includes('before-restore') && <Badge tone="info">before a restore</Badge>}</span></td>
                      <td>{fmtDateTime(item.created_at)}</td>
                      <td>{bytes(item.size)}</td>
                      <td className="file-actions">
                        <ConfirmButton className="btn btn-sm" confirmLabel="Replace everything?" onConfirm={() => restore(item.name)}
                          title="Replace the current data with this backup">{busy === item.name ? 'Restoring…' : 'Restore'}</ConfirmButton>
                        <ConfirmButton className="icon-btn" confirmLabel="Sure?" title="Delete this backup" onConfirm={() => remove(item.name)}><Icon name="trash" size={14} /></ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {backups && backups.items.length === 0 && backups.available && <p className="muted backup-empty">No backups yet.</p>}
        </Card>

        <Card title="Import a project">
          <p className="lead">Bring in a project exported from another machine: a <code>.planner.zip</code> file with the plan, the board, the journal and every upload. It is added as a new project; nothing existing is touched.</p>
          <label className={`btn ${importing ? 'disabled' : ''}`}>
            <input type="file" accept=".zip,application/zip" className="visually-hidden" disabled={importing}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
            <Icon name="upload" size={14} /> {importing ? 'Importing…' : 'Choose a .planner.zip file'}
          </label>
          <p className="muted small">To export, open the project's Settings tab.</p>
        </Card>

        <Card title="From the terminal">
          <p className="muted">The same binary prints where a project stands, for a shell prompt or a status bar:</p>
          <pre className="code-block">{`bin/planner status              # the project linked to this folder, else the one you touched last
bin/planner status --short      # one line, e.g. for tmux or a prompt
bin/planner status --here       # nothing unless you are inside a linked repository
bin/planner status --project 3  # a specific project
bin/planner status --json`}</pre>
        </Card>
      </div>
    </main>
  );
}
