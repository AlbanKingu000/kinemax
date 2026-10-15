import {
  changePasswordRequestSchema,
  nameSchema,
  PASSWORD_MIN_LENGTH,
  type Locale,
} from '@kinemax/shared';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError } from '../api/http';
import { authErrorMessage, fieldErrorMessage } from '../auth/auth-errors';
import { useAuth } from '../auth/auth-context';
import { Button, ButtonLink } from '../components/Button/Button';
import { RadioGroup } from '../components/Choice/Radio';

import { ErrorSummary, type SummaryError } from '../components/ErrorSummary/ErrorSummary';
import { FormField } from '../components/FormField/FormField';
import { Input } from '../components/Input/Input';
import { Container } from '../components/Layout/Layout';
import { PasswordInput } from '../components/PasswordInput/PasswordInput';
import { useToast } from '../components/Toast/toast-context';
import { usePageMeta } from '../hooks/use-page-meta';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './AccountPage.module.css';
import { fieldIssues } from '../auth/helpers';

const NATIVE: Record<Locale, string> = { sq: 'Shqip', en: 'English' };

/** /account: profile, language, password, sessions and (later) tickets. Behind RequireAuth. */
export function AccountPage() {
  const t = useMessages();
  usePageMeta(`${t.account.title} · ${t.meta.titleSuffix}`, t.account.description);
  return (
    <Container narrow className={styles.page}>
      <h1 className={styles.title}>{t.account.title}</h1>
      <ProfileSection />
      <PasswordSection />
      <DevicesSection />
      <section aria-labelledby="account-tickets" className={styles.section}>
        <h2 id="account-tickets" className={styles.heading}>
          {t.account.myTickets}
        </h2>
        <p className={styles.text}>{t.myTickets.description}</p>
        <div>
          <ButtonLink to="/account/tickets" variant="secondary" icon="ticket">
            {t.account.myTickets}
          </ButtonLink>
        </div>
      </section>
    </Container>
  );
}

