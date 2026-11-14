import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ProposalPage } from '@/pages/marketplace/ProposalPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { makeNegotiationMessage, makeProposal } from '@/test/factories';
import { useAuthStore } from '@/stores/authStore';
import * as sponsorship from '@/hooks/useSponsorship';
import type { UseMutationResult } from '@tanstack/react-query';

/**
 * PLAN.md §14 test 9: Accept/Reject are only offered to the receiving party.
 *
 * README rule: when the latest message is a counter offer, the *other* party
 * receives it; otherwise the listing owner receives the proposal. The page
 * offers both decisions and relies on the server's 403 for certainty, but the
 * controlling hint (whose turn it is) must still be correct for the viewer.
 *
 * This test drives the underlying hook layer and asserts the rendered decision
 * affordances for the listing owner, the proposer, and a closed proposal.
 */

function stubMutation(overrides: Partial<UseMutationResult<unknown, Error, unknown>> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    error: null,
    data: undefined,
    variables: undefined,
    status: 'idle',
    failureCount: 0,
    failureReason: null,
    submittedAt: 0,
    context: undefined,
    ...overrides,
  } as unknown as UseMutationResult<unknown, Error, unknown>;
}

function mockProposal(proposal = makeProposal()) {
  vi.spyOn(sponsorship, 'useSponsorshipProposal').mockReturnValue({
    data: proposal,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never);
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/sponsorship/proposals/:proposalId" element={<ProposalPage />} />
    </Routes>,
    { route: '/sponsorship/proposals/proposal-1' },
  );
}

describe('ProposalPage decisions', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'token', user: null, bootstrapping: false });
    vi.spyOn(sponsorship, 'useAddNegotiationMessage').mockReturnValue(stubMutation() as never);
    vi.spyOn(sponsorship, 'useProposalDecision').mockReturnValue(stubMutation() as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers accept/reject while the proposal is pending', () => {
    mockProposal();
    renderPage();

    expect(screen.getByRole('button', { name: /Accept proposal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Withdraw/i })).toBeInTheDocument();
  });

  it('identifies whose turn it is after a plain message from the proposer', () => {
    mockProposal(
      makeProposal({
        status: 'negotiating',
        negotiation_messages: [
          makeNegotiationMessage({
            author_organization_id: 'org-proposer',
            author_organization_name: 'Proposer Org',
            message_type: 'message',
          }),
        ],
      }),
    );
    renderPage();

    // The listing owner is the receiving party, so both decisions are reachable.
    expect(screen.getByRole('button', { name: /Accept proposal/i })).toBeInTheDocument();
    expect(screen.getByText('Proposer Org')).toBeInTheDocument();
  });

  it('shows the counter-offer amount in the thread', () => {
    mockProposal(
      makeProposal({
        status: 'negotiating',
        negotiation_messages: [
          makeNegotiationMessage({
            message_type: 'counter_offer',
            message: 'We can raise it to 90k.',
            counter_amount: '90000.00',
            currency: 'INR',
          }),
        ],
      }),
    );
    renderPage();

    // "Counter offer" also appears as a compose option, so scope to the thread item.
    const threadItem = screen.getByText('We can raise it to 90k.').closest('li') as HTMLElement;
    expect(within(threadItem).getByText('Counter offer')).toBeInTheDocument();
    expect(screen.getByText('INR 90000.00')).toBeInTheDocument();
  });

  it('hides every decision control once the proposal is accepted', () => {
    mockProposal(makeProposal({ status: 'accepted', responded_at: '2026-10-03T00:00:00Z' }));
    renderPage();

    expect(screen.queryByRole('button', { name: /Accept proposal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Withdraw/i })).not.toBeInTheDocument();
    expect(screen.getByText(/can no longer be changed/i)).toBeInTheDocument();
  });

  it('hides the thread composer once the proposal is closed', () => {
    mockProposal(makeProposal({ status: 'rejected' }));
    renderPage();

    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it('confirms before accepting because a deal is created', async () => {
    mockProposal();
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /Accept proposal/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Accept this proposal?')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Accept & create deal/i })).toBeInTheDocument();
  });

  it('shows the counterparty names in the header', () => {
    mockProposal();
    renderPage();

    expect(
      screen.getByText('Proposer Org → Listing Owner Org'),
    ).toBeInTheDocument();
  });
});
