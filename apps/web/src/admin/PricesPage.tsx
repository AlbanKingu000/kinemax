import {
  adjustmentKindSchema,
  seatTypeSchema,
  type AdminPricesResponse,
  type AppSettingsInput,
  type PriceKind,
} from '@kinemax/shared';
import { useId, useState, type SubmitEvent } from 'react';
import {
  endPriceRule,
  fetchAdminPrices,
  fetchSettings,
  savePriceRule,
  saveSettings,
} from '../api/admin';
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
import { useToast } from '../components/Toast/toast-context';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages } from '../i18n/admin-messages';
import { formatPrice } from '../i18n/format';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './AdminPage.module.css';
import { clock, formatMoney, parseEuros } from './format';

type Adjustment = AdminPricesResponse['adjustment'][number];
interface Row {
  key: string;
  label: string;
  kind: PriceKind;
  /** The version in effect (id, value text, since). */
  current: { id: string; text: string; since: string } | null;
  /** Discounts take a kind + value; the others an amount in euros. */
  discount?: boolean;
  body: (value: { cents: number } | { kind: 'PERCENT' | 'FIXED_CENTS'; value: number }) => object;
}

/** /admin/prices: versioned price rules and the app settings (super admin). */
export function PricesPage() {
  const p = useAdminMessages().prices;
  const t = useMessages();
  const state = useAsync(
    (signal) => Promise.all([fetchAdminPrices(signal), fetchSettings(signal)]),
    'prices',
  );
  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <p role="status" className="visually-hidden">
          {t.common.loading}
        </p>
        <Skeleton shape="rect" height="24rem" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <EmptyState
        icon="warning"
        tone="error"
        title={p.loadError}
        headingLevel="h1"
        action={<Button onClick={state.retry}>{t.common.retry}</Button>}
      />
    );
  }
  const [prices, settings] = state.data;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{p.title}</h1>
      </header>
      <p className={styles.hint}>{p.intro}</p>
      <SettingsForm initial={settings} />
      <Rules prices={prices} onChanged={state.retry} />
    </div>
  );
}

