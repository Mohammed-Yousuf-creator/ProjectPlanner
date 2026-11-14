import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Handshake, MessageSquare, Send, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import {
  useAddNegotiationMessage,
  useProposalDecision,
  useSponsorshipProposal,
} from '@/hooks/useSponsorship';
import { formatDateTime } from '@/lib/format';
import { toApiError } from '@/lib/errors';
import type { SponsorshipProposalRead } from '@/api/types';
import { ProposalSummaryCard } from './ProposalSummaryCard';

/**
 * Negotiation thread + decisions.
 * Accept is irreversible and creates the deal; reject/withdraw end the proposal.
 * Which side may act is enforced by the server, so both are offered and the
 * server's 403 is surfaced verbatim.
 */
export function ProposalPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const toast = useToast();

  const proposalQuery = useSponsorshipProposal(proposalId);
  const addMessage = useAddNegotiationMessage(proposalId ?? '');
  const decision = useProposalDecision(proposalId ?? '');

  const [message, setMessage] = useState('');
  const [counterAmount, setCounterAmount] = useState('');
  const [messageType, setMessageType] = useState<'message' | 'counter_offer'>('message');
  const [confirm, setConfirm] = useState<'accept' | 'reject' | 'withdraw' | null>(null);

  if (proposalQuery.isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLines lines={2} className="max-w-sm" />
        <Card>
          <SkeletonLines lines={6} />
        </Card>
      </div>
    );
  }

  if (proposalQuery.isError) {
    const apiError = toApiError(proposalQuery.error);
    if (apiError.status === 403 || apiError.status === 404) {
      return (
        <EmptyState
          icon={Handshake}
          title="Proposal unavailable"
          description="It does not exist, or your organization is not a party to it."
          actions={
            <Link to="/organizations">
              <Button variant="outline">My organizations</Button>
            </Link>
          }
        />
      );
    }
    return <ErrorState error={proposalQuery.error} onRetry={() => void proposalQuery.refetch()} />;
  }

  const proposal = proposalQuery.data;
  if (!proposal) return null;

  const isOpen = proposal.status === 'pending' || proposal.status === 'negotiating';

  const sendMessage = () => {
    if (!message.trim()) {
      toast.error('Write a message first.');
      return;
    }
    if (messageType === 'counter_offer' && counterAmount && Number(counterAmount) <= 0) {
      toast.error('A counter amount must be greater than zero.');
      return;
    }
    addMessage.mutate(
      {
        message_type: messageType,
        message: message.trim(),
        counter_amount: messageType === 'counter_offer' ? counterAmount.trim() || null : null,
        currency: proposal.currency,
      },
      {
        onSuccess: () => {
          toast.success(messageType === 'counter_offer' ? 'Counter offer sent.' : 'Message sent.');
          setMessage('');
          setCounterAmount('');
          setMessageType('message');
        },
        onError: (error) => toast.error(toApiError(error).message),
      },
    );
  };

  const act = (action: 'accept' | 'reject' | 'withdraw') => {
    decision.mutate(action, {
      onSuccess: (result) => {
        setConfirm(null);
        if (action === 'accept' && result && typeof result === 'object' && 'id' in result) {
          toast.success('Proposal accepted. A deal was created.');
        } else {
          toast.success('Proposal updated.');
        }
      },
      onError: (error) => {
        setConfirm(null);
        toast.error(toApiError(error).message);
      },
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sponsorship proposal"
        title={proposal.listing_title ?? proposal.listing?.title ?? 'Proposal'}
        description={`${proposal.proposer_organization_name ?? 'Proposer'} → ${proposal.listing_owner_organization_name ?? 'Listing owner'}`}
        breadcrumbs={[
          { label: 'Marketplace', to: '/marketplace' },
          { label: 'Proposal' },
        ]}
        actions={<StatusBadge status={proposal.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Proposal message" />
            <p className="whitespace-pre-line pt-3 text-xs leading-relaxed text-taupe">
              {proposal.message}
            </p>
          </Card>

          <Card className="space-y-3">
            <CardHeader
              title="Negotiation"
              description="Both sides share this thread. Counter offers record an amount."
            />

            {proposal.negotiation_messages.length === 0 ? (
              <EmptyState
                inline
                icon={MessageSquare}
                title="No messages yet"
                description="Start the conversation to agree on scope and amount."
              />
            ) : (
              <ol className="space-y-2">
                {proposal.negotiation_messages.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-line-subtle bg-canvas p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-ink">
                        {entry.author_organization_name ?? 'Organization'}
                        {entry.author_user_name ? ` · ${entry.author_user_name}` : ''}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant={entry.message_type === 'counter_offer' ? 'category' : 'neutral'}>
                          {entry.message_type === 'counter_offer' ? 'Counter offer' : 'Message'}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted">
                          {formatDateTime(entry.created_at)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-taupe">
                      {entry.message}
                    </p>
                    {entry.counter_amount && (
                      <p className="mt-1 font-mono text-[11px] font-bold text-forest">
                        {entry.currency ?? proposal.currency} {entry.counter_amount}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {isOpen && (
              <div className="space-y-2 border-t border-line-subtle pt-3">
                <Field label="Your message" htmlFor="negotiation-message">
                  <Textarea
                    id="negotiation-message"
                    rows={3}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Share scope details, timelines, or a revised offer."
                  />
                </Field>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-40">
                    <Field label="Type" htmlFor="negotiation-type">
                      <select
                        id="negotiation-type"
                        className="w-full rounded-xl border border-line bg-canvas px-3.5 py-2 text-xs text-ink focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                        value={messageType}
                        onChange={(event) =>
                          setMessageType(event.target.value as 'message' | 'counter_offer')
                        }
                      >
                        <option value="message">Message</option>
                        <option value="counter_offer">Counter offer</option>
                      </select>
                    </Field>
                  </div>
                  {messageType === 'counter_offer' && (
                    <div className="w-40">
                      <Field label={`Amount (${proposal.currency})`} htmlFor="negotiation-amount">
                        <Input
                          id="negotiation-amount"
                          inputMode="decimal"
                          value={counterAmount}
                          onChange={(event) => setCounterAmount(event.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                  <Button
                    onClick={sendMessage}
                    loading={addMessage.isPending}
                    icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    Send
                  </Button>
                </div>
                {addMessage.isError && (
                  <Alert tone="error" title="Could not send">
                    {toApiError(addMessage.error).message}
                  </Alert>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <ProposalSummaryCard proposal={proposal} />

          <Card className="space-y-2">
            <CardHeader title="Decisions" />
            {!isOpen ? (
              <p className="pt-2 text-[11px] text-muted">
                This proposal is {proposal.status} and can no longer be changed.
                {proposal.responded_at && ` Closed ${formatDateTime(proposal.responded_at)}.`}
              </p>
            ) : (
              <div className="space-y-2 pt-2">
                <Button
                  block
                  onClick={() => setConfirm('accept')}
                  icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Accept proposal
                </Button>
                <Button
                  variant="outline"
                  block
                  onClick={() => setConfirm('reject')}
                  icon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  Reject
                </Button>
                <Button variant="chip" block onClick={() => setConfirm('withdraw')}>
                  Withdraw (proposer only)
                </Button>
                <p className="text-[10px] leading-relaxed text-muted">
                  Accepting creates an immutable deal snapshot. Reject and withdraw require the
                  matching side of the proposal — the server rejects the wrong party.
                </p>
              </div>
            )}
            {decision.isError && (
              <Alert tone="error" title="Action failed">
                {toApiError(decision.error).message}
              </Alert>
            )}
          </Card>
        </div>
      </div>

      <Link
        to="/organizations"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-taupe hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Back to organizations
      </Link>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && act(confirm)}
        title={
          confirm === 'accept'
            ? 'Accept this proposal?'
            : confirm === 'reject'
              ? 'Reject this proposal?'
              : 'Withdraw this proposal?'
        }
        description={
          confirm === 'accept'
            ? 'A deal is created immediately and cannot be undone.'
            : 'The proposal closes and cannot be reopened.'
        }
        confirmLabel={
          confirm === 'accept' ? 'Accept & create deal' : confirm === 'reject' ? 'Reject' : 'Withdraw'
        }
        destructive={confirm !== 'accept'}
        loading={decision.isPending}
      >
        <p>
          {confirm === 'accept'
            ? 'The deal snapshots the amount, currency, and terms at this moment. Later edits to the listing do not change it.'
            : 'Both sides will see the updated status in their proposal lists.'}
        </p>
      </ConfirmDialog>
    </div>
  );
}

export type { SponsorshipProposalRead };
