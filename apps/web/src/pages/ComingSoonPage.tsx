import { ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Container } from '../components/Layout/Layout';
import { usePageMeta } from '../hooks/use-page-meta';
import type { ComingSoonPageKey } from '../i18n/messages';
import { useMessages } from '../i18n/use-messages';
import styles from './ComingSoonPage.module.css';

/** Placeholder for sections that are not built yet, with their own title and description. */
export function ComingSoonPage({ page }: { page: ComingSoonPageKey }) {
  const t = useMessages();
  const text = t.comingSoon.pages[page];
  usePageMeta(`${text.title} · ${t.meta.titleSuffix}`, text.description);
  return (
    <Container narrow className={styles.page}>
      <EmptyState
        icon="film"
        eyebrow={t.comingSoon.badge}
        title={text.title}
        headingLevel="h1"
        action={
          <ButtonLink to="/" variant="secondary" icon="arrowRight">
            {t.common.backHome}
          </ButtonLink>
        }
      >
        <p>{text.body}</p>
      </EmptyState>
    </Container>
  );
}
