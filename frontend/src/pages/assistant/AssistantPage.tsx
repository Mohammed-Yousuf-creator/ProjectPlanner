import { useState } from 'react';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ChatPanel } from '@/components/ai/ChatPanel';
import {
  useConversations,
  useDeleteConversation,
} from '@/hooks/useAi';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { toApiError } from '@/lib/errors';

/**
 * Full-page assistant with a conversation sidebar.
 *
 * The sidebar is a convenience over `GET /ai/conversations`; the chat itself is
 * the same `ChatPanel` the floating widget uses, so behaviour cannot drift
 * between the two surfaces.
 */
export function AssistantPage() {
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | undefined>();
  const conversations = useConversations();
  const removeConversation = useDeleteConversation();

  const rows = conversations.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assistant"
        title="Ask about the platform"
        description="A guide to events, teams, submissions and sponsorship. Answers come from this app's own documentation — it will tell you when it does not know."
        actions={
          <Button
            variant="outline"
            icon={<MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => setActiveId(undefined)}
          >
            New chat
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr] lg:items-start">
        <Card padded={false} className="overflow-hidden">
          <div className="border-b border-line-subtle p-4">
            <h2 className="text-sm font-bold text-ink">Recent</h2>
            <p className="text-[11px] text-taupe">Your last {rows.length} conversations.</p>
          </div>

          {conversations.isLoading ? (
            <div className="p-4">
              <SkeletonLines lines={4} />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                inline
                icon={MessageSquarePlus}
                title="No conversations yet"
                description="Ask a question to start one."
              />
            </div>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {rows.map((row) => (
                <li key={row.id}>
                  <div
                    className={cn(
                      'group flex items-start gap-2 p-3 transition-colors',
                      activeId === row.id ? 'bg-canvas-2' : 'hover:bg-canvas',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveId(row.id)}
                      className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
                    >
                      <p className="truncate text-[11px] font-bold text-ink">{row.title}</p>
                      {row.last_message_preview && (
                        <p className="truncate text-[10px] text-taupe">
                          {row.last_message_preview}
                        </p>
                      )}
                      <p className="font-mono text-[9px] uppercase tracking-wider text-muted">
                        {row.message_count} {row.message_count === 1 ? 'message' : 'messages'} ·{' '}
                        {formatRelative(row.updated_at)}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${row.title}`}
                      onClick={() =>
                        removeConversation.mutate(row.id, {
                          onSuccess: () => {
                            if (activeId === row.id) setActiveId(undefined);
                            toast.success('Conversation deleted.');
                          },
                          onError: (error) => toast.error(toApiError(error).message),
                        })
                      }
                      className="rounded p-1 text-muted opacity-0 transition-opacity hover:text-rust focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-forest group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex h-[36rem] flex-col">
          <ChatPanel
            key={activeId ?? 'new'}
            conversationId={activeId}
            className="min-h-0 flex-1"
            onConversationCreated={(id) => {
              setActiveId(id);
              void conversations.refetch();
            }}
          />
        </Card>
      </div>
    </div>
  );
}
