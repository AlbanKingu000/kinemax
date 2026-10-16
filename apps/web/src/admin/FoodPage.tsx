import { menuCategorySchema, type AdminMenuItem, type MenuCategory } from '@kinemax/shared';
import { useEffect, useId, useState, type SubmitEvent } from 'react';
import {
  deleteMenuItem,
  fetchAdminMenu,
  fetchDeliveries,
  markDelivered,
  saveMenuItem,
  saveMenuOffer,
  uploadMenuImage,
} from '../api/admin';
import { useAuth } from '../auth/auth-context';
import { localDateTime } from '../booking/ticket-format';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Choice/Checkbox';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { DataTable } from '../components/DataTable/DataTable';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { FormField } from '../components/FormField/FormField';
import { Input } from '../components/Input/Input';
import { Modal } from '../components/Modal/Modal';
import { Select } from '../components/Select/Select';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { Tabs } from '../components/Tabs/Tabs';
import { useToast } from '../components/Toast/toast-context';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages } from '../i18n/admin-messages';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useAdminLocation } from './admin-location';
import styles from './AdminPage.module.css';
import { parseEuros } from './format';
import { slugify } from './slug';

/** /admin/food: the menu (items, each cinema's offer) and today's seat deliveries. */
export function FoodPage() {
  const f = useAdminMessages().food;
  const { selected } = useAdminLocation();
  const [tab, setTab] = useState('menu');
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{f.title}</h1>
      </header>
      {!selected && <p className={styles.hint}>{f.chooseCinema}</p>}
      <Tabs
        label={f.tabs}
        selected={tab}
        onSelect={setTab}
        tabs={[
          { id: 'menu', label: f.menuTab, content: <MenuTab /> },
          {
            id: 'deliveries',
            label: f.deliveriesTab,
            content: selected ? (
              <DeliveriesTab locationId={selected.id} />
            ) : (
              <p className={styles.hint}>{f.chooseCinema}</p>
            ),
          },
        ]}
      />
    </div>
  );
}

