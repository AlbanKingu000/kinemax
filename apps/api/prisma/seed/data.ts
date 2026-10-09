// Demo data for the development database. Everything here is fictional: the cinema chain, its
// addresses, the movies, their crews and the menu. No real titles, posters or trademarks.

import type { HallLayoutSpec } from '../../src/domain/seat-layout.js';
import { reclinerHallSpec, stadiumHallSpec, suiteHallSpec } from '../../src/domain/seat-layout.js';

export const TIME_ZONE = 'Europe/Belgrade';
/** All seeded price rules are valid from this instant (open-ended). */
export const RULES_VALID_FROM = new Date('2026-01-01T00:00:00Z');

export type HallTypeCode = 'STANDARD' | 'VIP_RECLINER' | 'PREMIUM_LARGE_FORMAT' | 'PRIVATE_SUITE';

export const HALL_TYPES: {
  code: HallTypeCode;
  nameSq: string;
  nameEn: string;
  descriptionSq: string;
  descriptionEn: string;
  features: string[];
  allowsSeatDelivery: boolean;
  sortOrder: number;
}[] = [
  {
    code: 'STANDARD',
    nameSq: 'Standard',
    nameEn: 'Standard',
    descriptionSq: 'Sallë klasike me ulëse të rehatshme në shkallë dhe zë digjital rrethues.',
    descriptionEn: 'Classic hall with comfortable stadium seating and digital surround sound.',
    features: ['STADIUM_SEATING', 'DIGITAL_SURROUND'],
    allowsSeatDelivery: false,
    sortOrder: 1,
  },
  {
    code: 'VIP_RECLINER',
    nameSq: 'VIP Recliner',
    nameEn: 'VIP Recliner',
    descriptionSq:
      'Kolltukë elektrikë që shtrihen, hapësirë e bollshme dhe ushqim i shërbyer në vend.',
    descriptionEn: 'Electric reclining armchairs, generous legroom and food served to your seat.',
    features: ['RECLINERS', 'SEAT_SERVICE', 'EXTRA_LEGROOM'],
    allowsSeatDelivery: true,
    sortOrder: 2,
  },
  {
    code: 'PREMIUM_LARGE_FORMAT',
    nameSq: 'Kinemax Grand',
    nameEn: 'Kinemax Grand',
    descriptionSq: 'Ekrani më i madh i Kinemax-it me zë imersiv nga çdo drejtim.',
    descriptionEn: "Kinemax's biggest screen with immersive sound from every direction.",
    features: ['GIANT_SCREEN', 'IMMERSIVE_SOUND', 'STADIUM_SEATING'],
    allowsSeatDelivery: false,
    sortOrder: 3,
  },
  {
    code: 'PRIVATE_SUITE',
    nameSq: 'Suitë private',
    nameEn: 'Private suite',
    descriptionSq: 'Sallë e vogël private për grupin tuaj, me kolltukë dhe shërbim në vend.',
    descriptionEn: 'A small private hall for your group, with recliners and seat service.',
    features: ['PRIVATE', 'RECLINERS', 'SEAT_SERVICE'],
    allowsSeatDelivery: true,
    sortOrder: 4,
  },
];

export interface HallSeed {
  name: string;
  type: HallTypeCode;
  layout: HallLayoutSpec;
  screen: { widthM: number; heightM: number; z: number };
  /** Whole-hall price in cents (suites only). */
  wholeHallPriceCents?: number;
}

export interface LocationSeed {
  slug: string;
  name: string;
  city: string;
  address: string;
  halls: HallSeed[];
}

const standardScreen = { widthM: 12, heightM: 5, z: 3.5 };
const grandScreen = { widthM: 22, heightM: 9.5, z: 5.5 };
const vipScreen = { widthM: 10, heightM: 4.2, z: 3 };
const suiteScreen = { widthM: 6, heightM: 2.6, z: 2 };

const grand = (rows: number) =>
  stadiumHallSpec({
    rows,
    blockSizes: [6, 12, 6],
    tierStartRow: 2,
    tierRiseM: 0.45,
    firstRowDistanceM: 7,
  });
