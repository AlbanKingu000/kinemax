import { Button } from '../components/Button/Button';
import { useAdminMessages } from '../i18n/admin-messages';
import styles from './AdminPage.module.css';

/** "Page 2 of 5" with previous/next, for the long admin lists (users, audit log). */
export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  const u = useAdminMessages().users;
  if (pages <= 1) return null;
  return (
    <nav className={styles.toolbar} aria-label={u.page(page, pages)}>
      <Button
        variant="secondary"
        size="sm"
        icon="chevronLeft"
        disabled={page <= 1}
        onClick={() => {
          onPage(page - 1);
        }}
      >
        {u.previous}
      </Button>
      <span className={styles.count}>{u.page(page, pages)}</span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= pages}
        onClick={() => {
          onPage(page + 1);
        }}
      >
        {u.next}
      </Button>
    </nav>
  );
}
