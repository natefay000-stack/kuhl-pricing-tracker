/**
 * KÜHL SP26 Style Stories — Data Layer
 *
 * Currently uses a static array. If migrating to a database, add a
 * `style_stories` table and query via Prisma (see prisma/schema.prisma).
 */

// ── Types ──────────────────────────────────────────────────────────

export type Gender = 'Men' | 'Women';

export type Category = 'True Outdoor' | 'Urban / Aktiv' | 'Workwear';

export type ChannelFit = 'Primary' | 'Hero' | 'Core' | 'Yes' | 'No';

export interface ChannelDistribution {
  web: ChannelFit;
  rei: ChannelFit;
  retail: ChannelFit;
  scheels: ChannelFit;
}

export interface PricingData {
  msrp: number;
  wholesale: number;
  cogs: number;
  /** Wholesale margin percentage (computed: (wholesale - cogs) / wholesale * 100) */
  marginWs: number;
  /** Percentage-point delta vs internal margin target */
  vsTargetPp: number;
  /** Percentage-point delta vs SP25 margin */
  vsSp25Pp: number;
}

export interface ConstructionFeature {
  name: string;
  description: string;
}

export interface StyleData {
  id: string;
  styleNumber: string;
  name: string;
  gender: Gender;
  productType: string;
  category: Category;
  isNew: boolean;

  // Editorial content
  subtitle: string;
  tagline: string;
  designedForHeadline: string;
  designedForBody: string;
  whyWeBuiltIt: string;
  constructionFeatures: ConstructionFeature[];

  // Pricing & distribution
  pricing: PricingData;
  channels: ChannelDistribution;

