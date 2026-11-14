import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { SkillEditor, type EditableSkill } from '@/components/ai/SkillEditor';
import { useMySkills, useReplaceMySkills } from '@/hooks/useAi';
import { toApiError } from '@/lib/errors';

/**
 * Skill profile.
 *
 * The form is seeded from the server **once per successful load** and then owned
 * by local state. That is deliberate: re-seeding on every query refresh would
 * wipe whatever the user is mid-way through typing — the exact bug that plagued
 * the organization edit form. `dataUpdatedAt` is the dependency, so an actual
 * server change still re-seeds, but a background refetch that returns identical
 * data does not.
 */
export function MySkillsPage() {
  const toast = useToast();
  const skills = useMySkills();
  const save = useReplaceMySkills();

  const [draft, setDraft] = useState<EditableSkill[]>([]);
  const [dirty, setDirty] = useState(false);

  const dataUpdatedAt = skills.dataUpdatedAt;

  useEffect(() => {
    if (!skills.data) return;
    setDraft(
      skills.data.map((skill) => ({
        label: skill.label,
        proficiency: skill.proficiency,
      })),
    );
    setDirty(false);
    // Intentionally keyed on the timestamp, not the array identity: react-query
    // hands back a new array on every fetch, which would reset the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  const handleChange = (next: EditableSkill[]) => {
    setDraft(next);
    setDirty(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Profile"
        title="Your skills"
        description="Skills drive matchmaking. Add what you can genuinely do — the algorithm is looking for people who complement each other, not people who look identical."
        actions={
          <Link to="/events">
            <Button variant="outline" icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}>
              Find an event to match in
            </Button>
          </Link>
        }
      />

      <Alert tone="info" title="Only people in the same event can see your matches">
        Your skills are visible to other signed-in users, but matchmaking only ranks people who are
        registered for the same event as you.
      </Alert>

      <Card className="space-y-4">
        <CardHeader
          title="Skill set"
          description="Spelling variants are merged automatically, so “React.js” and “react” count once."
        />

        {skills.isLoading ? (
          <SkeletonLines lines={5} />
        ) : (
          <>
            <SkillEditor
              value={draft}
              onChange={handleChange}
              disabled={save.isPending}
              error={save.isError ? toApiError(save.error).message : null}
            />

            <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
              <Button
                loading={save.isPending}
                disabled={!dirty}
                icon={<Save className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() =>
                  save.mutate(draft, {
                    onSuccess: (saved) => {
                      setDraft(
                        saved.map((skill) => ({
                          label: skill.label,
                          proficiency: skill.proficiency,
                        })),
                      );
                      setDirty(false);
                      toast.success(
                        `${saved.length} ${saved.length === 1 ? 'skill' : 'skills'} saved.`,
                      );
                    },
                    onError: (error) => toast.error(toApiError(error).message),
                  })
                }
              >
                Save skills
              </Button>
              {dirty && <span className="text-[11px] text-taupe">Unsaved changes</span>}
              {!dirty && draft.length > 0 && (
                <span className="text-[11px] text-muted">
                  Saved. Open an event and choose Matchmaking to see suggestions.
                </span>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