const standard = (rows: number, perSide: number) =>
  stadiumHallSpec({ rows, blockSizes: [perSide, perSide] });

export const LOCATIONS: LocationSeed[] = [
  {
    slug: 'prishtine',
    name: 'Kinemax Prishtinë',
    city: 'Prishtinë',
    address: 'Bulevardi i Dritës 12, 10000 Prishtinë',
    halls: [
      { name: 'Grand 1', type: 'PREMIUM_LARGE_FORMAT', layout: grand(14), screen: grandScreen },
      { name: 'Salla 2', type: 'STANDARD', layout: standard(12, 9), screen: standardScreen },
      { name: 'Salla 3', type: 'STANDARD', layout: standard(10, 8), screen: standardScreen },
      { name: 'Salla 4', type: 'STANDARD', layout: standard(9, 7), screen: standardScreen },
      {
        name: 'VIP 5',
        type: 'VIP_RECLINER',
        layout: reclinerHallSpec({ rows: 5, blockSizes: [4, 4] }),
        screen: vipScreen,
      },
      {
        name: 'Suita 6',
        type: 'PRIVATE_SUITE',
        layout: suiteHallSpec({ seatsPerRow: 7 }),
        screen: suiteScreen,
        wholeHallPriceCents: 14_000,
      },
    ],
  },
  {
    slug: 'prizren',
    name: 'Kinemax Prizren',
    city: 'Prizren',
    address: 'Rruga e Lumit 8, 20000 Prizren',
    halls: [
      { name: 'Salla 1', type: 'STANDARD', layout: standard(11, 8), screen: standardScreen },
      { name: 'Salla 2', type: 'STANDARD', layout: standard(8, 7), screen: standardScreen },
      {
        name: 'VIP 3',
        type: 'VIP_RECLINER',
        layout: reclinerHallSpec({ rows: 4, blockSizes: [4, 4] }),
        screen: vipScreen,
      },
      {
        name: 'Suita 4',
        type: 'PRIVATE_SUITE',
        layout: suiteHallSpec({ seatsPerRow: 5 }),
        screen: suiteScreen,
        wholeHallPriceCents: 11_000,
      },
    ],
  },
  {
    slug: 'peje',
    name: 'Kinemax Pejë',
    city: 'Pejë',
    address: 'Rruga e Bjeshkëve 21, 30000 Pejë',
    halls: [
      { name: 'Salla 1', type: 'STANDARD', layout: standard(10, 8), screen: standardScreen },
      { name: 'Salla 2', type: 'STANDARD', layout: standard(8, 6), screen: standardScreen },
      {
        name: 'VIP 3',
        type: 'VIP_RECLINER',
        layout: reclinerHallSpec({ rows: 4, blockSizes: [3, 3] }),
        screen: vipScreen,
      },
    ],
  },
  {
    slug: 'ferizaj',
    name: 'Kinemax Ferizaj',
    city: 'Ferizaj',
    address: 'Rruga e Hekurudhës 3, 70000 Ferizaj',
    halls: [
      { name: 'Grand 1', type: 'PREMIUM_LARGE_FORMAT', layout: grand(12), screen: grandScreen },
      { name: 'Salla 2', type: 'STANDARD', layout: standard(10, 8), screen: standardScreen },
      { name: 'Salla 3', type: 'STANDARD', layout: standard(8, 6), screen: standardScreen },
    ],
  },
];

export type GenreCode =
  | 'ACTION'
  | 'ADVENTURE'
  | 'ANIMATION'
  | 'COMEDY'
  | 'CRIME'
  | 'DRAMA'
  | 'FAMILY'
  | 'FANTASY'
  | 'HISTORY'
  | 'HORROR'
  | 'MUSIC'
  | 'MYSTERY'
  | 'ROMANCE'
  | 'SCI_FI'
  | 'THRILLER'
  | 'WAR';

export interface MovieSeed {
  slug: string;
  titleSq: string;
  titleEn: string;
  synopsisSq: string;
  synopsisEn: string;
  durationMinutes: number;
  ageRating: 'ALL' | 'AGE_7' | 'AGE_12' | 'AGE_15' | 'AGE_18';
  genres: GenreCode[];
  releaseDate: string;
  director: string;
  cast: string[];
  status: 'NOW_SHOWING' | 'COMING_SOON';
}

