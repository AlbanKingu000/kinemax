import { ADMIN_PAGE_SIZE, userRoleSchema, type AdminUser, type UserRole } from '@kinemax/shared';
import { useId, useState } from 'react';
import { ApiRequestError } from '../api/http';
import { fetchAdminUsers, updateAdminUser } from '../api/admin';
import { useAuth } from '../auth/auth-context';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Choice/Checkbox';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { DataTable } from '../components/DataTable/DataTable';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Input } from '../components/Input/Input';
import { Modal } from '../components/Modal/Modal';
import { Select } from '../components/Select/Select';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useToast } from '../components/Toast/toast-context';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages, type AdminMessages } from '../i18n/admin-messages';
import { useMessages } from '../i18n/use-messages';
import { useAdminLocation } from './admin-location';
import styles from './AdminPage.module.css';
import { Pager } from './Pager';

type UsersText = AdminMessages['users'];

/** The refusal of the server as a sentence (self change, last super admin, anything else). */
function userErrorMessage(error: unknown, u: UsersText): string {
  const code = error instanceof ApiRequestError ? error.fields[0]?.code : undefined;
  if (code === 'self') return u.errors.self;
  if (code === 'last_super_admin') return u.errors.lastSuperAdmin;
  return u.errors.generic;
}

