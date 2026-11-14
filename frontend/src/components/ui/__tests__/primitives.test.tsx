import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';

/**
 * PLAN.md §14 test 3: Button, Badge and Modal render, respect variants, and
 * follow the design-system radius rules.
 */

describe('Button', () => {
  it('is primary and rounded-xl by default', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button).toHaveClass('bg-forest');
    expect(button).toHaveClass('rounded-xl');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('applies the outline variant without the primary fill', () => {
    render(<Button variant="outline">Cancel</Button>);
    const button = screen.getByRole('button', { name: 'Cancel' });

    expect(button).toHaveClass('bg-white');
    expect(button).not.toHaveClass('bg-forest');
  });

  it('disables itself and shows a spinner while loading', () => {
    render(<Button loading>Saving</Button>);
    const button = screen.getByRole('button', { name: 'Saving' });

    expect(button).toBeDisabled();
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('fires onClick when enabled and not when disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Badge', () => {
  it('renders the neutral variant as a rounded-lg chip', () => {
    render(<Badge>Public</Badge>);
    const badge = screen.getByText('Public');
    expect(badge).toHaveClass('rounded-lg');
    expect(badge).not.toHaveClass('rounded-full');
  });

  it('uses the metric variant styling for figures', () => {
    render(<Badge variant="metric">128</Badge>);
    expect(screen.getByText('128')).toHaveClass('text-forest');
  });

  it('humanizes backend statuses in StatusBadge (uppercased by CSS)', () => {
    render(<StatusBadge status="registration_open" />);
    const badge = screen.getByText('registration open');
    // Mono + uppercase classes are what turn the raw enum into a display chip.
    expect(badge).toHaveClass('uppercase');
    expect(badge).toHaveClass('font-mono');
    expect(badge).not.toHaveTextContent('_');
  });

  it('renders nothing for a null status', () => {
    const { container } = render(<StatusBadge status={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Hidden">
        body
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title, description and children when open', () => {
    render(
      <Modal open onClose={vi.fn()} title="Delete event" description="This cannot be undone.">
        <p>Are you sure?</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Delete event')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('closes on Escape and on the close button', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Closable">
        body
      </Modal>,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ignores Escape when not dismissible', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Save this code" dismissible={false}>
        body
      </Modal>,
    );

    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });
});
