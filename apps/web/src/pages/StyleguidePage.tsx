// Development-only living styleguide (routes.tsx only registers it when import.meta.env.DEV).
import { useMemo, useState, type ReactNode } from 'react';
import monogramOnCrimson from '../assets/brand/monogram-on-crimson.svg';
import {
  AgeBadge,
  Badge,
  FormatBadge,
  LanguageBadge,
  type BadgeTone,
} from '../components/Badge/Badge';
import { AGE_RATINGS, LANGUAGE_VERSIONS } from '../components/Badge/movie-labels';
import { Button, ButtonLink } from '../components/Button/Button';
import { Card } from '../components/Card/Card';
import { Checkbox } from '../components/Choice/Checkbox';
import { RadioGroup } from '../components/Choice/Radio';
import { Switch } from '../components/Choice/Switch';
import { ChooseCinema } from '../components/ChooseCinema/ChooseCinema';
import { Chip } from '../components/Chip/Chip';
import { ErrorSummary } from '../components/ErrorSummary/ErrorSummary';
import { DayTabs } from '../components/DayTabs/DayTabs';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { FeaturedHero } from '../components/FeaturedHero/FeaturedHero';
import { FormField } from '../components/FormField/FormField';
import { HeroBackground } from '../components/HeroBackground/HeroBackground';
import { Icon } from '../components/Icon/Icon';
import { ICON_NAMES } from '../components/Icon/icon-paths';
import { Input } from '../components/Input/Input';
import { LanguageSwitch } from '../components/LanguageSwitch/LanguageSwitch';
import { Container, Grid } from '../components/Layout/Layout';
import { Link } from '../components/Link/Link';
import { LocationCard } from '../components/LocationPicker/LocationPicker';
import { Logo } from '../components/Logo/Logo';
import { Modal } from '../components/Modal/Modal';
import { SeatMap2D } from '../booking/SeatMap2D';
import { toggleSeat } from '../booking/selection';
import { MovieCard } from '../components/MovieCard/MovieCard';
import { MovieRail } from '../components/MovieRail/MovieRail';
import { PasswordInput } from '../components/PasswordInput/PasswordInput';
import { Select } from '../components/Select/Select';
import { ShowtimeGroups } from '../components/ShowtimeGroups/ShowtimeGroups';
import { SiteFooter } from '../components/SiteFooter/SiteFooter';
import { SiteHeader } from '../components/SiteHeader/SiteHeader';
import { MovieCardSkeleton } from '../components/Skeleton/Skeleton';
import { Tabs } from '../components/Tabs/Tabs';
import { useToast, type ToastTone } from '../components/Toast/toast-context';
import { styleguideMessages } from '../i18n/styleguide-messages';
import { messages } from '../i18n/messages';
import { useLocale } from '../i18n/use-messages';
import { useLocationChoice } from '../location/location-context';
import { AA_TEXT, CONTRAST_PAIRS, contrastRatio, readColorTokens } from '../styles/contrast';
import tokensCss from '../styles/tokens.css?raw';
import {
  DEMO_DAYS,
  DEMO_FEATURED,
  DEMO_LOCATIONS,
  DEMO_MOVIES,
  DEMO_SEATMAP,
  DEMO_SHOWTIME_GROUPS,
} from './styleguide-demo-data';
import styles from './StyleguidePage.module.css';

const COLORS = readColorTokens(tokensCss);
const TOKENS = new Map(
  [...tokensCss.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
    m[1] ?? '',
    (m[2] ?? '').trim(),
  ]),
);

const SECTION_IDS = [
  'hero',
  'logo',
  'colors',
  'typography',
  'foundations',
  'buttons',
  'forms',
  'navigation',
  'badges',
  'cards',
  'feedback',
  'icons',
  'layout',
  'shell',
  'home',
  'booking',
] as const;

const SWATCH_GROUPS = {
  backgrounds: [
    'color-bg',
    'color-surface',
    'color-elevated',
    'color-border',
    'color-border-control',
  ],
  text: ['color-text', 'color-text-secondary', 'color-text-muted'],
  crimson: [
    'color-crimson',
    'color-crimson-hover',
    'color-crimson-pressed',
    'color-crimson-deep',
    'color-crimson-text',
  ],
  status: ['color-success', 'color-warning', 'color-error', 'color-info'],
  seats: ['color-seat-standard', 'color-seat-vip', 'color-seat-couple'],
} as const;

const TYPE_SCALE = [
  ['text-display', 'display'],
  ['text-h1', 'display'],
  ['text-h2', 'display'],
  ['text-h3', 'display'],
  ['text-h4', 'display'],
  ['text-body-lg', 'body'],
  ['text-body', 'body'],
  ['text-body-sm', 'body'],
  ['text-caption', 'body'],
] as const;