/** /admin/users: search, role and cinemas, deactivate/reactivate (super admin). */
export function UsersPage() {
  const u = useAdminMessages().users;
  const t = useMessages();
  const { user: me } = useAuth();
  const { locations } = useAdminLocation();
  const searchId = useId();
  const roleId = useId();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [toggling, setToggling] = useState<AdminUser | null>(null);
  const query = q.trim();
  const state = useAsync(
    (signal) =>
      fetchAdminUsers({ ...(query ? { q: query } : {}), ...(role ? { role } : {}), page }, signal),
    `users:${query}:${role}:${String(page)}`,
  );
  const cinemaNames = (ids: readonly string[]) =>
    locations
      .filter((l) => ids.includes(l.id))
      .map((l) => l.name)
      .join(', ');

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{u.title}</h1>
      </header>

      <div className={styles.filters} role="search">
        <div className={styles.filter}>
          <label htmlFor={searchId}>{u.search}</label>
          <Input
            id={searchId}
            type="search"
            icon="search"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className={styles.filter}>
          <label htmlFor={roleId}>{u.role}</label>
          <Select
            id={roleId}
            value={role}
            onChange={(event) => {
              const parsed = userRoleSchema.safeParse(event.target.value);
              setRole(parsed.success ? parsed.data : '');
              setPage(1);
            }}
          >
            <option value="">{u.anyRole}</option>
            {userRoleSchema.options.map((value) => (
              <option key={value} value={value}>
                {u.roles[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {state.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="20rem" />
        </div>
      )}
      {state.status === 'error' && (
        <EmptyState
          icon="warning"
          tone="error"
          title={u.loadError}
          action={<Button onClick={state.retry}>{t.common.retry}</Button>}
        />
      )}
      {state.status === 'ready' && state.data.users.length === 0 && (
        <EmptyState icon="user" title={u.none} />
      )}
      {state.status === 'ready' && state.data.users.length > 0 && (
        <>
          <DataTable caption={u.title} hideCaption>
            <thead>
              <tr>
                <th scope="col">{u.columns.name}</th>
                <th scope="col">{u.columns.email}</th>
                <th scope="col">{u.columns.role}</th>
                <th scope="col">{u.columns.cinemas}</th>
                <th scope="col">{u.columns.status}</th>
                <th scope="col">
                  <span className="visually-hidden">{u.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.data.users.map((user) => {
                const self = user.id === me?.id;
                return (
                  <tr key={user.id}>
                    <th scope="row">
                      {user.name} {self && <Badge tone="info">{u.you}</Badge>}
                    </th>
                    <td>{user.email}</td>
                    <td>{u.roles[user.role]}</td>
                    <td>{cinemaNames(user.locationIds) || '—'}</td>
                    <td>
                      <Badge tone={user.isActive ? 'success' : 'neutral'}>
                        {user.isActive ? u.active : u.inactive}
                      </Badge>
                    </td>
                    <td>
                      {!self && (
                        <div className={styles.rowActions}>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="edit"
                            aria-label={u.edit(user.name)}
                            onClick={() => {
                              setEditing(user);
                            }}
                          >
                            {u.columns.role}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={
                              user.isActive ? u.deactivate(user.name) : u.reactivate(user.name)
                            }
                            onClick={() => {
                              setToggling(user);
                            }}
                          >
                            {user.isActive ? u.deactivateConfirm : u.reactivateConfirm}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <Pager
            page={page}
            pages={Math.max(1, Math.ceil(state.data.total / ADMIN_PAGE_SIZE))}
            onPage={setPage}
          />
        </>
      )}

      {editing && (
        <RoleDialog
          user={editing}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            state.retry();
          }}
        />
      )}
      {toggling && (
        <ToggleDialog
          user={toggling}
          onClose={() => {
            setToggling(null);
          }}
          onSaved={() => {
            setToggling(null);
            state.retry();
          }}
        />
      )}
    </div>
  );
}

function RoleDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const u = useAdminMessages().users;
  const toast = useToast();
  const { locations } = useAdminLocation();
  const roleId = useId();
  const [role, setRole] = useState<UserRole>(user.role);
  const [cinemas, setCinemas] = useState<string[]>(user.locationIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateAdminUser(user.id, {
        role,
        ...(role === 'LOCATION_MANAGER' ? { locationIds: cinemas } : {}),
      });
      toast.show({ tone: 'success', title: u.saved });
      onSaved();
    } catch (caught) {
      setError(userErrorMessage(caught, u));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={u.editTitle(user.name)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {u.cancel}
          </Button>
          <Button icon="check" loading={busy} onClick={() => void save()}>
            {u.save}
          </Button>
        </>
      }
    >
      <div className={styles.fields}>
        <div className={styles.filter}>
          <label htmlFor={roleId}>{u.role}</label>
          <Select
            id={roleId}
            value={role}
            onChange={(event) => {
              setRole(userRoleSchema.parse(event.target.value));
            }}
          >
            {userRoleSchema.options.map((value) => (
              <option key={value} value={value}>
                {u.roles[value]}
              </option>
            ))}
          </Select>
        </div>
        {role === 'LOCATION_MANAGER' && (
          <fieldset className={`${styles.fieldset} ${styles.wide}`}>
            <legend>{u.cinemas}</legend>
            <div className={styles.checks}>
              {locations.map((location) => (
                <Checkbox
                  key={location.id}
                  label={location.name}
                  checked={cinemas.includes(location.id)}
                  onChange={(event) => {
                    const { checked } = event.target;
                    setCinemas((ids) =>
                      checked ? [...ids, location.id] : ids.filter((id) => id !== location.id),
                    );
                  }}
                />
              ))}
            </div>
          </fieldset>
        )}
        {role !== user.role && <p className={`${styles.hint} ${styles.wide}`}>{u.roleImpact}</p>}
        {error && (
          <p className={`${styles.fieldError} ${styles.wide}`} role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function ToggleDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const u = useAdminMessages().users;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const deactivate = user.isActive;

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      await updateAdminUser(user.id, { isActive: !deactivate });
      toast.show({ tone: 'success', title: u.saved });
      onSaved();
    } catch (caught) {
      setError(userErrorMessage(caught, u));
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open
      title={deactivate ? u.deactivateTitle : u.reactivateTitle}
      confirmLabel={deactivate ? u.deactivateConfirm : u.reactivateConfirm}
      cancelLabel={u.cancel}
      onConfirm={() => void confirm()}
      onCancel={onClose}
      busy={busy}
      error={error}
    >
      <p>{deactivate ? u.deactivateBody(user.name) : u.reactivateBody(user.name)}</p>
    </ConfirmDialog>
  );
}