export const MOVIES: MovieSeed[] = [
  {
    slug: 'fanari-i-heshtur',
    titleSq: 'Fanari i Heshtur',
    titleEn: 'The Silent Lantern',
    synopsisSq:
      'Një rojtare fari në një ishull të largët merr sinjale drite nga një anije që u fundos tridhjetë vjet më parë.',
    synopsisEn:
      'A lighthouse keeper on a remote island starts receiving light signals from a ship that sank thirty years ago.',
    durationMinutes: 112,
    ageRating: 'AGE_15',
    genres: ['THRILLER', 'MYSTERY'],
    releaseDate: '2026-09-18',
    director: 'Erina Dushaj',
    cast: ['Vesa Krasniqi', 'Toni Malaj', 'Jon Rexhaj'],
    status: 'NOW_SHOWING',
  },
  {
    slug: 'kalldrem-dhe-neon',
    titleSq: 'Kalldrëm dhe Neon',
    titleEn: 'Cobblestone & Neon',
    synopsisSq:
      'Një taksist i natës dhe një hetuese e re ndjekin një rrjet kontrabande nëpër rrugicat e qytetit të vjetër.',
    synopsisEn:
      'A night taxi driver and a young detective chase a smuggling ring through the alleys of the old town.',
    durationMinutes: 124,
    ageRating: 'AGE_15',
    genres: ['CRIME', 'DRAMA'],
    releaseDate: '2026-09-25',
    director: 'Driton Leka',
    cast: ['Arta Bislimi', 'Gent Osmani', 'Lira Hasani'],
    status: 'NOW_SHOWING',
  },
  {
    slug: 'ekspedita-bjeshke',
    titleSq: 'Ekspedita Bjeshkë',
    titleEn: 'Expedition Highlands',
    synopsisSq:
      'Tre fëmijë dhe gjyshja e tyre nisen në male për të gjetur një liqen që nuk shfaqet në asnjë hartë.',
    synopsisEn:
      'Three kids and their grandmother head into the mountains to find a lake that appears on no map.',
    durationMinutes: 101,
    ageRating: 'AGE_7',
    genres: ['ADVENTURE', 'FAMILY'],
    releaseDate: '2026-10-02',
    director: 'Mira Zeka',
    cast: ['Nora Shala', 'Elion Kastrati', 'Shpresa Doda'],
    status: 'NOW_SHOWING',
  },
  {
    slug: 'letra-nga-bregu-i-kripes',
    titleSq: 'Letra nga Bregu i Kripës',
    titleEn: 'Letters from the Salt Coast',
    synopsisSq:
      'Dy të huaj zbulojnë se po i shkruajnë letra të njëjtës kuti postare në një fshat bregdetar.',
    synopsisEn:
      'Two strangers discover they have been writing letters to the same mailbox in a seaside village.',
    durationMinutes: 108,
    ageRating: 'AGE_12',
    genres: ['ROMANCE', 'DRAMA'],
    releaseDate: '2026-09-11',
    director: 'Albana Muja',
    cast: ['Rina Gashi', 'Besart Tahiri'],
    status: 'NOW_SHOWING',
  },
  {
    slug: 'pipa-dhe-robotet-e-kopshtit',
    titleSq: 'Pipa dhe Robotët e Kopshtit',
    titleEn: 'Pipa and the Garden Robots',
    synopsisSq:
      'Pipa ndërton robotë nga kanaçe të vjetra për të shpëtuar kopshtin e lagjes nga një thatësirë e madhe.',
    synopsisEn:
      'Pipa builds robots out of old tin cans to save the neighbourhood garden from a great drought.',
    durationMinutes: 92,
    ageRating: 'ALL',
    genres: ['ANIMATION', 'FAMILY', 'COMEDY'],
    releaseDate: '2026-10-01',
    director: 'Ardit Berisha',
    cast: ['Ela Morina (zëri)', 'Dren Hoti (zëri)'],
    status: 'NOW_SHOWING',
  },
  {
    slug: 'ulurima-ne-mjegull',
    titleSq: 'Ulurima në Mjegull',
    titleEn: 'Howl in the Fog',
    synopsisSq:
      'Një grup studentësh ngecin në një stan malor ku çdo natë mjegulla sjell me vete diçka tjetër.',
    synopsisEn:
      'A group of students get stranded in a mountain hut where every night the fog brings something new.',
    durationMinutes: 97,
    ageRating: 'AGE_18',
    genres: ['HORROR', 'THRILLER'],
    releaseDate: '2026-10-08',
    director: 'Kreshnik Prenga',
    cast: ['Blerta Kuqi', 'Ilir Vata', 'Dafina Lushi'],
    status: 'NOW_SHOWING',
  },
  {
    slug: 'kodi-orbital-9',
    titleSq: 'Kodi Orbital 9',
    titleEn: 'Orbital Code 9',
    synopsisSq:
      'Një inxhiniere softueri zbulon se satelitët e vjetër po i dërgojnë mesazhe njëri-tjetrit pa asnjë njeri në kontroll.',
    synopsisEn:
      'A software engineer discovers that old satellites are messaging each other with no human in control.',
    durationMinutes: 131,
    ageRating: 'AGE_12',
    genres: ['SCI_FI', 'THRILLER'],
    releaseDate: '2026-09-30',
    director: 'Valon Kurti',
    cast: ['Teuta Ramadani', 'Agon Selimi', 'Hana Bajrami'],
    status: 'NOW_SHOWING',
  },
  {
    slug: 'dasma-me-tre-nuse',
    titleSq: 'Dasma me Tre Nuse',
    titleEn: 'The Wedding with Three Brides',
    synopsisSq:
      'Një gabim në ftesa sjell tri nuse në të njëjtin restorant, në të njëjtën ditë, me të njëjtin orkestër.',
    synopsisEn:
      'A mix-up with the invitations brings three brides to the same restaurant, on the same day, with the same band.',
    durationMinutes: 104,
    ageRating: 'AGE_12',
    genres: ['COMEDY', 'ROMANCE'],
    releaseDate: '2026-09-04',
    director: 'Fjolla Rama',
    cast: ['Edona Gjoka', 'Kushtrim Sadiku', 'Mimoza Vrella'],
    status: 'NOW_SHOWING',
  },
  {
    slug: 'levizja-e-fundit-e-gjyshit',
    titleSq: 'Lëvizja e Fundit e Gjyshit',
    titleEn: "Grandpa's Last Move",
    synopsisSq:
      'Një mbesë mëson shah nga gjyshi i saj për ta mundur kampionin e kafenesë para turneut të fshatit.',
    synopsisEn:
      'A girl learns chess from her grandfather to beat the café champion before the village tournament.',
    durationMinutes: 96,
    ageRating: 'AGE_7',
    genres: ['DRAMA', 'FAMILY'],
    releaseDate: '2026-11-06',
    director: 'Sokol Daci',
    cast: ['Bukurije Shehu', 'Ardi Murati'],
    status: 'COMING_SOON',
  },
  {
    slug: 'agimi-mbi-uren-e-kuqe',
    titleSq: 'Agimi mbi Urën e Kuqe',
    titleEn: 'Dawn over the Red Bridge',
    synopsisSq:
      'Në dimrin e vitit 1912, një postier i ri duhet të kalojë frontin për të dorëzuar një letër që mund të ndalë luftën.',
    synopsisEn:
      'In the winter of 1912, a young postman must cross the front line to deliver a letter that could stop a war.',
    durationMinutes: 142,
    ageRating: 'AGE_15',
    genres: ['HISTORY', 'WAR', 'DRAMA'],
    releaseDate: '2026-11-20',
    director: 'Nexhat Tafa',
    cast: ['Luan Shatri', 'Albulena Cena', 'Petrit Zogaj'],
    status: 'COMING_SOON',
  },
  {
    slug: 'ritmi-i-rruges-2042',
    titleSq: 'Ritmi i Rrugës 2042',
    titleEn: 'Street Rhythm 2042',
    synopsisSq:
      'Në një qytet ku muzika është e ndaluar, një grup kërcimtarësh organizon koncertin e fundit të pa lejuar.',
    synopsisEn:
      'In a city where music is banned, a dance crew organises one last unauthorised concert.',
    durationMinutes: 115,
    ageRating: 'AGE_12',
    genres: ['MUSIC', 'SCI_FI'],
    releaseDate: '2026-12-04',
    director: 'Rron Halimi',
    cast: ['Jeta Berisha', 'Dion Kelmendi', 'Era Pllana'],
    status: 'COMING_SOON',
  },
  {
    slug: 'detektivja-mira-dhe-maska-e-argjendte',
    titleSq: 'Detektivja Mira dhe Maska e Argjendtë',
    titleEn: 'Detective Mira and the Silver Mask',
    synopsisSq:
      'Mira, dhjetë vjeç, zgjidh misterin e një maske që zhduket nga muzeu i qytetit çdo natë me hënë të plotë.',
    synopsisEn:
      'Ten-year-old Mira solves the mystery of a mask that vanishes from the city museum every full-moon night.',
    durationMinutes: 99,
    ageRating: 'AGE_7',
    genres: ['MYSTERY', 'FAMILY', 'ADVENTURE'],
    releaseDate: '2026-11-13',
    director: 'Gresa Tërnava',
    cast: ['Lea Hyseni', 'Faton Ademi'],
    status: 'COMING_SOON',
  },
];

