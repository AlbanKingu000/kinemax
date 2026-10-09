import { Link } from 'react-router';
import { useMessages } from '../i18n/use-messages';

export function NotFoundPage() {
  const t = useMessages();
  return (
    <main>
      <h1>{t.notFound.title}</h1>
      <p>
        <Link to="/">{t.notFound.backHome}</Link>
      </p>
    </main>
  );
}
