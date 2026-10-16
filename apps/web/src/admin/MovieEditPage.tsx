import {
  genreSchema,
  movieInputSchema,
  movieStatusSchema,
  type AdminMovie,
  type Genre,
  type MovieImageKind,
} from '@kinemax/shared';
import { useState, type SubmitEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { deleteMovie, fetchAdminMovie, saveMovie, uploadMovieImage } from '../api/admin';
import { ApiRequestError } from '../api/http';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Choice/Checkbox';
import { AGE_RATINGS } from '../components/Badge/movie-labels';
import { ConfirmDialog } from '../components/ConfirmDialog/ConfirmDialog';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ErrorSummary } from '../components/ErrorSummary/ErrorSummary';
import { FormField } from '../components/FormField/FormField';
import { Icon } from '../components/Icon/Icon';
import { Input } from '../components/Input/Input';
import { Link } from '../components/Link/Link';
import { Select } from '../components/Select/Select';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { Textarea } from '../components/Textarea/Textarea';
import { useToast } from '../components/Toast/toast-context';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages } from '../i18n/admin-messages';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import styles from './AdminPage.module.css';
import { slugify } from './slug';

/** Creates a movie (/admin/movies/new) or edits one (/admin/movies/:id). */
export function MovieEditPage() {
  const { id } = useParams();
  const a = useAdminMessages();
  const t = useMessages();
  const state = useAsync(
    (signal) => (id ? fetchAdminMovie(id, signal) : Promise.resolve(null)),
    `movie:${id ?? 'new'}`,
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
    const missing =
      state.error instanceof ApiRequestError && [400, 404].includes(state.error.status);
    return (
      <EmptyState
        icon={missing ? 'search' : 'warning'}
        tone={missing ? 'neutral' : 'error'}
        title={missing ? a.movieForm.notFound : a.movies.loadError}
        headingLevel="h1"
        action={
          missing ? (
            <Link to="/admin/movies">{a.movieForm.back}</Link>
          ) : (
            <Button onClick={state.retry}>{t.common.retry}</Button>
          )
        }
      />
    );
  }
  return <MovieForm key={state.data?.id ?? 'new'} initial={state.data} />;
}

type FormState = Record<
  | 'titleSq'
  | 'titleEn'
  | 'slug'
  | 'synopsisSq'
  | 'synopsisEn'
  | 'duration'
  | 'ageRating'
  | 'releaseDate'
  | 'director'
  | 'cast'
  | 'status'
  | 'trailer',
  string
> & { genres: Genre[] };

function toForm(movie: AdminMovie | null): FormState {
  return {
    titleSq: movie?.titleSq ?? '',
    titleEn: movie?.titleEn ?? '',
    slug: movie?.slug ?? '',
    synopsisSq: movie?.synopsisSq ?? '',
    synopsisEn: movie?.synopsisEn ?? '',
    duration: movie ? String(movie.durationMinutes) : '',
    ageRating: movie?.ageRating ?? 'ALL',
    releaseDate: movie?.releaseDate ?? '',
    director: movie?.director ?? '',
    cast: movie?.cast.join('\n') ?? '',
    status: movie?.status ?? 'COMING_SOON',
    trailer: movie?.trailerYoutubeId ?? '',
    genres: movie?.genres ?? [],
  };
}

function toInput(form: FormState): unknown {
  return {
    slug: form.slug.trim(),
    titleSq: form.titleSq,
    titleEn: form.titleEn,
    synopsisSq: form.synopsisSq,
    synopsisEn: form.synopsisEn,
    durationMinutes: form.duration.trim() === '' ? Number.NaN : Number(form.duration),
    ageRating: form.ageRating,
    genres: form.genres,
    releaseDate: form.releaseDate,
    director: form.director,
    cast: form.cast
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean),
    status: form.status,
    trailerYoutubeId: form.trailer.trim() === '' ? null : form.trailer.trim(),
  };
}

/** Input field names → the form's field ids. */
const FIELD_OF: Record<string, keyof FormState> = {
  durationMinutes: 'duration',
  trailerYoutubeId: 'trailer',
};

