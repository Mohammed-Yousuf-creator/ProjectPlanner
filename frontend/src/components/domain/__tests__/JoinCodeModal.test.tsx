import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JoinCodeModal } from '@/components/domain/JoinCodeModal';
import { renderWithProviders } from '@/test/renderWithProviders';

/**
 * PLAN.md §14 test 6: the one-time join code appears once after team creation,
 * is copyable, and cannot be dismissed by accident.
 */

describe('JoinCodeModal', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows the join code and the team name', () => {
    renderWithProviders(
      <JoinCodeModal open joinCode="HACK-9F2K" teamName="Night Owls" onClose={vi.fn()} />,
    );

    expect(screen.getByText('HACK-9F2K')).toBeInTheDocument();
    expect(screen.getByText(/Night Owls was created/)).toBeInTheDocument();
    expect(screen.getByText('This code cannot be retrieved again')).toBeInTheDocument();
  });

  it('copies the code to the clipboard and confirms it', async () => {
    renderWithProviders(
      <JoinCodeModal open joinCode="HACK-9F2K" teamName="Night Owls" onClose={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('HACK-9F2K');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('cannot be dismissed with Escape or the backdrop close button', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <JoinCodeModal open joinCode="HACK-9F2K" teamName="Night Owls" onClose={onClose} />,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });

  it('closes only through the explicit acknowledgement button', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <JoinCodeModal open joinCode="HACK-9F2K" teamName="Night Owls" onClose={onClose} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'I have saved the code' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <JoinCodeModal open={false} joinCode="HACK-9F2K" teamName="Night Owls" onClose={vi.fn()} />,
    );

    expect(screen.queryByText('HACK-9F2K')).not.toBeInTheDocument();
  });
});