// Prices in cents. Global base prices per hall type, plus Prishtinë-specific overrides.
export const BASE_PRICES: { hallType: HallTypeCode; locationSlug?: string; priceCents: number }[] =
  [
    { hallType: 'STANDARD', priceCents: 450 },
    { hallType: 'PREMIUM_LARGE_FORMAT', priceCents: 650 },
    { hallType: 'VIP_RECLINER', priceCents: 900 },
    { hallType: 'STANDARD', locationSlug: 'prishtine', priceCents: 500 },
    { hallType: 'PREMIUM_LARGE_FORMAT', locationSlug: 'prishtine', priceCents: 700 },
  ];

/**
 * VIP: added to every VIP ticket. COUPLE: a sofa sells two tickets (one per person) and this
 * surcharge is charged once per sofa, without time adjustment or discount.
 */
export const SEAT_SURCHARGES: { seatType: 'VIP' | 'COUPLE'; amountCents: number }[] = [
  { seatType: 'VIP', amountCents: 150 },
  { seatType: 'COUPLE', amountCents: 200 },
];

export const TIME_ADJUSTMENTS: {
  key: string;
  nameSq: string;
  nameEn: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  kind: 'PERCENT' | 'FIXED_CENTS';
  value: number;
  priority: number;
}[] = [
  {
    key: 'weekday-matinee',
    nameSq: 'Matine e ditëve të javës',
    nameEn: 'Weekday matinee',
    daysOfWeek: [1, 2, 3, 4, 5],
    startMinute: 0,
    endMinute: 16 * 60,
    kind: 'PERCENT',
    value: -20,
    priority: 10,
  },
  {
    key: 'weekend-evening',
    nameSq: 'Mbrëmje fundjave',
    nameEn: 'Weekend evening',
    daysOfWeek: [5, 6, 7],
    startMinute: 18 * 60,
    endMinute: 24 * 60,
    kind: 'FIXED_CENTS',
    value: 100,
    priority: 10,
  },
  {
    key: 'cheap-tuesday',
    nameSq: 'E martë me çmim të ulët',
    nameEn: 'Cheap Tuesday',
    daysOfWeek: [2],
    startMinute: 0,
    endMinute: 24 * 60,
    kind: 'PERCENT',
    value: -30,
    priority: 20,
  },
];

