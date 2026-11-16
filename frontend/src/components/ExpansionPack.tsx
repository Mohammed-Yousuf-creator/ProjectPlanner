import { api } from '../api';
import { useProject } from '../store';
import { Card, Empty, Icon } from './ui';

/**
 * The "Later" stories: everything that was cut from the MVP on purpose. They unlock once the
 * MVP has shipped — extra features are a reward, not a way to avoid finishing.
 */
export function ExpansionPack() {
  const { b, p, run } = useProject();
  const later = b.stories.filter((s) => s.tier === 'later');
  const onBoard = new Set(b.tasks.filter((t) => t.story_id !== null).map((t) => t.story_id));
  const shipped = p.phase === 'shipped';

  return (
    <Card title="Expansion pack" aside={!shipped && <span className="muted lock-note"><Icon name="lock" size={14} /> Unlocks when the MVP ships</span>}>
      {later.length === 0 ? (
        <Empty title="Nothing parked for later">Stories you sort into “Later” during the MVP cut show up here.</Empty>
      ) : (
        <ul className="plain-list">
          {later.map((s) => (
            <li key={s.id} className="row">
              <span className="row-main">{s.text}</span>
              {onBoard.has(s.id) ? (
                <span className="muted">On the board</span>
              ) : (
                <button className="btn btn-sm" disabled={!shipped}
                  title={shipped ? 'Add to the board' : 'Ship the MVP first'}
                  onClick={() => run(() => api.create(p.id, 'tasks', { title: s.text, story_id: s.id, scope: 'dlc', status: 'todo' }))}>
                  <Icon name="plus" size={14} /> Add to board
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
