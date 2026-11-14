import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useAppForm } from '@/hooks/useAppForm';

/**
 * The textbox glitches this hook fixes:
 *
 * 1. A validation error raised at submit time never cleared while the user
 *    retyped, so the field stayed red with its message stuck underneath.
 * 2. A server-side error (`setError`, e.g. a 409 from the API) stuck until the
 *    next submit.
 *
 * Both came from react-hook-form's default `mode: 'onSubmit'`. The tests render a
 * real form with real inputs, because `formState` only re-renders when something
 * subscribes to it — a bare `renderHook` would report stale values and pass even
 * if the behaviour regressed.
 */

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
});

type FormValues = z.infer<typeof schema>;

function TestForm({ onValid }: { onValid?: (values: FormValues) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useAppForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  return (
    <form onSubmit={handleSubmit((values) => onValid?.(values))} noValidate>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" invalid={Boolean(errors.email)} {...register('email')} />
      </Field>
      <Button type="submit">Submit</Button>
    </form>
  );
}

describe('useAppForm', () => {
  it('clears the error as soon as the value becomes valid, without resubmitting', async () => {
    const user = userEvent.setup();
    render(<TestForm />);

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();

    // Typing a valid address must clear the message immediately.
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await waitFor(() =>
      expect(screen.queryByText('Email is required')).not.toBeInTheDocument(),
    );
  });

  it('clears a partial-validity error once the value satisfies the rule', async () => {
    const user = userEvent.setup();
    render(<TestForm />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();

    // Finish it into a real address.
    await user.type(screen.getByLabelText('Email'), '@example.com');
    await waitFor(() =>
      expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument(),
    );
  });

  it('does not flag an untouched field before the first interaction', () => {
    render(<TestForm />);
    expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
  });

  it('submits when the form is valid', async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    render(<TestForm onValid={onValid} />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(onValid).toHaveBeenCalled());
    expect(onValid.mock.calls[0][0]).toEqual({ email: 'ada@example.com' });
  });

  it('validates on blur then revalidates on change', async () => {
    // Guards the actual configuration change: the plain `useForm` default is
    // mode 'onSubmit', which is what caused the stuck-error glitch.
    const user = userEvent.setup();
    render(<TestForm />);
    const email = screen.getByLabelText('Email');

    // Blur with an invalid value → error appears without submitting.
    await user.type(email, 'nope');
    await user.tab();
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();

    // Correcting it clears the error without a submit.
    await user.type(email, '@example.com');
    await waitFor(() =>
      expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument(),
    );
  });
});
