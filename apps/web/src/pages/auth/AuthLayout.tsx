import type { ReactNode } from 'react';
import { Container } from '../../components/Layout/Layout';
import { Logo } from '../../components/Logo/Logo';
import styles from './AuthLayout.module.css';

/** Centered card for the sign-in and register forms. */
export function AuthLayout({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Container className={styles.page}>
      <div className={styles.card}>
        <Logo variant="monogram" className={styles.monogram} />
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.intro}>{intro}</p>
        {children}
        <p className={styles.footer}>{footer}</p>
      </div>
    </Container>
  );
}
