import type { VirtualUserDisposition } from './virtual-user.types.js'

/**
 * The dials a disposition turns. Everything here changes what the engine does;
 * `instructions` is the only field the model ever sees, and it describes
 * behaviour the dials cannot express on their own.
 */
export interface DispositionProfile {
  /** Appended to the persona instructions. Behaviour, never identity. */
  instructions: string
  /**
   * Relative weights for the scheduler's four moves. `continue` dominating is
   * what makes a run look like work rather than channel-surfing.
   */
  moves: {
    continue: number
    suspend: number
    resume: number
    abandon: number
  }
  /** Sampling temperature for the model's own turns. */
  temperature: number
  /** Chance of re-issuing the previous call unchanged — the double-click. */
  repeatRate: number
  /** Chance of re-reading before acting instead of trusting memory. */
  reReadRate: number
  /** Start with nothing remembered, whatever the caller seeded. */
  emptyMemory: boolean
  /** Non-read calls are refused by the engine, not merely discouraged. */
  readOnly: boolean
  /**
   * A 2xx is a finding rather than a success. The engine cannot know *whose*
   * resource an id belongs to, so it flags the success and leaves ownership to
   * the app's classifier — the honest split, since ownership is app knowledge.
   */
  invertedOracle: boolean
}

const REALISTIC: DispositionProfile = {
  instructions: [
    'Work towards your current goal the way a competent user would.',
    'Read an endpoint schema before you use it, and prefer values that a real person would plausibly enter.',
  ].join(' '),
  moves: { continue: 88, suspend: 6, resume: 5, abandon: 1 },
  temperature: 0.7,
  repeatRate: 0,
  reReadRate: 0.1,
  emptyMemory: false,
  readOnly: false,
  invertedOracle: false,
}

/**
 * The profiles, keyed by disposition. `careless` is the one worth reading twice:
 * it is not malice, it is an ordinary person being interrupted and impatient,
 * and it is where most production bugs actually live.
 */
export const DISPOSITIONS: Readonly<
  Record<VirtualUserDisposition, DispositionProfile>
> = {
  realistic: REALISTIC,

  careless: {
    ...REALISTIC,
    instructions: [
      'You are busy and easily distracted. You act on what you half-remember rather than checking first,',
      'you sometimes submit the same thing twice because you are not sure it went through,',
      'and you are comfortable entering odd-but-legal values — a very long name, an empty optional field, an emoji, a huge page size.',
      'Stay within what the schema allows; you are careless, not malicious.',
    ].join(' '),
    moves: { continue: 62, suspend: 18, resume: 12, abandon: 8 },
    temperature: 1,
    repeatRate: 0.18,
    reReadRate: 0.03,
  },

  newcomer: {
    ...REALISTIC,
    instructions: [
      'This is your first time in this product. You know nothing about it and hold no ids or names in your head.',
      'Find your way from whatever lists or lookups exist, and say plainly when there is no path forward from where you are.',
    ].join(' '),
    moves: { continue: 80, suspend: 8, resume: 6, abandon: 6 },
    temperature: 0.8,
    reReadRate: 0.4,
    emptyMemory: true,
  },

  stale: {
    ...REALISTIC,
    instructions: [
      'You used this product a while ago and are working from notes you took then.',
      'Reach for the ids and names you already have rather than looking them up again — some of them are out of date, and finding out how the product tells you so is the point.',
    ].join(' '),
    moves: { continue: 84, suspend: 8, resume: 6, abandon: 2 },
    temperature: 0.7,
    reReadRate: 0.02,
  },

  auditor: {
    ...REALISTIC,
    instructions: [
      'You are reconciling, not achieving. Pick one fact the product reports — a total, a count, a balance, a status —',
      'and read it from every endpoint that claims to know it, then say whether they agree.',
      'Report a disagreement precisely: which endpoints, which field, which two values.',
      'Never change anything.',
    ].join(' '),
    moves: { continue: 92, suspend: 4, resume: 4, abandon: 0 },
    temperature: 0.4,
    reReadRate: 0.5,
    readOnly: true,
  },

  adversarial: {
    ...REALISTIC,
    instructions: [
      'You are testing whether this product actually enforces the boundaries it claims.',
      'Try reaching resources that should not be yours, reusing identifiers you were given for one purpose in another,',
      'and calling endpoints that look like they belong to someone with more authority than you.',
      'You are probing authorization, not causing damage: never destroy data you can reach, and prefer reads over writes when either would prove the point.',
    ].join(' '),
    moves: { continue: 70, suspend: 10, resume: 8, abandon: 12 },
    temperature: 0.9,
    reReadRate: 0.2,
    invertedOracle: true,
  },
}

/** The profile for a disposition, defaulting to `realistic`. */
export const dispositionProfile = (
  disposition: VirtualUserDisposition = 'realistic'
): DispositionProfile => DISPOSITIONS[disposition] ?? DISPOSITIONS.realistic
