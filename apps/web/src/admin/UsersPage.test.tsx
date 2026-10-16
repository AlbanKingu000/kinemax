import type { AdminUser, AuditResponse } from '@kinemax/shared';
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ADMIN_LOCATIONS, stubAdmin, superAdminUser } from '../test/admin';
import { renderApp } from '../test/catalog';

beforeAll(async () => {
  await import('./AdminApp');
});

const me = superAdminUser();
const id = (n: string) => `0190f0a0-0000-7000-8000-0000000000${n}`;
const user = (n: string, name: string, extra: Partial<AdminUser> = {}): AdminUser => ({
  id: id(n),
  email: `${name.toLowerCase().replace(' ', '.')}@kinemax.test`,
  name,
  role: 'CUSTOMER',
  isActive: true,
  createdAt: '2026-01-01T10:00:00.000Z',
  locationIds: [],
  ...extra,
});
const users = [
  { ...user('a1', me.name, { role: 'SUPER_ADMIN' }), id: me.id },
  user('a2', 'Ana Krasniqi'),
  user('a3', 'Admin Dy', { role: 'SUPER_ADMIN' }),
];

function stubUsers(onPatch: (body: unknown, path: string) => unknown) {
  const requests: { method: string; path: string; body: unknown }[] = [];
  stubAdmin(me, (req) => {
    requests.push(req);
    if (req.path === '/api/admin/users') return { users, total: users.length };
    if (req.method === 'PATCH') return onPatch(req.body, req.path);
    return undefined;
  });
  return requests;
}

describe('the users page', () => {
  it('makes a customer a cinema manager and deactivates an account after confirming', async () => {
    const requests = stubUsers((body) => ({ user: { ...users[1], ...(body as object) } }));
    renderApp('/admin/users');
    const self = await screen.findByRole('row', { name: new RegExp(me.name) });
    expect(within(self).getByText('Ti')).toBeInTheDocument();
    expect(within(self).queryByRole('button')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ndrysho: Ana Krasniqi' }));
    const dialog = screen.getByRole('dialog', { name: 'Ndrysho rolin: Ana Krasniqi' });
    fireEvent.change(within(dialog).getByLabelText('Roli'), {
      target: { value: 'LOCATION_MANAGER' },
    });
    expect(within(dialog).getByText(/nxjerr përdoruesin nga llogaria/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(ADMIN_LOCATIONS[1]?.name ?? ''));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ruaj' }));
    await vi.waitFor(() => {
      expect(requests.find((r) => r.method === 'PATCH')).toMatchObject({
        path: `/api/admin/users/${id('a2')}`,
        body: { role: 'LOCATION_MANAGER', locationIds: [ADMIN_LOCATIONS[1]?.id] },
      });
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Çaktivizo: Ana Krasniqi' }));
    const confirm = screen.getByRole('dialog', { name: 'Çaktivizo llogarinë?' });
    expect(confirm).toHaveTextContent('del menjëherë nga të gjitha pajisjet');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Çaktivizo' }));
    await vi.waitFor(() => {
      expect(requests.filter((r) => r.method === 'PATCH').at(-1)?.body).toEqual({
        isActive: false,
      });
    });
  });

  it('explains when the last super admin cannot be demoted', async () => {
    stubUsers(() => ({
      status: 409,
      body: {
        error: {
          code: 'conflict',
          message: 'x',
          fields: [{ path: 'role', code: 'last_super_admin' }],
        },
      },
    }));
    renderApp('/admin/users');
    fireEvent.click(await screen.findByRole('button', { name: 'Ndrysho: Admin Dy' }));
    const dialog = screen.getByRole('dialog', { name: 'Ndrysho rolin: Admin Dy' });
    fireEvent.change(within(dialog).getByLabelText('Roli'), { target: { value: 'CUSTOMER' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ruaj' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'super administratori i fundit aktiv',
    );
  });
});

describe('the users page, more', () => {
  it('reactivates an account, pages through results and filters by role', async () => {
    const queries: string[] = [];
    const inactive = user('a4', 'Besa Gashi', { isActive: false });
    stubAdmin(me, (req) => {
      if (req.path === '/api/admin/users') {
        queries.push(req.url.search);
        return { users: [inactive], total: 120 };
      }
      if (req.method === 'PATCH') {
        return {
          status: 409,
          body: {
            error: { code: 'conflict', message: 'x', fields: [{ path: 'isActive', code: 'self' }] },
          },
        };
      }
      return undefined;
    });
    renderApp('/admin/users');
    const row = await screen.findByRole('row', { name: /Besa Gashi/ });
    expect(row).toHaveTextContent('Joaktiv');
    expect(screen.getByText('Faqja 1 nga 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mbrapa' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Para' }));
    expect(await screen.findByText('Faqja 2 nga 3')).toBeInTheDocument();
    expect(queries.at(-1)).toContain('page=2');
    fireEvent.click(screen.getByRole('button', { name: 'Mbrapa' }));
    expect(await screen.findByText('Faqja 1 nga 3')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Roli'), { target: { value: 'SUPER_ADMIN' } });
    fireEvent.change(screen.getByLabelText('Kërko emër ose email'), { target: { value: 'besa' } });
    await vi.waitFor(() => {
      expect(queries.at(-1)).toBe('?q=besa&role=SUPER_ADMIN&page=1');
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Aktivizo: Besa Gashi' }));
    const confirm = screen.getByRole('dialog', { name: 'Aktivizo llogarinë?' });
    expect(confirm).toHaveTextContent('do të mund të hyjë përsëri');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Aktivizo' }));
    expect(await within(confirm).findByText(/rolin tënd/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Anulo' }));
  });

  it('offers a retry when the users cannot be loaded', async () => {
    stubAdmin(me, () => ({ status: 500, body: { error: { code: 'internal', message: 'x' } } }));
    renderApp('/admin/users');
    expect(await screen.findByText('Përdoruesit nuk u ngarkuan.')).toBeInTheDocument();
  });
});

describe('the audit log page', () => {
  it('lists changes and filters by type', async () => {
    const audit: AuditResponse = {
      total: 1,
      entityTypes: ['HallTypePrice', 'User'],
      entries: [
        {
          id: id('c1'),
          createdAt: '2026-10-16T08:05:00.000Z',
          actor: { id: me.id, name: me.name, email: me.email },
          action: 'user.update',
          entityType: 'User',
          entityId: id('a2'),
          before: { role: 'CUSTOMER' },
          after: { role: 'LOCATION_MANAGER' },
        },
      ],
    };
    const requests: string[] = [];
    stubAdmin(me, (req) => {
      if (req.path !== '/api/admin/audit') return undefined;
      requests.push(req.url.search);
      return audit;
    });
    renderApp('/admin/audit');
    const row = await screen.findByRole('row', { name: /user\.update/ });
    expect(row).toHaveTextContent('10:05');
    expect(row).toHaveTextContent('"role": "LOCATION_MANAGER"');
    fireEvent.change(screen.getByLabelText('Lloji'), { target: { value: 'User' } });
    await vi.waitFor(() => {
      expect(requests.at(-1)).toContain('entityType=User');
    });
  });
});