export const TICKET_CATEGORIES: {
  code: string;
  nameSq: string;
  nameEn: string;
  descriptionSq: string;
  descriptionEn: string;
  sortOrder: number;
  discount?: { kind: 'PERCENT' | 'FIXED_CENTS'; value: number };
}[] = [
  {
    code: 'ADULT',
    nameSq: 'I rritur',
    nameEn: 'Adult',
    descriptionSq: 'Bileta e rregullt.',
    descriptionEn: 'Regular ticket.',
    sortOrder: 1,
  },
  {
    code: 'STUDENT',
    nameSq: 'Student',
    nameEn: 'Student',
    descriptionSq: 'Me kartë studenti të vlefshme.',
    descriptionEn: 'With a valid student card.',
    sortOrder: 2,
    discount: { kind: 'PERCENT', value: 20 },
  },
  {
    code: 'CHILD',
    nameSq: 'Fëmijë',
    nameEn: 'Child',
    descriptionSq: 'Deri në 12 vjeç.',
    descriptionEn: 'Up to 12 years old.',
    sortOrder: 3,
    discount: { kind: 'FIXED_CENTS', value: 150 },
  },
  {
    code: 'SENIOR',
    nameSq: 'Pensionist',
    nameEn: 'Senior',
    descriptionSq: 'Mbi 65 vjeç.',
    descriptionEn: 'Over 65.',
    sortOrder: 4,
    discount: { kind: 'PERCENT', value: 25 },
  },
];

