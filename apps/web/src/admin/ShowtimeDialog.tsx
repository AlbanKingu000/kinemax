import {
  languageVersionSchema,
  movieFormatSchema,
  type AdminShowtime,
  type AdminShowtimesResponse,
  type LanguageVersion,
  type MovieFormat,
} from '@kinemax/shared';
import { useState, type SubmitEvent } from 'react';
import { saveShowtime } from '../api/admin';
import { localDateTime } from '../booking/ticket-format';
import { Button } from '../components/Button/Button';
import { FormField } from '../components/FormField/FormField';
import { Input } from '../components/Input/Input';
import { Modal } from '../components/Modal/Modal';
import { Select } from '../components/Select/Select';
import { useToast } from '../components/Toast/toast-context';
import { useAdminMessages } from '../i18n/admin-messages';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './AdminPage.module.css';
import { showtimeErrorMessage } from './showtime-errors';

interface ShowtimeDialogProps {
  /** null: a new show on `date`. */
  showtime: AdminShowtime | null;
  date: string;
  day: AdminShowtimesResponse;
  onClose: () => void;
  onSaved: () => void;
}

/** Create or edit one show. With sold tickets only format and language can change. */
export function ShowtimeDialog({ showtime, date, day, onClose, onSaved }: ShowtimeDialogProps) {
  const s = useAdminMessages().showtimes;
  const t = useMessages();
  const { locale } = useLocale();
  const toast = useToast();
  const start = showtime ? localDateTime(showtime.startsAt, day.timeZone) : null;
  const [movieId, setMovieId] = useState(showtime?.movieId ?? '');
  const [hallId, setHallId] = useState(showtime?.hallId ?? day.halls[0]?.id ?? '');
  const [showDate, setShowDate] = useState(start?.date ?? date);
  const [time, setTime] = useState(start?.time ?? '');
  const [format, setFormat] = useState<MovieFormat>(showtime?.format ?? '2D');
  const [language, setLanguage] = useState<LanguageVersion>(
    showtime?.languageVersion ?? 'ORIGINAL_SQ_SUBTITLES',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = (showtime?.activeBookings ?? 0) > 0;
  const movie = day.movies.find((m) => m.id === movieId);

  // The end the server will compute, shown while choosing.
  let ends: string | null = null;
  if (movie && /^\d{2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number);
    const total = (h ?? 0) * 60 + (m ?? 0) + movie.durationMinutes + day.cleaningBufferMinutes;
    ends = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!movieId || !hallId || !showDate || !time) {
      setError(s.errors.required);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input = locked
        ? { format, languageVersion: language }
        : { movieId, hallId, date: showDate, time, format, languageVersion: language };
      await saveShowtime(showtime?.id ?? null, input);
      toast.show({ tone: 'success', title: showtime ? s.form.saved : s.form.created });
      onSaved();
    } catch (err) {
      setError(showtimeErrorMessage(err, s));
    } finally {
      setBusy(false);
    }
  }

  const formId = 'showtime-form';
  return (
    <Modal
      open
      onClose={onClose}
      title={showtime ? s.form.editTitle : s.form.newTitle}
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            {s.form.cancel}
          </Button>
          <Button type="submit" form={formId} loading={busy} icon="check">
            {showtime ? s.form.save : s.form.create}
          </Button>
        </div>
      }
    >
      <form id={formId} noValidate className={styles.page} onSubmit={(e) => void onSubmit(e)}>
        {locked && <p className={styles.hint}>{s.form.locked}</p>}
        {error && (
          <p className={styles.fieldError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.fields}>
          <FormField label={s.form.movie} required className={styles.wide}>
            {(props) => (
              <Select
                {...props}
                value={movieId}
                disabled={locked}
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
                disabled={locked}
                onChange={(e) => {
                  setHallId(e.target.value);
                }}
              >
                {day.halls.map((hall) => (
                  <option key={hall.id} value={hall.id}>
                    {hall.name} · {pickText(locale, hall.hallTypeNameSq, hall.hallTypeNameEn)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={s.form.date} required>
            {(props) => (
              <Input
                {...props}
                type="date"
                value={showDate}
                disabled={locked}
                onChange={(e) => {
                  setShowDate(e.target.value);
                }}
              />
            )}
          </FormField>
          <FormField
            label={s.form.time}
            required
            hint={
              ends && movie
                ? s.form.ends(ends, movie.durationMinutes, day.cleaningBufferMinutes)
                : null
            }
          >
            {(props) => (
              <Input
                {...props}
                type="time"
                step={300}
                value={time}
                disabled={locked}
                onChange={(e) => {
                  setTime(e.target.value);
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
      </form>
    </Modal>
  );
}
