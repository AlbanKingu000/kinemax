import { PASSWORD_MIN_LENGTH, registerRequestSchema } from '@kinemax/shared';
import { useState, type SyntheticEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { ApiRequestError } from '../../api/http';
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
import { useLocale, useMessages } from '../../i18n/use-messages';
import styles from './AuthLayout.module.css';
import { fieldIssues, sameAsEmail } from '../../auth/helpers';
import { AuthLayout } from './AuthLayout';

const IDS = { name: 'register-name', email: 'register-email', password: 'register-password' };
type Field = keyof typeof IDS;

export function RegisterPage() {
  const t = useMessages();
  const { locale } = useLocale();
  const { status, register } = useAuth();
  const [params] = useSearchParams();
  const next = safeNextPath(params.get('next'));
  usePageMeta(`${t.auth.registerTitle} · ${t.meta.titleSuffix}`, t.auth.registerDescription);

  const [values, setValues] = useState<Record<Field, string>>({
    name: '',
    email: '',
    password: '',
  });
  const [fields, setFields] = useState<Partial<Record<Field, string>>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to={next} replace />;

  const set = (field: Field) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (submitting) return;
    setGeneral(null);
    const parsed = registerRequestSchema.safeParse({ ...values, preferredLocale: locale });
    const issues = parsed.success ? {} : fieldIssues(parsed.error.issues);
    if (!issues.password && sameAsEmail(values.password, values.email)) {
      issues.password = 'same_as_email';
    }
    if (!parsed.success || Object.keys(issues).length > 0) {
      setFields(
        Object.fromEntries(
          Object.entries(issues)
            .filter(([key]) => key in IDS)
            .map(([key, code]) => [key, fieldErrorMessage(t, key, code)]),
        ),
      );
      setAttempt((n) => n + 1);
      return;
    }
    setFields({});
    setSubmitting(true);
    try {
      await register(parsed.data);
    } catch (error) {
      // The server's password policy (e.g. a common password) answers with field codes.
      const known =
        error instanceof ApiRequestError && error.code === 'validation_failed'
          ? error.fields.filter((issue) => issue.path in IDS)
          : [];
      if (known.length > 0) {
        setFields(
          Object.fromEntries(
            known.map((issue) => [issue.path, fieldErrorMessage(t, issue.path, issue.code)]),
          ),
        );
      } else {
        setGeneral(authErrorMessage(t, error, 'register'));
      }
      setAttempt((n) => n + 1);
      setSubmitting(false);
    }
  }

  const summary: SummaryError[] = [
    ...(general ? [{ message: general }] : []),
    ...(Object.entries(fields) as [Field, string][]).map(([key, message]) => ({
      fieldId: IDS[key],
      message,
    })),
  ];

  return (
    <AuthLayout
      title={t.auth.registerTitle}
      intro={t.auth.registerIntro}
      footer={
        <>
          {t.auth.haveAccount}{' '}
          <Link to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`}>
            {t.auth.toLogin}
          </Link>
        </>
      }
    >
      <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
        <ErrorSummary title={t.auth.errorSummary} errors={summary} attempt={attempt} />
        <FormField label={t.auth.name} id={IDS.name} error={fields.name} required>
          {(control) => (
            <Input
              {...control}
              name="name"
              autoComplete="name"
              value={values.name}
              onChange={set('name')}
            />
          )}
        </FormField>
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
              value={values.email}
              onChange={set('email')}
            />
          )}
        </FormField>
        <FormField
          label={t.auth.password}
          id={IDS.password}
          hint={t.auth.passwordHint(PASSWORD_MIN_LENGTH)}
          error={fields.password}
          required
        >
          {(control) => (
            <PasswordInput
              {...control}
              name="password"
              autoComplete="new-password"
              value={values.password}
              onChange={set('password')}
            />
          )}
        </FormField>
        <Button type="submit" size="lg" className={styles.submit} loading={submitting}>
          {t.auth.submitRegister}
        </Button>
      </form>
    </AuthLayout>
  );
}
