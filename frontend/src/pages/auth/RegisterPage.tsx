import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/Toast';
import { useRegister } from '@/hooks/useAuth';
import { toApiError } from '@/lib/errors';
import { AuthLayout } from './AuthLayout';

/**
 * Mirrors `RegisterRequest` exactly:
 * email(email), username(3-50, ^[a-zA-Z0-9_\-.]+$), password(8-128), display_name(1-150).
 */
const registerSchema = z.object({
  display_name: z
    .string()
    .min(1, 'Display name is required.')
    .max(150, 'Display name must be 150 characters or fewer.'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters.')
    .max(50, 'Username must be 50 characters or fewer.')
    .regex(
      /^[a-zA-Z0-9_\-.]+$/,
      'Use only letters, numbers, underscore, hyphen or period.',
    ),
  email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be 128 characters or fewer.'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const registerMutation = useRegister();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { display_name: '', username: '', email: '', password: '' },
  });

  const apiError = registerMutation.error ? toApiError(registerMutation.error) : null;

  const onSubmit = handleSubmit((values) => {
    registerMutation.mutate(values, {
      onSuccess: () => {
        toast.success('Account created. Welcome aboard.');
        navigate('/dashboard', { replace: true });
      },
      onError: (error) => {
        const parsed = toApiError(error);
        // 409 duplicate email/username arrives as a string detail, so map it back
        // onto the correct field by matching the words the backend uses.
        const lower = parsed.message.toLowerCase();
        if (lower.includes('email')) {
          setError('email', { message: parsed.message });
        } else if (lower.includes('username')) {
          setError('username', { message: parsed.message });
        }
        for (const [field, message] of Object.entries(parsed.fieldErrors)) {
          if (field === 'email' || field === 'username' || field === 'password' || field === 'display_name') {
            setError(field, { message });
          }
        }
      },
    });
  });

  const showTopLevelError =
    apiError &&
    Object.keys(apiError.fieldErrors).length === 0 &&
    !/email|username/i.test(apiError.message);

  return (
    <AuthLayout
      title="Create your account"
      description="Register for events, form teams and submit projects."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-rust hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {showTopLevelError && (
          <Alert tone="error" title="Could not create your account">
            {apiError.message}
          </Alert>
        )}

        <Field label="Display name" htmlFor="display_name" error={errors.display_name?.message} required>
          <Input
            id="display_name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            invalid={Boolean(errors.display_name)}
            {...register('display_name')}
          />
        </Field>

        <Field
          label="Username"
          htmlFor="username"
          hint="Letters, numbers, underscore, hyphen or period."
          error={errors.username?.message}
          required
        >
          <Input
            id="username"
            autoComplete="username"
            placeholder="ada_lovelace"
            invalid={Boolean(errors.username)}
            {...register('username')}
          />
        </Field>

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

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters."
          error={errors.password?.message}
          required
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Choose a strong password"
            invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        <Button type="submit" block loading={registerMutation.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
