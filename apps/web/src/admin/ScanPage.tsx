import { normalizeTicketCode, type CheckinResponse } from '@kinemax/shared';
import jsQR from 'jsqr';
import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { checkIn } from '../api/admin';
import { localDateTime } from '../booking/ticket-format';
import { Button } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { FormField } from '../components/FormField/FormField';
import { Icon } from '../components/Icon/Icon';
import { Input } from '../components/Input/Input';
import { useAdminMessages } from '../i18n/admin-messages';
import { formatReleaseDate, pickText } from '../i18n/messages';
import { useLocale } from '../i18n/use-messages';
import { useAdminLocation } from './admin-location';
import styles from './ScanPage.module.css';

/**
 * Camera preview that reads QR codes with jsQR (a few frames a second). The camera only works on
 * https or localhost and after the user allowed it; otherwise `onUnavailable` is called.
 */
function CameraScanner({
  onCode,
  onUnavailable,
}: {
  onCode: (text: string) => void;
  onUnavailable: () => void;
}) {
  const a = useAdminMessages().scan;
  const videoRef = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onCode, onUnavailable });
  useEffect(() => {
    callbacks.current = { onCode, onUnavailable };
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    async function start() {
      const video = videoRef.current;
      // mediaDevices is missing outside https/localhost.
      if (!video || !context || !('mediaDevices' in navigator)) {
        callbacks.current.onUnavailable();
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        callbacks.current.onUnavailable();
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      timer = window.setInterval(() => {
        if (!video.videoWidth) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(frame.data, frame.width, frame.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code?.data) callbacks.current.onCode(code.data);
      }, 250);
    }
    void start();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, []);

  return (
    <div className={styles.camera}>
      <video ref={videoRef} className={styles.video} muted playsInline aria-label={a.video} />
      <span className={styles.frame} aria-hidden="true" />
    </div>
  );
}

/** /admin/scan: QR check-in at the entrance, by camera or by typing the code. Phone first. */
export function ScanPage() {
  const s = useAdminMessages().scan;
  const { selected } = useAdminLocation();
  const inputId = useId();
  const [camera, setCamera] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  if (!selected) {
    return (
      <EmptyState icon="scan" title={s.title} headingLevel="h1">
        <p>{s.chooseCinema}</p>
      </EmptyState>
    );
  }
  const locationId = selected.id;

  async function check(text: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await checkIn(normalizeTicketCode(text), locationId));
      setCode('');
    } catch {
      setError(s.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{s.title}</h1>
      {result ? (
        <div ref={resultRef} tabIndex={-1} className={styles.result}>
          <ScanResult result={result} />
          <Button
            size="lg"
            icon="scan"
            onClick={() => {
              setResult(null);
            }}
          >
            {s.next}
          </Button>
        </div>
      ) : (
        <>
          {camera && !unavailable ? (
            <>
              <CameraScanner
                onCode={(text) => void check(text)}
                onUnavailable={() => {
                  setUnavailable(true);
                }}
              />
              <p className={styles.hint}>{s.cameraHint}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setCamera(false);
                }}
              >
                {s.stopCamera}
              </Button>
            </>
          ) : (
            <Button
              size="lg"
              icon="scan"
              disabled={unavailable}
              onClick={() => {
                setCamera(true);
              }}
            >
              {s.startCamera}
            </Button>
          )}
          {unavailable && (
            <p className={styles.hint} role="status">
              {s.cameraUnavailable}
            </p>
          )}
          <form
            className={styles.manual}
            noValidate
            onSubmit={(event: SubmitEvent) => {
              event.preventDefault();
              if (code.trim()) void check(code);
            }}
          >
            <FormField label={s.manual} hint={s.manualHint} id={inputId}>
              {(props) => (
                <Input
                  {...props}
                  value={code}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(e) => {
                    setCode(e.target.value);
                  }}
                />
              )}
            </FormField>
            <Button type="submit" loading={busy} icon="check">
              {s.check}
            </Button>
          </form>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ScanResult({ result }: { result: CheckinResponse }) {
  const s = useAdminMessages().scan;
  const { locale } = useLocale();
  const when = (iso: string, timeZone: string) => {
    const local = localDateTime(iso, timeZone);
    return `${formatReleaseDate(locale, local.date)} ${local.time}`;
  };

  if (result.result === 'rejected') {
    const reason = s.reasons[result.reason];
    const text =
      typeof reason === 'function'
        ? reason(result.startsAt && result.timeZone ? when(result.startsAt, result.timeZone) : '')
        : reason;
    return (
      <div className={styles.card} data-tone="error" role="alert">
        <Icon name="error" size={48} />
        <p className={styles.verdict}>{s.rejected}</p>
        <p className={styles.reason}>{text}</p>
      </div>
    );
  }
  const { ticket } = result;
  const age = ticket.ageRating === 'AGE_18' ? '18+' : ticket.ageRating === 'AGE_15' ? '15+' : null;
  return (
    <div className={styles.card} data-tone={result.already ? 'warning' : 'success'} role="status">
      <Icon name={result.already ? 'warning' : 'success'} size={48} />
      <p className={styles.verdict}>
        {result.already ? s.already(localDateTime(result.checkedInAt, ticket.timeZone).time) : s.ok}
      </p>
      {age && <p className={styles.age}>{s.ageWarning(age)}</p>}
      <p className={styles.movie}>{pickText(locale, ticket.movieTitleSq, ticket.movieTitleEn)}</p>
      <p>
        {ticket.hallName} · {localDateTime(ticket.startsAt, ticket.timeZone).time}
      </p>
      <dl className={styles.details}>
        <dt>{s.seats}</dt>
        <dd className={styles.seats}>{ticket.wholeHall ? s.wholeHall : ticket.seats.join(', ')}</dd>
        {ticket.food.length > 0 && (
          <>
            <dt>{s.food}</dt>
            <dd>
              {ticket.food
                .map((f) => `${String(f.quantity)}× ${pickText(locale, f.nameSq, f.nameEn)}`)
                .join(', ')}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
