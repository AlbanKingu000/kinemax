import { loginRequestSchema } from '@kinemax/shared';
import { useState, type SyntheticEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { authErrorMessage, fieldErrorMessage } from '../../auth/auth-errors';
import { useAuth } from '../../auth/auth-context';
import { safeNextPath } from '../../auth/next-path';
import { Button } from '../../components/Button/Button';
import { ErrorSummary, type SummaryError } from '../../components/ErrorSummary/ErrorSummary';
import { FormField } from '../../components/FormField/FormField';
import { Input } from '../../components/Input/Input';
import { Link } from '../../components/Link/Link';
import { PasswordInput } from '../../components/PasswordInput/PasswordInput';
import { usePageMeta } from '../../hooks/use-page-meta';
import { useMessages } from '../../i18n/use-messages';
import styles from './AuthLayout.module.css';
import { fieldIssues } from '../../auth/helpers';
import { AuthLayout } from './AuthLayout';

const IDS = { email: 'login-email', password: 'login-password' } as const;

export function LoginPage() {
  const t = useMessages();
  const { status, login } = useAuth();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  usePageMeta(`${t.auth.loginTitle} · ${t.meta.titleSuffix}`, t.auth.loginDescription);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Partial<Record<keyof typeof IDS, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Signed in (also right after a successful login): continue where the user came from.
  if (status === 'authenticated') return <Navigate to={next} replace />;

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (submitting) return;
    setGeneral(null);
    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issues = fieldIssues(parsed.error.issues);
      setFields({
        ...(issues.email ? { email: fieldErrorMessage(t, 'email', issues.email) } : {}),
        ...(issues.password ? { password: t.auth.errors.required } : {}),
      });
      setAttempt((n) => n + 1);
      return;
    }
    setFields({});
    setSubmitting(true);
    try {
      await login(parsed.data);
    } catch (error) {
      setGeneral(authErrorMessage(t, error, 'login'));
      setAttempt((n) => n + 1);
      setSubmitting(false);
    }
  }

  const summary: SummaryError[] = [
    ...(general ? [{ message: general }] : []),
    ...(Object.entries(fields) as [keyof typeof IDS, string][]).map(([key, message]) => ({
      fieldId: IDS[key],
      message,
    })),
  ];

  return (
    <AuthLayout
      title={t.auth.loginTitle}
      intro={t.auth.loginIntro}
      footer={
        <>
          {t.auth.noAccount}{' '}
          <Link to={next === '/' ? '/register' : `/register?next=${encodeURIComponent(next)}`}>
            {t.auth.toRegister}
          </Link>
        </>
      }
    >
      <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
        <ErrorSummary title={t.auth.errorSummary} errors={summary} attempt={attempt} />
        <FormField label={t.auth.email} id={IDS.email} error={fields.email} required>
          {(control) => (
            <Input
              {...control}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          )}
        </FormField>
        <FormField label={t.auth.password} id={IDS.password} error={fields.password} required>
          {(control) => (
            <PasswordInput
              {...control}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          )}
        </FormField>
        <Button type="submit" size="lg" className={styles.submit} loading={submitting}>
          {t.auth.submitLogin}
        </Button>
      </form>
    </AuthLayout>
  );
}