export type MenuCategoryCode =
  'POPCORN' | 'DRINK' | 'SNACK' | 'NACHOS' | 'HOT_DOG' | 'VIP_DISH' | 'COMBO';

export interface MenuItemSeed {
  slug: string;
  nameSq: string;
  nameEn: string;
  descriptionSq?: string;
  descriptionEn?: string;
  category: MenuCategoryCode;
  /** Reference price in cents (Prishtinë); other locations derive from it. */
  priceCents: number;
  components?: { slug: string; quantity: number }[];
}

export const MENU_ITEMS: MenuItemSeed[] = [
  {
    slug: 'popcorn-small',
    nameSq: 'Kokoshka të vogla',
    nameEn: 'Small popcorn',
    category: 'POPCORN',
    priceCents: 250,
  },
  {
    slug: 'popcorn-medium',
    nameSq: 'Kokoshka mesatare',
    nameEn: 'Medium popcorn',
    category: 'POPCORN',
    priceCents: 350,
  },
  {
    slug: 'popcorn-large',
    nameSq: 'Kokoshka të mëdha',
    nameEn: 'Large popcorn',
    category: 'POPCORN',
    priceCents: 450,
  },
  {
    slug: 'popcorn-caramel',
    nameSq: 'Kokoshka me karamel',
    nameEn: 'Caramel popcorn',
    category: 'POPCORN',
    priceCents: 420,
  },
  {
    slug: 'soft-drink',
    nameSq: 'Pije e gazuar 0.5 l',
    nameEn: 'Soft drink 0.5 l',
    category: 'DRINK',
    priceCents: 200,
  },
  {
    slug: 'water',
    nameSq: 'Ujë mineral 0.5 l',
    nameEn: 'Mineral water 0.5 l',
    category: 'DRINK',
    priceCents: 120,
  },
  {
    slug: 'iced-tea',
    nameSq: 'Çaj i ftohtë 0.5 l',
    nameEn: 'Iced tea 0.5 l',
    category: 'DRINK',
    priceCents: 220,
  },
  {
    slug: 'orange-juice',
    nameSq: 'Lëng portokalli',
    nameEn: 'Orange juice',
    category: 'DRINK',
    priceCents: 250,
  },
  {
    slug: 'nachos-cheese',
    nameSq: 'Nachos me salcë djathi',
    nameEn: 'Nachos with cheese sauce',
    category: 'NACHOS',
    priceCents: 400,
  },
  {
    slug: 'hot-dog',
    nameSq: 'Hot dog klasik',
    nameEn: 'Classic hot dog',
    category: 'HOT_DOG',
    priceCents: 350,
  },
  {
    slug: 'chocolate-bar',
    nameSq: 'Çokollatë',
    nameEn: 'Chocolate bar',
    category: 'SNACK',
    priceCents: 150,
  },
  {
    slug: 'gummy-candy',
    nameSq: 'Karamele gome',
    nameEn: 'Gummy candy',
    category: 'SNACK',
    priceCents: 180,
  },
  {
    slug: 'vip-burger',
    nameSq: 'Burger i shtëpisë me patate',
    nameEn: 'House burger with fries',
    descriptionSq: 'Shërbehet në vend.',
    descriptionEn: 'Served at your seat.',
    category: 'VIP_DISH',
    priceCents: 950,
  },
  {
    slug: 'vip-flatbread',
    nameSq: 'Pite e pjekur me perime',
    nameEn: 'Baked flatbread with vegetables',
    descriptionSq: 'Shërbehet në vend.',
    descriptionEn: 'Served at your seat.',
    category: 'VIP_DISH',
    priceCents: 780,
  },
  {
    slug: 'vip-cheese-plate',
    nameSq: 'Pjatë djathërash vendorë',
    nameEn: 'Local cheese platter',
    descriptionSq: 'Për dy persona.',
    descriptionEn: 'For two.',
    category: 'VIP_DISH',
    priceCents: 1100,
  },
  {
    slug: 'combo-classic',
    nameSq: 'Kombo klasike',
    nameEn: 'Classic combo',
    descriptionSq: 'Kokoshka mesatare dhe një pije.',
    descriptionEn: 'Medium popcorn and a drink.',
    category: 'COMBO',
    priceCents: 500,
    components: [
      { slug: 'popcorn-medium', quantity: 1 },
      { slug: 'soft-drink', quantity: 1 },
    ],
  },
  {
    slug: 'combo-duo',
    nameSq: 'Kombo për dy',
    nameEn: 'Duo combo',
    descriptionSq: 'Kokoshka të mëdha dhe dy pije.',
    descriptionEn: 'Large popcorn and two drinks.',
    category: 'COMBO',
    priceCents: 750,
    components: [
      { slug: 'popcorn-large', quantity: 1 },
      { slug: 'soft-drink', quantity: 2 },
    ],
  },
  {
    slug: 'combo-family',
    nameSq: 'Kombo familjare',
    nameEn: 'Family combo',
    descriptionSq: 'Dy kokoshka të mëdha, katër pije dhe nachos.',
    descriptionEn: 'Two large popcorn, four drinks and nachos.',
    category: 'COMBO',
    priceCents: 1600,
    components: [
      { slug: 'popcorn-large', quantity: 2 },
      { slug: 'soft-drink', quantity: 4 },
      { slug: 'nachos-cheese', quantity: 1 },
    ],
  },
  {
    slug: 'combo-vip',
    nameSq: 'Kombo VIP',
    nameEn: 'VIP combo',
    descriptionSq: 'Burger, kokoshka me karamel dhe një pije.',
    descriptionEn: 'Burger, caramel popcorn and a drink.',
    category: 'COMBO',
    priceCents: 1350,
    components: [
      { slug: 'vip-burger', quantity: 1 },
      { slug: 'popcorn-caramel', quantity: 1 },
      { slug: 'soft-drink', quantity: 1 },
    ],
  },
];