function MovieForm({ initial }: { initial: AdminMovie | null }) {
  const a = useAdminMessages();
  const f = a.movieForm;
  const t = useMessages();
  const { locale } = useLocale();
  const toast = useToast();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(initial);
  const [form, setForm] = useState(() => toForm(initial));
  const [slugTouched, setSlugTouched] = useState(initial !== null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<'archive' | 'delete' | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | undefined>();

  const set = (key: keyof FormState) => (value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'titleSq' && !slugTouched ? { slug: slugify(value) } : {}),
    }));
  };

  const messageFor = (field: keyof FormState, code: string): string => {
    if (code === 'too_big' && field !== 'duration') return f.errors.tooLong;
    if (field === 'slug') return form.slug.trim() === '' ? f.errors.required : f.errors.slug;
    if (field === 'duration') return f.errors.duration;
    if (field === 'genres') return f.errors.genres;
    if (field === 'trailer') return f.errors.trailer;
    if (field === 'releaseDate') return form.releaseDate === '' ? f.errors.required : f.errors.date;
    return f.errors.required;
  };

  const fieldErrors = (issues: readonly { path: string; code: string }[]) => {
    const next: Partial<Record<keyof FormState, string>> = {};
    for (const issue of issues) {
      const key = issue.path.split('.')[0] ?? '';
      const field = FIELD_OF[key] ?? (key as keyof FormState);
      if (field in form && !next[field]) next[field] = messageFor(field, issue.code);
    }
    return next;
  };

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = movieInputSchema.safeParse(toInput(form));
    if (!parsed.success) {
      setErrors(
        fieldErrors(parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code }))),
      );
      setAttempt((n) => n + 1);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await saveMovie(movie?.id ?? null, parsed.data);
      if (movie) {
        setMovie(saved);
        setForm(toForm(saved));
        toast.show({ tone: 'success', title: f.saved });
      } else {
        toast.show({ tone: 'success', title: f.created });
        void navigate(`/admin/movies/${saved.id}`, { replace: true });
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setErrors({ slug: f.errors.conflict });
      } else if (error instanceof ApiRequestError && error.fields.length > 0) {
        setErrors(fieldErrors(error.fields));
      } else {
        setFormError(f.errors.generic);
      }
      setAttempt((n) => n + 1);
    } finally {
      setSaving(false);
    }
  }

  // In the order of the form, each named by its label.
  const labels: Record<keyof FormState, string> = {
    titleSq: f.fields.titleSq,
    titleEn: f.fields.titleEn,
    slug: f.fields.slug,
    synopsisSq: f.fields.synopsisSq,
    synopsisEn: f.fields.synopsisEn,
    duration: f.fields.duration,
    ageRating: f.fields.ageRating,
    releaseDate: f.fields.releaseDate,
    status: f.fields.status,
    director: f.fields.director,
    trailer: f.fields.trailer,
    cast: f.fields.cast,
    genres: f.fields.genres,
  };
  const summary = [
    ...(formError ? [{ message: formError }] : []),
    ...(Object.keys(labels) as (keyof FormState)[]).flatMap((key) =>
      errors[key] ? [{ fieldId: `movie-${key}`, message: `${labels[key]}: ${errors[key]}` }] : [],
    ),
  ];
  const field = (key: keyof FormState) => ({
    id: `movie-${key}`,
    ...(errors[key] ? { error: errors[key] } : {}),
  });

  async function confirmDialog() {
    if (!movie || !dialog) return;
    setDialogBusy(true);
    setDialogError(undefined);
    try {
      if (dialog === 'archive') {
        const saved = await saveMovie(movie.id, { status: 'ARCHIVED' });
        setMovie(saved);
        setForm(toForm(saved));
        toast.show({ tone: 'success', title: f.archived });
      } else {
        await deleteMovie(movie.id);
        toast.show({ tone: 'success', title: f.deleted });
        void navigate('/admin/movies', { replace: true });
      }
      setDialog(null);
    } catch {
      setDialogError(f.errors.generic);
    } finally {
      setDialogBusy(false);
    }
  }

  const heading = movie ? pickText(locale, movie.titleSq, movie.titleEn) : f.newTitle;

  return (
    <div className={styles.page}>
      <Link to="/admin/movies" className={styles.back}>
        <Icon name="chevronLeft" size={16} />
        {f.back}
      </Link>
      <header className={styles.head}>
        <h1 className={styles.title}>{heading}</h1>
      </header>

      <form className={styles.page} noValidate onSubmit={(event) => void onSubmit(event)}>
        <ErrorSummary title={f.errors.summary} errors={summary} attempt={attempt} />

        <section className={styles.section} aria-labelledby="movie-texts">
          <h2 id="movie-texts" className={styles.sectionTitle}>
            {f.sections.texts}
          </h2>
          <div className={styles.fields}>
            <FormField label={f.fields.titleSq} required {...field('titleSq')}>
              {(props) => (
                <Input
                  {...props}
                  value={form.titleSq}
                  onChange={(e) => {
                    set('titleSq')(e.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField label={f.fields.titleEn} optional {...field('titleEn')}>
              {(props) => (
                <Input
                  {...props}
                  lang="en"
                  value={form.titleEn}
                  onChange={(e) => {
                    set('titleEn')(e.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField label={f.fields.slug} hint={f.fields.slugHint} required {...field('slug')}>
              {(props) => (
                <Input
                  {...props}
                  value={form.slug}
                  spellCheck={false}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set('slug')(e.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField
              label={f.fields.synopsisSq}
              required
              className={styles.wide}
              {...field('synopsisSq')}
            >
              {(props) => (
                <Textarea
                  {...props}
                  value={form.synopsisSq}
                  onChange={(e) => {
                    set('synopsisSq')(e.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField
              label={f.fields.synopsisEn}
              optional
              className={styles.wide}
              {...field('synopsisEn')}
            >
              {(props) => (
                <Textarea
                  {...props}
                  lang="en"
                  value={form.synopsisEn}
                  onChange={(e) => {
                    set('synopsisEn')(e.target.value);
                  }}
                />
              )}
            </FormField>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="movie-details">
          <h2 id="movie-details" className={styles.sectionTitle}>
            {f.sections.details}
          </h2>
          <div className={styles.fields}>
            <FormField label={f.fields.duration} required {...field('duration')}>
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={600}
                  value={form.duration}
                  onChange={(e) => {
                    set('duration')(e.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField label={f.fields.ageRating} required {...field('ageRating')}>
              {(props) => (
                <Select
                  {...props}
                  value={form.ageRating}
                  onChange={(e) => {
                    set('ageRating')(e.target.value);
                  }}
                >
                  {AGE_RATINGS.map((rating) => (
                    <option key={rating} value={rating}>
                      {t.movie.ageRatings[rating]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label={f.fields.releaseDate} required {...field('releaseDate')}>
              {(props) => (
                <Input
                  {...props}
                  type="date"
                  value={form.releaseDate}
                  onChange={(e) => {
                    set('releaseDate')(e.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField
              label={f.fields.status}
              required
              hint={movie?.status === 'ARCHIVED' ? f.restoreHint : undefined}
              {...field('status')}
            >
              {(props) => (
                <Select
                  {...props}
                  value={form.status}
                  onChange={(e) => {
                    set('status')(e.target.value);
                  }}
                >
                  {movieStatusSchema.options.map((status) => (
                    <option key={status} value={status}>
                      {a.movies.statuses[status]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label={f.fields.director} required {...field('director')}>
              {(props) => (
                <Input
                  {...props}
                  value={form.director}
                  onChange={(e) => {
                    set('director')(e.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField
              label={f.fields.trailer}
              hint={f.fields.trailerHint}
              optional
              {...field('trailer')}
            >
              {(props) => (
                <Input
                  {...props}
                  value={form.trailer}
                  maxLength={11}
                  spellCheck={false}
                  onChange={(e) => {
                    set('trailer')(e.target.value);
                  }}
                />
              )}
            </FormField>
            <FormField
              label={f.fields.cast}
              hint={f.fields.castHint}
              optional
              className={styles.wide}
              {...field('cast')}
            >
              {(props) => (
                <Textarea
                  {...props}
                  rows={3}
                  value={form.cast}
                  onChange={(e) => {
                    set('cast')(e.target.value);
                  }}
                />
              )}
            </FormField>
            <fieldset
              id="movie-genres"
              className={`${styles.fieldset} ${styles.wide}`}
              aria-describedby="movie-genres-hint"
              tabIndex={-1}
            >
              <legend>
                {f.fields.genres}
                <span aria-hidden="true"> *</span>
              </legend>
              <p id="movie-genres-hint" className={styles.hint}>
                {f.fields.genresHint}
              </p>
              {errors.genres && <p className={styles.fieldError}>{errors.genres}</p>}
              <div className={styles.checks}>
                {genreSchema.options.map((genre) => (
                  <Checkbox
                    key={genre}
                    label={t.movie.genres[genre]}
                    checked={form.genres.includes(genre)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((current) => ({
                        ...current,
                        genres: checked
                          ? [...current.genres, genre]
                          : current.genres.filter((g) => g !== genre),
                      }));
                    }}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        </section>

        <div className={styles.actions}>
          <Button type="submit" loading={saving} icon="check">
            {movie ? f.save : f.create}
          </Button>
        </div>
      </form>

      <section className={styles.section} aria-labelledby="movie-images">
        <h2 id="movie-images" className={styles.sectionTitle}>
          {f.sections.images}
        </h2>
        {movie ? (
          <div className={styles.images}>
            {(['poster', 'backdrop'] as const).map((kind) => (
              <ImageUpload key={kind} movie={movie} kind={kind} onUploaded={setMovie} />
            ))}
          </div>
        ) : (
          <p className={styles.hint}>{f.images.saveFirst}</p>
        )}
      </section>

      {movie && (
        <section className={`${styles.section} ${styles.danger}`} aria-labelledby="movie-danger">
          <h2 id="movie-danger" className={styles.sectionTitle}>
            {f.sections.danger}
          </h2>
          {movie.showtimeCount > 0 && (
            <p className={styles.hint}>{f.deleteBlocked(movie.showtimeCount)}</p>
          )}
          <div className={styles.actions}>
            {movie.status !== 'ARCHIVED' && (
              <Button
                variant="secondary"
                icon="warning"
                onClick={() => {
                  setDialog('archive');
                }}
              >
                {f.archive}
              </Button>
            )}
            {movie.showtimeCount === 0 && (
              <Button
                variant="secondary"
                icon="close"
                onClick={() => {
                  setDialog('delete');
                }}
              >
                {f.delete}
              </Button>
            )}
          </div>
          <ConfirmDialog
            open={dialog !== null}
            title={dialog === 'delete' ? f.deleteTitle : f.archiveTitle}
            confirmLabel={dialog === 'delete' ? f.confirmDelete : f.confirmArchive}
            cancelLabel={f.cancel}
            busy={dialogBusy}
            {...(dialogError ? { error: dialogError } : {})}
            onCancel={() => {
              setDialog(null);
              setDialogError(undefined);
            }}
            onConfirm={() => void confirmDialog()}
          >
            <p>{dialog === 'delete' ? f.deleteBody : f.archiveBody(movie.upcomingShowtimeCount)}</p>
          </ConfirmDialog>
        </section>
      )}
    </div>
  );
}

function ImageUpload({
  movie,
  kind,
  onUploaded,
}: {
  movie: AdminMovie;
  kind: MovieImageKind;
  onUploaded: (movie: AdminMovie) => void;
}) {
  const f = useAdminMessages().movieForm;
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  // A new key empties the file input after an upload.
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = f.images[kind];
  const current = kind === 'poster' ? movie.posterPath : movie.backdropPath;
  const inputId = `movie-${kind}-file`;
  const errorId = `${inputId}-error`;

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onUploaded(await uploadMovieImage(movie.id, kind, file));
      setFile(null);
      setInputKey((n) => n + 1);
      toast.show({ tone: 'success', title: f.images.uploaded });
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.fields[0]?.code : undefined;
      const known = f.images.errors as Record<string, string>;
      setError(
        err instanceof ApiRequestError && err.status === 413
          ? f.images.errors.tooLarge
          : (code && known[code]) || f.images.errors.generic,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.image}>
      <h3 className={styles.sectionTitle}>{label}</h3>
      <div
        className={`${styles.preview} ${kind === 'poster' ? styles.posterPreview : styles.backdropPreview}`}
      >
        {current ? (
          <img src={current} alt={f.images.current(label)} />
        ) : (
          <span>{f.images.none}</span>
        )}
      </div>
      <p className={styles.hint} id={`${inputId}-hint`}>
        {kind === 'poster' ? f.images.posterRules : f.images.backdropRules}
      </p>
      <label htmlFor={inputId} className="visually-hidden">
        {f.images.choose(label)}
      </label>
      <input
        key={inputKey}
        id={inputId}
        className={styles.file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-describedby={[`${inputId}-hint`, error ? errorId : ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setError(null);
        }}
      />
      {error && (
        <p className={styles.fieldError} id={errorId} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          size="sm"
          icon="upload"
          disabled={!file}
          loading={busy}
          onClick={() => void upload()}
        >
          {f.images.upload}
        </Button>
      </div>
    </div>
  );
}