const SPACING = ['1', '2', '3', '4', '5', '6', '8', '10', '12', '16', '20', '24'].map(
  (n) => `space-${n}`,
);
const RADII = ['radius-sm', 'radius-md', 'radius-lg', 'radius-pill'];
const SHADOWS = ['shadow-1', 'shadow-2', 'shadow-3', 'glow-crimson', 'glow-crimson-soft'];
const MOTION = [
  'duration-fast',
  'duration-base',
  'duration-slow',
  'duration-cinematic',
  'ease-standard',
  'ease-emphasized',
  'ease-exit',
];
const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'icon'] as const;
const DEMO_STATES = ['default', 'hover', 'focus', 'active', 'loading', 'disabled'] as const;
const BADGE_TONES: BadgeTone[] = ['neutral', 'crimson', 'success', 'warning', 'error', 'info'];
const TOAST_TONES: ToastTone[] = ['success', 'error', 'warning', 'info'];
const FAVICONS = [
  { src: '/favicon-16.png', size: 16 },
  { src: '/favicon-32.png', size: 32 },
  { src: '/favicon-48.png', size: 48 },
  { src: '/apple-touch-icon.png', size: 180 },
] as const;

const cssVar = (token: string) => `var(--${token})`;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={styles.section}>
      <h2 id={`${id}-title`} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Sub({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <div className={styles.sub}>
      <h3 className={styles.subTitle}>{title}</h3>
      {note && <p className={styles.note}>{note}</p>}
      {children}
    </div>
  );
}

function Token({ children }: { children: ReactNode }) {
  return <code className={styles.token}>{children}</code>;
}