/** Per-location menu: price factor (rounded to 10 cents) and items that are not offered there. */
export const LOCATION_MENUS: Record<string, { priceFactor: number; unavailable: string[] }> = {
  prishtine: { priceFactor: 1, unavailable: [] },
  prizren: { priceFactor: 0.95, unavailable: ['vip-cheese-plate'] },
  peje: { priceFactor: 0.9, unavailable: ['popcorn-caramel', 'combo-vip', 'iced-tea'] },
  // No VIP hall in Ferizaj, so no VIP dishes.
  ferizaj: {
    priceFactor: 0.9,
    unavailable: ['vip-burger', 'vip-flatbread', 'vip-cheese-plate', 'combo-vip'],
  },
};

export const SEED_USERS = {
  superAdmin: { email: 'admin@kinemax.test', name: 'Administratori Kinemax' },
  managers: LOCATIONS.map((location) => ({
    email: `menaxher.${location.slug}@kinemax.test`,
    name: `Menaxher ${location.city}`,
    locationSlug: location.slug,
  })),
  customers: [
    { email: 'klient1@kinemax.test', name: 'Arbena Demo', preferredLocale: 'sq' as const },
    { email: 'klient2@kinemax.test', name: 'Jon Demo', preferredLocale: 'en' as const },
  ],
};
