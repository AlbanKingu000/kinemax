import {
  BULK_SHOWTIMES_MAX,
  languageVersionSchema,
  movieFormatSchema,
  type AdminShowtimesResponse,
  type BulkPreviewResponse,
  type LanguageVersion,
  type MovieFormat,
} from '@kinemax/shared';
import { useState } from 'react';
import { createBulkShowtimes, previewBulkShowtimes } from '../api/admin';
import { ApiRequestError } from '../api/http';
import { localDateTime } from '../booking/ticket-format';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Choice/Checkbox';
import { DataTable } from '../components/DataTable/DataTable';
import { FormField } from '../components/FormField/FormField';
import { Input } from '../components/Input/Input';
import { Modal } from '../components/Modal/Modal';
import { Select } from '../components/Select/Select';
import { useToast } from '../components/Toast/toast-context';
import { useAdminMessages } from '../i18n/admin-messages';
import { addDays } from '../i18n/format';
import { formatReleaseDate, pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './AdminPage.module.css';
import { dateRange, parseTimes } from './bulk-slots';
import { showtimeErrorMessage } from './showtime-errors';

interface BulkProps {
  date: string;
  day: AdminShowtimesResponse;
  onClose: () => void;
  onSaved: () => void;
}

/** One movie into several days and times: preview the slots, then create the chosen ones. */
export function BulkShowtimesDialog({ date, day, onClose, onSaved }: BulkProps) {
  const b = useAdminMessages().showtimes.bulkForm;
  const s = useAdminMessages().showtimes;
  const t = useMessages();
  const { locale } = useLocale();
  const toast = useToast();
  const [movieId, setMovieId] = useState('');
  const [hallId, setHallId] = useState(day.halls[0]?.id ?? '');
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(addDays(date, 6));
  const [timesText, setTimesText] = useState('');
  const [format, setFormat] = useState<MovieFormat>('2D');
  const [language, setLanguage] = useState<LanguageVersion>('ORIGINAL_SQ_SUBTITLES');
  const [preview, setPreview] = useState<BulkPreviewResponse['slots'] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = { movieId, hallId, format, languageVersion: language };
  const fmt = (iso: string) => localDateTime(iso, day.timeZone).time;

  async function runPreview() {
    const times = parseTimes(timesText);
    const dates = dateRange(from, to);
    if (!movieId || !hallId) {
      setError(s.errors.required);
      return;
    }
    if (!dates) {
      setError(b.rangeError);
      return;
    }
    if (!times) {
      setError(b.timesError);
      return;
    }
    const slots = dates.flatMap((d) => times.map((time) => ({ date: d, time })));
    if (slots.length > BULK_SHOWTIMES_MAX) {
      setError(b.rangeError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await previewBulkShowtimes({ ...base, slots });
      setPreview(result.slots);
      setChosen(new Set(result.slots.flatMap((slot, i) => (slot.status === 'ok' ? [i] : []))));
    } catch (err) {
      setError(showtimeErrorMessage(err, s));
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  async function create() {
    if (!preview) return;
    const slots = preview
      .filter((_, i) => chosen.has(i))
      .map(({ date: d, time }) => ({ date: d, time }));
    setBusy(true);
    setError(null);
    try {
      const created = await createBulkShowtimes({ ...base, slots });
      toast.show({ tone: 'success', title: b.created(created) });
      onSaved();
    } catch (err) {
      // 409: someone scheduled the hall meanwhile; the preview must be run again.
      setError(
        err instanceof ApiRequestError && err.status === 409
          ? b.changed
          : showtimeErrorMessage(err, s),
      );
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={b.title}
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            {s.form.cancel}
          </Button>
          {preview ? (
            <Button
              icon="check"
              loading={busy}
              disabled={chosen.size === 0}
              onClick={() => void create()}
            >
              {b.create(chosen.size)}
            </Button>
          ) : (
            <Button icon="search" loading={busy} onClick={() => void runPreview()}>
              {b.preview}
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.page}>
        {error && (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}
        <div
          className={styles.fields}
          onChange={() => {
            // Any change invalidates the preview.
            setPreview(null);
          }}
        >
          <FormField label={s.form.movie} required className={styles.wide}>
            {(props) => (
              <Select
                {...props}
                value={movieId}
                onChange={(e) => {
                  setMovieId(e.target.value);
                }}
              >
                <option value="">{s.form.choose}</option>
                {day.movies.map((m) => (
                  <option key={m.id} value={m.id}>
                    {pickText(locale, m.titleSq, m.titleEn)} · {t.movie.duration(m.durationMinutes)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={s.form.hall} required>
            {(props) => (
              <Select
                {...props}
                value={hallId}
                onChange={(e) => {
                  setHallId(e.target.value);
                }}
              >
                {day.halls.map((hall) => (
                  <option key={hall.id} value={hall.id}>
                    {hall.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={b.from} required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={b.to} required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={b.times} hint={b.timesHint} required>
            {(props) => (
              <Input
                {...props}
                value={timesText}
                inputMode="numeric"
                placeholder="14:00, 17:30, 21:00"
                onChange={(e) => {
                  setTimesText(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField label={s.form.format} required>
            {(props) => (
              <Select
                {...props}
                value={format}
                onChange={(e) => {
                  setFormat(movieFormatSchema.parse(e.target.value));
                }}
              >
                {movieFormatSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {s.formats[value]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={s.form.language} required>
            {(props) => (
              <Select
                {...props}
                value={language}
                onChange={(e) => {
                  setLanguage(languageVersionSchema.parse(e.target.value));
                }}
              >
                {languageVersionSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {t.movie.languageVersions[value]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>

        {preview && (
          <DataTable caption={b.previewCaption}>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">{b.previewTitle}</span>
                </th>
                <th scope="col">{s.form.date}</th>
                <th scope="col">{s.columns.time}</th>
                <th scope="col">{s.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((slot, i) => {
                const label = b.slot(formatReleaseDate(locale, slot.date), slot.time);
                return (
                  <tr key={`${slot.date}-${slot.time}`}>
                    <td>
                      <Checkbox
                        label={<span className="visually-hidden">{b.include(label)}</span>}
                        checked={chosen.has(i)}
                        disabled={slot.status !== 'ok'}
                        onChange={(e) => {
                          const next = new Set(chosen);
                          if (e.target.checked) next.add(i);
                          else next.delete(i);
                          setChosen(next);
                        }}
                      />
                    </td>
                    <th scope="row">{formatReleaseDate(locale, slot.date)}</th>
                    <td data-align="end">{s.timeRange(slot.time, fmt(slot.endsAt))}</td>
                    <td>
                      <Badge tone={slot.status === 'ok' ? 'success' : 'warning'}>
                        {b.statuses[slot.status]}
                      </Badge>
                      {slot.conflicts.map((c) => (
                        <span key={c.showtimeId} className={styles.sub}>
                          {b.conflictWith(
                            pickText(locale, c.movieTitleSq, c.movieTitleEn),
                            s.timeRange(fmt(c.startsAt), fmt(c.endsAt)),
                          )}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>
    </Modal>
  );
}
