import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/Toast';
import { useLogin } from '@/hooks/useAuth';
import { toApiError } from '@/lib/errors';
import { AuthLayout } from './AuthLayout';

/** Mirrors `LoginRequest`: email (email format) + password 1-128 chars. */
const loginSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z
    .string()
    .min(1, 'Password is required.')
    .max(128, 'Password must be 128 characters or fewer.'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const login = useLogin();

  const nextParam = searchParams.get('next');
  const nextPath = nextParam && nextParam.startsWith('/') ? nextParam : '/dashboard';
  const expired = searchParams.get('expired') === '1';

  useEffect(() => {
    if (expired) toast.error('Session expired. Please sign in again.');
    // Only when the redirect came from the 401 interceptor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const apiError = login.error ? toApiError(login.error) : null;

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => {
        toast.success('Signed in.');
        navigate(nextPath, { replace: true });
      },
      onError: (error) => {
        const parsed = toApiError(error);
        if (parsed.fieldErrors.email) {
          setError('email', { message: parsed.fieldErrors.email });
        }
        if (parsed.fieldErrors.password) {
          setError('password', { message: parsed.fieldErrors.password });
        }
      },
    });
  });

  return (
    <AuthLayout
      title="Sign in"
      description="Access your registrations, teams and submissions."
      footer={
        <>
          New to the platform?{' '}
          <Link to="/register" className="font-semibold text-rust hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {apiError && !apiError.fieldErrors.email && !apiError.fieldErrors.password && (
          <Alert tone="error" title="Could not sign in">
            {apiError.message}
          </Alert>
        )}

        <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        <Button type="submit" block loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