function ProfileSection() {
  const t = useMessages();
  const { setLocale } = useLocale();
  const { user, updateMe } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [language, setLanguage] = useState<Locale>(user?.preferredLocale ?? 'sq');
  const [errors, setErrors] = useState<SummaryError[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  // A flag, not text: saving may switch the language, and the message must follow it.
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (saving) return;
    setSaved(false);
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setErrors([
        {
          fieldId: 'account-name',
          message: fieldErrorMessage(t, 'name', parsed.error.issues[0]?.code ?? ''),
        },
      ]);
      setAttempt((n) => n + 1);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const saved = await updateMe({ name: parsed.data, preferredLocale: language });
      setLocale(saved.preferredLocale);
      setSaved(true);
    } catch (error) {
      setErrors([{ message: authErrorMessage(t, error) }]);
      setAttempt((n) => n + 1);
    } finally {
      setSaving(false);
    }
  }

  const nameError = errors.find((e) => e.fieldId === 'account-name')?.message;
  return (
    <section aria-labelledby="account-profile" className={styles.section}>
      <h2 id="account-profile" className={styles.heading}>
        {t.account.profile}
      </h2>
      <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
        <ErrorSummary title={t.auth.errorSummary} errors={errors} attempt={attempt} />
        <FormField label={t.auth.name} id="account-name" error={nameError} required>
          {(control) => (
            <Input
              {...control}
              name="name"
              autoComplete="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </FormField>
        <FormField label={t.auth.email} hint={t.account.emailReadOnly}>
          {(control) => <Input {...control} type="email" value={user?.email ?? ''} readOnly />}
        </FormField>
        <RadioGroup
          legend={t.account.preferredLanguage}
          name="preferredLocale"
          value={language}
          inline
          options={(['sq', 'en'] as const).map((value) => ({ value, label: NATIVE[value] }))}
          onChange={setLanguage}
        />
        <div className={styles.actions}>
          <Button type="submit" loading={saving}>
            {t.account.save}
          </Button>
          <p role="status" className={styles.status}>
            {saved ? t.account.saved : ''}
          </p>
        </div>
      </form>
    </section>
  );
}

function PasswordSection() {
  const t = useMessages();
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [fields, setFields] = useState<{ current?: string; next?: string }>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);

  async function onSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (saving) return;
    setChanged(false);
    setGeneral(null);
    const parsed = changePasswordRequestSchema.safeParse({
      currentPassword: current,
      newPassword: next,
    });
    if (!parsed.success) {
      const issues = fieldIssues(parsed.error.issues);
      setFields({
        ...(issues.currentPassword ? { current: t.auth.errors.required } : {}),
        ...(issues.newPassword
          ? { next: fieldErrorMessage(t, 'newPassword', issues.newPassword) }
          : {}),
      });
      setAttempt((n) => n + 1);
      return;
    }
    setFields({});
    setSaving(true);
    try {
      await changePassword(parsed.data);
      setCurrent('');
      setNext('');
      setChanged(true);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'validation_failed') {
        const issue = error.fields.find((f) => f.path === 'newPassword');
        setFields(issue ? { next: fieldErrorMessage(t, 'newPassword', issue.code) } : {});
        if (!issue) setGeneral(t.auth.errors.generic);
      } else {
        setGeneral(authErrorMessage(t, error, 'changePassword'));
      }
      setAttempt((n) => n + 1);
    } finally {
      setSaving(false);
    }
  }

  const summary: SummaryError[] = [
    ...(general ? [{ message: general }] : []),
    ...(fields.current ? [{ fieldId: 'account-current-password', message: fields.current }] : []),
    ...(fields.next ? [{ fieldId: 'account-new-password', message: fields.next }] : []),
  ];
  return (
    <section aria-labelledby="account-password" className={styles.section}>
      <h2 id="account-password" className={styles.heading}>
        {t.account.security}
      </h2>
      <form className={styles.form} noValidate onSubmit={(event) => void onSubmit(event)}>
        <ErrorSummary title={t.auth.errorSummary} errors={summary} attempt={attempt} />
        <FormField
          label={t.account.currentPassword}
          id="account-current-password"
          error={fields.current}
          required
        >
          {(control) => (
            <PasswordInput
              {...control}
              name="currentPassword"
              autoComplete="current-password"
              value={current}
              onChange={(event) => {
                setCurrent(event.target.value);
              }}
            />
          )}
        </FormField>
        <FormField
          label={t.account.newPassword}
          id="account-new-password"
          hint={t.auth.passwordHint(PASSWORD_MIN_LENGTH)}
          error={fields.next}
          required
        >
          {(control) => (
            <PasswordInput
              {...control}
              name="newPassword"
              autoComplete="new-password"
              value={next}
              onChange={(event) => {
                setNext(event.target.value);
              }}
            />
          )}
        </FormField>
        <div className={styles.actions}>
          <Button type="submit" variant="secondary" loading={saving}>
            {t.account.changePassword}
          </Button>
          <p role="status" className={styles.status}>
            {changed ? t.account.passwordChanged : ''}
          </p>
        </div>
      </form>
    </section>
  );
}

function DevicesSection() {
  const t = useMessages();
  const toast = useToast();
  const navigate = useNavigate();
  const { logoutAll } = useAuth();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    // Leave the protected page first; otherwise its guard sends us to the login page.
    void navigate('/', { replace: true });
    try {
      await logoutAll();
      toast.show({ tone: 'success', title: t.account.loggedOutEverywhere });
    } catch (failure) {
      toast.show({ tone: 'error', title: authErrorMessage(t, failure) });
    }
  }

  return (
    <section aria-labelledby="account-devices" className={styles.section}>
      <h2 id="account-devices" className={styles.heading}>
        {t.account.devices}
      </h2>
      <p className={styles.text}>{t.account.devicesBody}</p>
      <div className={styles.actions}>
        <Button variant="secondary" icon="logout" loading={busy} onClick={() => void onClick()}>
          {t.account.logoutAll}
        </Button>
      </div>
    </section>
  );
}
