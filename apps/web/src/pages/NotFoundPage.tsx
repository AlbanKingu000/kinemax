import { ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Container } from '../components/Layout/Layout';
import { usePageMeta } from '../hooks/use-page-meta';
import { useMessages } from '../i18n/use-messages';
import styles from './ComingSoonPage.module.css';

export function NotFoundPage() {
  const t = useMessages();
  usePageMeta(`${t.notFound.title} · ${t.meta.titleSuffix}`, t.notFound.description);
  return (
    <Container narrow className={styles.page}>
      <EmptyState
        icon="search"
        eyebrow="404"
        title={t.notFound.title}
        headingLevel="h1"
        action={
          <ButtonLink to="/" icon="arrowRight">
            {t.notFound.backHome}
          </ButtonLink>
        }
      >
        <p>{t.notFound.body}</p>
      </EmptyState>
    </Container>
  );
}
