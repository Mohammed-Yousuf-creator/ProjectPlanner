import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, Trash2, User2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/Textarea';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { toApiError } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import {
  useAiStatus,
  useConversation,
  useSendMessage,
} from '@/hooks/useAi';
import type { ChatMessageRead } from '@/api/types';

const SUGGESTIONS = [
  'How do I form a team?',
  'What happens when I submit a project?',
  'How does judging work?',
  'How do I ask for a mentor?',
];

function MessageBubble({ message }: { message: ChatMessageRead }) {
  const isUser = message.role === 'user';
  const isFallback = message.source === 'fallback';

  return (
    <div className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[11px]',
          isUser ? 'border-line bg-fill text-taupe' : 'border-forest/20 bg-forest/10 text-forest',
        )}
        aria-hidden="true"
      >
        {isUser ? <User2 className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </span>

      <div className={cn('min-w-0 max-w-[85%] space-y-1', isUser && 'text-right')}>
        <div
          className={cn(
            'inline-block whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-left text-xs leading-relaxed',
            isUser
              ? 'border-line bg-white text-ink'
              : 'border-line-subtle bg-canvas-2 text-ink',
          )}
        >
          {message.content}
        </div>
        <div
          className={cn(
            'flex flex-wrap items-center gap-1.5',
            isUser ? 'justify-end' : 'justify-start',
          )}
        >
          {/* Honesty: scripted answers are labelled, never passed off as AI. */}
          {!isUser && isFallback && (
            <span className="rounded-lg border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-amber-900">
              Offline answer
            </span>
          )}
          {!isUser && !isFallback && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-emerald-900">
              <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
              AI
            </span>
          )}
          <span className="font-mono text-[9px] text-muted">
            {formatRelative(message.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Assistant chat.
 *
 * Driven by `POST /ai/chat`, which creates the thread on the first message. Once
 * a conversation id comes back we pin it, so follow-ups continue the same thread
 * and carry its history for context.
 *
 * The composer deliberately does NOT clear optimistically: the reply arrives in
 * the same response as the send, so the input is cleared only when the round trip
 * settles. That keeps the text in the box if the request fails.
 */
export function ChatPanel({
  eventId,
  conversationId: initialConversationId,
  onConversationCreated,
  className,
}: {
  eventId?: string;
  /** Resume an existing thread instead of starting a new one. */
  conversationId?: string;
  onConversationCreated?: (conversationId: string) => void;
  className?: string;
}) {
  const toast = useToast();
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialConversationId,
  );
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const status = useAiStatus();
  const aiEnabled = status.data?.ai_enabled ?? false;
  const conversation = useConversation(conversationId);
  const send = useSendMessage(conversationId);

  const messages = conversation.data?.messages ?? [];

  // Follow the newest turn.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, send.isPending]);

  const submit = (text: string) => {
    const message = text.trim();
    if (!message || send.isPending) return;

    send.mutate(
      { message, eventId },
      {
        onSuccess: (response) => {
          setDraft('');
          if (!conversationId) {
            setConversationId(response.conversation_id);
            onConversationCreated?.(response.conversation_id);
          }
        },
        onError: (error) => {
          // The draft is intentionally left in place so nothing is lost.
          toast.error(toApiError(error).message);
        },
      },
    );
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {!aiEnabled && status.isSuccess && (
        <Alert tone="warning" title="AI is not configured on this server" className="mb-3">
          Replies come from a scripted platform guide rather than a language model. Set
          <code className="mx-1 rounded bg-white px-1 font-mono text-[10px]">GEMINI_API_KEY</code>
          in the backend .env to enable live answers.
        </Alert>
      )}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-3"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 && !send.isPending ? (
          <div className="space-y-3">
            <EmptyState
              icon={Bot}
              title="Ask about the platform"
              description="Teams, submissions, judging, mentors, sponsorship — I answer from this app's own documentation, so I will not invent features."
            />
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => submit(suggestion)}
                  className="rounded-xl border border-line bg-canvas px-2.5 py-1.5 text-[11px] font-semibold text-taupe transition-colors hover:bg-hover-stone hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-forest"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}

        {/* The pending bubble is shown before the reply arrives. */}
        {send.isPending && (
          <div className="flex gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-forest/20 bg-forest/10 text-forest">
              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="inline-flex items-center gap-2 rounded-xl border border-line-subtle bg-canvas-2 px-3 py-2 text-xs text-taupe">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Thinking…
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line-subtle pt-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit(draft);
              }
            }}
            placeholder="Ask about teams, submissions, judging…"
            aria-label="Message the assistant"
            maxLength={4000}
            className="flex-1"
          />
          <Button
            type="submit"
            loading={send.isPending}
            disabled={!draft.trim()}
            icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Send
          </Button>
        </form>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-muted">
            Enter to send · Shift+Enter for a new line
          </p>
          {conversationId && (
            <Button
              variant="chip"
              size="sm"
              icon={<Trash2 className="h-3 w-3" aria-hidden="true" />}
              onClick={() => {
                setConversationId(undefined);
                setDraft('');
              }}
            >
              New chat
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
