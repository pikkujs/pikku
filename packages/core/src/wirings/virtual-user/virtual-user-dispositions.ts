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

/**
 * Per-user overrides for a disposition's dials.
 *
 * The six profiles below are starting points, not laws — the weights are a
 * considered guess about how people behave, and your product is allowed to know
 * better. A user that declares `disposition: 'careless'` with a higher
 * `repeatRate` is still a careless user; it is the same behaviour tuned to a
 * product where double-submits actually happen.
 *
 * `instructions` is the one field that appends rather than replaces. Everything
 * else is a number the engine reads, so overriding it changes the run and
 * nothing else; instructions are the model's sense of who it is, and letting a
 * declaration replace them wholesale is how you end up with a `careless` user
 * that is not careless — which makes the name, and every run labelled with it,
 * a lie.
 */
export interface VirtualUserTuning {
  /** Relative weights for the scheduler's moves. Merged over the profile's. */
  moves?: Partial<DispositionProfile['moves']>
  temperature?: number
  repeatRate?: number
  reReadRate?: number
  emptyMemory?: boolean
  readOnly?: boolean
  invertedOracle?: boolean
  /** Extra behaviour, appended to the disposition's own instructions. */
  instructions?: string
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

  // The only disposition that is not testing anything. It is doing the job, so
  // it abandons rarely, runs cool, and is told to stop and say so rather than
  // guess — the failure mode here is a wrong action nobody asked for, not a
  // missed bug.
  accountable: {
    ...REALISTIC,
    instructions: [
      'You are doing this job for real. What you change stays changed, and every call you make is recorded against your name.',
      'Work towards your goals as the person you are, using the tools you have been given.',
      'Where a specialist agent exists for part of the work, hand that part to it rather than reconstructing it yourself.',
      'When you are unsure whether something is wanted, stop and say what you would do and why, rather than doing it and reporting afterwards.',
      'Never guess at an identifier, an amount or a recipient — read it from the product first.',
    ].join(' '),
    moves: { continue: 94, suspend: 5, resume: 1, abandon: 0 },
    temperature: 0.4,
    repeatRate: 0,
    reReadRate: 0.25,
  },
}

/**
 * The profile for a disposition, defaulting to `realistic`, with any declared
 * tuning merged over it.
 *
 * Every consumer resolves a profile through here — the engine, the CLI report
 * and the console screen — so a tuned user reads as tuned everywhere rather
 * than only behaving differently when it runs.
 */
export const dispositionProfile = (
  disposition: VirtualUserDisposition = 'realistic',
  tuning?: VirtualUserTuning
): DispositionProfile => {
  const base = DISPOSITIONS[disposition] ?? DISPOSITIONS.realistic
  if (!tuning) {
    return base
  }

  const { moves, instructions, ...dials } = tuning
  const profile: DispositionProfile = {
    ...base,
    // An explicit `undefined` is someone spreading an optional value, not a
    // request to unset a dial — spreading `dials` straight in would erase it.
    ...Object.fromEntries(
      Object.entries(dials).filter(([, value]) => value !== undefined)
    ),
    moves: {
      ...base.moves,
      ...Object.fromEntries(
        Object.entries(moves ?? {}).filter(([, value]) => value !== undefined)
      ),
    },
  }
  if (instructions) {
    profile.instructions = `${base.instructions} ${instructions}`
  }
  return profile
}