function SettingsForm({ initial }: { initial: AppSettingsInput }) {
  const p = useAdminMessages().prices;
  const toast = useToast();
  const [hold, setHold] = useState(String(initial.seatHoldMinutes));
  const [cutoff, setCutoff] = useState(String(initial.cancellationCutoffMinutes));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveSettings({
        seatHoldMinutes: Number(hold),
        cancellationCutoffMinutes: Number(cutoff),
      });
      toast.show({ tone: 'success', title: p.settingsSaved });
    } catch {
      setError(p.error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.section} aria-labelledby="settings-title">
      <h2 id="settings-title" className={styles.sectionTitle}>
        {p.settings}
      </h2>
      <form className={styles.toolbar} noValidate onSubmit={(e) => void onSubmit(e)}>
        <FormField label={p.holdMinutes}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={60}
              value={hold}
              onChange={(e) => {
                setHold(e.target.value);
              }}
            />
          )}
        </FormField>
        <FormField label={p.cutoffMinutes}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={0}
              value={cutoff}
              onChange={(e) => {
                setCutoff(e.target.value);
              }}
            />
          )}
        </FormField>
        <Button type="submit" size="sm" icon="check" loading={busy}>
          {p.saveSettings}
        </Button>
      </form>
      {error && (
        <p className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Rules({ prices, onChanged }: { prices: AdminPricesResponse; onChanged: () => void }) {
  const p = useAdminMessages().prices;
  const t = useMessages();
  const { locale } = useLocale();
  const toast = useToast();
  const [ending, setEnding] = useState<{ kind: PriceKind; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adjusting, setAdjusting] = useState<Adjustment | 'new' | null>(null);
  const editLabel = useAdminMessages().movies.edit;
  const money = (cents: number) => formatPrice(locale, cents);
  const since = (iso: string) => iso.slice(0, 10);
  const name = (x: { nameSq: string; nameEn: string | null }) =>
    pickText(locale, x.nameSq, x.nameEn);
  const discountText = (d: { kind: string; value: number }) =>
    d.kind === 'PERCENT' ? `${String(d.value)}%` : money(d.value);

  const base: Row[] = prices.hallTypes.flatMap((type) =>
    [null, ...prices.locations].map((location) => {
      const rule = prices.base.find(
        (r) => r.hallTypeId === type.id && r.locationId === (location?.id ?? null),
      );
      return {
        key: `base-${type.id}-${location?.id ?? 'g'}`,
        label: `${name(type)} · ${location?.name ?? p.global}`,
        kind: 'base' as const,
        current: rule
          ? { id: rule.id, text: money(rule.priceCents), since: since(rule.validFrom) }
          : null,
        body: (v) => ({
          hallTypeId: type.id,
          locationId: location?.id ?? null,
          priceCents: 'cents' in v ? v.cents : 0,
        }),
      };
    }),
  );
  const surcharge: Row[] = seatTypeSchema.options.map((seatType) => {
    const rule = prices.surcharge.find((r) => r.seatType === seatType);
    return {
      key: `surcharge-${seatType}`,
      label: t.seats.types[seatType],
      kind: 'surcharge',
      current: rule
        ? { id: rule.id, text: money(rule.amountCents), since: since(rule.validFrom) }
        : null,
      body: (v) => ({ seatType, amountCents: 'cents' in v ? v.cents : 0 }),
    };
  });
  const discount: Row[] = prices.categories.map((category) => {
    const rule = prices.discount.find((r) => r.ticketCategoryId === category.id);
    return {
      key: `discount-${category.id}`,
      label: name(category),
      kind: 'discount',
      discount: true,
      current: rule
        ? { id: rule.id, text: discountText(rule), since: since(rule.validFrom) }
        : null,
      body: (v) => ({
        ticketCategoryId: category.id,
        ...('kind' in v ? v : { kind: 'FIXED_CENTS', value: v.cents }),
      }),
    };
  });
  const suite: Row[] = prices.suites.map((hall) => {
    const rule = prices.suite.find((r) => r.hallId === hall.id);
    return {
      key: `suite-${hall.id}`,
      label: `${hall.name} · ${hall.locationName}`,
      kind: 'suite',
      current: rule
        ? { id: rule.id, text: money(rule.priceCents), since: since(rule.validFrom) }
        : null,
      body: (v) => ({ hallId: hall.id, priceCents: 'cents' in v ? v.cents : 0 }),
    };
  });

  async function end() {
    if (!ending) return;
    setBusy(true);
    try {
      await endPriceRule(ending.kind, ending.id);
      toast.show({ tone: 'success', title: p.ended });
      setEnding(null);
      onChanged();
    } catch {
      toast.show({ tone: 'error', title: p.error });
    } finally {
      setBusy(false);
    }
  }

  const onEnd = (kind: PriceKind, id: string, label: string) => {
    setEnding({ kind, id, label });
  };
  return (
    <>
      {(
        [
          ['base', base],
          ['surcharge', surcharge],
          ['discount', discount],
          ['suite', suite],
        ] as const
      ).map(([kind, rows]) => (
        <section key={kind} className={styles.section} aria-labelledby={`prices-${kind}`}>
          <h2 id={`prices-${kind}`} className={styles.sectionTitle}>
            {p.sections[kind]}
          </h2>
          <DataTable caption={p.sections[kind]} hideCaption>
            <thead>
              <tr>
                <th scope="col">{p.columns.rule}</th>
                <th scope="col" data-align="end">
                  {p.columns.current}
                </th>
                <th scope="col">{p.columns.since}</th>
                <th scope="col">{p.columns.change}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RuleRow key={row.key} row={row} onSaved={onChanged} onEnd={onEnd} />
              ))}
            </tbody>
          </DataTable>
        </section>
      ))}

      <section className={styles.section} aria-labelledby="prices-adjustment">
        <div className={styles.head}>
          <h2 id="prices-adjustment" className={styles.sectionTitle}>
            {p.sections.adjustment}
          </h2>
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            onClick={() => {
              setAdjusting('new');
            }}
          >
            {p.addAdjustment}
          </Button>
        </div>
        <DataTable caption={p.sections.adjustment} hideCaption>
          <thead>
            <tr>
              <th scope="col">{p.columns.rule}</th>
              <th scope="col">{p.fields.days}</th>
              <th scope="col" data-align="end">
                {p.columns.current}
              </th>
              <th scope="col">{p.columns.since}</th>
              <th scope="col">
                <span className="visually-hidden">{p.columns.change}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {prices.adjustment.map((rule) => (
              <tr key={rule.id}>
                <th scope="row">
                  {name(rule)}
                  <span className={styles.sub}>
                    {prices.locations.find((l) => l.id === rule.locationId)?.name ?? p.global}
                  </span>
                </th>
                <td>
                  {p.window(
                    rule.daysOfWeek.map((d) => t.dates.weekdaysShort[d - 1] ?? '').join(' '),
                    clock(rule.startMinute),
                    clock(rule.endMinute),
                  )}
                </td>
                <td data-align="end">
                  {rule.kind === 'PERCENT'
                    ? `${rule.value > 0 ? '+' : ''}${String(rule.value)}%`
                    : `${rule.value > 0 ? '+' : ''}${formatMoney(locale, rule.value)}`}
                </td>
                <td>{since(rule.validFrom)}</td>
                <td>
                  <div className={styles.rowActions}>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="edit"
                      onClick={() => {
                        setAdjusting(rule);
                      }}
                    >
                      {editLabel}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="close"
                      aria-label={p.endLabel(name(rule))}
                      onClick={() => {
                        onEnd('adjustment', rule.id, name(rule));
                      }}
                    >
                      {p.end}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      {adjusting && (
        <AdjustmentDialog
          rule={adjusting === 'new' ? null : adjusting}
          locations={prices.locations}
          onClose={() => {
            setAdjusting(null);
          }}
          onSaved={() => {
            setAdjusting(null);
            onChanged();
          }}
        />
      )}
      <ConfirmDialog
        open={ending !== null}
        title={p.endTitle}
        confirmLabel={p.confirmEnd}
        cancelLabel={p.cancel}
        busy={busy}
        onCancel={() => {
          setEnding(null);
        }}
        onConfirm={() => void end()}
      >
        {ending && (
          <>
            <p>
              <strong>{ending.label}</strong>
            </p>
            <p>{p.endImpact[ending.kind]}</p>
            <p>{p.endHistory}</p>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

function RuleRow({
  row,
  onSaved,
  onEnd,
}: {
  row: Row;
  onSaved: () => void;
  onEnd: (kind: PriceKind, id: string, label: string) => void;
}) {
  const p = useAdminMessages().prices;
  const toast = useToast();
  const inputId = useId();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'PERCENT' | 'FIXED_CENTS'>('PERCENT');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const value =
      row.discount && kind === 'PERCENT'
        ? /^\d{1,3}$/.test(text.trim())
          ? Number(text)
          : null
        : parseEuros(text);
    if (value === null) {
      setError(p.invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await savePriceRule(row.kind, row.body(row.discount ? { kind, value } : { cents: value }));
      setText('');
      toast.show({ tone: 'success', title: p.saved });
      onSaved();
    } catch {
      setError(p.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <th scope="row">{row.label}</th>
      <td data-align="end">{row.current?.text ?? p.none}</td>
      <td data-muted>{row.current?.since ?? p.none}</td>
      <td>
        <div className={styles.rowActions}>
          {row.discount && (
            <Select
              aria-label={p.fields.kind}
              value={kind}
              className={styles.compactSelect}
              onChange={(e) => {
                setKind(adjustmentKindSchema.parse(e.target.value));
              }}
            >
              {adjustmentKindSchema.options.map((k) => (
                <option key={k} value={k}>
                  {p.kinds[k]}
                </option>
              ))}
            </Select>
          )}
          <label htmlFor={inputId} className="visually-hidden">
            {p.newValue(row.label)}
          </label>
          <Input
            id={inputId}
            className={styles.amountInput}
            inputMode="decimal"
            value={text}
            placeholder={row.discount && kind === 'PERCENT' ? p.percent : p.euros}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={text.trim() === ''}
            aria-label={p.saveLabel(row.label)}
            onClick={() => void save()}
          >
            {p.save}
          </Button>
          {row.current && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={p.endLabel(row.label)}
              onClick={() => {
                onEnd(row.kind, row.current?.id ?? '', row.label);
              }}
            >
              {p.end}
            </Button>
          )}
        </div>
        {error && (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}
      </td>
    </tr>
  );
}

function AdjustmentDialog({
  rule,
  locations,
  onClose,
  onSaved,
}: {
  rule: Adjustment | null;
  locations: AdminPricesResponse['locations'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const p = useAdminMessages().prices;
  const t = useMessages();
  const toast = useToast();
  const [nameSq, setNameSq] = useState(rule?.nameSq ?? '');
  const [nameEn, setNameEn] = useState(rule?.nameEn ?? '');
  const [locationId, setLocationId] = useState(rule?.locationId ?? '');
  const [days, setDays] = useState<number[]>(rule?.daysOfWeek ?? []);
  const [from, setFrom] = useState(rule ? clock(rule.startMinute) : '');
  const [to, setTo] = useState(rule ? clock(rule.endMinute) : '');
  const [kind, setKind] = useState<'PERCENT' | 'FIXED_CENTS'>(rule?.kind ?? 'PERCENT');
  const [value, setValue] = useState(() => {
    if (!rule) return '';
    if (rule.kind === 'PERCENT') return String(rule.value);
    return (rule.value / 100).toFixed(2).replace('.', ',');
  });
  const [priority, setPriority] = useState(String(rule?.priority ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const minutes = (time: string) => {
    if (time === '24:00') return 1440;
    const [h, m] = time.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const start = minutes(from);
    const endM = to === '00:00' ? 1440 : minutes(to);
    // Percent as a whole number; a fixed amount in euros ("-1,50"), stored in cents.
    const trimmed = value.trim();
    const size =
      /^-?\d{1,3}$/.test(trimmed) && kind === 'PERCENT' ? Math.abs(Number(trimmed)) : null;
    const cents = kind === 'FIXED_CENTS' ? parseEuros(trimmed.replace(/^-/, '')) : null;
    const amount = kind === 'PERCENT' ? size : cents;
    if (!nameSq.trim() || days.length === 0 || !from || !to || start >= endM || amount === null) {
      setError(p.windowError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await savePriceRule(
        'adjustment',
        {
          locationId: locationId || null,
          nameSq,
          nameEn,
          daysOfWeek: [...days].sort(),
          startMinute: start,
          endMinute: endM,
          kind,
          value: trimmed.startsWith('-') ? -amount : amount,
          priority: Number(priority) || 0,
        },
        rule?.id,
      );
      toast.show({ tone: 'success', title: p.saved });
      onSaved();
    } catch {
      setError(p.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={p.adjustmentTitle}
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            {p.cancel}
          </Button>
          <Button type="submit" form="adjustment-form" icon="check" loading={busy}>
            {p.save}
          </Button>
        </div>
      }
    >
      <form
        id="adjustment-form"
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
          <FormField label={p.fields.name} required>
            {(props) => (
              <Input
                {...props}
                value={nameSq}
                onChange={(e) => {
                  setNameSq(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={p.fields.nameEn} optional>
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
          <FormField label={p.fields.location}>
            {(props) => (
              <Select
                {...props}
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                }}
              >
                <option value="">{p.global}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <fieldset className={`${styles.fieldset} ${styles.wide}`}>
            <legend>{p.fields.days}</legend>
            <div className={styles.checks}>
              {t.dates.weekdaysShort.map((day, index) => (
                <Checkbox
                  key={day}
                  label={day}
                  checked={days.includes(index + 1)}
                  onChange={(e) => {
                    setDays(
                      e.target.checked ? [...days, index + 1] : days.filter((d) => d !== index + 1),
                    );
                  }}
                />
              ))}
            </div>
          </fieldset>
          <FormField label={p.fields.from} required>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={p.fields.to} required>
            {(props) => (
              <Input
                {...props}
                type="time"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={p.fields.kind}>
            {(props) => (
              <Select
                {...props}
                value={kind}
                onChange={(e) => {
                  setKind(adjustmentKindSchema.parse(e.target.value));
                }}
              >
                {adjustmentKindSchema.options.map((k) => (
                  <option key={k} value={k}>
                    {p.kinds[k]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField
            label={p.fields.value}
            hint={kind === 'PERCENT' ? p.percent : p.euros}
            required
          >
            {(props) => (
              <Input
                {...props}
                inputMode="numeric"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={p.fields.priority}>
            {(props) => (
              <Input
                {...props}
                type="number"
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                }}
              />
            )}
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
