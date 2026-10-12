import type { LocationSummary } from '@kinemax/shared';
import { pickText } from '../../i18n/messages';
import { useLocale, useMessages } from '../../i18n/use-messages';
import { useLocationChoice } from '../../location/location-context';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';
import { Icon } from '../Icon/Icon';
import { Modal } from '../Modal/Modal';
import { Skeleton } from '../Skeleton/Skeleton';
import styles from './LocationPicker.module.css';

/** The "Choose your cinema" dialog. Open/closed state lives in the LocationProvider. */
export function LocationPicker() {
  const t = useMessages();
  const { locations, selected, choose, pickerOpen, closePicker } = useLocationChoice();

  return (
    <Modal open={pickerOpen} onClose={closePicker} title={t.location.choose} size="lg">
      <p className={styles.intro}>{t.location.pickerIntro}</p>
      {locations.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <div className={styles.grid} aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <Skeleton key={n} shape="rect" height="10rem" />
            ))}
          </div>
        </div>
      )}
      {locations.status === 'error' && (
        <EmptyState
          icon="warning"
          tone="error"
          title={t.location.loadError}
          action={
            <Button variant="secondary" icon="arrowRight" onClick={locations.retry}>
              {t.common.retry}
            </Button>
          }
        />
      )}
      {locations.status === 'ready' && (
        <ul className={styles.grid}>
          {locations.data.map((location) => (
            <li key={location.slug}>
              <LocationCard
                location={location}
                selected={location.slug === selected?.slug}
                onChoose={() => {
                  choose(location.slug);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** One cinema as a large button: city, address and the hall types it offers. */
export function LocationCard({
  location,
  selected,
  onChoose,
}: {
  location: LocationSummary;
  selected: boolean;
  onChoose: () => void;
}) {
  const t = useMessages();
  const { locale } = useLocale();
  return (
    <button
      type="button"
      className={styles.card}
      aria-current={selected ? 'true' : undefined}
      onClick={onChoose}
    >
      <span className={styles.cardHeader}>
        <span className={styles.city}>{location.city}</span>
        {selected && (
          <Badge tone="crimson" className={styles.selected}>
            <Icon name="check" size={14} />
            {t.location.selected}
          </Badge>
        )}
      </span>
      <span className={styles.address}>
        <Icon name="mapPin" size={16} className={styles.addressIcon} />
        {location.address}
      </span>
      <span className="visually-hidden">{t.location.halls}:</span>
      <span className={styles.halls}>
        {location.hallTypes.map((type) => (
          <Badge key={type.code}>
            {pickText(locale, type.nameSq, type.nameEn)} · {t.location.hallCount(type.hallCount)}
          </Badge>
        ))}
      </span>
    </button>
  );
}
