import { useMessages } from '../../i18n/use-messages';
import { useLocationChoice } from '../../location/location-context';
import { Button } from '../Button/Button';
import { EmptyState } from '../EmptyState/EmptyState';

/** Inline prompt where showtimes need a cinema: opens the cinema picker. */
export function ChooseCinema({ headingLevel = 'h2' }: { headingLevel?: 'h2' | 'h3' }) {
  const t = useMessages();
  const { openPicker } = useLocationChoice();
  return (
    <EmptyState
      icon="mapPin"
      title={t.showtimes.chooseCinemaTitle}
      headingLevel={headingLevel}
      action={
        <Button icon="mapPin" onClick={openPicker} aria-haspopup="dialog">
          {t.location.choose}
        </Button>
      }
    >
      <p>{t.showtimes.chooseCinemaBody}</p>
    </EmptyState>
  );
}