export function StyleguidePage() {
  const { locale } = useLocale();
  const s = styleguideMessages[locale];
  const toast = useToast();
  const t = messages[locale];
  const { openPicker } = useLocationChoice();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [demoSeats, setDemoSeats] = useState<string[]>(['demo-B2', 'demo-C3']);
  const demoSeatsById = useMemo(
    () => new Map(DEMO_SEATMAP.seats.map((seat) => [seat.id, seat])),
    [],
  );
  const [demoLocation, setDemoLocation] = useState('prizren');
  const [demoDay, setDemoDay] = useState(DEMO_DAYS[0] ?? '');
  const [seatType, setSeatType] = useState<'standard' | 'vip' | 'couple'>('vip');
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['drama']);
  const [activeFilters, setActiveFilters] = useState<('prishtina' | 'vip')[]>(['prishtina', 'vip']);

  const movies = [
    {
      slug: 'fanari-i-heshtur',
      title: s.cards.movies.lantern,
      rating: 'AGE_15',
      minutes: 112,
      genres: [s.cards.genres.thriller, s.cards.genres.mystery],
      formats: ['2D'],
      language: 'ORIGINAL_SQ_SUBTITLES',
    },
    {
      slug: 'pipa-dhe-robotet-e-kopshtit',
      title: s.cards.movies.robots,
      rating: 'ALL',
      minutes: 92,
      genres: [s.cards.genres.animation, s.cards.genres.family],
      formats: ['2D', '3D'],
      language: 'DUBBED_SQ',
    },
    {
      slug: 'ekspedita-bjeshke',
      title: s.cards.movies.highlands,
      rating: 'AGE_7',
      minutes: 101,
      genres: [s.cards.genres.adventure, s.cards.genres.family],
      formats: ['2D'],
      language: 'DUBBED_SQ',
    },
    {
      slug: 'kodi-orbital-9',
      title: s.cards.movies.orbital,
      rating: 'AGE_12',
      minutes: 131,
      genres: [s.cards.genres.sciFi],
      formats: ['2D', '3D'],
      language: 'ORIGINAL_SQ_SUBTITLES',
    },
    {
      slug: 'ulurima-ne-mjegull',
      title: s.cards.movies.fog,
      rating: 'AGE_18',
      minutes: 97,
      genres: [s.cards.genres.horror],
      formats: ['2D'],
      language: 'ORIGINAL_NO_SUBTITLES',
    },
  ] as const;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Container className={styles.headerInner}>
          <Logo variant="horizontal" className={styles.headerLogo} />
          <LanguageSwitch />
        </Container>
      </header>

      <main>
        <Container className={styles.intro}>
          <p className={styles.overline}>{s.eyebrow}</p>
          <h1 className={styles.title}>{s.title}</h1>
          <p className={styles.lead}>{s.intro}</p>
          <p className={styles.note}>{s.languageNote}</p>
        </Container>

        <Container className={styles.layout}>
          <nav aria-label={s.contents} className={styles.toc}>
            <p className={styles.tocTitle} aria-hidden="true">
              {s.contents}
            </p>
            <ol>
              {SECTION_IDS.map((id) => (
                <li key={id}>
                  <a href={`#${id}`}>{s.sections[id]}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className={styles.sections}>
            <Section id="hero" title={s.sections.hero}>
              <div className={styles.heroDemo}>
                <HeroBackground />
                <div className={styles.heroContent}>
                  <p className={styles.overline}>{s.hero.eyebrow}</p>
                  <p className={styles.heroTitle}>{s.hero.title}</p>
                  <p className={styles.heroBody}>{s.hero.body}</p>
                  <div className={styles.row}>
                    <Button size="lg" icon="ticket">
                      {s.hero.cta}
                    </Button>
                    <Button size="lg" variant="secondary" icon="play">
                      {s.buttons.trailer}
                    </Button>
                  </div>
                </div>
              </div>
            </Section>

            <Section id="logo" title={s.sections.logo}>
              <div className={styles.logoGrid}>
                <figure className={styles.logoTile}>
                  <Logo variant="full" className={styles.logoFull} />
                  <figcaption>{s.logo.full}</figcaption>
                </figure>
                <figure className={styles.logoTile}>
                  <Logo variant="horizontal" className={styles.logoHorizontal} />
                  <figcaption>{s.logo.horizontal}</figcaption>
                </figure>
                <figure className={styles.logoTile}>
                  <Logo variant="monogram" className={styles.logoMonogram} />
                  <figcaption>{s.logo.monogram}</figcaption>
                </figure>
              </div>

              <Sub title={s.logo.sizes}>
                <div className={styles.sizesRow}>
                  {[24, 32, 48, 64, 96].map((px) => (
                    <figure key={px} className={styles.sizeItem}>
                      <span className={styles.sizeBox} style={{ width: px, height: px }}>
                        <Logo variant="monogram" className={styles.fill} />
                      </span>
                      <figcaption>{s.logo.sizeLabel(px)}</figcaption>
                    </figure>
                  ))}
                </div>
                <div className={styles.sizesRow}>
                  {[28, 40, 56].map((px) => (
                    <figure key={px} className={styles.sizeItem}>
                      <span className={styles.sizeBox} style={{ height: px }}>
                        <Logo variant="horizontal" className={styles.fillHeight} />
                      </span>
                      <figcaption>{s.logo.sizeLabel(px)}</figcaption>
                    </figure>
                  ))}
                </div>
              </Sub>

              <Sub title={s.logo.backgrounds}>
                <div className={styles.backgroundRow}>
                  {(['bg', 'surface', 'elevated'] as const).map((bg) => (
                    <figure
                      key={bg}
                      className={styles.backgroundTile}
                      style={{ background: cssVar(`color-${bg}`) }}
                    >
                      <Logo variant="monogram" className={styles.logoOnBackground} />
                      <figcaption>
                        <Token>--color-{bg}</Token>
                      </figcaption>
                    </figure>
                  ))}
                  <figure
                    className={styles.backgroundTile}
                    style={{ background: cssVar('color-crimson') }}
                  >
                    <img
                      src={monogramOnCrimson}
                      alt="Kinemax"
                      className={styles.logoOnBackground}
                      width={152}
                      height={152}
                    />
                    <figcaption>{s.logo.onCrimson}</figcaption>
                  </figure>
                </div>
              </Sub>

              <Sub title={s.logo.favicons} note={s.logo.faviconNote}>
                <div className={styles.faviconRow}>
                  {FAVICONS.map(({ src, size }) => (
                    <figure key={src} className={styles.faviconItem}>
                      <img src={src} alt="" width={size} height={size} />
                      <figcaption>{s.logo.sizeLabel(size)}</figcaption>
                    </figure>
                  ))}
                  <figure className={styles.faviconItem}>
                    <img src="/favicon.svg" alt="" width={32} height={32} />
                    <figcaption>favicon.svg</figcaption>
                  </figure>
                </div>
              </Sub>
            </Section>

            <Section id="colors" title={s.sections.colors}>
              {Object.entries(SWATCH_GROUPS).map(([group, tokens]) => (
                <Sub key={group} title={s.colors.groups[group as keyof typeof SWATCH_GROUPS]}>
                  <ul className={styles.swatches}>
                    {tokens.map((token) => {
                      const hex = COLORS.get(token) ?? '';
                      return (
                        <li key={token} className={styles.swatch}>
                          <span className={styles.chip} style={{ background: cssVar(token) }} />
                          <Token>--{token}</Token>
                          <span className={styles.hex}>{hex.toUpperCase()}</span>
                          <span className={styles.ratio}>
                            {contrastRatio(hex, COLORS.get('color-bg') ?? '#000').toFixed(2)} : 1
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Sub>
              ))}

              <Sub title={s.colors.contrastHeading} note={s.colors.contrastIntro}>
                <div
                  className={styles.tableWrap}
                  tabIndex={0}
                  role="region"
                  aria-label={s.colors.contrastHeading}
                >
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">{s.colors.columns.foreground}</th>
                        <th scope="col">{s.colors.columns.background}</th>
                        <th scope="col">{s.colors.columns.ratio}</th>
                        <th scope="col">{s.colors.columns.minimum}</th>
                        <th scope="col">{s.colors.columns.use}</th>
                        <th scope="col">{s.colors.columns.result}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CONTRAST_PAIRS.map((pair) => {
                        const ratio = contrastRatio(
                          COLORS.get(pair.foreground) ?? '#000',
                          COLORS.get(pair.background) ?? '#000',
                        );
                        const passes = ratio >= pair.min;
                        return (
                          <tr key={`${pair.foreground}-${pair.background}`}>
                            <td>
                              {pair.min >= AA_TEXT ? (
                                <span
                                  className={styles.sample}
                                  style={{
                                    color: cssVar(pair.foreground),
                                    background: cssVar(pair.background),
                                  }}
                                >
                                  Aa
                                </span>
                              ) : (
                                // Non-text pair (outline, focus ring): shown as a line, not text.
                                <span
                                  className={styles.sample}
                                  aria-hidden="true"
                                  style={{
                                    background: cssVar(pair.background),
                                    boxShadow: `inset 0 0 0 2px ${cssVar(pair.foreground)}`,
                                  }}
                                />
                              )}
                              <Token>--{pair.foreground}</Token>
                            </td>
                            <td>
                              <Token>--{pair.background}</Token>
                            </td>
                            <td className={styles.numeric}>{ratio.toFixed(2)}</td>
                            <td className={styles.numeric}>{pair.min.toFixed(1)}</td>
                            <td>{s.colors.uses[pair.use]}</td>
                            <td>
                              <Badge tone={passes ? 'success' : 'error'}>
                                {passes ? s.colors.pass : s.colors.fail}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Sub>
            </Section>

            <Section id="typography" title={s.sections.typography}>
              <div className={styles.families}>
                <div className={styles.family}>
                  <span className={styles.familySampleDisplay} aria-hidden="true">
                    Aa Ëë Çç
                  </span>
                  <p>{s.typography.families.display}</p>
                </div>
                <div className={styles.family}>
                  <span className={styles.familySampleBody} aria-hidden="true">
                    Aa Ëë Çç
                  </span>
                  <p>{s.typography.families.body}</p>
                </div>
              </div>

              <Sub title={s.typography.scale}>
                <ul className={styles.typeScale}>
                  {TYPE_SCALE.map(([token, family]) => (
                    <li key={token}>
                      <Token>--{token}</Token>
                      <span
                        className={family === 'display' ? styles.displaySample : styles.bodySample}
                        style={{ fontSize: cssVar(token) }}
                      >
                        {family === 'display'
                          ? s.typography.sampleHeading
                          : s.typography.sampleBody}
                      </span>
                    </li>
                  ))}
                  <li>
                    <Token>overline</Token>
                    <span className={styles.overline}>{s.typography.overline}</span>
                  </li>
                </ul>
              </Sub>

              <Sub title={s.typography.glyphs}>
                <p className={styles.glyphDisplay}>{s.typography.sampleDisplay}</p>
                <p className={styles.glyphLine}>Ë ë Ç ç · € 12,50 · „Kinemax“ · 20:30–22:45</p>
                <p className={styles.caption}>{s.typography.sampleCaption}</p>
              </Sub>
            </Section>

            <Section id="foundations" title={s.sections.foundations}>
              <Sub title={s.foundations.spacing}>
                <ul className={styles.spacingList}>
                  {SPACING.map((token) => (
                    <li key={token}>
                      <Token>--{token}</Token>
                      <span className={styles.tokenValue}>{TOKENS.get(token)}</span>
                      <span className={styles.spacingBar} style={{ width: cssVar(token) }} />
                    </li>
                  ))}
                </ul>
              </Sub>
              <Sub title={s.foundations.radii}>
                <div className={styles.demoRow}>
                  {RADII.map((token) => (
                    <figure key={token} className={styles.demoItem}>
                      <span className={styles.radiusBox} style={{ borderRadius: cssVar(token) }} />
                      <figcaption>
                        <Token>--{token}</Token> {TOKENS.get(token)}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </Sub>
              <Sub title={s.foundations.shadows}>
                <div className={styles.demoRow}>
                  {SHADOWS.map((token) => (
                    <figure key={token} className={styles.demoItem}>
                      <span className={styles.shadowBox} style={{ boxShadow: cssVar(token) }} />
                      <figcaption>
                        <Token>--{token}</Token>
                      </figcaption>
                    </figure>
                  ))}
                  <figure className={styles.demoItem}>
                    <span className={`${styles.shadowBox} ${styles.focusDemo}`} />
                    <figcaption>
                      <Token>:focus-visible</Token>
                    </figcaption>
                  </figure>
                </div>
              </Sub>
              <Sub title={s.foundations.motion} note={s.foundations.motionNote}>
                <dl className={styles.motionList}>
                  {MOTION.map((token) => (
                    <div key={token}>
                      <dt>
                        <Token>--{token}</Token>
                      </dt>
                      <dd>{TOKENS.get(token)}</dd>
                    </div>
                  ))}
                </dl>
              </Sub>
            </Section>

            <Section id="buttons" title={s.sections.buttons}>
              <Sub title={s.buttons.variants}>
                <div className={styles.row}>
                  <Button icon="ticket">{s.buttons.buyTickets}</Button>
                  <Button variant="secondary" iconEnd="arrowRight">
                    {s.buttons.showtimes}
                  </Button>
                  <Button variant="ghost">{s.buttons.next}</Button>
                  <Button variant="icon" icon="search" aria-label={s.buttons.search} />
                  <Button variant="icon" icon="menu" aria-label={s.buttons.menu} />
                </div>
              </Sub>
              <Sub title={s.buttons.sizes}>
                {(['sm', 'md', 'lg'] as const).map((size) => (
                  <div key={size} className={styles.row}>
                    <Button size={size}>{s.buttons.sizeNames[size]}</Button>
                    <Button size={size} variant="secondary">
                      {s.buttons.sizeNames[size]}
                    </Button>
                    <Button size={size} variant="ghost">
                      {s.buttons.sizeNames[size]}
                    </Button>
                    <Button
                      size={size}
                      variant="icon"
                      icon="play"
                      aria-label={`${s.buttons.trailer} (${s.buttons.sizeNames[size]})`}
                    />
                  </div>
                ))}
              </Sub>
              <Sub title={s.buttons.states}>
                <div className={styles.statesGrid}>
                  {BUTTON_VARIANTS.map((variant) => (
                    <div key={variant} className={styles.statesRow}>
                      <p className={styles.statesLabel}>{s.buttons.variantNames[variant]}</p>
                      {DEMO_STATES.map((state) => {
                        const demo = {
                          'data-demo-state': state,
                          loading: state === 'loading',
                          disabled: state === 'disabled',
                        };
                        const label = s.buttons.stateNames[state];
                        return (
                          <div key={state} className={styles.stateCell}>
                            {variant === 'icon' ? (
                              <Button {...demo} variant="icon" icon="ticket" aria-label={label} />
                            ) : (
                              <Button {...demo} variant={variant}>
                                {s.buttons.buyTickets}
                              </Button>
                            )}
                            <span className={styles.stateName}>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </Sub>
            </Section>

            <Section id="forms" title={s.sections.forms}>
              <div className={styles.formGrid}>
                <FormField label={s.forms.email} hint={s.forms.emailHint} required>
                  {(props) => (
                    <Input
                      {...props}
                      type="email"
                      autoComplete="email"
                      placeholder={s.forms.emailPlaceholder}
                    />
                  )}
                </FormField>
                <FormField label={s.forms.fullName} error={s.forms.fullNameError} required>
                  {(props) => <Input {...props} autoComplete="name" defaultValue="Arta" />}
                </FormField>
                <FormField label={s.forms.search}>
                  {(props) => (
                    <Input
                      {...props}
                      type="search"
                      icon="search"
                      placeholder={s.forms.searchPlaceholder}
                    />
                  )}
                </FormField>
                <FormField label={s.forms.promo} optional>
                  {(props) => <Input {...props} defaultValue="KINEMAX-NATA" />}
                </FormField>
                <FormField label={s.forms.city}>
                  {(props) => (
                    <Select {...props} defaultValue="">
                      <option value="" disabled>
                        {s.forms.chooseCity}
                      </option>
                      {['Prishtinë', 'Prizren', 'Pejë', 'Ferizaj'].map((city) => (
                        <option key={city}>{city}</option>
                      ))}
                    </Select>
                  )}
                </FormField>
                <FormField label={s.forms.city} error={s.forms.cityError}>
                  {(props) => (
                    <Select {...props} defaultValue="">
                      <option value="">{s.forms.chooseCity}</option>
                    </Select>
                  )}
                </FormField>
                <FormField label={s.forms.disabledField}>
                  {(props) => <Input {...props} disabled defaultValue={s.forms.disabledValue} />}
                </FormField>
              </div>

              <Sub title={s.buttons.states}>
                <div className={styles.formGrid}>
                  {(['default', 'hover', 'focus'] as const).map((state) => (
                    <FormField key={state} label={s.buttons.stateNames[state]}>
                      {(props) => (
                        <Input
                          {...props}
                          data-demo-state={state}
                          placeholder={s.forms.emailPlaceholder}
                        />
                      )}
                    </FormField>
                  ))}
                </div>
              </Sub>

              <div className={styles.choiceGrid}>
                <Sub title={s.forms.checkboxes}>
                  <div className={styles.stack}>
                    <Checkbox label={s.forms.newsletter} />
                    <Checkbox label={s.forms.terms} defaultChecked />
                    <Checkbox label={s.forms.allHalls} indeterminate readOnly />
                    <Checkbox label={s.forms.disabledCheckbox} disabled />
                  </div>
                </Sub>
                <Sub title={s.forms.radios}>
                  <RadioGroup
                    legend={s.forms.seatType}
                    name="seat-type"
                    value={seatType}
                    onChange={setSeatType}
                    options={[
                      { value: 'standard', label: s.forms.seatTypes.standard },
                      { value: 'vip', label: s.forms.seatTypes.vip },
                      { value: 'couple', label: s.forms.seatTypes.couple, disabled: true },
                    ]}
                  />
                </Sub>
                <Sub title={s.forms.switches}>
                  <div className={styles.stack}>
                    <Switch label={s.forms.subtitlesOnly} />
                    <Switch label={s.forms.reminders} defaultChecked />
                    <Switch label={s.forms.disabledSwitch} disabled />
                  </div>
                </Sub>
              </div>
              <Sub title={s.forms.passwordAndErrors}>
                <div className={styles.authDemo}>
                  <ErrorSummary
                    title={t.auth.errorSummary}
                    errors={[
                      { fieldId: 'demo-password', message: t.auth.errors.tooShort(10) },
                      { message: t.auth.errors.invalidCredentials },
                    ]}
                    attempt={0}
                  />
                  <FormField
                    label={t.auth.password}
                    id="demo-password"
                    hint={t.auth.passwordHint(10)}
                    error={t.auth.errors.tooShort(10)}
                    required
                  >
                    {(control) => (
                      <PasswordInput
                        {...control}
                        autoComplete="new-password"
                        defaultValue="kinemax"
                      />
                    )}
                  </FormField>
                </div>
              </Sub>
            </Section>

            <Section id="navigation" title={s.sections.navigation}>
              <Sub title={s.navigation.links}>
                <p className={styles.paragraph}>
                  {s.navigation.inlineBefore}
                  <Link to="#navigation">{s.navigation.inlineLink}</Link>
                  {s.navigation.inlineAfter}
                </p>
                <p>
                  <Link to="#cards" variant="standalone">
                    {s.navigation.standalone}
                  </Link>
                </p>
              </Sub>
              <Sub title={s.navigation.tabs}>
                <Tabs
                  label={s.navigation.tabsLabel}
                  tabs={(['today', 'tomorrow', 'weekend'] as const).map((id) => ({
                    id,
                    label: s.navigation.tabNames[id],
                    content: <p>{s.navigation.tabContent[id]}</p>,
                  }))}
                />
              </Sub>
            </Section>

            <Section id="badges" title={s.sections.badges}>
              <Sub title={s.badges.ages}>
                <div className={styles.row}>
                  {AGE_RATINGS.map((rating) => (
                    <AgeBadge key={rating} rating={rating} />
                  ))}
                </div>
              </Sub>
              <Sub title={s.badges.formats}>
                <div className={styles.row}>
                  <FormatBadge format="2D" />
                  <FormatBadge format="3D" />
                </div>
              </Sub>
              <Sub title={s.badges.languages}>
                <div className={styles.row}>
                  {LANGUAGE_VERSIONS.map((version) => (
                    <LanguageBadge key={version} version={version} />
                  ))}
                </div>
              </Sub>
              <Sub title={s.badges.tones}>
                <div className={styles.row}>
                  {BADGE_TONES.map((tone) => (
                    <Badge key={tone} tone={tone}>
                      {s.badges.toneNames[tone]}
                    </Badge>
                  ))}
                </div>
              </Sub>
              <Sub title={s.badges.chips}>
                <div className={styles.row}>
                  {(['drama', 'comedy', 'thriller', 'family'] as const).map((genre) => (
                    <Chip
                      key={genre}
                      label={s.badges.chipNames[genre]}
                      selected={selectedGenres.includes(genre)}
                      onToggle={(on) => {
                        setSelectedGenres((current) =>
                          on ? [...current, genre] : current.filter((g) => g !== genre),
                        );
                      }}
                    />
                  ))}
                  <Chip
                    label={s.forms.disabledCheckbox}
                    selected={false}
                    onToggle={() => undefined}
                    disabled
                  />
                </div>
              </Sub>
              <Sub title={s.badges.activeFilters}>
                <div className={styles.row}>
                  {activeFilters.map((filter) => (
                    <Chip
                      key={filter}
                      label={s.badges.removableNames[filter]}
                      onRemove={() => {
                        setActiveFilters((current) => current.filter((f) => f !== filter));
                      }}
                    />
                  ))}
                </div>
              </Sub>
            </Section>

            <Section id="cards" title={s.sections.cards}>
              <Sub title={s.cards.cards}>
                <Grid min="15rem">
                  <Card>
                    <h4 className={styles.cardTitle}>{s.cards.surfaceTitle}</h4>
                    <p className={styles.cardBody}>{s.cards.surfaceBody}</p>
                  </Card>
                  <Card variant="elevated">
                    <h4 className={styles.cardTitle}>{s.cards.elevatedTitle}</h4>
                    <p className={styles.cardBody}>{s.cards.elevatedBody}</p>
                  </Card>
                  <Card variant="outline" interactive>
                    <h4 className={styles.cardTitle}>{s.cards.interactiveTitle}</h4>
                    <p className={styles.cardBody}>{s.cards.interactiveBody}</p>
                  </Card>
                </Grid>
              </Sub>
              <Sub title={s.cards.movieCards}>
                <Grid as="ul" min="min(11rem, 38vw)" gap="lg">
                  {movies.map((movie) => (
                    <li key={movie.slug}>
                      <MovieCard
                        title={movie.title}
                        to="#cards"
                        posterSrc={`/seed/posters/${movie.slug}.svg`}
                        ageRating={movie.rating}
                        durationMinutes={movie.minutes}
                        genres={movie.genres}
                        formats={movie.formats}
                        languageVersion={movie.language}
                        headingLevel="h4"
                      />
                    </li>
                  ))}
                  <li>
                    <MovieCard
                      title={s.cards.noPoster}
                      to="#cards"
                      ageRating="AGE_12"
                      durationMinutes={88}
                      headingLevel="h4"
                    />
                  </li>
                </Grid>
              </Sub>
            </Section>

            <Section id="feedback" title={s.sections.feedback}>
              <Sub title={s.feedback.dialog}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDialogOpen(true);
                  }}
                >
                  {s.feedback.openDialog}
                </Button>
                <Modal
                  open={dialogOpen}
                  onClose={() => {
                    setDialogOpen(false);
                  }}
                  title={s.feedback.dialogTitle}
                  footer={
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setDialogOpen(false);
                        }}
                      >
                        {s.feedback.cancel}
                      </Button>
                      <Button
                        onClick={() => {
                          setDialogOpen(false);
                          toast.show({
                            tone: 'success',
                            title: s.feedback.toastTitles.success,
                            description: s.feedback.toastBodies.success,
                          });
                        }}
                      >
                        {s.feedback.confirm}
                      </Button>
                    </>
                  }
                >
                  <p>{s.feedback.dialogBody}</p>
                  <p className={styles.dialogExtra}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        toast.show({ tone: 'info', title: s.shell.toastQueued });
                      }}
                    >
                      {s.shell.toastInDialog}
                    </Button>
                  </p>
                </Modal>
              </Sub>
              <Sub title={s.feedback.sheet}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSheetOpen(true);
                  }}
                >
                  {s.feedback.openSheet}
                </Button>
                <Modal
                  open={sheetOpen}
                  variant="sheet"
                  onClose={() => {
                    setSheetOpen(false);
                  }}
                  title={t.schedule.filters}
                  footer={
                    <Button
                      onClick={() => {
                        setSheetOpen(false);
                      }}
                    >
                      {t.schedule.apply}
                    </Button>
                  }
                >
                  <p>{s.feedback.sheetBody}</p>
                </Modal>
              </Sub>
              <Sub title={s.feedback.toasts}>
                <div className={styles.row}>
                  {TOAST_TONES.map((tone) => (
                    <Button
                      key={tone}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        toast.show({
                          tone,
                          title: s.feedback.toastTitles[tone],
                          description: s.feedback.toastBodies[tone],
                        });
                      }}
                    >
                      {s.feedback.toastTones[tone]}
                    </Button>
                  ))}
                </div>
              </Sub>
              <Sub title={s.feedback.skeletons}>
                <div aria-busy="true" className={styles.skeletonDemo}>
                  <p role="status" className="visually-hidden">
                    {s.cards.skeletonLabel}
                  </p>
                  <Grid min="min(11rem, 38vw)" gap="lg">
                    <MovieCardSkeleton />
                    <MovieCardSkeleton />
                    <MovieCardSkeleton />
                  </Grid>
                </div>
              </Sub>
            </Section>

            <Section id="icons" title={s.sections.icons}>
              <p className={styles.note}>{s.icons.note}</p>
              <ul className={styles.iconGrid}>
                {ICON_NAMES.map((name) => (
                  <li key={name}>
                    <Icon name={name} size={24} />
                    <Token>{name}</Token>
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="layout" title={s.sections.layout}>
              <p className={styles.note}>{s.layout.containerNote}</p>
              <p className={styles.note}>{s.layout.gridNote}</p>
              <Grid min="9rem" gap="sm" className={styles.gridDemo}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div key={n} className={styles.gridCell}>
                    {s.layout.cell(n)}
                  </div>
                ))}
              </Grid>
            </Section>

            <Section id="shell" title={s.sections.shell}>
              <Sub title={s.shell.header} note={s.shell.headerNote}>
                <div className={styles.shellDemo}>
                  <SiteHeader />
                </div>
                <p className={styles.note}>{s.shell.drawerNote}</p>
              </Sub>
              <Sub title={s.shell.picker} note={s.shell.pickerNote}>
                <ul className={styles.locationDemo}>
                  {DEMO_LOCATIONS.map((location) => (
                    <li key={location.slug}>
                      <LocationCard
                        location={location}
                        selected={location.slug === demoLocation}
                        onChoose={() => {
                          setDemoLocation(location.slug);
                        }}
                      />
                    </li>
                  ))}
                </ul>
                <Button variant="secondary" icon="mapPin" onClick={openPicker}>
                  {s.shell.openPicker}
                </Button>
              </Sub>
              <Sub title={s.shell.buttonLinks}>
                <div className={styles.row}>
                  <ButtonLink to="#shell" icon="ticket">
                    {t.nav.buyTicket}
                  </ButtonLink>
                  <ButtonLink to="#shell" variant="secondary" icon="arrowRight">
                    {t.common.backHome}
                  </ButtonLink>
                  <ButtonLink to="#shell" variant="ghost" size="sm">
                    {t.nav.login}
                  </ButtonLink>
                </div>
              </Sub>
              <Sub title={s.shell.emptyStates}>
                <Grid min="18rem">
                  <EmptyState
                    title={t.home.noMoviesTitle}
                    action={
                      <Button variant="secondary" icon="mapPin">
                        {t.home.changeLocation}
                      </Button>
                    }
                  >
                    <p>{s.shell.emptyBody}</p>
                  </EmptyState>
                  <EmptyState
                    icon="warning"
                    tone="error"
                    title={t.home.moviesError}
                    action={<Button variant="secondary">{t.common.retry}</Button>}
                  />
                  <EmptyState
                    eyebrow={t.comingSoon.badge}
                    title={t.comingSoon.pages.food.title}
                    action={
                      <ButtonLink to="#shell" variant="secondary" icon="arrowRight">
                        {t.common.backHome}
                      </ButtonLink>
                    }
                  >
                    <p>{t.comingSoon.pages.food.body}</p>
                  </EmptyState>
                </Grid>
              </Sub>
              <Sub title={s.shell.footer}>
                <div className={styles.shellDemo}>
                  <SiteFooter />
                </div>
              </Sub>
            </Section>

            <Section id="home" title={s.sections.home}>
              <Sub title={s.home.hero}>
                <div className={styles.heroFrame}>
                  <FeaturedHero
                    state={{ status: 'ready', data: DEMO_FEATURED }}
                    onRetry={() => undefined}
                    titleTag="h2"
                  />
                </div>
              </Sub>
              <Sub title={s.home.heroLoading}>
                <div className={styles.heroFrame}>
                  <FeaturedHero
                    state={{ status: 'loading' }}
                    onRetry={() => undefined}
                    titleTag="h2"
                  />
                </div>
              </Sub>
              <Sub title={s.home.heroError}>
                <div className={styles.heroFrame}>
                  <FeaturedHero
                    state={{ status: 'error' }}
                    onRetry={() => undefined}
                    titleTag="h2"
                  />
                </div>
              </Sub>
              <Sub title={s.home.heroNone}>
                <div className={styles.heroFrame}>
                  <FeaturedHero
                    state={{ status: 'ready', data: null }}
                    onRetry={() => undefined}
                    titleTag="h2"
                  />
                </div>
              </Sub>
              <Sub title={s.home.showtimes} note={s.home.showtimesNote}>
                <DayTabs days={DEMO_DAYS} selected={demoDay} onSelect={setDemoDay}>
                  <ShowtimeGroups groups={DEMO_SHOWTIME_GROUPS} headingLevel="h4" />
                </DayTabs>
              </Sub>
              <Sub title={s.home.chooseCinema}>
                <ChooseCinema headingLevel="h3" />
              </Sub>
              <Sub title={s.home.rails}>
                <div className={styles.railDemo}>
                  <MovieRail
                    id="demo-rail-ready"
                    title={t.home.comingSoon}
                    state={{ status: 'ready', data: DEMO_MOVIES }}
                    onRetry={() => undefined}
                    empty={null}
                    showRelease
                  />
                  <MovieRail
                    id="demo-rail-loading"
                    title={s.home.railLoading}
                    state={{ status: 'loading' }}
                    onRetry={() => undefined}
                    empty={null}
                  />
                  <MovieRail
                    id="demo-rail-error"
                    title={s.home.railError}
                    state={{ status: 'error' }}
                    onRetry={() => undefined}
                    empty={null}
                  />
                  <MovieRail
                    id="demo-rail-empty"
                    title={s.home.railEmpty}
                    state={{ status: 'ready', data: [] }}
                    onRetry={() => undefined}
                    empty={<EmptyState title={t.home.noMoviesTitle} />}
                  />
                </div>
              </Sub>
            </Section>

            <Section id="booking" title={s.sections.booking}>
              <Sub title={s.booking.map} note={s.booking.mapNote}>
                <SeatMap2D
                  map={DEMO_SEATMAP}
                  selected={demoSeats}
                  onToggle={(seat) => {
                    const result = toggleSeat(demoSeats, seat, demoSeatsById);
                    if (result.ok) setDemoSeats(result.selected);
                  }}
                />
              </Sub>
            </Section>
          </div>
        </Container>
      </main>
    </div>
  );
}
