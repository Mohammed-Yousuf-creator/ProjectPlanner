import { useState } from 'react';
import { Send } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/Toast';
import { PackageCard } from './PackageCard';
import { useCreateProposal } from '@/hooks/useSponsorship';
import { useMyOrganizations, useOrganizationEvents } from '@/hooks/useOrganizations';
import { toApiError } from '@/lib/errors';
import type { SponsorshipListingRead, SponsorshipPackageRead } from '@/api/types';

/**
 * `SponsorshipProposalCreate` requires `target_event_id`, so the form asks for
 * one of the proposing organization's own events. The proposing organization
 * must be chosen first because events are listed per organization.
 */
export function ProposalModal({
  open,
  onClose,
  listing,
  packages,
}: {
  open: boolean;
  onClose: () => void;
  listing: SponsorshipListingRead;
  packages: SponsorshipPackageRead[];
}) {
  const toast = useToast();
  const mine = useMyOrganizations();
  const createProposal = useCreateProposal(listing.id);

  const [orgId, setOrgId] = useState('');
  const [eventId, setEventId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(listing.currency || 'INR');
  const [message, setMessage] = useState('');

  const events = useOrganizationEvents(orgId || undefined);

  const submit = () => {
    if (!orgId) {
      toast.error('Choose which of your organizations is making the proposal.');
      return;
    }
    if (!eventId) {
      toast.error('Choose the event this sponsorship is for.');
      return;
    }
    if (message.trim().length < 10) {
      toast.error('Write at least a short message explaining the proposal.');
      return;
    }
    createProposal.mutate(
      {
        proposer_organization_id: orgId,
        target_event_id: eventId,
        package_id: packageId || null,
        proposed_amount: amount.trim() || null,
        currency: currency.trim() || 'INR',
        message: message.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Proposal sent. Track it from your organization dashboard.');
          onClose();
          setOrgId('');
          setEventId('');
          setPackageId('');
          setAmount('');
          setMessage('');
        },
        onError: (error) => toast.error(toApiError(error).message),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send a sponsorship proposal"
      description={`For “${listing.title}”`}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={createProposal.isPending}
            icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Send proposal
          </Button>
        </>
      }
    >
      {createProposal.isError && (
        <Alert tone="error" title="Could not send the proposal">
          {toApiError(createProposal.error).message}
        </Alert>
      )}

      {mine.isLoading ? (
        <p className="text-[11px] text-muted">Loading your organizations…</p>
      ) : mine.isError ? (
        <Alert tone="error" title="Could not load your organizations">
          {toApiError(mine.error).message}
        </Alert>
      ) : (mine.data ?? []).length === 0 ? (
        <Alert tone="info" title="You need an organization first">
          Proposals are sent on behalf of an organization you own or administer. Create one, then
          come back to this listing.
        </Alert>
      ) : null}

      <Field
        label="Your organization"
        htmlFor="proposal-org"
        hint="Only organizations you own or administer can propose."
        required
      >
        <Select
          id="proposal-org"
          value={orgId}
          onChange={(event) => {
            setOrgId(event.target.value);
            setEventId('');
          }}
          placeholder="Select an organization"
          options={(mine.data ?? []).map((org) => ({
            value: org.id,
            label: org.name,
          }))}
        />
      </Field>

      <Field
        label="Target event"
        htmlFor="proposal-event"
        hint={orgId ? 'Events from the selected organization.' : 'Choose an organization first.'}
        required
      >
        <Select
          id="proposal-event"
          value={eventId}
          onChange={(event) => setEventId(event.target.value)}
          placeholder={events.isLoading ? 'Loading events…' : 'Select the event to sponsor'}
          disabled={!orgId || events.isLoading}
          options={(events.data ?? []).map((event) => ({ value: event.id, label: event.name }))}
        />
      </Field>

      {packages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-taupe">
            Reference a package (optional)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                selectable
                selected={packageId === pkg.id}
                onSelect={() => setPackageId(packageId === pkg.id ? '' : pkg.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Proposed amount" htmlFor="proposal-amount">
          <Input
            id="proposal-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="25000.00"
          />
        </Field>
        <Field label="Currency" htmlFor="proposal-currency">
          <Input
            id="proposal-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Message" htmlFor="proposal-message" hint="Explain what you offer and what you expect." required>
        <Textarea
          id="proposal-message"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>
    </Modal>
  );
}