function MenuTab() {
  const f = useAdminMessages().food;
  const t = useMessages();
  const { locale } = useLocale();
  const { user } = useAuth();
  const { selected } = useAdminLocation();
  const toast = useToast();
  const superAdmin = user?.role === 'SUPER_ADMIN';
  const state = useAsync(
    (signal) => fetchAdminMenu(selected?.id ?? null, signal),
    `menu:${selected?.id ?? ''}`,
  );
  const [editing, setEditing] = useState<AdminMenuItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminMenuItem | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === 'loading') return <Skeleton shape="rect" height="16rem" />;
  if (state.status === 'error') {
    return (
      <EmptyState
        icon="warning"
        tone="error"
        title={f.loadError}
        action={<Button onClick={state.retry}>{t.common.retry}</Button>}
      />
    );
  }
  const items = state.data;
  const name = (i: AdminMenuItem) => pickText(locale, i.nameSq, i.nameEn);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteMenuItem(deleting.id);
      toast.show({ tone: 'success', title: f.deleted });
      setDeleting(null);
      state.retry();
    } catch {
      toast.show({ tone: 'error', title: f.hasOrders });
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      {superAdmin && (
        <div className={styles.actions}>
          <Button
            size="sm"
            icon="plus"
            onClick={() => {
              setEditing('new');
            }}
          >
            {f.add}
          </Button>
        </div>
      )}
      <DataTable caption={f.menuTab} hideCaption>
        <thead>
          <tr>
            <th scope="col">{f.columns.item}</th>
            <th scope="col">{f.columns.category}</th>
            {selected && <th scope="col">{f.columns.offer}</th>}
            {superAdmin && <th scope="col">{f.columns.status}</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <th scope="row">
                {name(item)}
                {item.isCombo && (
                  <span className={styles.sub}>
                    {item.components.map((c) => `${String(c.quantity)}× ${c.nameSq}`).join(', ')}
                  </span>
                )}
              </th>
              <td>{t.food.categories[item.category]}</td>
              {selected && (
                <td>
                  <OfferEditor item={item} locationId={selected.id} label={name(item)} />
                </td>
              )}
              {superAdmin && (
                <td>
                  <div className={styles.rowActions}>
                    <Badge tone={item.isActive ? 'success' : 'neutral'}>
                      {item.isActive ? f.active : f.inactive}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="edit"
                      aria-label={f.editLabel(name(item))}
                      onClick={() => {
                        setEditing(item);
                      }}
                    >
                      {f.edit}
                    </Button>
                    {!item.hasOrders && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="close"
                        aria-label={f.deleteLabel(name(item))}
                        onClick={() => {
                          setDeleting(item);
                        }}
                      >
                        {f.delete}
                      </Button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </DataTable>
      {editing && (
        <ItemDialog
          item={editing === 'new' ? null : editing}
          items={items}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            state.retry();
          }}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={f.deleteTitle}
        confirmLabel={f.confirmDelete}
        cancelLabel={f.form.cancel}
        busy={busy}
        onCancel={() => {
          setDeleting(null);
        }}
        onConfirm={() => void remove()}
      >
        {deleting && (
          <>
            <p>
              <strong>{name(deleting)}</strong>
            </p>
            <p>{f.deleteBody}</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** Availability and price of one item at the chosen cinema. */
function OfferEditor({
  item,
  locationId,
  label,
}: {
  item: AdminMenuItem;
  locationId: string;
  label: string;
}) {
  const f = useAdminMessages().food;
  const toast = useToast();
  const priceId = useId();
  const [available, setAvailable] = useState(item.offer?.isAvailable ?? false);
  const [price, setPrice] = useState(
    item.offer ? (item.offer.priceCents / 100).toFixed(2).replace('.', ',') : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    const cents = parseEuros(price);
    if (cents === null) {
      setError(f.invalidPrice);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveMenuOffer(item.id, locationId, { isAvailable: available, priceCents: cents });
      toast.show({ tone: 'success', title: f.saved });
    } catch {
      setError(f.invalidPrice);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.rowActions}>
      <Checkbox
        label={<span className="visually-hidden">{f.available(label)}</span>}
        checked={available}
        onChange={(e) => {
          setAvailable(e.target.checked);
        }}
      />
      <label htmlFor={priceId} className="visually-hidden">
        {f.price(label)}
      </label>
      <Input
        id={priceId}
        className={styles.amountInput}
        inputMode="decimal"
        value={price}
        placeholder={item.offer ? undefined : '€'}
        onChange={(e) => {
          setPrice(e.target.value);
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        loading={busy}
        aria-label={f.saveOffer(label)}
        onClick={() => void save()}
      >
        {f.save}
      </Button>
      {error && (
        <span className={styles.fieldError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function ItemDialog({
  item,
  items,
  onClose,
  onSaved,
}: {
  item: AdminMenuItem | null;
  items: AdminMenuItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const f = useAdminMessages().food;
  const t = useMessages();
  const toast = useToast();
  const fileId = useId();
  const [current, setCurrent] = useState(item);
  const [nameSq, setNameSq] = useState(item?.nameSq ?? '');
  const [nameEn, setNameEn] = useState(item?.nameEn ?? '');
  const [slug, setSlug] = useState(item?.slug ?? '');
  const [descriptionSq, setDescriptionSq] = useState(item?.descriptionSq ?? '');
  const [descriptionEn, setDescriptionEn] = useState(item?.descriptionEn ?? '');
  const [category, setCategory] = useState<MenuCategory>(item?.category ?? 'POPCORN');
  const [active, setActive] = useState(item?.isActive ?? true);
  const [contents, setContents] = useState<Record<string, number>>(
    Object.fromEntries((item?.components ?? []).map((c) => [c.componentId, c.quantity])),
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const singles = items.filter((i) => !i.isCombo && i.id !== item?.id);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveMenuItem(current?.id ?? null, {
        slug: slug || slugify(nameSq),
        nameSq,
        nameEn,
        descriptionSq,
        descriptionEn,
        category,
        isActive: active,
        components:
          category === 'COMBO'
            ? Object.entries(contents)
                .filter(([, q]) => q > 0)
                .map(([componentId, quantity]) => ({ componentId, quantity }))
            : [],
      });
      toast.show({ tone: 'success', title: f.saved });
      if (current) onSaved();
      else setCurrent(saved);
    } catch {
      setError(f.form.error);
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!current || !file) return;
    setBusy(true);
    try {
      setCurrent(await uploadMenuImage(current.id, file));
      toast.show({ tone: 'success', title: f.form.uploaded });
      setFile(null);
    } catch {
      setError(f.form.imageError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={current && !item ? onSaved : onClose}
      title={item ? f.form.editTitle : f.form.newTitle}
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={current && !item ? onSaved : onClose}>
            {f.form.cancel}
          </Button>
          <Button type="submit" form="menu-item-form" icon="check" loading={busy}>
            {f.form.save}
          </Button>
        </div>
      }
    >
      <form
        id="menu-item-form"
        className={styles.page}
        noValidate
        onSubmit={(e) => void onSubmit(e)}
      >
        {error && (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fields}>
          <FormField label={f.form.nameSq} required>
            {(props) => (
              <Input
                {...props}
                value={nameSq}
                onChange={(e) => {
                  setNameSq(e.target.value);
                  if (!item) setSlug(slugify(e.target.value));
                }}
              />
            )}
          </FormField>
          <FormField label={f.form.nameEn} optional>
            {(props) => (
              <Input
                {...props}
                lang="en"
                value={nameEn}
                onChange={(e) => {
                  setNameEn(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={f.form.slug} required>
            {(props) => (
              <Input
                {...props}
                value={slug}
                spellCheck={false}
                onChange={(e) => {
                  setSlug(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={f.form.category} required>
            {(props) => (
              <Select
                {...props}
                value={category}
                onChange={(e) => {
                  setCategory(menuCategorySchema.parse(e.target.value));
                }}
              >
                {menuCategorySchema.options.map((c) => (
                  <option key={c} value={c}>
                    {t.food.categories[c]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={f.form.descriptionSq} optional className={styles.wide}>
            {(props) => (
              <Input
                {...props}
                value={descriptionSq}
                onChange={(e) => {
                  setDescriptionSq(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={f.form.descriptionEn} optional className={styles.wide}>
            {(props) => (
              <Input
                {...props}
                lang="en"
                value={descriptionEn}
                onChange={(e) => {
                  setDescriptionEn(e.target.value);
                }}
              />
            )}
          </FormField>
          <div className={styles.wide}>
            <Checkbox
              label={f.form.active}
              checked={active}
              onChange={(e) => {
                setActive(e.target.checked);
              }}
            />
          </div>
          {category === 'COMBO' && (
            <fieldset className={`${styles.fieldset} ${styles.wide}`}>
              <legend>{f.form.contents}</legend>
              <div className={styles.checks}>
                {singles.map((single) => (
                  <label key={single.id} className={styles.rowActions}>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      className={styles.labelInput}
                      aria-label={f.form.quantity(single.nameSq)}
                      value={String(contents[single.id] ?? 0)}
                      onChange={(e) => {
                        setContents({ ...contents, [single.id]: Number(e.target.value) });
                      }}
                    />
                    <span>{single.nameSq}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      </form>
      <div className={styles.image}>
        <label htmlFor={fileId} className={styles.sectionTitle}>
          {f.form.image}
        </label>
        {current?.imagePath && (
          <img src={current.imagePath} alt="" className={styles.posterPreview} />
        )}
        {current ? (
          <div className={styles.actions}>
            <input
              id={fileId}
              className={styles.file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
              }}
            />
            <Button
              size="sm"
              icon="upload"
              disabled={!file}
              loading={busy}
              onClick={() => void upload()}
            >
              {f.form.upload}
            </Button>
          </div>
        ) : (
          <p className={styles.hint}>{f.form.saveFirst}</p>
        )}
      </div>
    </Modal>
  );
}

/** Today's seat deliveries of one cinema, refreshed every 30 seconds. */
function DeliveriesTab({ locationId }: { locationId: string }) {
  const d = useAdminMessages().food.deliveries;
  const t = useMessages();
  const { locale } = useLocale();
  const toast = useToast();
  const state = useAsync(
    (signal) => fetchDeliveries(locationId, signal),
    `deliveries:${locationId}`,
  );
  const { retry } = state;
  useEffect(() => {
    const timer = window.setInterval(retry, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [retry]);

  if (state.status === 'loading') return <Skeleton shape="rect" height="12rem" />;
  if (state.status === 'error') {
    return (
      <EmptyState
        icon="warning"
        tone="error"
        title={d.error}
        action={<Button onClick={retry}>{t.common.retry}</Button>}
      />
    );
  }
  const { orders, timeZone } = state.data;
  const time = (iso: string) => localDateTime(iso, timeZone).time;
  return (
    <section className={styles.page} aria-labelledby="deliveries-title">
      <h2 id="deliveries-title" className={styles.sectionTitle}>
        {d.title}
      </h2>
      <p className={styles.hint}>{d.refresh}</p>
      {orders.length === 0 ? (
        <p className={styles.hint}>{d.none}</p>
      ) : (
        <DataTable caption={d.title} hideCaption>
          <thead>
            <tr>
              <th scope="col">{d.due}</th>
              <th scope="col">{d.show}</th>
              <th scope="col">{d.seats}</th>
              <th scope="col">{d.items}</th>
              <th scope="col">
                <span className="visually-hidden">{d.deliver}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={`${order.bookingId}-${order.serveTiming}`}
                data-muted={order.deliveredAt ? true : undefined}
              >
                <td data-align="end">
                  {time(order.dueAt)}
                  <span className={styles.sub}>{d.timing[order.serveTiming]}</span>
                </td>
                <td>
                  {pickText(locale, order.movieTitleSq, order.movieTitleEn)}
                  <span className={styles.sub}>
                    {order.hallName} · {time(order.startsAt)}
                  </span>
                </td>
                <th scope="row">{order.seats.join(', ')}</th>
                <td>
                  {order.items
                    .map((i) => `${String(i.quantity)}× ${pickText(locale, i.nameSq, i.nameEn)}`)
                    .join(', ')}
                </td>
                <td>
                  {order.deliveredAt ? (
                    <Badge tone="success">{d.delivered(time(order.deliveredAt))}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      icon="check"
                      aria-label={d.deliverLabel(order.seats.join(', '), time(order.dueAt))}
                      onClick={() => {
                        markDelivered(order.bookingId, order.serveTiming).then(retry, () => {
                          toast.show({ tone: 'error', title: d.error });
                        });
                      }}
                    >
                      {d.deliver}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