  // Visual
  photoBgGradient: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function computeMargin(wholesale: number, cogs: number): number {
  return Math.round(((wholesale - cogs) / wholesale) * 1000) / 10;
}

// ── Data ───────────────────────────────────────────────────────────

export const STYLES_DATA: StyleData[] = [
  {
    id: 'renegade-pant',
    styleNumber: '1027',
    name: 'Renegade Pant',
    gender: 'Men',
    productType: 'Bottoms',
    category: 'True Outdoor',
    isNew: false,
    subtitle: 'The Original \u00b7 Since 2006',
    tagline: 'Moves like softshell, lives like denim.',
    designedForHeadline: 'The weekend climber who commutes on Monday',
    designedForBody:
      'He\u2019s 34, lives in Boulder or Bozeman, and owns more chalk bags than dress shoes. He needs a pant that can scramble a 5.9 on Saturday and walk into a Monday standup without raising eyebrows. He buys one thing that works everywhere and replaces it only when it finally dies.',
    whyWeBuiltIt:
      'Kevin saw climbers showing up to the crag in stiff denim and cotton chinos\u2014pants that ripped at the crotch, soaked through with sweat, and couldn\u2019t handle a single high step. He knew there had to be a better answer: a technical pant with the look and durability of your favorite pair of jeans. The Renegade was that answer, and it\u2019s been our number-one seller every season since.',
    constructionFeatures: [
      {
        name: 'K\u00dcHL-Dry stretch woven',
        description:
          'Proprietary fabric with mechanical stretch and moisture-wicking finish. No spandex to break down over time.',
      },
      {
        name: 'Gusseted crotch',
        description:
          'Diamond-shaped gusset eliminates binding on high steps and deep squats.',
      },
      {
        name: 'Articulated patterning',
        description:
          'Pre-curved knees and seat seams follow the body\u2019s natural movement arc.',
      },
      {
        name: 'Low-profile waistband',
        description:
          'Sits cleanly under a harness or pack hip-belt without hot spots.',
      },
    ],
    pricing: {
      msrp: 129,
      wholesale: 64.5,
      cogs: 24.1,
      marginWs: computeMargin(64.5, 24.1),
      vsTargetPp: 2.7,
      vsSp25Pp: 1.1,
    },
    channels: { web: 'Primary', rei: 'Core', retail: 'Core', scheels: 'Yes' },
    photoBgGradient: 'linear-gradient(135deg, #0a1f0a 0%, #1a2e1a 40%, #0d1a0d 100%)',
  },
  {
    id: 'spyr-pant',
    styleNumber: '1044',
    name: 'Spyr Pant',
    gender: 'Men',
    productType: 'Bottoms',
    category: 'True Outdoor',
    isNew: false,
    subtitle: 'Alpine Performance \u00b7 Since 2012',
    tagline: 'For the ascent. And the apr\u00e8s.',
    designedForHeadline: 'The ski patroller who never clocks out',
    designedForBody:
      'She or he is on the mountain before first chair and stays past last call. They need a pant that handles boot-packing a couloir at dawn and still looks sharp walking into town for dinner. Performance isn\u2019t a feature\u2014it\u2019s the baseline.',
    whyWeBuiltIt:
      'We built the Spyr when we realized customers were layering softshell pants over the Renegade in cold weather. They loved the fit and mobility but needed weather protection and warmth without bulk. The Spyr took everything great about the Renegade\u2019s movement and wrapped it in a fabric built for alpine conditions.',
    constructionFeatures: [
      {
        name: 'Korup Klim stretch fabric',
        description:
          'Bonded softshell face with fleece interior. Wind-resistant, water-repellent, and four-way stretch.',
      },
      {
        name: 'Slim alpine taper',
        description:
          'Streamlined from knee to cuff to fit cleanly inside ski boots without bunching.',
      },
      {
        name: 'Internal gaiter loops',
        description:
          'Hidden boot hooks keep the cuff anchored during transitions and skinning.',
      },
      {
        name: 'Thigh vents',
        description:
          'Zippered vents dump heat on the uphill without removing a layer.',
      },
    ],
    pricing: {
      msrp: 149,
      wholesale: 74.5,
      cogs: 29.8,
      marginWs: computeMargin(74.5, 29.8),
      vsTargetPp: 0,
      vsSp25Pp: 0,
    },
    channels: { web: 'Primary', rei: 'Hero', retail: 'Core', scheels: 'No' },
    photoBgGradient: 'linear-gradient(135deg, #0a0f1e 0%, #1a2540 40%, #0d1225 100%)',
  },
  {
    id: 'klash-short',
    styleNumber: '1103',
    name: 'Klash Short',
    gender: 'Men',
    productType: 'Shorts',
    category: 'Urban / Aktiv',
    isNew: true,
    subtitle: 'New for SP26',
    tagline: 'Trail to tap room without the change.',
    designedForHeadline: 'The trail runner who\u2019s also a dad and a regular',
    designedForBody:
      'He runs three mornings a week before the kids wake up, coaches Saturday soccer, and meets friends at the brewery after. He doesn\u2019t want a running short that screams \u201Cperformance\u201D or a casual short that chafes at mile two. He wants one short that handles all of it.',
    whyWeBuiltIt:
      'Our Urban/Aktiv customer kept showing up in the data\u2014high repeat purchase rate, highest NPS scores in the book, but we had nothing purpose-built for him in shorts. He was buying the Renegade short and making it work, but the construction was over-built for his use case and the price point was too high. The Klash is right-sized in every way.',
    constructionFeatures: [
      {
        name: 'Nylon-poly stretch blend',
        description:
          'Lightweight, quick-drying fabric with a soft hand feel. Won\u2019t cling when wet.',
      },
      {
        name: '7" inseam',
        description:
          'The Goldilocks length\u2014long enough for the school pickup line, short enough for trail speed.',
      },
      {
        name: 'Inner brief liner',
        description:
          'Seamless mesh liner eliminates chafe on runs and provides support without compression.',
      },
      {
        name: 'Side zip pocket',
        description:
          'Secure zip pocket on the right thigh keeps phone and keys locked down mid-stride.',
      },
    ],
    pricing: {
      msrp: 79,
      wholesale: 39.5,
      cogs: 14.6,
      marginWs: computeMargin(39.5, 14.6),
      vsTargetPp: 3.0,
      vsSp25Pp: 2.2,
    },
    channels: { web: 'Primary', rei: 'No', retail: 'Core', scheels: 'Yes' },
    photoBgGradient: 'linear-gradient(135deg, #1a0e08 0%, #2e1810 40%, #1a0d07 100%)',
  },
  {
    id: 'freeflex-pant',
    styleNumber: '1061',
    name: 'Freeflex Pant',
    gender: 'Men',
    productType: 'Bottoms',
    category: 'Urban / Aktiv',
    isNew: false,
    subtitle: 'Crossover Performance \u00b7 Since 2018',
    tagline: 'The pant that keeps up, no matter what up means.',
    designedForHeadline: 'The guy who does everything but specializes in nothing',
    designedForBody:
      'He\u2019s 41, works in tech, bikes to the office when there is one, and hikes most weekends. He doesn\u2019t identify as an \u201Coutdoor guy\u201D but he\u2019s outside more than most. He wants clothes that look intentional without trying too hard, and he\u2019ll pay for quality but not for logos.',
    whyWeBuiltIt:
      'The Renegade was cannibalizing our casual wear sales\u2014customers were buying it as an everyday pant even though it was built (and priced) for technical use. Instead of fighting the trend, we leaned in and built for the biggest underserved segment in men\u2019s bottoms: the guy who needs one pant for everything that isn\u2019t a suit.',
    constructionFeatures: [
      {
        name: 'Dual-directional stretch',
        description:
          'Two-way mechanical stretch moves with you on the bike, at the desk, or on the trail.',
      },
      {
        name: 'Clean urban silhouette',
        description:
          'Straight-through-hip with a slight taper. No cargo pockets, no visible tech details.',
      },
      {
        name: 'Moisture-wicking liner',
        description:
          'Lightweight interior wicking finish keeps you dry during bike commutes and warm hikes.',
      },
      {
        name: 'Hidden waistband adjuster',
        description:
          'Internal elastic tabs let you dial in fit without a belt\u2014invisible from the outside.',
      },
    ],
    pricing: {
      msrp: 109,
      wholesale: 54.5,
      cogs: 26.4,
      marginWs: computeMargin(54.5, 26.4),
      vsTargetPp: -8.4,
      vsSp25Pp: -1.2,
    },
    channels: { web: 'Primary', rei: 'No', retail: 'Yes', scheels: 'Core' },
    photoBgGradient: 'linear-gradient(135deg, #120e1e 0%, #1e1830 40%, #110d1a 100%)',
  },
];

// ── Filter helpers ─────────────────────────────────────────────────

export type FilterKey = 'all' | 'mens' | 'womens' | 'true-outdoor' | 'urban-aktiv' | 'workwear' | 'new';

export interface FilterTab {
  key: FilterKey;
  label: string;
  filter: (s: StyleData) => boolean;
}

export const FILTER_TABS: FilterTab[] = [
  { key: 'all', label: 'All Styles', filter: () => true },
  { key: 'mens', label: "Men\u2019s", filter: (s) => s.gender === 'Men' },
  { key: 'womens', label: "Women\u2019s", filter: (s) => s.gender === 'Women' },
  { key: 'true-outdoor', label: 'True Outdoor', filter: (s) => s.category === 'True Outdoor' },
  { key: 'urban-aktiv', label: 'Urban / Aktiv', filter: (s) => s.category === 'Urban / Aktiv' },
  { key: 'workwear', label: 'Workwear', filter: (s) => s.category === 'Workwear' },
  { key: 'new', label: 'New SP26', filter: (s) => s.isNew },
];
