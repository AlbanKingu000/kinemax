import { useState } from 'react';
import { useMessages } from '../../i18n/use-messages';
import { Button } from '../Button/Button';
import { Modal } from '../Modal/Modal';
import styles from './TrailerButton.module.css';

/**
 * "Trailer" button with a video dialog. The YouTube player (youtube-nocookie.com) is only created
 * after the click, so nothing is loaded from YouTube before the visitor asks for it.
 */
export function TrailerButton({ youtubeId, title }: { youtubeId: string; title: string }) {
  const t = useMessages();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        icon="play"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t.home.trailer}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={t.home.trailerTitle(title)}
        size="lg"
      >
        <div className={styles.video}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
            title={t.home.trailerTitle(title)}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </Modal>
    </>
  );
}
